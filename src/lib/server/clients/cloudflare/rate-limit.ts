// Workers Rate Limiting binding. Limits and periods live in wrangler.jsonc `ratelimits`.
import type { RateLimit } from '../../env.ts';

/** True when every key is still under its limit. Keys are checked in order and stop at the first refusal. */
export async function withinLimits(limiter: RateLimit, ...keys: string[]): Promise<boolean> {
  for (const key of keys) {
    if (!(await limiter.limit({ key })).success) return false;
  }
  return true;
}
