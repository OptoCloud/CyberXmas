// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Context } from '#lib/server/context.ts';

/** The subset of Cloudflare's Turnstile browser API that TipForm uses. */
interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  namespace App {
    interface Locals {
      /** Config, bindings and clients for this request. Set in src/hooks.server.ts. */
      ctx: Context;
    }
  }

  interface Window {
    turnstile?: Turnstile;
  }
}

export {};
