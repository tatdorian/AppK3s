import { Worker, Queue } from 'bullmq';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

let backupQueue: Queue | null = null;

export function getBackupQueue(): Queue {
  if (!backupQueue) {
    backupQueue = new Queue('backups', {
      connection: { url: config.redisUrl },
    });
  }
  return backupQueue;
}

export async function startBackupWorker(): Promise<Worker> {
  const queue = getBackupQueue();

  const worker = new Worker(
    'backups',
    async (job) => {
      const { configId } = job.data as { configId: string };
      if (!configId) throw new Error('Missing configId in job data');

      const { runBackup } = await import('../services/backup.service.js');
      await runBackup(configId);
    },
    {
      connection: { url: config.redisUrl },
      concurrency: 2,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[backup-worker] Job ${job.id} completed for configId=${job.data.configId}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[backup-worker] Job ${job?.id} failed:`, err.message);
    // Dispatch failure notification if we have a userId from config
    if (job?.data?.configId) {
      db.query.backupConfigs.findFirst({
        where: eq(schema.backupConfigs.id, job.data.configId),
      }).then(async (backupCfg) => {
        if (!backupCfg) return;
        const app = await db.query.applications.findFirst({
          where: eq(schema.applications.id, backupCfg.appId),
        });
        if (!app) return;

        // Find an admin or owner to notify (use app creator via appPermissions)
        const perm = await db.query.appPermissions.findFirst({
          where: eq(schema.appPermissions.appId, backupCfg.appId),
        });
        if (!perm) return;

        const { dispatchNotification } = await import('../services/notification.service.js');
        await dispatchNotification('backup.fail', perm.userId, {
          appName: app.name,
          appId: app.id,
          configName: backupCfg.name,
          error: err.message,
        });
      }).catch(() => {/* ignore notification errors */});
    }
  });

  // Schedule backup jobs from DB configs
  await scheduleCronBackups(queue);

  return worker;
}

// Schedule all enabled backup configs as repeatable jobs
async function scheduleCronBackups(queue: Queue): Promise<void> {
  try {
    const configs = await db.query.backupConfigs.findMany({
      where: eq(schema.backupConfigs.enabled, true),
    });

    for (const cfg of configs) {
      await queue.add(
        'backup',
        { configId: cfg.id },
        {
          repeat: { pattern: cfg.schedule },
          jobId: `backup-cron-${cfg.id}`,
        },
      );
    }

    console.log(`[backup-worker] Scheduled ${configs.length} backup job(s)`);
  } catch (err) {
    console.error('[backup-worker] Failed to schedule cron backups:', err);
  }
}
