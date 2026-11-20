// Cloudflare Turnstile server-side validation (siteverify).
import { isRecord } from '#lib/util/validate.ts';
import { expectJson, type HttpClient } from '../http.ts';

export interface TurnstileVerdict {
  success: boolean;
  hostname?: string;
  action?: string;
}

/** Returns null when siteverify itself is unavailable. */
export async function verifyTurnstile(http: HttpClient, options: {
  secret: string; token: string; remoteIp?: string;
}): Promise<TurnstileVerdict | null> {
  const body = new URLSearchParams({ secret: options.secret, response: options.token });
  if (options.remoteIp) body.set('remoteip', options.remoteIp);
  const response = await http.request('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  if (!response.ok) return null;
  const data = await expectJson(response, 64 * 1024);
  if (!isRecord(data)) return null;
  return {
    success: data.success === true,
    ...(typeof data.hostname === 'string' ? { hostname: data.hostname } : {}),
    ...(typeof data.action === 'string' ? { action: data.action } : {})
  };
}

/** A verdict counts only for this hostname and this widget action. */
export const turnstilePassed = (verdict: TurnstileVerdict, hostname: string, action: string): boolean =>
  verdict.success && verdict.hostname === hostname && verdict.action === action;
