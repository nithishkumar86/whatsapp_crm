import { NextRequest, NextResponse } from 'next/server';

/**
 * Session auth middleware.
 *
 * Protects /whatsapp and all /api/* routes EXCEPT the two public webhooks
 * (/api/webhook/whatsapp, /api/webhook/3sigma) and the auth endpoints
 * (/api/auth/login, /api/auth/logout).
 *
 * The session cookie is an HMAC-signed token in the format
 * `<expiresAt>.<signature>` produced by lib/auth.ts. Middleware runs on the
 * Edge runtime, so we verify the HMAC here with Web Crypto (subtle) rather
 * than importing Node's crypto from lib/auth.
 *
 * Keep the cookie name + secret in sync with lib/auth.ts.
 */

const SESSION_COOKIE_NAME = 'wa_crm_session';

// Paths that bypass auth entirely.
const PUBLIC_API_PREFIXES = [
  '/api/webhook/whatsapp',
  '/api/webhook/3sigma',
  '/api/auth/login',
  '/api/auth/logout',
];

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Constant-time-ish hex string comparison.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyToken(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!token || !secret) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  if (!payload || !signature) return false;

  // Recompute HMAC-SHA256(payload) with the shared secret.
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload),
  );
  const expected = toHex(sigBuf);

  if (!timingSafeEqualHex(signature, expected)) return false;

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt)) return false;
  if (Date.now() > expiresAt) return false;

  return true;
}

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Public webhooks + auth endpoints bypass the gate.
  if (isPublicApi(pathname)) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith('/api/');
  const isDashboard = pathname === '/whatsapp' || pathname.startsWith('/whatsapp/');
  const isHome = pathname === '/home' || pathname.startsWith('/home/');
  const isAdminDash = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  const isCron = pathname === '/cron' || pathname.startsWith('/cron/');
  const isAnalytics = pathname === '/analytics' || pathname.startsWith('/analytics/');

  // Only /whatsapp, /dashboard, /cron, /analytics, /home and protected /api/* are gated; everything else passes.
  if (!isApi && !isDashboard && !isHome && !isAdminDash && !isCron && !isAnalytics) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET || '';
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const valid = await verifyToken(token, secret);

  if (valid) {
    return NextResponse.next();
  }

  // Unauthenticated API call → 401 JSON.
  if (isApi) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Unauthenticated dashboard → redirect to home (login lives there in Phase 3).
  const url = req.nextUrl.clone();
  url.pathname = '/';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on /whatsapp and all /api routes. Static assets are excluded.
  matcher: ['/whatsapp/:path*', '/dashboard/:path*', '/cron/:path*', '/analytics/:path*', '/home/:path*', '/api/:path*'],
};
