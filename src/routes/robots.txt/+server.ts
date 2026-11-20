import type { RequestHandler } from '@sveltejs/kit';

// Preview deployments (SEARCH_INDEXING=false) ask crawlers to stay out entirely.
export const GET: RequestHandler = ({ locals: { ctx } }) => new Response(
  ctx.config.searchIndexing ? 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /editorial\n' : 'User-agent: *\nDisallow: /\n',
  { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } }
);
