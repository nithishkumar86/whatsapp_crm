import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth';

/**
 * Dashboard logout — clears the session cookie.
 *
 * POST /api/auth/logout
 */
export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse> {
  const res = NextResponse.json({ success: true }, { status: 200 });
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
