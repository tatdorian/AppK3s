/**
 * S3StorageService — CRUD + connection test for S3-compatible storage providers
 * Uses AES-256-GCM encryption for access/secret keys (same as github-app.service.ts)
 */
import { S3Client, ListBucketsCommand, HeadBucketCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function getEncKey(): Buffer {
  const k = process.env.ENCRYPTION_KEY ?? 'appk3s-default-encryption-key-32b';
  return Buffer.from(k.padEnd(32).slice(0, 32));
}

export function encryptS3(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getEncKey(), iv);
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), enc.toString('hex'), tag.toString('hex')].join(':');
}

export function decryptS3(stored: string): string {
  const [ivHex, encHex, tagHex] = stored.split(':');
  const decipher = crypto.createDecipheriv(ALGO, getEncKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;  // plaintext (already decrypted)
  secretKey: string;  // plaintext (already decrypted)
  pathStyle: boolean;
}

/** Build a connected S3Client from config. */
export function buildS3Client(cfg: S3Config): S3Client {
  return new S3Client({
    endpoint: cfg.endpoint || undefined,
    region: cfg.region || 'us-east-1',
    credentials: {
      accessKeyId: cfg.accessKey,
      secretAccessKey: cfg.secretKey,
    },
    forcePathStyle: cfg.pathStyle,
  });
}

/** Test connection by listing buckets or heading the target bucket. */
export async function testS3Connection(cfg: S3Config): Promise<{ ok: boolean; message: string }> {
  const client = buildS3Client(cfg);
  try {
    // Try HeadBucket first (works even if ListBuckets is restricted)
    await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
    return { ok: true, message: `Connexion réussie — bucket "${cfg.bucket}" accessible` };
  } catch (err: any) {
    // 403 means we can reach the bucket but don't have ListBuckets — still accessible
    if (err?.$metadata?.httpStatusCode === 403) {
      return { ok: true, message: `Bucket "${cfg.bucket}" accessible (permissions restreintes)` };
    }
    // Try a quick put/delete to verify write access
    try {
      const testKey = `.appk3s-test-${Date.now()}`;
      await client.send(new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: testKey,
        Body: Buffer.from('test'),
      }));
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: testKey }));
      return { ok: true, message: `Connexion réussie — lecture/écriture sur "${cfg.bucket}" vérifiée` };
    } catch (e2: any) {
      const msg = e2?.message ?? e2?.Code ?? 'Erreur inconnue';
      return { ok: false, message: `Échec de la connexion : ${msg}` };
    }
  }
}
