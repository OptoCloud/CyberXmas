// Read-only public API: edition, feed and incident detail. All share the SQL embargo rule.
import { feedFilters, type Edition, type FeedPage, type PublicIncident } from '#lib/domain/incidents.ts';
import { findPublishedIncident, listPublishedIncidents, readEdition } from '../db/incidents.ts';
import { cachedPublic } from '../http/cache.ts';
import { error, json } from '../http/respond.ts';
import type { ApiHandler, Context } from '../context.ts';

export const getIncident: ApiHandler<{ id: number }> = ({ request, locals: { ctx }, params: { id } }) => cachedPublic(request, ctx, `/api/incidents/${id}`, async () => {
  const incident = await findPublishedIncident(ctx.db, ctx.clock, id);
  return incident ? json(incident) : error(404, 'Incident not found');
});

export const listIncidents: ApiHandler = ({ request, locals: { ctx } }) => {
  const filters = feedFilters(new URL(request.url).searchParams, ctx.config.feed);
  const query = new URLSearchParams({ q: filters.query, category: filters.category, page: String(filters.page) });
  return cachedPublic(request, ctx, `/api/incidents?${query}`, async () => {
    const page = await listPublishedIncidents(ctx.db, ctx.clock, filters, ctx.config.feed.pageSize);
    return json({ ...page, page: filters.page } satisfies FeedPage<PublicIncident>);
  });
};

export const getEdition: ApiHandler = async ({ request, locals: { ctx } }) => {
  const { clock, config } = ctx;
  const rawYear = new URL(request.url).searchParams.get('year') ?? String(clock.year);
  const year = Number(rawYear);
  if (!/^\d{4}$/.test(rawYear) || year < config.edition.firstYear || year > clock.year) {
    return error(404, 'Edition not found');
  }
  return cachedPublic(request, ctx, `/api/edition?year=${year}`, () => edition(ctx, year));
};

async function edition(ctx: Context, year: number): Promise<Response> {
  const { clock, config } = ctx;
  const { calendar, years, feed } = await readEdition(ctx.db, clock, year, config.edition.latestCount);
  return json({
    year, today: clock.today, timezone: config.edition.timezone, calendar, feed,
    years: [...new Set([clock.year, ...years])],
    shiftDays: ctx.shiftDays,
    timeTravel: config.edition.timeTravel
  } satisfies Edition);
}
