// Data for the public pages, loaded during server rendering so a page arrives complete instead
// of fetching after it loads. It calls the public API handlers, so pages share their embargo rule
// and their edge cache.
import { demoEdition, demoFeed } from '#lib/content/demo.ts';
import type { TipBoard } from '#lib/domain/community.ts';
import { feedFilters, pageSize, type Edition, type FeedPage, type PublicIncident } from '#lib/domain/incidents.ts';
import { publicView, type PublicData } from '#lib/domain/pages.ts';
import { isRecord } from '#lib/util/validate.ts';
import type { ApiHandler, Context } from '../context.ts';
import { getEdition, getIncident, listIncidents } from './public.ts';
import { listTips } from './tips.ts';

const demoYear = 2026;

/** A failure the reader should see as written, such as "Incident not found". */
class PageError extends Error {}

async function read<T, P extends Record<string, unknown>>(handler: ApiHandler<P>, origin: string, path: string, locals: { ctx: Context }, params: P, cookie = ''): Promise<T> {
  const response = await handler({ request: new Request(origin + path, cookie ? { headers: { Cookie: cookie } } : {}), params, locals });
  const body: unknown = await response.json();
  if (!response.ok) throw new PageError(isRecord(body) && typeof body.error === 'string' ? body.error : 'Could not load the latest stories');
  return body as T;
}

function demoPage(url: URL): PublicData {
  const { view, id } = publicView(url.pathname);
  const data: PublicData = { demo: true, edition: demoEdition(demoYear), feed: null, incident: null, tips: null, error: '' };
  if (view === 'home' || view === 'calendar') {
    const year = Number((view === 'calendar' ? url.searchParams.get('year') : null) ?? demoYear);
    if ([2026, 2025].includes(year)) data.edition = demoEdition(year);
    else data.error = 'Edition not found';
  } else if (view === 'feed') {
    const filters = feedFilters(url.searchParams);
    const matches = demoFeed.filter((item) => (!filters.category || item.category === filters.category)
      && `${item.title} ${item.summary}`.toLowerCase().includes(filters.query.toLowerCase()));
    data.feed = {
      items: matches.slice((filters.page - 1) * pageSize, filters.page * pageSize),
      page: filters.page,
      hasMore: filters.page * pageSize < matches.length
    };
  } else if (view === 'detail') {
    data.incident = demoFeed.find((item) => item.id === id) ?? null;
    if (!data.incident) data.error = 'Incident not found';
  }
  return data;
}

/** `dev` is SvelteKit's dev flag: `pnpm dev` shows demo stories unless the URL says otherwise. */
export async function loadPublicPage({ url, request, locals }: { url: URL; request: Request; locals: { ctx: Context } }, dev: boolean): Promise<PublicData> {
  if (url.searchParams.get('demo') === '1' || (dev && !url.searchParams.has('demo'))) return demoPage(url);
  const { view, id } = publicView(url.pathname);
  const data: PublicData = { demo: false, edition: null, feed: null, incident: null, tips: null, error: '' };
  const none: Record<string, never> = {};
  const year = view === 'calendar' ? url.searchParams.get('year') : null;
  // Every page shows the edition's date in its masthead, but only home and calendar depend on it;
  // elsewhere it loads alongside the page's own content and may quietly be missing.
  const masthead = view === 'home' || view === 'calendar' ? null
    : read<Edition, typeof none>(getEdition, url.origin, '/api/edition', locals, none).catch(() => null);
  try {
    if (!masthead) {
      const query = year === null ? '' : `?${new URLSearchParams({ year })}`;
      data.edition = await read<Edition, typeof none>(getEdition, url.origin, `/api/edition${query}`, locals, none);
    } else if (view === 'feed') {
      data.feed = await read<FeedPage<PublicIncident>, typeof none>(listIncidents, url.origin, `/api/incidents${url.search}`, locals, none);
    } else if (view === 'detail' && id !== null) {
      data.incident = await read<PublicIncident, { id: number }>(getIncident, url.origin, `/api/incidents/${id}`, locals, { id });
    } else if (view === 'submit') {
      // The board depends on who is signed in, so it is read with the visitor's own cookies.
      data.tips = await read<TipBoard, typeof none>(listTips, url.origin, '/api/tips', locals, none, request.headers.get('Cookie') ?? '').catch(() => null);
    }
  } catch (failure) {
    if (!(failure instanceof PageError)) console.error('Page data failed', url.pathname, failure);
    data.error = failure instanceof PageError ? failure.message : 'Could not load the latest stories';
  }
  if (masthead) data.edition = await masthead;
  return data;
}
