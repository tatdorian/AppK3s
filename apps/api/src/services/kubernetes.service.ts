import * as k8s from '@kubernetes/client-node';
import type { DbApplication } from '../db/schema.js';
import type { AppStatusInfo, K8sPodInfo } from '@appk3s/shared';

const MANAGED_BY = 'appk3s';

export class KubernetesService {
  private kc: k8s.KubeConfig;
  private coreApi: k8s.CoreV1Api;
  private appsApi: k8s.AppsV1Api;
  private networkingApi: k8s.NetworkingV1Api;

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
  }

  // ─── Namespace ───────────────────────────────────────────────────────────────

  async ensureNamespace(namespace: string): Promise<void> {
    try {
      await this.coreApi.readNamespace({ name: namespace });
    } catch {
      await this.coreApi.createNamespace({
        body: {
          metadata: { name: namespace, labels: { 'managed-by': MANAGED_BY } },
        },
      });
    }
  }

  // ─── Labels helpers ──────────────────────────────────────────────────────────

  private labels(app: DbApplication) {
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
      () => this.coreApi.readNamespacedSecret({ name, namespace: app.namespace }),
      () => this.coreApi.createNamespacedSecret({ namespace: app.namespace, body }),
      () => this.coreApi.replaceNamespacedSecret({ name, namespace: app.namespace, body }),
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
      () => this.coreApi.readNamespacedPersistentVolumeClaim({ name, namespace: app.namespace }),
      () => this.coreApi.createNamespacedPersistentVolumeClaim({ namespace: app.namespace, body }),
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

    const spec: k8s.V1DeploymentSpec = {
      replicas: app.replicas,
      selector: { matchLabels: { 'app.kubernetes.io/name': name } },
      template: {
        metadata: { labels },
        spec: {
          containers: [
            {
              name: app.name,
              image: `${app.image}:${app.imageTag ?? 'latest'}`,
              ports: containerPorts,
              envFrom,
              volumeMounts,
              resources,
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
      () => this.appsApi.readNamespacedDeployment({ name, namespace: app.namespace }),
      () => this.appsApi.createNamespacedDeployment({ namespace: app.namespace, body }),
      () => this.appsApi.replaceNamespacedDeployment({ name, namespace: app.namespace, body }),
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

    const body: k8s.V1Service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name, namespace: app.namespace, labels },
      spec: {
        selector: { 'app.kubernetes.io/name': name },
        ports,
        type: 'ClusterIP',
      },
    };

    await this.upsert(
      () => this.coreApi.readNamespacedService({ name, namespace: app.namespace }),
      () => this.coreApi.createNamespacedService({ namespace: app.namespace, body }),
      () => this.coreApi.replaceNamespacedService({ name, namespace: app.namespace, body }),
    );
  }

  // ─── Ingress ─────────────────────────────────────────────────────────────────

  async applyIngress(app: DbApplication): Promise<void> {
    if (!app.subdomain || !app.domain) return;

    const name = `${app.name}-ingress`;
    const host = `${app.subdomain}.${app.domain}`;
    const servicePort = app.ports[0]?.containerPort ?? 80;
    const labels = this.labels(app);

    const annotations: Record<string, string> = {};
    if (app.ingressClass === 'nginx') {
      annotations['kubernetes.io/ingress.class'] = 'nginx';
    } else {
      annotations['traefik.ingress.kubernetes.io/router.entrypoints'] = app.tlsEnabled
        ? 'web,websecure'
        : 'web';
    }

    const tls: k8s.V1IngressTLS[] | undefined = app.tlsEnabled
      ? [{ hosts: [host], secretName: `${app.name}-tls` }]
      : undefined;

    const body: k8s.V1Ingress = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: { name, namespace: app.namespace, labels, annotations },
      spec: {
        ...(app.ingressClass !== 'traefik'
          ? { ingressClassName: app.ingressClass }
          : {}),
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
      () => this.networkingApi.readNamespacedIngress({ name, namespace: app.namespace }),
      () => this.networkingApi.createNamespacedIngress({ namespace: app.namespace, body }),
      () => this.networkingApi.replaceNamespacedIngress({ name, namespace: app.namespace, body }),
    );
  }

  // ─── Scale / Restart ─────────────────────────────────────────────────────────

  async scaleDeployment(app: DbApplication, replicas: number): Promise<void> {
    await this.appsApi.patchNamespacedDeployment({
      name: app.name,
      namespace: app.namespace,
      body: [{ op: 'replace', path: '/spec/replicas', value: replicas }],
    });
  }

  async restartDeployment(app: DbApplication): Promise<void> {
    const patch = [
      {
        op: 'add',
        path: '/spec/template/metadata/annotations',
        value: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() },
      },
    ];
    await this.appsApi.patchNamespacedDeployment({
      name: app.name,
      namespace: app.namespace,
      body: patch,
    });
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────

  async deleteApp(app: DbApplication): Promise<void> {
    const ns = app.namespace;
    const ignore404 = (err: any) => { if (err?.statusCode !== 404) throw err; };

    await Promise.allSettled([
      this.appsApi.deleteNamespacedDeployment({ name: app.name, namespace: ns }).catch(ignore404),
      this.coreApi.deleteNamespacedService({ name: app.name, namespace: ns }).catch(ignore404),
      this.networkingApi.deleteNamespacedIngress({ name: `${app.name}-ingress`, namespace: ns }).catch(ignore404),
      this.coreApi.deleteNamespacedSecret({ name: `${app.name}-env`, namespace: ns }).catch(ignore404),
      ...app.volumes.map((v) =>
        this.coreApi
          .deleteNamespacedPersistentVolumeClaim({ name: `${app.name}-${v.name}`, namespace: ns })
          .catch(ignore404),
      ),
    ]);
  }

  // ─── Status & Logs ───────────────────────────────────────────────────────────

  async getDeploymentStatus(app: DbApplication): Promise<AppStatusInfo> {
    const { body: dep } = await this.appsApi.readNamespacedDeployment({
      name: app.name,
      namespace: app.namespace,
    });

    const pods = await this.listPods(app);

    return {
      desiredReplicas: dep.spec?.replicas ?? 0,
      availableReplicas: dep.status?.availableReplicas ?? 0,
      readyReplicas: dep.status?.readyReplicas ?? 0,
      pods,
    };
  }

  async listPods(app: DbApplication): Promise<K8sPodInfo[]> {
    const { body } = await this.coreApi.listNamespacedPod({
      namespace: app.namespace,
      labelSelector: `app.kubernetes.io/name=${app.name}`,
    });

    return body.items.map((pod) => {
      const containerStatus = pod.status?.containerStatuses?.[0];
      const ready = containerStatus?.ready ?? false;
      const restarts = containerStatus?.restartCount ?? 0;
      const phase = pod.status?.phase ?? 'Unknown';
      const startTime = pod.status?.startTime;
      const age = startTime
        ? `${Math.round((Date.now() - new Date(startTime).getTime()) / 60000)}m`
        : 'N/A';

      return { name: pod.metadata?.name ?? '', phase, ready, restarts, age };
    });
  }

  async getPodLogs(namespace: string, podName: string, tailLines = 200): Promise<string> {
    const { body } = await this.coreApi.readNamespacedPodLog({
      name: podName,
      namespace,
      tailLines,
      timestamps: true,
    });
    return body as unknown as string;
  }

  async streamPodLogs(
    namespace: string,
    podName: string,
    onLine: (line: string) => void,
  ): Promise<() => void> {
    const log = new k8s.Log(this.kc);
    const stream = await log.log(namespace, podName, '', null, {
      follow: true,
      tailLines: 100,
      pretty: false,
      timestamps: true,
    });

    stream.on('data', (chunk: Buffer) => {
      chunk
        .toString()
        .split('\n')
        .filter(Boolean)
        .forEach(onLine);
    });

    return () => stream.destroy();
  }

  // ─── Apply helper ────────────────────────────────────────────────────────────

  private async upsert<T>(
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
