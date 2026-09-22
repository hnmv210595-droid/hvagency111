export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}
