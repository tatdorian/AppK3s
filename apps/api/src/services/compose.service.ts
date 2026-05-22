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

export class ComposeService {
  constructor(private k8s: KubernetesService) {}

  parse(content: string): ComposeFile {
    const parsed = yaml.load(content) as ComposeFile;
    if (!parsed?.services) throw new Error('Invalid docker-compose: missing "services" key');
    return parsed;
  }

  // Deploy a compose-type application: one Deployment + Service per service
  async deployCompose(app: DbApplication): Promise<void> {
    const compose = this.parse(app.composeContent!);

    // Create PVCs for named volumes first
    for (const volumeName of Object.keys(compose.volumes ?? {})) {
      await this.k8s.applyPVC(app, volumeName, '1Gi');
    }

    for (const [serviceName, svc] of Object.entries(compose.services)) {
      await this.deployComposeService(app, serviceName, svc, compose);
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
      // named volume: "pgdata:/var/lib/postgresql/data"
      const [volName, mountPath] = vol.split(':');
      if (volName && mountPath && !volName.startsWith('./') && !volName.startsWith('/')) {
        volumeMounts.push({ name: volName, mountPath });
        volumes.push({
          name: volName,
          persistentVolumeClaim: { claimName: `${app.name}-${volName}` },
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
      await appsApi.replaceNamespacedDeployment(name, ns, deploymentBody);
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.response?.statusCode === 404) {
        await appsApi.createNamespacedDeployment(ns, deploymentBody);
      } else {
        throw err;
      }
    }

    // Service
    if (ports.length > 0) {
      const svcBody: k8s.V1Service = {
        metadata: { name, namespace: ns },
        spec: {
          selector: { 'app.kubernetes.io/name': name },
          ports: ports.map((p) => ({ port: p, targetPort: p as any, protocol: 'TCP' })),
          type: 'ClusterIP',
        },
      };
      try {
        await coreApi.readNamespacedService(name, ns);
        await coreApi.replaceNamespacedService(name, ns, svcBody);
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.response?.statusCode === 404) {
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

    for (const volName of Object.keys(compose.volumes ?? {})) {
      await coreApi
        .deleteNamespacedPersistentVolumeClaim(`${app.name}-${volName}`, ns)
        .catch(ignore);
    }
  }
}
