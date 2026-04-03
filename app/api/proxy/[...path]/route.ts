import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/session';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';

async function proxyRequest(request: NextRequest, method: string) {
  // Verify session (except for public auth endpoints)
  const url = new URL(request.url);
  const backendPath = '/' + url.pathname.replace(/^\/api\/proxy\//, '');

  const isPublicEndpoint =
    backendPath === '/admin/verify-credentials' ||
    backendPath === '/admin/forgot-password' ||
    backendPath === '/admin/reset-password';

  if (!isPublicEndpoint) {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Build backend request
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Admin-Token': ADMIN_TOKEN,
  };

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
  const backendUrl = `${BACKEND_URL}${backendPath}${url.search}`;

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
