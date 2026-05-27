import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { execSync, spawn } from 'node:child_process';
import { createWriteStream, readFileSync, unlinkSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../db/index.js';
import { schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import type { DbBackupConfig } from '../db/schema.js';

type DbType = 'postgres' | 'mysql' | 'mongodb' | 'redis';

// Detect DB type from container image name
function detectDbType(image: string): DbType | null {
  const img = image.toLowerCase();
  if (img.includes('postgres') || img.includes('pg')) return 'postgres';
  if (img.includes('mysql') || img.includes('mariadb')) return 'mysql';
  if (img.includes('mongo')) return 'mongodb';
  if (img.includes('redis')) return 'redis';
  return null;
}

// Build dump command based on DB type and env vars
function buildDumpCommand(dbType: DbType, envVars: { key: string; value: string }[]): string {
  const env = Object.fromEntries(envVars.map((e) => [e.key, e.value]));

  switch (dbType) {
    case 'postgres': {
      const host = env['POSTGRES_HOST'] || 'localhost';
      const user = env['POSTGRES_USER'] || 'postgres';
      const dbName = env['POSTGRES_DB'] || 'postgres';
      const pass = env['POSTGRES_PASSWORD'] || '';
      return `PGPASSWORD='${pass}' pg_dump -h ${host} -U ${user} ${dbName}`;
    }
    case 'mysql': {
      const user = env['MYSQL_USER'] || env['MYSQL_ROOT_USER'] || 'root';
      const pass = env['MYSQL_PASSWORD'] || env['MYSQL_ROOT_PASSWORD'] || '';
      const dbName = env['MYSQL_DATABASE'] || '';
      return `mysqldump -u ${user} -p'${pass}' ${dbName}`;
    }
    case 'mongodb': {
      const host = env['MONGODB_HOST'] || 'localhost';
      const port = env['MONGODB_PORT'] || '27017';
      return `mongodump --host ${host}:${port} --archive`;
    }
    default:
      throw new Error(`Unsupported DB type: ${dbType}`);
  }
}

// Run kubectl exec and capture output
function kubectlExecDump(
  namespace: string,
  podName: string,
  containerName: string,
  command: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const kubeconfig = process.env.KUBECONFIG || '';
    const env = kubeconfig ? { ...process.env, KUBECONFIG: kubeconfig } : process.env;

    const args = [
      'exec',
      podName,
      '-n', namespace,
      '-c', containerName,
      '--',
      '/bin/sh', '-c', command,
    ];

    const proc = spawn('kubectl', args, { env: env as NodeJS.ProcessEnv });
    const out = createWriteStream(outputPath);

    proc.stdout.pipe(out);

    let errOutput = '';
    proc.stderr.on('data', (d: Buffer) => { errOutput += d.toString(); });

    proc.on('close', (code) => {
      out.close();
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`kubectl exec exited with code ${code}: ${errOutput}`));
      }
    });

    proc.on('error', reject);
  });
}

export async function runBackup(configId: string): Promise<void> {
  const startTime = Date.now();

  // Look up config
  const config = await db.query.backupConfigs.findFirst({
    where: eq(schema.backupConfigs.id, configId),
  });
  if (!config) throw new Error(`Backup config ${configId} not found`);

  // Look up app
  const application = await db.query.applications.findFirst({
    where: eq(schema.applications.id, config.appId),
  });
  if (!application) throw new Error(`Application ${config.appId} not found`);

  // Create a run record
  const [run] = await db
    .insert(schema.backupRuns)
    .values({ configId, status: 'running' })
    .returning();

  const tmpFile = join(tmpdir(), `backup-${config.id}-${Date.now()}.dump`);

  try {
    // Get the first running pod
    const kubeconfig = process.env.KUBECONFIG || '';
    const kubeconfigEnv = kubeconfig ? `KUBECONFIG=${kubeconfig} ` : '';
    const podsOutput = execSync(
      `${kubeconfigEnv}kubectl get pods -n ${application.namespace} -l app.kubernetes.io/name=${application.name} --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}'`,
      { encoding: 'utf8' },
    ).trim().replace(/'/g, '');

    if (!podsOutput) throw new Error('No running pods found for backup');

    const podName = podsOutput;
    const containerName = application.name;

    // Detect DB type from image
    const dbType = detectDbType(application.image || '');
    if (!dbType) throw new Error(`Cannot detect DB type from image: ${application.image}`);
    if (dbType === 'redis') throw new Error('Redis backup via RDB not yet supported via kubectl exec');

    // Build dump command
    const dumpCmd = buildDumpCommand(dbType, application.envVars);

    // Run the dump
    await kubectlExecDump(application.namespace, podName, containerName, dumpCmd, tmpFile);

    const fileStats = statSync(tmpFile);
    const sizeBytes = fileStats.size;

    let destinationPath: string;

    if (config.destination === 's3' && config.s3Config) {
      const s3Cfg = config.s3Config;
      const s3 = new S3Client({
        region: s3Cfg.region,
        ...(s3Cfg.endpoint ? { endpoint: s3Cfg.endpoint } : {}),
        credentials: {
          accessKeyId: s3Cfg.accessKey,
          secretAccessKey: s3Cfg.secretKey,
        },
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const prefix = s3Cfg.prefix ? `${s3Cfg.prefix}/` : '';
      const key = `${prefix}${application.name}/${timestamp}.dump`;

      const fileBuffer = readFileSync(tmpFile);
      await s3.send(new PutObjectCommand({
        Bucket: s3Cfg.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: 'application/octet-stream',
      }));

      destinationPath = `s3://${s3Cfg.bucket}/${key}`;

      // Cleanup old backups in S3
      await cleanupOldS3Backups(s3, s3Cfg.bucket, `${prefix}${application.name}/`, config.retentionDays);
    } else {
      // Local destination
      const localDir = config.localPath || join(tmpdir(), 'appk3s-backups', application.name);
      if (!existsSync(localDir)) {
        mkdirSync(localDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      destinationPath = join(localDir, `${timestamp}.dump`);

      // Move tmp file to destination
      execSync(`mv ${tmpFile} ${destinationPath}`);

      // Cleanup old local backups
      await cleanupOldLocalBackups(localDir, config.retentionDays);
    }

    const durationMs = Date.now() - startTime;

    // Update run record
    await db
      .update(schema.backupRuns)
      .set({
        status: 'success',
        sizeBytes,
        durationMs,
        destinationPath,
        completedAt: new Date(),
      })
      .where(eq(schema.backupRuns.id, run.id));

    // Update config lastRunAt
    await db
      .update(schema.backupConfigs)
      .set({ lastRunAt: new Date() })
      .where(eq(schema.backupConfigs.id, configId));
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startTime;

    // Update run with failure
    await db
      .update(schema.backupRuns)
      .set({
        status: 'failed',
        durationMs,
        error,
        completedAt: new Date(),
      })
      .where(eq(schema.backupRuns.id, run.id));

    // Cleanup tmp file
    try {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    } catch {
      // ignore
    }

    throw err;
  }

  // Cleanup tmp file
  try {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  } catch {
    // ignore
  }
}

async function cleanupOldS3Backups(
  s3: S3Client,
  bucket: string,
  prefix: string,
  retentionDays: number,
): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    const toDelete = (list.Contents ?? [])
      .filter((obj) => obj.LastModified && obj.LastModified < cutoff && obj.Key)
      .map((obj) => ({ Key: obj.Key! }));

    if (toDelete.length > 0) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: toDelete },
      }));
    }
  } catch {
    // Non-fatal: cleanup errors should not fail the backup
  }
}

async function cleanupOldLocalBackups(dir: string, retentionDays: number): Promise<void> {
  try {
    const { readdirSync, statSync: fstatSync, unlinkSync: funlinkSync } = await import('node:fs');
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const files = readdirSync(dir);
    for (const file of files) {
      const filePath = join(dir, file);
      const stat = fstatSync(filePath);
      if (stat.mtimeMs < cutoff) {
        funlinkSync(filePath);
      }
    }
  } catch {
    // Non-fatal
  }
}
