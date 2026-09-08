import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';
import { verifySession } from '@/lib/session';
import { adminEnv } from '@/lib/env';

async function proxyRequest(request: NextRequest, method: string) {
  // Verify session (except for public auth endpoints)
  const url = new URL(request.url);
  const backendPath = '/' + url.pathname.replace(/^\/api\/proxy\//, '');

  const isPublicEndpoint =
    backendPath === '/admin/verify-credentials' ||
    backendPath === '/admin/forgot-password' ||
    backendPath === '/admin/reset-password';

  let authenticatedActor: string | null = null;
  if (!isPublicEndpoint) {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Rebuild outbound headers instead of forwarding browser input. The actor
    // therefore comes from the verified server-side session, never from a
    // caller-controlled body/header.
    authenticatedActor = session.email
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 200) || null;
  }

  // Build backend request
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Admin-Token': adminEnv.ADMIN_TOKEN,
  };
  const actorSigningSecret = adminEnv.ADMIN_ACTOR_SIGNING_SECRET;
  if (authenticatedActor && actorSigningSecret) {
    const timestamp = String(Date.now());
    const payload = `${timestamp}\n${method.toUpperCase()}\n${backendPath}\n${authenticatedActor}`;
    headers['X-Admin-Actor'] = authenticatedActor;
    headers['X-Admin-Actor-Timestamp'] = timestamp;
    headers['X-Admin-Actor-Signature'] = createHmac('sha256', actorSigningSecret)
      .update(payload)
      .digest('hex');
  }

  const init: RequestInit = { method, headers };

  if (method !== 'GET' && method !== 'HEAD') {
    try {
      const body = await request.text();
      init.body = body || '{}';
    } catch {
      init.body = '{}';
    }
  }

  // Forward query params
  const backendUrl = `${adminEnv.BACKEND_URL}${backendPath}${url.search}`;

  try {
    const response = await fetch(backendUrl, init);
    const data = await response.text();

    return new NextResponse(data, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Backend unavailable', message: (error as Error).message },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest) {
  return proxyRequest(request, 'GET');
}

export async function POST(request: NextRequest) {
  return proxyRequest(request, 'POST');
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request, 'PUT');
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request, 'PATCH');
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request, 'DELETE');
}
