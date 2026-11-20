import { readBoundedJson } from '#lib/util/stream.ts';

/** True when the browser says the request came from this site's own origin. */
export const isSameOrigin = (request: Request): boolean => request.headers.get('Origin') === new URL(request.url).origin;

/** Like isSameOrigin, but also accepts requests without an Origin header (non-browser clients). */
export function isSameOriginOrUnset(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

/** Parse a bounded `application/json` body, or return null. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  if (request.headers.get('Content-Type')?.split(';')[0]?.trim() !== 'application/json' || !request.body) return null;
  try {
    return await readBoundedJson(request.body, maxBytes);
  } catch {
    return null;
  }
}
