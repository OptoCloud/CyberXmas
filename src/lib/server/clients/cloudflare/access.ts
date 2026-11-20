// Cloudflare Access: verify the `Cf-Access-Jwt-Assertion` header that Access adds to
// requests it has authenticated. Never trust the header without verifying it: anyone who
// can reach the Worker without passing through Access could otherwise forge it.
import { base64UrlDecode, utf8 } from '#lib/util/encoding.ts';
import { isRecord } from '#lib/util/validate.ts';
import { expectJson, type HttpClient } from '../http.ts';

export const accessJwtHeader = 'Cf-Access-Jwt-Assertion';

export interface AccessIdentity {
  /** Stable subject identifier from the identity provider. */
  subject: string;
  /** Signed-in user's email, absent for service tokens. */
  email?: string;
  /** Service token client ID, absent for users. */
  commonName?: string;
}

export interface AccessOptions {
  teamDomain: string;
  audience: string;
  now: Date;
  clockSkewSeconds: number;
  certsTtlSeconds: number;
}

interface KeySet {
  fetchedAt: number;
  keys: Map<string, CryptoKey>;
}

/** Signing keys per team domain. Module scope so an isolate reuses them across requests. */
const keySets = new Map<string, KeySet>();
const minimumRefetchMs = 30_000;

async function fetchKeys(http: HttpClient, teamDomain: string, now: number): Promise<KeySet> {
  const data = await expectJson(await http.request(`https://${teamDomain}/cdn-cgi/access/certs`), 256 * 1024);
  const keys = new Map<string, CryptoKey>();
  for (const jwk of isRecord(data) && Array.isArray(data.keys) ? data.keys : []) {
    if (!isRecord(jwk) || jwk.kty !== 'RSA' || typeof jwk.kid !== 'string') continue;
    keys.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk as JsonWebKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  const set = { fetchedAt: now, keys };
  keySets.set(teamDomain, set);
  return set;
}

async function signingKey(http: HttpClient, kid: string, options: AccessOptions): Promise<CryptoKey | undefined> {
  const now = options.now.getTime();
  let set = keySets.get(options.teamDomain);
  if (!set || now - set.fetchedAt > options.certsTtlSeconds * 1000) set = await fetchKeys(http, options.teamDomain, now);
  // Unknown key ID: Access may have rotated keys. Refetch, but not on every forged token.
  if (!set.keys.has(kid) && now - set.fetchedAt > minimumRefetchMs) set = await fetchKeys(http, options.teamDomain, now);
  return set.keys.get(kid);
}

function decodeJson(segment: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(utf8.decode(base64UrlDecode(segment)));
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

/** Verify an Access application token. Returns null for any invalid, expired or foreign token. */
export async function verifyAccessJwt(http: HttpClient, token: string | null, options: AccessOptions): Promise<AccessIdentity | null> {
  if (!token || token.length > 8192) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerText, payloadText, signatureText] = parts as [string, string, string];
  const header = decodeJson(headerText);
  const claims = decodeJson(payloadText);
  if (header?.alg !== 'RS256' || typeof header.kid !== 'string' || !claims) return null;

  const key = await signingKey(http, header.kid, options);
  if (!key) return null;
  let signature: Uint8Array<ArrayBuffer>;
  try { signature = base64UrlDecode(signatureText); } catch { return null; }
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, utf8.encode(`${headerText}.${payloadText}`));
  if (!valid) return null;

  const now = options.now.getTime() / 1000;
  const skew = options.clockSkewSeconds;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== `https://${options.teamDomain}` || !audiences.includes(options.audience)
    || typeof claims.exp !== 'number' || claims.exp < now - skew
    || (typeof claims.nbf === 'number' && claims.nbf > now + skew)
    || typeof claims.sub !== 'string') return null;
  return {
    subject: claims.sub,
    ...(typeof claims.email === 'string' ? { email: claims.email } : {}),
    ...(typeof claims.common_name === 'string' ? { commonName: claims.common_name } : {})
  };
}
