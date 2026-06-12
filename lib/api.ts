const BASE_URL = '/api/proxy';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  // The API proxy returns 401 when the session is missing, expired or revoked
  // (sessionVersion bump). The navigation middleware only does a local JWT check, so
  // this is where a revoked/expired session is caught — bounce the admin to /login.
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login';
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body?.error?.message ?? body?.message ?? `HTTP ${res.status}`);
  }

  const json = await res.json() as { success: boolean; data: T };
  return json.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body != null ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body != null ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body != null ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
