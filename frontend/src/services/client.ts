// HTTP transport for the service layer. All data comes from the backend.

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

export async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError('Can’t reach the promotions server. Check that the backend is running.', 0, 'NETWORK');
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const body = await res.json();
      message = body?.error?.message ?? message;
      code = body?.error?.code;
    } catch {
      // Non-JSON error body: keep the generic message.
    }
    throw new ApiError(message, res.status, code);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
export const put = (body: unknown): RequestInit => ({ method: 'PUT', body: JSON.stringify(body) });
export const patch = (body: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(body) });
