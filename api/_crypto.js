import crypto from 'crypto';

// AES-256-GCM helpers for sensitive profile fields (SSN last 4, CAF). The key lives only in the
// PROFILE_ENCRYPTION_KEY environment variable (64 hex characters = 32 bytes).
function getKey() {
  const hex = process.env.PROFILE_ENCRYPTION_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('PROFILE_ENCRYPTION_KEY is missing or not 64 hex characters.');
  return Buffer.from(hex, 'hex');
}

export function encryptValue(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'enc:v1:' + Buffer.concat([iv, tag, enc]).toString('base64');
}

// Legacy plaintext values (not starting with "enc:v1:") are returned unchanged.
export function decryptValue(value) {
  if (typeof value !== 'string' || !value.startsWith('enc:v1:')) return value;
  const raw = Buffer.from(value.slice(7), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
