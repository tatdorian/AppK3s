import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const ALG = 'aes-256-gcm';
const KEY_LEN = 32;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? '';
  if (!raw) {
    // Derive from JWT_SECRET as fallback (acceptable for dev, warn for prod)
    const jwt = process.env.JWT_SECRET ?? 'fallback-dev-key-do-not-use-in-prod';
    return createHash('sha256').update(jwt).digest();
  }
  return Buffer.from(raw, 'hex').subarray(0, KEY_LEN);
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // format: base64(iv:tag:encrypted)
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decrypt(ciphertext: string): string {
  try {
    const buf = Buffer.from(ciphertext, 'base64');
    const iv  = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const key = getKey();
    const decipher = createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc) + decipher.final('utf8');
  } catch {
    // Return raw value if not encrypted (migration path)
    return ciphertext;
  }
}

/** Hash an API key for storage */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Generate a new API key: ak_base64random */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const raw = randomBytes(32).toString('base64url');
  const key = `ak_${raw}`;
  const prefix = key.substring(0, 12);
  return { key, hash: hashApiKey(key), prefix };
}
