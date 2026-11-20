const baseHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const;

export type HeaderMap = Record<string, string>;

export function json(data: unknown, status = 200, headers: HeaderMap = {}): Response {
  return Response.json(data, { status, headers: { ...baseHeaders, ...headers } });
}

export const error = (status: number, message: string, headers?: HeaderMap): Response => json({ error: message }, status, headers);

export const methodNotAllowed = (allow: string[]): Response => error(405, 'Method not allowed', { Allow: allow.join(', ') });

export const tooManyAttempts = (): Response => error(429, 'Too many attempts. Try again in a minute.', { 'Retry-After': '60' });

/** A 303 redirect that never leaks the current URL and may set cookies. */
export function redirect(location: string, ...cookies: string[]): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}
