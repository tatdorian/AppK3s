import * as k8s from '@kubernetes/client-node';
import { PassThrough } from 'stream';
import type { DbApplication } from '../db/schema.js';
import type { AppStatusInfo, K8sPodInfo, NodeInfo, ServicePortInfo } from '@appk3s/shared';

const MANAGED_BY = 'appk3s';

export class KubernetesService {
  protected kc: k8s.KubeConfig;
  protected coreApi: k8s.CoreV1Api;
  protected appsApi: k8s.AppsV1Api;
  protected networkingApi: k8s.NetworkingV1Api;
  protected customApi: k8s.CustomObjectsApi;

  constructor() {
    this.kc = new k8s.KubeConfig();
    if (process.env.KUBERNETES_SERVICE_HOST) {
      this.kc.loadFromCluster();
    } else {
      this.kc.loadFromDefault();
    }
    this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
    this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
    this.networkingApi = this.kc.makeApiClient(k8s.NetworkingV1Api);
    this.customApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
  }

  // ─── Namespace ───────────────────────────────────────────────────────────────

  async ensureNamespace(namespace: string): Promise<void> {
    try {
      await this.coreApi.readNamespace(namespace);
    } catch {
      await this.coreApi.createNamespace({
        metadata: { name: namespace, labels: { 'managed-by': MANAGED_BY } },
      });
    }
  }

  // ─── Labels helpers ──────────────────────────────────────────────────────────

  protected labels(app: DbApplication) {
    return {
      'app.kubernetes.io/name': app.name,
      'app.kubernetes.io/managed-by': MANAGED_BY,
      'appk3s.io/app-id': app.id,
    };
  }

  // ─── Secret (env vars) ───────────────────────────────────────────────────────

  async applySecret(app: DbApplication): Promise<void> {
    const name = `${app.name}-env`;
    const data: Record<string, string> = {};
    for (const { key, value } of app.envVars) {
      data[key] = Buffer.from(value).toString('base64');
    }

    const body: k8s.V1Secret = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name, namespace: app.namespace, labels: this.labels(app) },
      data,
    };

    await this.upsert(
      () => this.coreApi.readNamespacedSecret(name, app.namespace),
      () => this.coreApi.createNamespacedSecret(app.namespace, body),
      () => this.coreApi.replaceNamespacedSecret(name, app.namespace, body),
    );
  }

  // ─── PVC ─────────────────────────────────────────────────────────────────────

  async applyPVC(app: DbApplication, volumeName: string, size: string, storageClass?: string): Promise<void> {
    const name = `${app.name}-${volumeName}`;
    const body: k8s.V1PersistentVolumeClaim = {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: { name, namespace: app.namespace, labels: this.labels(app) },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: { requests: { storage: size } },
        ...(storageClass ? { storageClassName: storageClass } : {}),
      },
    };

    await this.upsert(
      () => this.coreApi.readNamespacedPersistentVolumeClaim(name, app.namespace),
      () => this.coreApi.createNamespacedPersistentVolumeClaim(app.namespace, body),
      () => Promise.resolve(null as any), // PVCs are immutable once bound
    );
  }

  // ─── Deployment ──────────────────────────────────────────────────────────────

  async applyDeployment(app: DbApplication, overrides?: Partial<k8s.V1DeploymentSpec>): Promise<void> {
    const name = app.name;
    const labels = this.labels(app);

    const envFrom: k8s.V1EnvFromSource[] =
      app.envVars.length > 0
        ? [{ secretRef: { name: `${app.name}-env` } }]
        : [];

    const volumeMounts: k8s.V1VolumeMount[] = app.volumes.map((v) => ({
      name: v.name,
      mountPath: v.mountPath,
    }));

    const volumes: k8s.V1Volume[] = app.volumes.map((v) => ({
      name: v.name,
      persistentVolumeClaim: { claimName: `${app.name}-${v.name}` },
    }));

    const containerPorts: k8s.V1ContainerPort[] = app.ports.map((p) => ({
      containerPort: p.containerPort,
      protocol: p.protocol,
    }));

    const resources: k8s.V1ResourceRequirements = {
      ...(app.cpuLimit || app.memoryLimit
        ? { limits: { ...(app.cpuLimit ? { cpu: app.cpuLimit } : {}), ...(app.memoryLimit ? { memory: app.memoryLimit } : {}) } }
        : {}),
    };

    // Built images are pushed to the local registry (192.168.188.10:5000).
    // All nodes pull from there, so IfNotPresent works cluster-wide.
    const imagePullPolicy = 'IfNotPresent';

    // Inject PORT env var for source-built apps (nixpacks/git/github-app) so the
    // runtime respects the configured container port. Only injected when the user
    // hasn't already set PORT in their env vars.
    const extraEnv: k8s.V1EnvVar[] = [];
    const isSourceBuild = app.type === 'github-app' || app.type === 'git';
    if (isSourceBuild && containerPorts.length > 0) {
      const userSetPort = app.envVars.some((e) => e.key === 'PORT');
      if (!userSetPort) {
        extraEnv.push({ name: 'PORT', value: String(containerPorts[0].containerPort) });
      }
    }

    const spec: k8s.V1DeploymentSpec = {
      replicas: app.replicas,
      selector: { matchLabels: { 'app.kubernetes.io/name': name } },
      // Rolling update for zero-downtime deployments
      strategy: {
        type: 'RollingUpdate',
        rollingUpdate: { maxSurge: 1, maxUnavailable: 0 },
      },
      template: {
        metadata: { labels },
        spec: {
          containers: [
            {
              name: app.name,
              image: `${app.image}:${app.imageTag ?? 'latest'}`,
              imagePullPolicy,
              ports: containerPorts,
              envFrom,
              env: extraEnv.length > 0 ? extraEnv : undefined,
              volumeMounts,
              resources,
              // Startup probe — blocks liveness/readiness until the app is up.
              // Gives up to 5 minutes for slow starts (nixpacks, JVM, etc.).
              // Once the startup probe passes, liveness/readiness take over.
              startupProbe: containerPorts.length > 0 ? {
                tcpSocket: { port: containerPorts[0].containerPort as any },
                initialDelaySeconds: 5,
                periodSeconds: 10,
                failureThreshold: 30, // 5 min max startup window
                timeoutSeconds: 3,
              } : undefined,
              // Liveness probe — restart if app hangs after startup.
              livenessProbe: containerPorts.length > 0 ? {
                tcpSocket: { port: containerPorts[0].containerPort as any },
                initialDelaySeconds: 0,
                periodSeconds: 15,
                failureThreshold: 4,
                timeoutSeconds: 3,
              } : undefined,
              // Readiness probe — remove from Service endpoints if unhealthy.
              readinessProbe: containerPorts.length > 0 ? {
                tcpSocket: { port: containerPorts[0].containerPort as any },
                initialDelaySeconds: 0,
                periodSeconds: 10,
                failureThreshold: 4,
                timeoutSeconds: 3,
              } : undefined,
              // Override Docker CMD when the template requires explicit server args
              // (e.g. MinIO needs ["server", "/data", "--console-address", ":9001"])
              ...(app.args && app.args.length > 0 ? { args: app.args } : {}),
            },
          ],
          volumes,
        },
      },
      ...overrides,
    };

    const body: k8s.V1Deployment = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name, namespace: app.namespace, labels },
      spec,
    };

    await this.upsert(
      () => this.appsApi.readNamespacedDeployment(name, app.namespace),
      () => this.appsApi.createNamespacedDeployment(app.namespace, body),
      () => this.appsApi.replaceNamespacedDeployment(name, app.namespace, body),
    );
  }

  // ─── Service ─────────────────────────────────────────────────────────────────

  async applyService(app: DbApplication): Promise<void> {
    const name = app.name;
    const labels = this.labels(app);
    const ports: k8s.V1ServicePort[] = app.ports.map((p) => ({
      name: `port-${p.containerPort}`,
      port: p.containerPort,
      targetPort: p.containerPort as any,
      protocol: p.protocol,
    }));

    if (!ports.length) {
      // Default HTTP port assumption when none specified
      ports.push({ name: 'http', port: 80, targetPort: 80 as any, protocol: 'TCP' });
    }

    try {
      // Service exists → patch uniquement selector + ports.
      // replaceNamespacedService est interdit car clusterIP est immutable :
      // Kubernetes rejette un replace sans clusterIP avec "This field is immutable".
      await this.coreApi.readNamespacedService(name, app.namespace);

      const patchBody = {
        metadata: { labels },
        spec: {
          selector: { 'app.kubernetes.io/name': name },
          ports,
        },
      };
      await this.coreApi.patchNamespacedService(
        name,
        app.namespace,
        patchBody,
        undefined, undefined, undefined, undefined, undefined,
        { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } },
      );
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.response?.statusCode === 404) {
        // Service n'existe pas → création complète avec NodePort
        const body: k8s.V1Service = {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name, namespace: app.namespace, labels },
          spec: {
            selector: { 'app.kubernetes.io/name': name },
            ports,
            type: 'NodePort',
          },
        };
        await this.coreApi.createNamespacedService(app.namespace, body);
      } else {
        throw err;
      }
    }
  }

  async getServicePorts(app: DbApplication): Promise<ServicePortInfo[]> {
    try {
      const { body } = await this.coreApi.readNamespacedService(app.name, app.namespace);
      return (body.spec?.ports ?? []).map((p) => ({
        name: p.name ?? '',
        port: p.port,
        targetPort: typeof p.targetPort === 'number' ? p.targetPort : p.port,
        nodePort: p.nodePort,
        protocol: p.protocol ?? 'TCP',
      }));
    } catch {
      return [];
    }
  }

  // ─── Ingress ─────────────────────────────────────────────────────────────────

  /**
   * Crée explicitement un Certificate cert-manager via Let's Encrypt
   * et attend qu'il soit Ready avant de créer l'Ingress.
   * Évite la race condition où Traefik cherche le secret TLS avant
   * que cert-manager ait terminé la validation HTTP-01.
   * Timeout : 3 minutes (Let's Encrypt HTTP-01 prend 30-90s en général).
   */
  protected async ensureCertificate(
    host: string,
    secretName: string,
    namespace: string,
  ): Promise<void> {
    const certName = secretName; // même nom que le secret TLS

    // ── Réutiliser le secret existant si déjà valide ─────────────────────────
    // Let's Encrypt limite à 5 certs identiques / 7 jours.
    // Si le secret TLS existe déjà pour ce host, on laisse cert-manager le
    // gérer (renouvellement) sans en redemander un nouveau.
    try {
      const secretRes = await this.coreApi.readNamespacedSecret(secretName, namespace);
      const secret = secretRes.body;
      const certData = secret.data?.['tls.crt'];
      if (certData) {
        // Décoder le PEM et vérifier la date d'expiration
        const pem = Buffer.from(certData, 'base64').toString('utf8');
        // Extraire la date d'expiration grossièrement (valable uniquement comme heuristique)
        // cert-manager se charge du renouvellement automatique — on s'assure juste que
        // le secret est présent et non vide.
        const existingCertIsUsable = pem.includes('-----BEGIN CERTIFICATE-----');
        if (existingCertIsUsable) {
          // Secret valide — vérifier que le Certificate CRD couvre bien le host demandé
          try {
            const certRes: any = await this.customApi.getNamespacedCustomObject(
              'cert-manager.io', 'v1', namespace, 'certificates', certName,
            );
            const existingDnsNames: string[] = certRes?.body?.spec?.dnsNames ?? [];
            if (existingDnsNames.includes(host)) {
              // CRD couvre déjà ce host → cert-manager gère le renouvellement, rien à faire
              return;
            }
            // Le host a changé (ex: subdomain modifié) → ne pas retourner,
            // continuer vers replaceNamespacedCustomObject pour mettre à jour les dnsNames.
            // cert-manager détectera le changement et ré-émettra automatiquement.
            // On supprime aussi l'ancien secret pour forcer la ré-émission immédiate.
            try {
              await this.coreApi.deleteNamespacedSecret(secretName, namespace);
            } catch { /* déjà supprimé ou absent */ }
          } catch {
            // Pas de Certificate CRD mais le secret est là → créer le CRD
            // cert-manager détectera le secret existant et ne ré-émettra pas
          }
        }
      }
    } catch {
      // Secret absent → flux normal de création
    }

    const certBody = {
      apiVersion: 'cert-manager.io/v1',
      kind: 'Certificate',
      metadata: {
        name: certName,
        namespace,
      },
      spec: {
        secretName,
        dnsNames: [host],
        issuerRef: {
          name: 'letsencrypt-prod',
          kind: 'ClusterIssuer',
        },
      },
    };

    // Upsert du Certificate
    try {
      await this.customApi.getNamespacedCustomObject(
        'cert-manager.io', 'v1', namespace, 'certificates', certName,
      );
      await this.customApi.replaceNamespacedCustomObject(
        'cert-manager.io', 'v1', namespace, 'certificates', certName, certBody,
      );
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.response?.statusCode === 404) {
        await this.customApi.createNamespacedCustomObject(
          'cert-manager.io', 'v1', namespace, 'certificates', certBody,
        );
      } else {
        throw err;
      }
    }

    // Attendre que le cert soit Ready (max 3 min — HTTP-01 prend 30-90s)
    for (let i = 0; i < 180; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const res: any = await this.customApi.getNamespacedCustomObject(
          'cert-manager.io', 'v1', namespace, 'certificates', certName,
        );
        const conditions: any[] = res?.body?.status?.conditions ?? [];
        const ready = conditions.find((c: any) => c.type === 'Ready' && c.status === 'True');
        if (ready) return;
      } catch {
        // ignore, on réessaie
      }
    }
    // On continue même si le timeout est atteint (cert sera prêt en arrière-plan)
  }

  async applyIngress(
    app: DbApplication,
    /**
     * Quand fourni, on réutilise ce secret TLS existant (ex: cert wildcard).
     * Quand absent, un Certificate cert-manager est créé via la CA interne
     * AppK3s (10 ans, sans HTTP-01) et attendu avant la création de l'Ingress.
     */
    wildcardCertSecret?: string,
  ): Promise<void> {
    if (!app.subdomain || !app.domain) return;

    const name = `${app.name}-ingress`;
    const host = `${app.subdomain}.${app.domain}`;
    const servicePort = app.ports[0]?.containerPort ?? 80;
    const labels = this.labels(app);

    const annotations: Record<string, string> = {};
    const ingressClass = app.ingressClass || 'traefik';

    const useWildcard = !!wildcardCertSecret;
    const certSecretName = wildcardCertSecret ?? `${app.name}-tls`;

    if (app.tlsEnabled && !useWildcard) {
      // ① Créer le Certificate AVANT l'Ingress → Traefik trouve le secret dès le départ
      await this.ensureCertificate(host, certSecretName, app.namespace);
    }

    if (ingressClass === 'nginx') {
      if (app.tlsEnabled) {
        annotations['nginx.ingress.kubernetes.io/ssl-redirect'] = 'true';
      }
    } else {
      // Traefik (k3s default)
      if (app.tlsEnabled) {
        annotations['traefik.ingress.kubernetes.io/router.entrypoints'] = 'web,websecure';
        annotations['traefik.ingress.kubernetes.io/router.middlewares'] = 'default-redirect-https@kubernetescrd';
      } else {
        annotations['traefik.ingress.kubernetes.io/router.entrypoints'] = 'web';
      }
    }

    const tls: k8s.V1IngressTLS[] | undefined = app.tlsEnabled
      ? [{ hosts: [host], secretName: certSecretName }]
      : undefined;

    const body: k8s.V1Ingress = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: { name, namespace: app.namespace, labels, annotations },
      spec: {
        ingressClassName: ingressClass,
        ...(tls ? { tls } : {}),
        rules: [
          {
            host,
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: app.name,
                      port: { number: servicePort },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    };

    await this.upsert(
      () => this.networkingApi.readNamespacedIngress(name, app.namespace),
      () => this.networkingApi.createNamespacedIngress(app.namespace, body),
      () => this.networkingApi.replaceNamespacedIngress(name, app.namespace, body),
    );
  }

  /**
   * Variante de applyIngress pour les compose apps :
   * le backend service peut être différent de app.name.
   */
  async applyIngressForBackend(
    app: DbApplication,
    backendServiceName: string,
    backendServicePort: number,
  ): Promise<void> {
    if (!app.subdomain || !app.domain) return;

    const name = `${app.name}-ingress`;
    const host = `${app.subdomain}.${app.domain}`;
    const labels = this.labels(app);
    const ingressClass = app.ingressClass || 'traefik';

    const annotations: Record<string, string> = {};
    const certSecretName = `${app.name}-tls`;

    if (app.tlsEnabled) {
      await this.ensureCertificate(host, certSecretName, app.namespace);
      if (ingressClass === 'nginx') {
        annotations['nginx.ingress.kubernetes.io/ssl-redirect'] = 'true';
      } else {
        annotations['traefik.ingress.kubernetes.io/router.entrypoints'] = 'web,websecure';
        annotations['traefik.ingress.kubernetes.io/router.middlewares'] = 'default-redirect-https@kubernetescrd';
      }
    } else {
      if (ingressClass !== 'nginx') {
        annotations['traefik.ingress.kubernetes.io/router.entrypoints'] = 'web';
      }
    }

    const tls: k8s.V1IngressTLS[] | undefined = app.tlsEnabled
      ? [{ hosts: [host], secretName: certSecretName }]
      : undefined;

    const body: k8s.V1Ingress = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: { name, namespace: app.namespace, labels, annotations },
      spec: {
        ingressClassName: ingressClass,
        ...(tls ? { tls } : {}),
        rules: [
          {
            host,
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: backendServiceName,
                      port: { number: backendServicePort },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    };

    await this.upsert(
      () => this.networkingApi.readNamespacedIngress(name, app.namespace),
      () => this.networkingApi.createNamespacedIngress(app.namespace, body),
      () => this.networkingApi.replaceNamespacedIngress(name, app.namespace, body),
    );
  }

  // ─── Delete Certificate cert-manager ────────────────────────────────────────

  async deleteCertificate(name: string, namespace: string): Promise<void> {
    try {
      await this.customApi.deleteNamespacedCustomObject(
        'cert-manager.io', 'v1', namespace, 'certificates', name,
      );
    } catch {
      // ignore si inexistant
    }
  }

  // ─── Scale / Restart ─────────────────────────────────────────────────────────

  async scaleDeployment(app: DbApplication, replicas: number): Promise<void> {
    await this.appsApi.patchNamespacedDeployment(
      app.name,
      app.namespace,
      [{ op: 'replace', path: '/spec/replicas', value: replicas }],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { headers: { 'Content-Type': 'application/json-patch+json' } },
    );
  }

  async restartDeployment(app: DbApplication): Promise<void> {
    const patch = [
      {
        op: 'add',
        path: '/spec/template/metadata/annotations',
        value: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() },
      },
    ];
    await this.appsApi.patchNamespacedDeployment(
      app.name,
      app.namespace,
      patch,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { headers: { 'Content-Type': 'application/json-patch+json' } },
    );
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────

  async deleteApp(app: DbApplication): Promise<void> {
    const ns = app.namespace;
    const ignore404 = (err: any) => { if (err?.statusCode !== 404) throw err; };

    await Promise.allSettled([
      this.appsApi.deleteNamespacedDeployment(app.name, ns).catch(ignore404),
      this.coreApi.deleteNamespacedService(app.name, ns).catch(ignore404),
      this.networkingApi.deleteNamespacedIngress(`${app.name}-ingress`, ns).catch(ignore404),
      this.coreApi.deleteNamespacedSecret(`${app.name}-env`, ns).catch(ignore404),
      // Supprimer uniquement le Certificate CRD — PAS le secret TLS.
      // Let's Encrypt limite à 5 certificats identiques / 7 jours.
      // Conserver le secret permet de le réutiliser si l'app est recréée
      // avec le même sous-domaine sans redemander un cert à Let's Encrypt.
      this.deleteCertificate(`${app.name}-tls`, ns),
      // ⚠️  NE PAS faire : this.coreApi.deleteNamespacedSecret(`${app.name}-tls`, ns)
      ...app.volumes.map((v) =>
        this.coreApi
          .deleteNamespacedPersistentVolumeClaim(`${app.name}-${v.name}`, ns)
          .catch(ignore404),
      ),
    ]);
  }

  // ─── Status & Logs ───────────────────────────────────────────────────────────

  async getNodeIPs(): Promise<string[]> {
    try {
      const { body } = await this.coreApi.listNode();
      return body.items
        .map((n) => n.status?.addresses?.find((a) => a.type === 'InternalIP')?.address ?? '')
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async getDeploymentStatus(app: DbApplication): Promise<AppStatusInfo> {
    const { body: dep } = await this.appsApi.readNamespacedDeployment(
      app.name,
      app.namespace,
    );

    const [pods, servicePorts, nodeIPs] = await Promise.all([
      this.listPods(app),
      this.getServicePorts(app),
      this.getNodeIPs(),
    ]);

    // Build access URLs
    let accessUrl: string | undefined;
    let nodePortUrls: string[] = [];

    if (app.subdomain && app.domain) {
      const proto = app.tlsEnabled ? 'https' : 'http';
      accessUrl = `${proto}://${app.subdomain}.${app.domain}`;
    }

    // NodePort URLs — accessible sur TOUS les nodes du cluster
    const firstNodePort = servicePorts.find((p) => p.nodePort)?.nodePort;
    if (firstNodePort) {
      nodePortUrls = nodeIPs.map((ip) => `http://${ip}:${firstNodePort}`);
      if (!accessUrl && nodePortUrls.length > 0) {
        accessUrl = nodePortUrls[0];
      }
    }

    return {
      desiredReplicas: dep.spec?.replicas ?? 0,
      availableReplicas: dep.status?.availableReplicas ?? 0,
      readyReplicas: dep.status?.readyReplicas ?? 0,
      pods,
      servicePorts,
      accessUrl,
      nodePortUrls,
    };
  }

  async listPods(app: DbApplication): Promise<K8sPodInfo[]> {
    const { body } = await this.coreApi.listNamespacedPod(
      app.namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      `app.kubernetes.io/name=${app.name}`,
    );

    return body.items.map((pod) => {
      const containerStatus = pod.status?.containerStatuses?.[0];
      const ready = containerStatus?.ready ?? false;
      const restarts = containerStatus?.restartCount ?? 0;
      const phase = pod.status?.phase ?? 'Unknown';
      const startTime = pod.status?.startTime;
      const age = startTime
        ? `${Math.round((Date.now() - new Date(startTime).getTime()) / 60000)}m`
        : 'N/A';
      const node = pod.spec?.nodeName ?? '';

      return { name: pod.metadata?.name ?? '', phase, ready, restarts, age, node };
    });
  }

  async getPodLogs(namespace: string, podName: string, tailLines = 200): Promise<string> {
    const { body } = await this.coreApi.readNamespacedPodLog(
      podName,
      namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tailLines,
      true, // timestamps
    );
    return body as unknown as string;
  }

  async streamPodLogs(
    namespace: string,
    podName: string,
    onLine: (line: string) => void,
  ): Promise<() => void> {
    const log = new k8s.Log(this.kc);
    const stream = new PassThrough();

    stream.on('data', (chunk: Buffer) => {
      chunk
        .toString()
        .split('\n')
        .filter(Boolean)
        .forEach(onLine);
    });

    await log.log(namespace, podName, '', stream, {
      follow: true,
      tailLines: 100,
      pretty: false,
      timestamps: true,
    });

    return () => stream.destroy();
  }

  // ─── Nodes ───────────────────────────────────────────────────────────────────

  async listNodes(): Promise<NodeInfo[]> {
    const { body: nodeList } = await this.coreApi.listNode();

    // Try to get metrics (metrics-server may not be present)
    let metricsMap: Record<string, { cpu: string; memory: string }> = {};
    try {
      const customApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
      const metricsResp = await customApi.listClusterCustomObject(
        'metrics.k8s.io',
        'v1beta1',
        'nodes',
      ) as any;
      const items: any[] = metricsResp?.body?.items ?? metricsResp?.items ?? [];
      for (const item of items) {
        metricsMap[item.metadata.name] = {
          cpu: item.usage?.cpu ?? '0',
          memory: item.usage?.memory ?? '0',
        };
      }
    } catch {
      // metrics-server not installed — skip
    }

    return nodeList.items.map((node): NodeInfo => {
      const name = node.metadata?.name ?? '';
      const roles: string[] = [];
      const labels = node.metadata?.labels ?? {};
      if (labels['node-role.kubernetes.io/control-plane'] !== undefined) roles.push('control-plane');
      if (labels['node-role.kubernetes.io/master'] !== undefined) roles.push('master');
      if (labels['node-role.kubernetes.io/worker'] !== undefined) roles.push('worker');
      if (roles.length === 0) roles.push('worker'); // k3s worker nodes often have no role label

      const conditions = node.status?.conditions ?? [];
      const readyCond = conditions.find((c) => c.type === 'Ready');
      const ready = readyCond?.status === 'True';

      const allocatable = node.status?.allocatable ?? {};
      const capacity = node.status?.capacity ?? {};

      const internalIP =
        node.status?.addresses?.find((a) => a.type === 'InternalIP')?.address ?? '';

      const age = node.metadata?.creationTimestamp
        ? Math.round(
            (Date.now() - new Date(node.metadata.creationTimestamp as any).getTime()) / 86400000,
          ) + 'd'
        : 'N/A';

      const metrics = metricsMap[name];

      return {
        name,
        roles,
        ready,
        internalIP,
        osImage: node.status?.nodeInfo?.osImage ?? '',
        kernelVersion: node.status?.nodeInfo?.kernelVersion ?? '',
        containerRuntime: node.status?.nodeInfo?.containerRuntimeVersion ?? '',
        k8sVersion: node.status?.nodeInfo?.kubeletVersion ?? '',
        age,
        // Capacité (allocatable)
        cpuAllocatable: allocatable['cpu'] ?? capacity['cpu'] ?? '',
        memoryAllocatable: allocatable['memory'] ?? capacity['memory'] ?? '',
        podsAllocatable: allocatable['pods'] ?? capacity['pods'] ?? '',
        // Métriques live (si metrics-server disponible)
        cpuUsage: metrics?.cpu ?? null,
        memoryUsage: metrics?.memory ?? null,
      };
    });
  }

  // ─── Apply helper ────────────────────────────────────────────────────────────

  protected async upsert<T>(
    read: () => Promise<T>,
    create: () => Promise<T>,
    update: () => Promise<T>,
  ): Promise<T> {
    try {
      await read();
      return update();
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.response?.statusCode === 404) {
        return create();
      }
      throw err;
    }
  }
}
