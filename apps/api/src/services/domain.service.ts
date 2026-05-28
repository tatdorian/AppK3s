import { execSync } from 'child_process';
import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();
if (process.env.KUBERNETES_SERVICE_HOST) {
  kc.loadFromCluster();
} else {
  kc.loadFromDefault();
}
const coreApi = kc.makeApiClient(k8s.CoreV1Api);
const networkingApi = kc.makeApiClient(k8s.NetworkingV1Api);

function kubectl(yaml: string): void {
  const kubeconfig = process.env.KUBECONFIG ?? '/etc/rancher/k3s/k3s.yaml';
  const cmd = `echo ${JSON.stringify(yaml)} | KUBECONFIG=${kubeconfig} kubectl apply -f -`;
  execSync(cmd, { stdio: 'pipe' });
}

function kubectlDelete(resource: string, name: string, ns: string): void {
  const kubeconfig = process.env.KUBECONFIG ?? '/etc/rancher/k3s/k3s.yaml';
  try {
    execSync(
      `KUBECONFIG=${kubeconfig} kubectl delete ${resource} ${name} -n ${ns} --ignore-not-found`,
      { stdio: 'pipe' },
    );
  } catch {
    // ignore
  }
}

// ── OVH secret in cert-manager namespace ────────────────────────────────────

export async function applyOvhSecret(appKey: string, appSecret: string, consumerKey: string) {
  const yaml = `
apiVersion: v1
kind: Secret
metadata:
  name: ovh-credentials
  namespace: cert-manager
type: Opaque
stringData:
  applicationKey: "${appKey}"
  applicationSecret: "${appSecret}"
  consumerKey: "${consumerKey}"
`;
  kubectl(yaml);
}

// ── ClusterIssuer with DNS-01 solver ────────────────────────────────────────

export async function applyClusterIssuerDns01(acmeEmail: string) {
  const yaml = `
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: "${acmeEmail}"
    privateKeySecretRef:
      name: letsencrypt-prod-account-key
    solvers:
      - dns01:
          webhook:
            groupName: acme.example.com
            solverName: ovh
            config:
              endpoint: ovh-eu
              applicationKeyRef:
                name: ovh-credentials
                key: applicationKey
              applicationSecretRef:
                name: ovh-credentials
                key: applicationSecret
              consumerKeyRef:
                name: ovh-credentials
                key: consumerKey
      - http01:
          ingress:
            ingressClassName: traefik
`;
  kubectl(yaml);
}

// ── Wildcard Certificate ────────────────────────────────────────────────────

export async function applyWildcardCert(wildcardDomain: string, secretName = 'wildcard-tls') {
  // Delete old cert if domain changed
  const yaml = `
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${secretName}
  namespace: default
spec:
  secretName: ${secretName}
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - "*.${wildcardDomain}"
    - "${wildcardDomain}"
  renewBefore: 360h
`;
  kubectl(yaml);
}

// ── Delete wildcard cert + secret (on domain change) ───────────────────────

export async function deleteWildcardCert(secretName = 'wildcard-tls') {
  kubectlDelete('certificate', secretName, 'default');
  kubectlDelete('secret', secretName, 'default');
}

// ── Delete interface cert + secret (on interfaceDomain change) ─────────────
// cert-manager ne réémet pas si le secret appk3s-tls existe déjà (même expiré
// ou pour l'ancien domaine). On le supprime pour forcer une nouvelle émission.

export async function deleteInterfaceCert(secretName = 'appk3s-tls') {
  kubectlDelete('certificate', secretName, 'default');
  kubectlDelete('secret', secretName, 'default');
}

// ── CoreDNS override helpers ─────────────────────────────────────────────────
// K3s charge tous les fichiers *.server du ConfigMap coredns-custom (via
// `import /etc/coredns/custom/*.server`). On utilise kubectl patch pour
// ajouter/mettre à jour une clé sans écraser les autres clés existantes.

function patchCoreDnsKey(key: string, serverBlock: string): void {
  const kubeconfig = process.env.KUBECONFIG ?? '/etc/rancher/k3s/k3s.yaml';
  const patch = JSON.stringify({ data: { [key]: serverBlock } });
  execSync(
    `KUBECONFIG=${kubeconfig} kubectl patch configmap coredns-custom -n kube-system --patch ${JSON.stringify(patch)}`,
    { stdio: 'pipe' },
  );
}

function restartCoreDns(): void {
  const kubeconfig = process.env.KUBECONFIG ?? '/etc/rancher/k3s/k3s.yaml';
  execSync(
    `KUBECONFIG=${kubeconfig} kubectl rollout restart deployment/coredns -n kube-system`,
    { stdio: 'pipe' },
  );
}

// ── Wildcard domain override ─────────────────────────────────────────────────
// Tout sous-domaine de wildcardDomain résout vers masterNodeIp à l'intérieur
// du cluster (contournement hairpin NAT pour la validation ACME HTTP-01).

export async function updateCoreDnsOverride(wildcardDomain: string, masterNodeIp: string) {
  const serverBlock = `${wildcardDomain}:53 {
  template IN A ${wildcardDomain} {
    match ^(.+\\.)?${wildcardDomain.replace(/\./g, '\\.')}\\.$
    answer "{{ .Name }} 60 IN A ${masterNodeIp}"
  }
  template IN AAAA ${wildcardDomain} {
    match ^(.+\\.)?${wildcardDomain.replace(/\./g, '\\.')}\\.$
    rcode NOERROR
  }
  forward . /etc/resolv.conf
}
`;
  patchCoreDnsKey('wildcard.server', serverBlock);
  restartCoreDns();
}

// ── Interface domain override ────────────────────────────────────────────────
// Le domaine de l'interface AK3s (ex: ak3s.syit.fr) doit aussi résoudre vers
// masterNodeIp depuis l'intérieur du cluster pour que le challenge HTTP-01
// Let's Encrypt fonctionne (self-check cert-manager).

export async function updateInterfaceCoreDns(interfaceDomain: string, masterNodeIp: string) {
  if (!interfaceDomain || !masterNodeIp) return;
  const serverBlock = `${interfaceDomain}:53 {
  hosts {
    ${masterNodeIp} ${interfaceDomain}
    fallthrough
  }
  forward . /etc/resolv.conf
}
`;
  patchCoreDnsKey('interface.server', serverBlock);
  restartCoreDns();
}

// ── Mettre à jour l'ingress de l'interface AppK3s ────────────────────────────
// Recréé automatiquement avec le bon host, TLS et redirect HTTPS.

export async function updateAppK3sIngress(interfaceDomain: string, masterNodeIp: string) {
  if (!interfaceDomain || !masterNodeIp) return;

  // 1. Service headless pointant vers le master
  const svcYaml = `
apiVersion: v1
kind: Service
metadata:
  name: appk3s-web
  namespace: default
  labels:
    app: appk3s-web
spec:
  ports:
    - name: http
      port: 3000
      targetPort: 3000
      protocol: TCP
`;
  kubectl(svcYaml);

  // 2. EndpointSlice vers la nouvelle IP du master
  const epsYaml = `
apiVersion: discovery.k8s.io/v1
kind: EndpointSlice
metadata:
  name: appk3s-web-eps
  namespace: default
  labels:
    kubernetes.io/service-name: appk3s-web
addressType: IPv4
endpoints:
  - addresses:
      - "${masterNodeIp}"
    conditions:
      ready: true
ports:
  - name: http
    port: 3000
    protocol: TCP
`;
  kubectl(epsYaml);

  // 3. Ingress avec TLS + redirect HTTPS
  const ingYaml = `
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: appk3s
  namespace: default
  labels:
    app: appk3s
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    traefik.ingress.kubernetes.io/router.entrypoints: web,websecure
    traefik.ingress.kubernetes.io/router.middlewares: default-redirect-https@kubernetescrd
spec:
  ingressClassName: traefik
  tls:
    - hosts:
        - ${interfaceDomain}
      secretName: appk3s-tls
  rules:
    - host: ${interfaceDomain}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: appk3s-web
                port:
                  number: 3000
`;
  kubectl(ingYaml);
}

// ── Update all app ingresses to new domain ──────────────────────────────────

export async function migrateAppIngresses(oldDomain: string, newDomain: string) {
  if (!oldDomain || oldDomain === newDomain) return;

  const { body: ingresses } = await networkingApi.listNamespacedIngress('default');
  for (const ing of ingresses.items) {
    const labels = ing.metadata?.labels ?? {};
    if (labels['app.kubernetes.io/managed-by'] !== 'appk3s') continue;

    let changed = false;
    // Update TLS hosts
    ing.spec?.tls?.forEach((tls) => {
      tls.hosts = tls.hosts?.map((h) => {
        const updated = h.replace(`.${oldDomain}`, `.${newDomain}`);
        if (updated !== h) changed = true;
        return updated;
      });
    });
    // Update rules hosts
    ing.spec?.rules?.forEach((rule) => {
      if (rule.host?.endsWith(`.${oldDomain}`)) {
        rule.host = rule.host.replace(`.${oldDomain}`, `.${newDomain}`);
        changed = true;
      }
    });

    if (changed && ing.metadata?.name) {
      await networkingApi.replaceNamespacedIngress(
        ing.metadata.name,
        ing.metadata.namespace ?? 'default',
        ing,
      );
    }
  }
}
