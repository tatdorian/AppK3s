import { Worker, Queue } from 'bullmq';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { KubernetesService } from '../services/kubernetes.service.js';
import { dispatchNotification } from '../services/notification.service.js';

const k8s = new KubernetesService();
const ALERT_JOB_ID = 'alert-check-recurring';

let alertQueue: Queue | null = null;

export function getAlertQueue(): Queue {
  if (!alertQueue) {
    alertQueue = new Queue('alerts', {
      connection: { url: config.redisUrl },
    });
  }
  return alertQueue;
}

async function checkAlerts(): Promise<void> {
  const rules = await db.query.alertRules.findMany({
    where: eq(schema.alertRules.enabled, true),
  });

  for (const rule of rules) {
    try {
      let currentValue: number | null = null;

      if (rule.appId) {
        // Per-app metric
        const app = await db.query.applications.findFirst({
          where: eq(schema.applications.id, rule.appId),
        });
        if (!app) continue;

        if (rule.metric === 'pod_restarts') {
          const pods = await k8s.listPods(app);
          currentValue = pods.reduce((sum, p) => sum + p.restarts, 0);
        }
        // cpu_percent / memory_percent require metrics-server pod-level metrics
        // which needs a separate API call — basic implementation skipped here
      } else {
        // Cluster-wide metric: check nodes
        if (rule.metric === 'cpu_percent' || rule.metric === 'memory_percent') {
          const nodes = await k8s.listNodes();
          const values: number[] = [];

          for (const node of nodes) {
            if (rule.metric === 'cpu_percent') {
              if (node.cpuUsage && node.cpuAllocatable) {
                const usage = parseCpuMillicores(node.cpuUsage);
                const alloc = parseCpuMillicores(node.cpuAllocatable);
                if (alloc > 0) values.push((usage / alloc) * 100);
              }
            } else if (rule.metric === 'memory_percent') {
              if (node.memoryUsage && node.memoryAllocatable) {
                const usage = parseMemoryBytes(node.memoryUsage);
                const alloc = parseMemoryBytes(node.memoryAllocatable);
                if (alloc > 0) values.push((usage / alloc) * 100);
              }
            }
          }

          if (values.length > 0) {
            currentValue = Math.max(...values);
          }
        }
      }

      if (currentValue === null) continue;

      const triggered =
        (rule.operator === 'gt' && currentValue > rule.threshold) ||
        (rule.operator === 'lt' && currentValue < rule.threshold);

      if (triggered) {
        // Rate limit: don't re-trigger if already triggered in last durationMinutes
        const cooloffMs = rule.durationMinutes * 60 * 1000;
        const lastTriggered = rule.lastTriggeredAt;
        if (lastTriggered && Date.now() - lastTriggered.getTime() < cooloffMs) {
          continue;
        }

        // Update lastTriggeredAt
        await db
          .update(schema.alertRules)
          .set({ lastTriggeredAt: new Date() })
          .where(eq(schema.alertRules.id, rule.id));

        // Dispatch notification
        let appName: string | undefined;
        if (rule.appId) {
          const app = await db.query.applications.findFirst({
            where: eq(schema.applications.id, rule.appId),
          });
          appName = app?.name;
        }

        await dispatchNotification('alert.triggered', rule.userId, {
          ruleName: rule.name,
          appName,
          appId: rule.appId ?? undefined,
          metric: rule.metric,
          value: currentValue,
        });
      }
    } catch (err) {
      console.error(`[alert-worker] Failed to check rule ${rule.id}:`, err);
    }
  }
}

export async function startAlertWorker(): Promise<Worker> {
  const queue = getAlertQueue();

  // Schedule a repeating check every minute
  await queue.add(
    'check-alerts',
    {},
    {
      repeat: { every: 60_000 }, // every minute
      jobId: ALERT_JOB_ID,
    },
  );

  const worker = new Worker(
    'alerts',
    async (_job) => {
      await checkAlerts();
    },
    {
      connection: { url: config.redisUrl },
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[alert-worker] Job ${job?.id} failed:`, err.message);
  });

  console.log('[alert-worker] Started, checking alerts every minute');
  return worker;
}

function parseCpuMillicores(cpu: string): number {
  if (cpu.endsWith('m')) return parseInt(cpu.slice(0, -1), 10);
  return parseFloat(cpu) * 1000;
}

function parseMemoryBytes(mem: string): number {
  if (mem.endsWith('Ki')) return parseInt(mem.slice(0, -2), 10) * 1024;
  if (mem.endsWith('Mi')) return parseInt(mem.slice(0, -2), 10) * 1024 * 1024;
  if (mem.endsWith('Gi')) return parseInt(mem.slice(0, -2), 10) * 1024 * 1024 * 1024;
  return parseInt(mem, 10);
}
