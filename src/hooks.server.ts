import { env, waitUntil } from 'cloudflare:workers';
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { createContext, type Context } from '#lib/server/context.ts';
import { readCookie } from '#lib/server/http/cookies.ts';
import { editionDateCookie } from '#lib/domain/edition.ts';

// Security headers for every rendered page and API response. Static files get the same set from
// _headers; keep the two lists in sync. The Content Security Policy for pages is in
// vite.config.js.
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  // Browsers ignore this over plain HTTP, so it is harmless on local http://127.0.0.1.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
} as const;

// The HTTP to HTTPS redirect is the zone's Always Use HTTPS setting, not code: wrangler dev
// presents local requests as http://<route host>, so a redirect here would loop locally.

// Build the request Context on first use. It is cheap: config is parsed once per Worker instance.
export const handle: Handle = async ({ event, resolve }) => {
  let ctx: Context | undefined;
  const context = () => (ctx ??= createContext(env, { waitUntil, editionDate: readCookie(event.request, editionDateCookie) }));
  Object.defineProperty(event.locals, 'ctx', { get: context });
  // Preload the Latin fonts along with scripts and styles, so text does not reflow when they
  // replace the fallback faces.
  const response = await resolve(event, {
    preload: ({ type, path }) => type === 'js' || type === 'css' || (type === 'font' && /-latin-(?!ext)[^/]*\.woff2$/.test(path))
  });
  try {
    for (const [name, value] of Object.entries(securityHeaders)) {
      if (!response.headers.has(name)) response.headers.set(name, value);
    }
    if (!context().config.searchIndexing) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  } catch {
    // Some responses (such as fetched ones passed through) have immutable headers; leave them.
  }
  return response;
};

// Expected errors (404s, error() calls, validation) pass through; anything else is logged,
// counted in Analytics Engine and hidden behind a generic message.
export const handleError: HandleServerError = (caught) => {
  if (caught.kind !== 'unknown') return caught.error;
  const { event } = caught;
  const error = caught.error;
  // Workers Logs drops an Error's message when it prints the stack, so log the message explicitly.
  const reason = error instanceof Error ? `${error.message}
${error.stack ?? ''}` : String(error);
  console.error('Request failed', event.request.method, event.route.id, reason);
  event.locals.ctx.metrics.write('request_error', { label: event.route.id ?? 'unknown' });
  return { message: 'Service temporarily unavailable' };
};
