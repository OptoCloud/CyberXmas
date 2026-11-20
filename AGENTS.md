# AGENTS.md

Guidance for AI coding agents working in this repository. Humans may find it useful too; the full
reference is [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md).

## Project

CyberXmas is a cybersecurity advent calendar: one Cloudflare Worker running SvelteKit (pages and a
JSON API) plus Cron Trigger jobs, with D1 as the source of truth. See [README.md](README.md).

## Commands

```sh
pnpm install
pnpm check        # svelte-check, strict TypeScript; must pass with no warnings
pnpm test         # node --test on src/**/*.test.ts (TypeScript runs natively, no build)
pnpm build        # vite build + scripts/cloudflare-entry.ts (adds the cron handler)
pnpm dev          # UI with demo data
pnpm db:local && pnpm preview   # full Worker on 127.0.0.1:8787 with local D1
```

Run `pnpm check` and `pnpm test` before finishing a change. Never run `pnpm deploy`,
`pnpm deploy:preview`, `wrangler deploy` or any `--remote` command unless asked: they change live
infrastructure.

## Layout and dependency rules

- `src/routes`: pages and endpoints. `api/**/+server.ts` files only re-export handlers from
  `#lib/server/api`.
- `src/lib` is imported as `#lib/...` (declared in `package.json` `imports`). Do not use relative
  paths across `lib` folders.
- `util` imports nothing else. `config` imports `util`. `domain` imports `config` and `util`.
  `components` and `content` never import `server`.
- In `server`: `api` and `jobs` orchestrate; `db` and `clients` never import `api` or `jobs`.
- **SQL only in `src/lib/server/db`.** Every value goes through `.bind()`; template literals may
  only splice module-level constant fragments. `sql-safety.test.ts` enforces this.
- **Outbound HTTP only through `src/lib/server/clients/http.ts`,** to fixed origins. Never fetch a
  user-supplied URL.

## Conventions

- New tunables go in `src/lib/config/defaults.ts`. New Worker variables are parsed in
  `src/lib/config/index.ts`, added to `wrangler.jsonc` if set there, and documented in the
  variables table in `docs/INFRASTRUCTURE.md` (a test checks this). Keep cron expressions in
  `triggers.crons` and the `CRON_*` variables in sync.
- Secrets never go in `wrangler.jsonc`, code or tests. Locally they live in the gitignored
  `.dev.vars`; tests use obvious fakes.
- Schema changes are new numbered files in `migrations/`, never edits to applied ones, and must
  stay compatible with the version already deployed.
- Embargo and visibility are decided in SQL on the server, never in Svelte.
- Render all external and user text as text. Source links must be HTTPS without credentials.
- Svelte 5 runes, TypeScript everywhere, pinned dependency versions. Match the surrounding style:
  compact code, few comments that explain why rather than what.
- Use the edition clock from the request `Context` for anything date-related, not `new Date()`.

## Content rules

The site is defensive. Do not add exploit code, payloads or reproduction steps to reports, demo
data or prompts. Demo stories must stay clearly fictional and labelled.

## Commits

Small commits with a plain-English summary of what changed and why. No AI attribution trailers.
