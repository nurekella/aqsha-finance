import { useAuthStore } from './auth-store';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  skipAuth?: boolean;
  skipRefreshOn401?: boolean;
}

let refreshPromise: Promise<boolean> | null = null;

async function rawRequest(path: string, options: ApiOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  if (!options.skipAuth) {
    const token = useAuthStore.getState().accessToken;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  return fetch(path, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { accessToken?: string };
        if (!data.accessToken) return false;
        useAuthStore.getState().setAccessToken(data.accessToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  let response = await rawRequest(path, options);

  if (response.status === 401 && !options.skipAuth && !options.skipRefreshOn401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      response = await rawRequest(path, options);
    } else {
      useAuthStore.getState().clear();
    }
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson && response.status !== 204 ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const code = isErrorPayload(payload) ? payload.code ?? extractCode(payload) : undefined;
    const message = isErrorPayload(payload)
      ? typeof payload.message === 'string'
        ? payload.message
        : Array.isArray(payload.message)
          ? payload.message.join(', ')
          : `Request failed (${response.status})`
      : `Request failed (${response.status})`;
    throw new ApiError(response.status, message, code, payload);
  }

  return payload as T;
}

function isErrorPayload(value: unknown): value is { message?: unknown; code?: unknown } {
  return typeof value === 'object' && value !== null;
}

function extractCode(payload: unknown): string | undefined {
  if (typeof payload === 'object' && payload !== null) {
    const obj = payload as { error?: { code?: unknown }; code?: unknown };
    if (typeof obj.code === 'string') return obj.code;
    if (typeof obj.error?.code === 'string') return obj.error.code;
  }
  return undefined;
}
