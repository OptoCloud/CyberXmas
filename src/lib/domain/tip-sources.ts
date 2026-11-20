import { parseHttpsUrl } from '#lib/util/validate.ts';

/** [label, accepted hostnames (canonical first), allowed path pattern] */
export type TrustedSource = readonly [label: string, hosts: readonly string[], path: RegExp];

export const trustedTipSources: readonly TrustedSource[] = [
  ['CISA advisories and alerts', ['www.cisa.gov', 'cisa.gov'], /^\/news-events\/(?:cybersecurity-advisories|alerts)\/[\w-]+$/i],
  ['GitHub Advisory Database', ['github.com'], /^\/advisories\/GHSA-(?:[a-z0-9]{4}-){2}[a-z0-9]{4}$/i],
  ['Microsoft Security Response Center', ['msrc.microsoft.com'], /^\/(?:blog\/\d{4}\/\d{2}\/[\w-]+|update-guide\/(?:vulnerability|advisory)\/[\w-]+)$/i],
  ['Cloudflare Blog', ['blog.cloudflare.com'], /^\/[\w-]+$/],
  ['Cloudflare Status', ['www.cloudflarestatus.com', 'cloudflarestatus.com'], /^\/incidents\/[a-z0-9]+$/],
  ['GitHub Status', ['www.githubstatus.com', 'githubstatus.com'], /^\/incidents\/[a-z0-9]+$/],
  ['AWS Security Bulletins', ['aws.amazon.com'], /^\/security\/security-bulletins\/[\w-]+$/i],
  ['Google Cloud Service Health', ['status.cloud.google.com'], /^\/incidents\/[a-z0-9]+$/i],
  ['BleepingComputer', ['www.bleepingcomputer.com', 'bleepingcomputer.com'], /^\/news\/security\/[\w-]+$/],
  ['The Hacker News', ['thehackernews.com', 'www.thehackernews.com'], /^\/\d{4}\/\d{2}\/[\w-]+\.html$/],
  ['KrebsOnSecurity', ['krebsonsecurity.com', 'www.krebsonsecurity.com'], /^\/\d{4}\/\d{2}\/[\w-]+$/]
];

const cloudflareBlogIndexes = new Set(['about', 'authors', 'archive', 'tag', 'tags', 'page', 'search']);
const cvePattern = /^CVE-\d{4}-\d{4,19}$/;

export interface TipSource {
  /** Canonical source URL, used for deduplication. */
  url: string;
  /** Set when the tip cites a CVE record. */
  cve?: string;
}

function cveSource(id: string | null | undefined): TipSource | null {
  const cve = id?.trim().toUpperCase() ?? '';
  return cvePattern.test(cve) ? { cve, url: `https://www.cve.org/CVERecord?id=${cve}` } : null;
}

/** Canonicalize a tip's evidence: exactly one CVE ID or one direct link from a trusted source. */
export function tipSource(cve: unknown, sourceUrl: unknown): TipSource | null {
  if (typeof cve !== 'string' || typeof sourceUrl !== 'string' || cve.length > 32 || sourceUrl.length > 2048) return null;
  if (cve.trim()) return !sourceUrl.trim() ? cveSource(cve) : null;
  const source = parseHttpsUrl(sourceUrl, { allowPort: false });
  if (!source) return null;
  const path = source.pathname.replace(/\/$/, '');
  if (['www.cve.org', 'cve.org'].includes(source.hostname) && path === '/CVERecord') {
    return cveSource(source.searchParams.get('id'));
  }
  if (source.hostname === 'nvd.nist.gov' && /^\/vuln\/detail\/CVE-/i.test(path)) {
    return cveSource(path.split('/').at(-1));
  }
  const trusted = trustedTipSources.find(([, hosts, match]) => hosts.includes(source.hostname) && match.test(path));
  if (!trusted || (source.hostname === 'blog.cloudflare.com' && cloudflareBlogIndexes.has(path.slice(1)))) return null;
  const host = trusted[1][0]!;
  return { url: `https://${host}${host === 'github.com' ? path.toLowerCase() : path}` };
}
