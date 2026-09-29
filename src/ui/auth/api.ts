/** Browser-side helper for the JSON auth API. Same-origin only; the browser adds the Origin header the server checks. */

export interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string>;
  data?: Record<string, string | null>;
  requestId?: string;
}

export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: ApiError;
}

export async function apiRequest<T = unknown>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'GET',
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const res = await fetch(path, init);
    const json = (await res.json().catch(() => null)) as { error?: ApiError } | T | null;
    if (res.ok) return { ok: true, status: res.status, data: json as T };
    const error = (json as { error?: ApiError } | null)?.error ?? {
      code: 'INTERNAL',
      message: 'Something went wrong on our side.',
    };
    return { ok: false, status: res.status, error };
  } catch {
    return {
      ok: false,
      status: 0,
      error: { code: 'NETWORK', message: 'Could not reach Howdy. Check your connection and try again.' },
    };
  }
}

export const postJson = <T = unknown>(path: string, body: unknown) => apiRequest<T>('POST', path, body);
