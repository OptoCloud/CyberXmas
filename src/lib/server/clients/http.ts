// Every outbound request goes through here: no redirects, a timeout, a User-Agent,
// and bounded response bodies.
import { readBoundedJson } from '#lib/util/stream.ts';

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface OutboundInit {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  timeoutMs?: number;
}

export interface HttpClient {
  request(url: string, init?: OutboundInit): Promise<Response>;
}

export interface HttpOptions {
  userAgent: string;
  timeoutMs: number;
}

export function createHttpClient(fetchImpl: Fetch, { userAgent, timeoutMs }: HttpOptions): HttpClient {
  return {
    request(url, { method, headers = {}, body, timeoutMs: timeout = timeoutMs } = {}) {
      // Call fetchImpl as a plain function: Workers reject `fetch` invoked as a method of another object.
      return fetchImpl(url, {
        method, body, headers: { 'User-Agent': userAgent, ...headers },
        redirect: 'manual', signal: AbortSignal.timeout(timeout)
      });
    }
  };
}

/** Parse a successful JSON response no larger than `maxBytes`; throws `HTTP <status>` otherwise. */
export async function expectJson(response: Response, maxBytes: number): Promise<unknown> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.body) throw new Error('Empty response');
  return readBoundedJson(response.body, maxBytes);
}
