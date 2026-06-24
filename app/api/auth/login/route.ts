import { NextRequest, NextResponse } from 'next/server';
import {
  checkPassword,
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth';

/**
 * Dashboard login.
 *
 * POST /api/auth/login  Body: { password }
 *   On success → set the signed HMAC session cookie (httpOnly).
 *
 * This route is public (the gate itself) — middleware allows it through so
 * unauthenticated users can obtain a session.
 *
 * Node runtime: lib/auth uses Node crypto.
 */
export const runtime = 'nodejs';

interface LoginBody {
  password?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const password = typeof body.password === 'string' ? body.password : '';

  let ok = false;
  try {
    ok = checkPassword(password);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'auth misconfigured';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (!ok) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = createSessionToken();
  const res = NextResponse.json({ success: true }, { status: 200 });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
