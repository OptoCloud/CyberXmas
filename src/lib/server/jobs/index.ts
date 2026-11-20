// Cron Trigger entry point. SvelteKit's Cloudflare adapter only builds a fetch handler, so
// scripts/cloudflare-entry.ts bundles this module and adds it to the generated Worker.
import { createContext, type ContextOptions } from '../context.ts';
import type { Env, ScheduledController } from '../env.ts';
import { runAiReview } from './ai-review.ts';
import { runCollection } from './collect.ts';

export async function scheduled(controller: ScheduledController, env: Env, options: ContextOptions = {}): Promise<void> {
  const ctx = createContext(env, { now: new Date(controller.scheduledTime), ...options });
  const { schedule } = ctx.config;
  if (controller.cron === schedule.aiReview) { await runAiReview(ctx); return; }
  if (controller.cron === schedule.collect) {
    const failed = (await runCollection(ctx)).filter((result) => 'error' in result).map((result) => result.provider);
    if (failed.length) throw new Error(`Source collection failed: ${failed.join(', ')}`);
    return;
  }
  throw new Error(`No job is configured for cron "${controller.cron}"; check CRON_* variables and wrangler.jsonc triggers`);
}

export { runAiReview, runCollection };
