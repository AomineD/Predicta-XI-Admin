import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { adminEnv } from '@/lib/env';
import type { SessionPayload } from '@/lib/admin-session';
import { validateSessionPayload } from '@/lib/admin-session';

const encodedKey = new TextEncoder().encode(adminEnv.SESSION_SECRET);

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

  // Check session cookie
  const session = request.cookies.get('admin_session')?.value;
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const { payload } = await jwtVerify(session, encodedKey, { algorithms: ['HS256'] });
    const valid = await validateSessionPayload(payload as unknown as SessionPayload);
    if (!valid) {
      throw new Error('Session revoked');
    }
    return NextResponse.next();
  } catch {
    // Invalid or expired session
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
