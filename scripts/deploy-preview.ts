// Build and deploy the preview site (Worker cyberxmas-preview, see `env.preview` in wrangler.jsonc).
// CLOUDFLARE_ENV makes the adapter write the preview's bindings into the generated Wrangler config,
// so the migration and deploy steps that read it target the preview database and Worker.
// Afterwards the build output belongs to the preview; `pnpm run deploy` rebuilds for production.
import { spawnSync } from 'node:child_process';

const env = { ...process.env, CLOUDFLARE_ENV: 'preview' };
const steps = [
  'pnpm run build',
  'pnpm exec wrangler d1 migrations apply DB --remote',
  'pnpm exec wrangler deploy'
];

for (const step of steps) {
  console.log(`\n> ${step}`);
  const { status } = spawnSync(step, { env, stdio: 'inherit', shell: true });
  if (status !== 0) process.exit(status ?? 1);
}
