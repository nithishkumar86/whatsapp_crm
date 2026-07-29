import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM encryption for secrets stored in Postgres.
 *
 * Used for the WhatsApp Business Integration System User token obtained from
 * Embedded Signup. Row Level Security already restricts live reads to the
 * service role — this adds defence in depth for database dumps, backups and
 * anything that accidentally logs a row.
 *
 * Server-side only. Requires TOKEN_ENCRYPTION_KEY: a 32-byte key supplied as
 * base64 (44 chars) or hex (64 chars).
 *
 *   openssl rand -base64 32
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce is the GCM standard
const KEY_LENGTH = 32; // AES-256

export interface EncryptedValue {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Decode TOKEN_ENCRYPTION_KEY into a 32-byte Buffer.
 * Accepts hex (64 chars) or base64 — throws if the key is missing or the
 * wrong length, so a misconfiguration fails loudly instead of silently
 * writing weakly-protected tokens.
 */
function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('Missing env var: TOKEN_ENCRYPTION_KEY');
  }

  const trimmed = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, 'hex')
    : Buffer.from(trimmed, 'base64');

  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got ${key.length}). ` +
        'Generate one with: openssl rand -base64 32',
    );
  }

  return key;
}

/**
 * True when a usable encryption key is configured. Lets callers degrade
 * gracefully (e.g. report "not configured") instead of throwing.
 */
export function isEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt a secret. Returns hex-encoded ciphertext, nonce and auth tag —
 * all three are required to decrypt.
 */
export function encryptToken(plaintext: string): EncryptedValue {
  if (!plaintext) throw new Error('encryptToken: plaintext is required');

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

/**
 * Decrypt a value produced by encryptToken().
 * Throws if the auth tag does not verify (tampered or wrong key).
 */
export function decryptToken(value: EncryptedValue): string {
  const { ciphertext, iv, authTag } = value;
  if (!ciphertext || !iv || !authTag) {
    throw new Error('decryptToken: ciphertext, iv and authTag are all required');
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
