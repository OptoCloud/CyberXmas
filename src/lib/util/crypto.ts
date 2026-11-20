// WebCrypto helpers. Available in Workers, browsers and Node.js 22+.
import { base64UrlEncode, utf8 } from './encoding.ts';

/** A random token; 32 bytes encode to 43 base64url characters. */
export const randomToken = (bytes = 32): string => base64UrlEncode(crypto.getRandomValues(new Uint8Array(bytes)));

/** Matches tokens produced by `randomToken()` with the default length. */
export const randomTokenPattern = /^[\w-]{43}$/;

export async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(value)));
}

export async function sha256Base64Url(value: string): Promise<string> {
  return base64UrlEncode(await sha256(value));
}

/** Compare two strings without leaking their common prefix length through timing. */
export async function timingSafeEqual(actual: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(actual), sha256(expected)]);
  let different = 0;
  for (let i = 0; i < b.length; i++) different |= a[i]! ^ b[i]!;
  return different === 0;
}
