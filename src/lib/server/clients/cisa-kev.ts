// CISA Known Exploited Vulnerabilities catalog.
import { isRecord, toIsoTimestamp } from '#lib/util/validate.ts';
import { expectJson, type HttpClient } from './http.ts';
import type { CandidateLead } from './leads.ts';

export const kevOrigin = 'https://www.cisa.gov';
const feedPath = '/sites/default/files/feeds/known_exploited_vulnerabilities.json';

function normalize(row: unknown): CandidateLead | null {
  if (!isRecord(row)) return null;
  const id = row.cveID;
  const added = toIsoTimestamp(row.dateAdded);
  const name = typeof row.vulnerabilityName === 'string' ? row.vulnerabilityName.trim() : '';
  if (typeof id !== 'string' || !/^CVE-\d{4}-\d{4,}$/.test(id) || !added || !name) return null;
  return {
    id, title: `${id}: ${name}`.slice(0, 250), url: `${kevOrigin}/known-exploited-vulnerabilities-catalog`,
    impact: 'none', status: 'cataloged', occurred: added, updated: added, category: 'vulnerability'
  };
}

export async function fetchKnownExploited(http: HttpClient, options: { maxBytes: number; timeoutMs: number }): Promise<CandidateLead[]> {
  const response = await http.request(`${kevOrigin}${feedPath}`, {
    headers: { Accept: 'application/json' }, timeoutMs: options.timeoutMs
  });
  const data = await expectJson(response, options.maxBytes);
  const rows = isRecord(data) ? data.vulnerabilities : null;
  if (!Array.isArray(rows)) throw new Error('Invalid source feed');
  return rows.flatMap((row) => normalize(row) ?? []);
}
