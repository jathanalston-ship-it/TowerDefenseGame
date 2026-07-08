// Shared HTTP plumbing for every endpoint: JSON envelopes, size-capped body
// parsing, client IP, and the browser-write origin check. Keep this dependency-
// free — the whole functions bundle should stay small for fast cold starts.

export function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/** Uniform error envelope: { error: <machine-code>, message? } — never leaks internals. */
export function err(status: number, code: string, message?: string): Response {
  return json({ error: code, ...(message ? { message } : {}) }, status);
}

/** Parse a JSON body with a hard size cap (bytes). Returns null on any violation. */
export async function readJson<T>(request: Request, maxBytes: number): Promise<T | null> {
  const len = Number(request.headers.get('content-length') ?? '0');
  if (len > maxBytes) return null;
  let text: string;
  try {
    text = await request.text();
  } catch {
    return null;
  }
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** The connecting client IP (Cloudflare always sets CF-Connecting-IP at the edge). */
export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

/**
 * Cross-origin write rejection. Browsers attach an Origin header to POST/PUT —
 * if one is present and doesn't match the request's own host, refuse. Server-to-
 * server calls (the Stripe webhook) send no Origin and are unaffected. This is a
 * cheap CSRF/abuse cut, not the security boundary (that's tokens + validation).
 */
export function crossOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}
