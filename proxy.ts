import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { adminEnv } from '@/lib/env';

function getEncodedKey(): Uint8Array {
  return new TextEncoder().encode(adminEnv.SESSION_SECRET);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page, API proxy routes, and static assets
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Gate navigation on a LOCAL JWT check only (signature + expiry) — no network call.
  // Session revocation (sessionVersion) is still enforced per-request in the API proxy
  // (verifySession → validateSessionPayload), so a transient backend outage (e.g. during a
  // redeploy) must never bounce an authenticated admin back to /login and wipe their cookie.
  const session = request.cookies.get('admin_session')?.value;
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    await jwtVerify(session, getEncodedKey(), { algorithms: ['HS256'] });
    return NextResponse.next();
  } catch {
    // Malformed, tampered or expired session token
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('admin_session');
    return response;
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
