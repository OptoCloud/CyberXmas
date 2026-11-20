/// <reference types="node" />
// Add the Cron Trigger handler to the Worker that @sveltejs/adapter-cloudflare generates.
// The adapter only emits a fetch handler and uploads its output unbundled (`no_bundle`),
// so the jobs module is bundled here into a single plain-JavaScript file next to it.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const workerDir = new URL('../.svelte-kit/cloudflare/worker/', import.meta.url);
const configFile = new URL('wrangler.json', workerDir);
const settings = JSON.parse(await readFile(configFile, 'utf8')) as { main: string };
if (settings.main !== 'index.js') throw new Error(`Unexpected Cloudflare adapter entry point: ${settings.main}`);

await build({
  entryPoints: [fileURLToPath(new URL('../src/lib/server/jobs/index.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('cyberxmas-jobs.js', workerDir)),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2024',
  conditions: ['workerd', 'worker', 'browser'],
  legalComments: 'none',
  logLevel: 'warning'
});

await writeFile(new URL('scheduled-entry.js', workerDir), `import kit from './index.js';
import { scheduled } from './cyberxmas-jobs.js';

export default {
  ...kit,
  scheduled: (controller, env) => scheduled(controller, env)
};
`);
settings.main = 'scheduled-entry.js';
await writeFile(configFile, JSON.stringify(settings, null, 2));
