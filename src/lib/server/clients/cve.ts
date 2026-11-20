// CVE Program record lookups (CVE Services API).
import { isRecord } from '#lib/util/validate.ts';
import { expectJson, type HttpClient } from './http.ts';

export type CveRecordState = 'published' | 'missing' | 'unavailable';

export async function getCveRecordState(http: HttpClient, id: string): Promise<CveRecordState> {
  const response = await http.request(`https://cveawg.mitre.org/api/cve/${encodeURIComponent(id)}`);
  if (response.status === 404) return 'missing';
  if (!response.ok) return 'unavailable';
  const record = await expectJson(response, 2 * 1024 * 1024);
  const metadata = isRecord(record) && isRecord(record.cveMetadata) ? record.cveMetadata : null;
  return metadata?.cveId === id && metadata.state === 'PUBLISHED' ? 'published' : 'missing';
}
