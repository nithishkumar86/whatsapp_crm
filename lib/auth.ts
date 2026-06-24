import crypto from 'crypto';

/**
 * Internal dashboard auth (v1).
 *
 * Single shared DASHBOARD_PASSWORD gates access to /whatsapp and all
 * /api/* routes except the two public webhooks. On successful login we
 * issue an HMAC-signed session cookie. Verification is stateless — no
 * session store — using SESSION_SECRET.
 *
 * Server-side only.
 */

export const SESSION_COOKIE_NAME = 'wa_crm_session';

const SESSION_SECRET = process.env.SESSION_SECRET || '';
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || '';

// Session lifetime: 7 days.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function requireSecret(): string {
  if (!SESSION_SECRET) {
    throw new Error('Missing env var: SESSION_SECRET');
  }
  return SESSION_SECRET;
}

/**
 * Constant-time string comparison to avoid timing attacks.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Validate a submitted password against DASHBOARD_PASSWORD.
 */
export function checkPassword(password: string): boolean {
  if (!DASHBOARD_PASSWORD) {
    throw new Error('Missing env var: DASHBOARD_PASSWORD');
  }
  if (!password) return false;
  return safeEqual(password, DASHBOARD_PASSWORD);
}

function sign(payload: string): string {
  return crypto
    .createHmac('sha256', requireSecret())
    .update(payload)
    .digest('hex');
}

/**
 * Create a signed session token. Format: `<expiresAt>.<signature>`.
 */
export function createSessionToken(): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = String(expiresAt);
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

/**
 * Verify a session token: signature valid AND not expired.
 */
export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payload, signature] = parts;
  if (!payload || !signature) return false;

  const expected = sign(payload);
  if (!safeEqual(signature, expected)) return false;

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt)) return false;
  if (Date.now() > expiresAt) return false;

  return true;
}

export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
