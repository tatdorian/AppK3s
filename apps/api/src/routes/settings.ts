import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import {
  applyOvhSecret,
  applyClusterIssuerDns01,
  applyWildcardCert,
  deleteWildcardCert,
  updateCoreDnsOverride,
  updateAppK3sIngress,
  migrateAppIngresses,
} from '../services/domain.service.js';

const ALLOWED_KEYS = [
  'defaultDomain',
  'defaultIngressClass',
  'defaultTls',
  'wildcardDomain',
  'interfaceDomain',
  'masterNodeIp',
  'acmeEmail',
  'ovhAppKey',
  'ovhAppSecret',
  'ovhConsumerKey',
] as const;
type SettingKey = (typeof ALLOWED_KEYS)[number];

function isAllowedKey(k: string): k is SettingKey {
  return ALLOWED_KEYS.includes(k as SettingKey);
}

const DEFAULTS: Record<SettingKey, string> = {
  defaultDomain:      '',
  defaultIngressClass:'traefik',
  defaultTls:         'true',
  wildcardDomain:     '',
  interfaceDomain:    '',
  masterNodeIp:       process.env.NODE_IP ?? '192.168.188.10',
  acmeEmail:          '',
  ovhAppKey:          '',
  ovhAppSecret:       '',
  ovhConsumerKey:     '',
};

async function getAll(): Promise<Record<SettingKey, string>> {
  const rows = await db.query.settings.findMany();
  const result = { ...DEFAULTS };
  for (const row of rows) {
    if (isAllowedKey(row.key)) result[row.key] = row.value;
  }
  return result;
}

export async function settingsRoutes(fastify: FastifyInstance) {
  const auth = { preHandler: fastify.authenticate };

  // GET /api/settings
  fastify.get('/', auth, async () => getAll());

  // PATCH /api/settings
  fastify.patch('/', auth, async (request, reply) => {
    const body = request.body as Record<string, string>;
    if (typeof body !== 'object' || body === null) {
      return reply.code(400).send({ error: 'Invalid body' });
    }

    // Load current settings before update
    const before = await getAll();

    // Persist changed keys
    const updates: Promise<unknown>[] = [];
    for (const [key, value] of Object.entries(body)) {
      if (!isAllowedKey(key)) continue;
      if (typeof value !== 'string') continue;
      updates.push(
        db
          .insert(schema.settings)
          .values({ key, value, updatedAt: new Date() })
          .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } }),
      );
    }
    await Promise.all(updates);

    const after = await getAll();

    // ── Side-effects ─────────────────────────────────────────────────────────
    const ovhReady =
      after.ovhAppKey && after.ovhAppSecret && after.ovhConsumerKey && after.acmeEmail;

    const wildcardChanged = !!after.wildcardDomain && after.wildcardDomain !== before.wildcardDomain;
    const masterIpChanged  = !!after.masterNodeIp   && after.masterNodeIp   !== before.masterNodeIp;
    const ifaceDomChanged  = !!after.interfaceDomain && after.interfaceDomain !== before.interfaceDomain;

    // IP effective (préférer la valeur en base, sinon variable d'env)
    const masterNodeIp = after.masterNodeIp || process.env.NODE_IP || '192.168.188.10';

    try {
      // ── 1. CoreDNS wildcard override ──────────────────────────────────────
      // Déclenché dès que le domaine wildcard ou l'IP master changent,
      // SANS dépendance aux credentials OVH.
      if (after.wildcardDomain && (wildcardChanged || masterIpChanged || !before.wildcardDomain)) {
        await updateCoreDnsOverride(after.wildcardDomain, masterNodeIp);
      }

      // ── 2. Ingress AppK3s (interface) ─────────────────────────────────────
      // Re-créé avec TLS + redirect HTTPS si le domaine ou l'IP changent.
      if (after.interfaceDomain && (ifaceDomChanged || masterIpChanged || !before.interfaceDomain)) {
        await updateAppK3sIngress(after.interfaceDomain, masterNodeIp);
      }

      // ── 3. OVH + wildcard cert (nécessite les credentials OVH) ───────────
      if (ovhReady) {
        // 3a. OVH Secret dans le namespace cert-manager
        if (after.ovhAppKey !== before.ovhAppKey ||
            after.ovhAppSecret !== before.ovhAppSecret ||
            after.ovhConsumerKey !== before.ovhConsumerKey) {
          await applyOvhSecret(after.ovhAppKey, after.ovhAppSecret, after.ovhConsumerKey);
        }

        // 3b. ClusterIssuer DNS-01
        if (after.acmeEmail !== before.acmeEmail) {
          await applyClusterIssuerDns01(after.acmeEmail);
        }

        // 3c. Certificat wildcard
        if (after.wildcardDomain) {
          if (wildcardChanged && before.wildcardDomain) {
            await deleteWildcardCert();
          }
          await applyWildcardCert(after.wildcardDomain);
        }
      }

      // ── 4. Migration des ingresses existants (si domaine wildcard change) ─
      if (wildcardChanged && before.wildcardDomain) {
        await migrateAppIngresses(before.wildcardDomain, after.wildcardDomain);
      }
    } catch (err) {
      fastify.log.error(`Domain service error: ${err}`);
      // Retourner les settings même si les side-effects k8s échouent
      return reply.code(207).send({
        settings: after,
        warning: `Paramètres sauvegardés mais synchronisation k8s échouée : ${(err as Error).message}`,
      });
    }

    return after;
  });

  // GET /api/settings/cert-status — check wildcard cert readiness
  fastify.get('/cert-status', auth, async () => {
    try {
      const { execSync } = await import('child_process');
      const kubeconfig = process.env.KUBECONFIG ?? '/etc/rancher/k3s/k3s.yaml';
      const out = execSync(
        `KUBECONFIG=${kubeconfig} kubectl get certificate wildcard-tls -n default -o jsonpath='{.status.conditions[?(@.type=="Ready")].status},{.status.conditions[?(@.type=="Ready")].message}' 2>/dev/null || echo 'NotFound,'`,
        { encoding: 'utf8' },
      );
      const [status, message] = out.replace(/'/g, '').split(',');
      return { ready: status === 'True', message: message ?? '' };
    } catch {
      return { ready: false, message: 'Certificate not found' };
    }
  });
}
