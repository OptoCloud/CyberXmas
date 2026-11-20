// Atlassian Statuspage v2 public incident feeds (used by Cloudflare, GitHub and many others).
import { isRecord, toIsoTimestamp } from '#lib/util/validate.ts';
import { expectJson, type HttpClient } from './http.ts';
import type { CandidateLead } from './leads.ts';

const impacts = new Set(['none', 'minor', 'major', 'critical']);
const states = new Set(['investigating', 'identified', 'monitoring', 'resolved', 'postmortem']);

function normalize(row: unknown, origin: string): CandidateLead | null {
  if (!isRecord(row)) return null;
  const title = typeof row.name === 'string' ? row.name.trim().slice(0, 250) : '';
  const { id, impact, status } = row;
  const occurred = toIsoTimestamp(row.started_at) || toIsoTimestamp(row.created_at);
  const updated = toIsoTimestamp(row.updated_at);
  if (!title || typeof id !== 'string' || !/^[a-z0-9]{1,32}$/.test(id) || !occurred || !updated
    || typeof impact !== 'string' || !impacts.has(impact) || typeof status !== 'string' || !states.has(status)) return null;
  return { id, title, url: `${origin}/incidents/${id}`, impact, status, occurred, updated, category: 'outage' };
}

export async function fetchStatuspageIncidents(http: HttpClient, origin: string, options: {
  maxBytes: number; timeoutMs: number;
}): Promise<CandidateLead[]> {
  const response = await http.request(`${origin}/api/v2/incidents.json`, {
    headers: { Accept: 'application/json' }, timeoutMs: options.timeoutMs
  });
  const data = await expectJson(response, options.maxBytes);
  const rows = isRecord(data) ? data.incidents : null;
  if (!Array.isArray(rows)) throw new Error('Invalid source feed');
  return rows.flatMap((row) => normalize(row, origin) ?? []);
}
