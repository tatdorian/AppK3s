import yaml from 'js-yaml';
import type { DbApplication } from '../db/schema.js';
import type { KubernetesService } from './kubernetes.service.js';
import * as k8s from '@kubernetes/client-node';

interface ComposeServiceDef {
  image?: string;
  build?: string | { context: string; dockerfile?: string };
  ports?: Array<string | { target: number; published?: number; protocol?: string }>;
  environment?: Record<string, string> | string[];
  volumes?: string[];
  depends_on?: string[] | Record<string, unknown>;
  command?: string | string[];
  entrypoint?: string | string[];
  restart?: string;
  deploy?: { replicas?: number; resources?: { limits?: { cpus?: string; memory?: string } } };
}

interface ComposeFile {
  version?: string;
  services: Record<string, ComposeServiceDef>;
  volumes?: Record<string, unknown>;
  networks?: Record<string, unknown>;
}

/**
 * Converts any string to a valid Kubernetes resource name: lowercase, only [a-z0-9-],
 * no leading/trailing hyphens.
 * Example: "n8n_data" → "n8n-data", "My_Volume!" → "my-volume"
 */
function k8sName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')  // replace anything not [a-z0-9-] with hyphen
    .replace(/-{2,}/g, '-')        // collapse multiple hyphens
    .replace(/^-+|-+$/g, '');      // strip leading/trailing hyphens
}

export class ComposeService {
  constructor(private k8s: KubernetesService) {}

  parse(content: string): ComposeFile {
    const parsed = yaml.load(content) as ComposeFile;
    if (!parsed?.services) throw new Error('Invalid docker-compose: missing "services" key');
    return parsed;
  }

  /**
   * Collecte tous les volumes nommés depuis les deux sources possibles :
   * - La section top-level `volumes:` (optionnelle dans le spec Compose)
   * - Les arrays `volumes:` de chaque service (source principale)
   * Déduplique via un Set. Exclut les bind-mounts (chemins relatifs ou absolus).
   */
  private collectNamedVolumes(compose: ComposeFile): Set<string> {
    const names = new Set<string>();
    // Top-level volumes section
    for (const name of Object.keys(compose.volumes ?? {})) {
      names.add(name);
    }
    // Service-level volumes (in case top-level section is absent or incomplete)
    for (const svc of Object.values(compose.services)) {
      for (const vol of svc.volumes ?? []) {
        const [volName] = vol.split(':');
        if (volName && !volName.startsWith('./') && !volName.startsWith('/')) {
          names.add(volName);
        }
      }
    }
    return names;
  }

  // Deploy a compose-type application: one Deployment + Service per service
  async deployCompose(app: DbApplication): Promise<void> {
    const compose = this.parse(app.composeContent!);

    // Create PVCs for ALL named volumes (top-level section + service-level declarations).
    // Many compose files omit the top-level `volumes:` section and only declare volumes
    // inside services — those were previously missed, causing "PVC not found" errors.
    // Sanitize names: Docker Compose allows underscores (e.g. "n8n_data"),
    // but Kubernetes resource names only allow [a-z0-9-].
    for (const volumeName of this.collectNamedVolumes(compose)) {
      await this.k8s.applyPVC(app, k8sName(volumeName), '1Gi');
    }

    for (const [serviceName, svc] of Object.entries(compose.services)) {
      await this.deployComposeService(app, serviceName, svc, compose);
    }

    // Créer un Ingress vers le premier service avec des ports (si domaine configuré)
    if (app.subdomain && app.domain) {
      const firstEntry = Object.entries(compose.services).find(
        ([, svc]) => svc.ports && svc.ports.length > 0,
      );
      if (firstEntry) {
        const [firstSvcName, firstSvc] = firstEntry;
        const firstPort = this.parsePorts(firstSvc.ports)[0];
        const backendSvcName = `${app.name}-${firstSvcName}`;
        await this.k8s.applyIngressForBackend(app, backendSvcName, firstPort);
      }
    }
  }

  private async deployComposeService(
    app: DbApplication,
    serviceName: string,
    svc: ComposeServiceDef,
    _compose: ComposeFile,
  ): Promise<void> {
    const name = `${app.name}-${serviceName}`;
    const ns = app.namespace;

    // Access the underlying k8s clients via the protected accessors
    const coreApi = (this.k8s as any).coreApi as k8s.CoreV1Api;
    const appsApi = (this.k8s as any).appsApi as k8s.AppsV1Api;

    const envData: Record<string, string> = {};
    if (Array.isArray(svc.environment)) {
      for (const e of svc.environment) {
        const [k, ...rest] = e.split('=');
        envData[k] = rest.join('=');
      }
    } else if (svc.environment) {
      Object.assign(envData, svc.environment);
    }

    // Also merge app-level env vars
    for (const { key, value } of app.envVars) {
      envData[key] = value;
    }

    const secretName = `${name}-env`;
    if (Object.keys(envData).length > 0) {
      const secretBody: k8s.V1Secret = {
        metadata: { name: secretName, namespace: ns },
        data: Object.fromEntries(
          Object.entries(envData).map(([k, v]) => [k, Buffer.from(v).toString('base64')]),
        ),
      };
      try {
        await coreApi.readNamespacedSecret(secretName, ns);
        await coreApi.replaceNamespacedSecret(secretName, ns, secretBody);
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.response?.statusCode === 404) {
          await coreApi.createNamespacedSecret(ns, secretBody);
        } else {
          throw err;
        }
      }
    }

    const ports = this.parsePorts(svc.ports);
    const volumeMounts: k8s.V1VolumeMount[] = [];
    const volumes: k8s.V1Volume[] = [];

    for (const vol of svc.volumes ?? []) {
      // named volume: "pgdata:/var/lib/postgresql/data" or "n8n_data:/home/node/.n8n"
      const [volName, mountPath] = vol.split(':');
      if (volName && mountPath && !volName.startsWith('./') && !volName.startsWith('/')) {
        // Must sanitize: underscores and other chars are invalid in Kubernetes names.
        // The sanitized name must match exactly what was used in applyPVC above.
        const safeVolName = k8sName(volName);
        volumeMounts.push({ name: safeVolName, mountPath });
        volumes.push({
          name: safeVolName,
          persistentVolumeClaim: { claimName: `${app.name}-${safeVolName}` },
        });
      }
    }

    const replicas = svc.deploy?.replicas ?? 1;
    const image = svc.image ?? 'scratch';

    const deploymentBody: k8s.V1Deployment = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name,
        namespace: ns,
        labels: {
          'app.kubernetes.io/name': name,
          'app.kubernetes.io/managed-by': 'appk3s',
          'appk3s.io/app-id': app.id,
        },
      },
      spec: {
        replicas,
        selector: { matchLabels: { 'app.kubernetes.io/name': name } },
        template: {
          metadata: { labels: { 'app.kubernetes.io/name': name } },
          spec: {
            containers: [
              {
                name: serviceName,
                image,
                ports: ports.map((p) => ({ containerPort: p, protocol: 'TCP' })),
                envFrom: Object.keys(envData).length > 0 ? [{ secretRef: { name: secretName } }] : [],
                volumeMounts,
                ...(Array.isArray(svc.command)
                  ? { command: svc.command }
                  : svc.command
                    ? { command: [svc.command] }
                    : {}),
              },
            ],
            volumes,
          },
        },
      },
    };

    try {
      await appsApi.readNamespacedDeployment(name, ns);
      // Patch the deployment spec (safer than replace which needs resourceVersion)
      await appsApi.patchNamespacedDeployment(
        name, ns,
        { spec: deploymentBody.spec },
        undefined, undefined, undefined, undefined, undefined,
        { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } },
      );
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.response?.statusCode === 404) {
        await appsApi.createNamespacedDeployment(ns, deploymentBody);
      } else {
        throw err;
      }
    }

    // Service
    if (ports.length > 0) {
      const svcPorts = ports.map((p) => ({ port: p, targetPort: p as any, protocol: 'TCP' }));
      try {
        await coreApi.readNamespacedService(name, ns);
        // Patch: ne pas remplacer (clusterIP est immutable)
        await coreApi.patchNamespacedService(
          name, ns,
          { spec: { selector: { 'app.kubernetes.io/name': name }, ports: svcPorts } },
          undefined, undefined, undefined, undefined, undefined,
          { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } },
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.response?.statusCode === 404) {
          const svcBody: k8s.V1Service = {
            metadata: { name, namespace: ns, labels: { 'app.kubernetes.io/name': name, 'app.kubernetes.io/managed-by': 'appk3s', 'appk3s.io/app-id': app.id } },
            spec: {
              selector: { 'app.kubernetes.io/name': name },
              ports: svcPorts,
              type: 'ClusterIP',
            },
          };
          await coreApi.createNamespacedService(ns, svcBody);
        } else {
          throw err;
        }
      }
    }
  }

  private parsePorts(ports?: ComposeServiceDef['ports']): number[] {
    if (!ports) return [];
    return ports.map((p) => {
      if (typeof p === 'string') {
        const parts = p.split(':');
        return parseInt(parts[parts.length - 1].split('/')[0], 10);
      }
      return p.target;
    });
  }

  async deleteCompose(app: DbApplication): Promise<void> {
    const compose = this.parse(app.composeContent!);
    const appsApi = (this.k8s as any).appsApi as k8s.AppsV1Api;
    const coreApi = (this.k8s as any).coreApi as k8s.CoreV1Api;
    const ignore = (err: any) => { if (err?.statusCode !== 404) throw err; };
    const ns = app.namespace;

    for (const serviceName of Object.keys(compose.services)) {
      const name = `${app.name}-${serviceName}`;
      await Promise.allSettled([
        appsApi.deleteNamespacedDeployment(name, ns).catch(ignore),
        coreApi.deleteNamespacedService(name, ns).catch(ignore),
        coreApi.deleteNamespacedSecret(`${name}-env`, ns).catch(ignore),
      ]);
    }

    // Delete PVCs for ALL named volumes (top-level + service-level).
    // Also apply k8sName() to match the sanitized name used during creation.
    for (const volName of this.collectNamedVolumes(compose)) {
      await coreApi
        .deleteNamespacedPersistentVolumeClaim(`${app.name}-${k8sName(volName)}`, ns)
        .catch(ignore);
    }
  }
}
