// Hourly source collection. Each source fails independently; nothing collected is ever published.
import type { CollectorSourceId } from '#lib/config/index.ts';
import { fetchKnownExploited } from '../clients/cisa-kev.ts';
import type { CandidateLead } from '../clients/leads.ts';
import { fetchStatuspageIncidents } from '../clients/statuspage.ts';
import type { Context } from '../context.ts';
import { recordCollection, recordCollectionFailure } from '../db/candidates.ts';

type Collector = (ctx: Context) => Promise<CandidateLead[]>;

const feedOptions = ({ config }: Context) => ({ maxBytes: config.collection.maxFeedBytes, timeoutMs: config.collection.timeoutMs });
const statuspage = (origin: string): Collector => (ctx) => fetchStatuspageIncidents(ctx.http, origin, feedOptions(ctx));

/** Add a source here and to `collectorSourceIds` in #lib/config/defaults.ts. */
export const collectors: Record<CollectorSourceId, Collector> = {
  cloudflare: statuspage('https://www.cloudflarestatus.com'),
  github: statuspage('https://www.githubstatus.com'),
  cisa: (ctx) => fetchKnownExploited(ctx.http, feedOptions(ctx))
};

export type CollectionResult = { provider: CollectorSourceId; count: number } | { provider: CollectorSourceId; error: string };

/** Keep the newest version of each lead, newest first, capped per source. */
function latest(leads: CandidateLead[], limit: number): CandidateLead[] {
  const byId = new Map<string, CandidateLead>();
  for (const lead of leads) {
    if (lead.updated >= (byId.get(lead.id)?.updated ?? '')) byId.set(lead.id, lead);
  }
  return [...byId.values()].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, limit);
}

export async function runCollection(ctx: Context): Promise<CollectionResult[]> {
  const { db, config, clock, metrics } = ctx;
  return Promise.all(config.collection.sources.map(async (provider): Promise<CollectionResult> => {
    try {
      const leads = latest(await collectors[provider](ctx), config.collection.maxCandidatesPerSource);
      await recordCollection(db, provider, leads, clock.timestamp);
      metrics.write('collection', { label: provider, status: 'ok', values: [leads.length] });
      return { provider, count: leads.length };
    } catch (failure) {
      const message = failure instanceof SyntaxError ? 'Invalid feed JSON' : String((failure as Error)?.message).slice(0, 160);
      await recordCollectionFailure(db, provider, clock.timestamp, message);
      metrics.write('collection', { label: provider, status: 'error' });
      return { provider, error: message };
    }
  }));
}
