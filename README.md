# CyberXmas

**The Cyber Incident Christmas Calendar.** Bringing the Christmas spirit to sysadmins and
maintainers everywhere, one incident at a time.

Every day from December 1 to 24 a new door opens on a cybersecurity story: a major outage, a
breach, an actively exploited vulnerability, or a lesson from security history. Outside December,
the intelligence feed and the archive of past editions stay open year-round.

Live at [cyberxmas.com](https://cyberxmas.com).

## Features

- **Advent calendar.** 24 doors per edition, each opening at midnight in the edition time zone,
  with a short terminal-style reveal (skipped with reduced motion). Earlier editions stay browsable.
- **Intelligence feed and reports.** Searchable, filterable feed of approved stories, each with a
  full report: summary, impact, timeline, defensive guidance and original sources.
- **Community tips.** Readers sign in with GitHub to suggest incidents, backed by a published CVE or
  a link from a trusted source, and like other readers' tips. Likes never publish anything.
- **Editorial desk.** Editors review collected leads and tips, write reports, publish them to the
  feed and schedule December doors. Scheduled stories stay hidden everywhere until they open.
- **Source collection.** An hourly job imports metadata from the Cloudflare and GitHub status pages
  and CISA's Known Exploited Vulnerabilities catalog for editors to review.
- **AI shortlist (optional).** A daily Workers AI job suggests up to five candidates to the desk.
  It cannot publish, vote or change a tip.

## Stack

One Cloudflare Worker runs everything: [SvelteKit](https://svelte.dev/docs/kit) pages and the JSON
API, plus the Cron Trigger jobs. Data lives in D1. Turnstile, Rate Limiting, Workers AI, Analytics
Engine and (optionally) Cloudflare Access cover the rest. See
[docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) for the architecture, every setting and binding,
and the security model.

## Getting started

Requires Node.js 22.18 or later and pnpm (the version pinned in `package.json`; `corepack enable`
picks it up).

```sh
pnpm install
pnpm dev          # UI only, with fictional demo stories
```

To run the full Worker locally against a local D1 database:

```sh
pnpm db:local     # apply migrations to local D1
pnpm preview      # build and run with wrangler dev
```

Open the URL Wrangler prints. The live feed reads only D1 and starts empty; add `?demo=1` to the
home page to preview fictional stories and example editions.

### Local secrets

Put local secrets in `.dev.vars` (gitignored). Each one turns on a feature; leave it out and that
feature stays off.

```ini
EDITOR_TOKEN=<at least 32 random characters>   # editorial desk at /editorial
GITHUB_CLIENT_ID=<local OAuth app>             # GitHub sign-in, with the secret below
GITHUB_CLIENT_SECRET=<local OAuth app secret>
TURNSTILE_SITE_KEY=1x00000000000000000000AA    # Cloudflare's always-pass test keys
TURNSTILE_SECRET=1x0000000000000000000000000000000AA
```

For GitHub sign-in, create a separate [OAuth app](https://github.com/settings/applications/new)
whose callback is `http://127.0.0.1:8787/api/community/callback`. Sign-in requests no scopes and
keeps no GitHub access token.

### Trying the collector

```sh
pnpm build
pnpm exec wrangler dev --test-scheduled
curl "http://127.0.0.1:8787/cdn-cgi/handler/scheduled?cron=0+*+*+*+*"
pnpm exec wrangler d1 execute DB --local --command "SELECT * FROM editorial_source_state"
```

## Checks

```sh
pnpm check        # svelte-check, strict TypeScript
pnpm test         # Node test runner on TypeScript, D1 replaced by node:sqlite
pnpm build
pnpm test:smoke   # against a running `pnpm preview` with an empty database
pnpm test:e2e     # browser flow through the desk, calendar and tip form
```

CI runs all of these on Node.js 22, 24 and 26. It holds no Cloudflare credentials and never deploys.

## Deploying your own

1. Create D1 databases and point the `database_id` values in `wrangler.jsonc` at them. Change the
   `routes` custom domain to a zone in your own Cloudflare account, or remove it to use workers.dev.
2. Set secrets with `pnpm exec wrangler secret put <NAME>`: `EDITOR_TOKEN`, and for community
   features `GITHUB_CLIENT_SECRET` and `TURNSTILE_SECRET`. Put your own `GITHUB_CLIENT_ID` and
   `TURNSTILE_SITE_KEY` in `vars`. The OAuth callback is `https://<your domain>/api/community/callback`.
3. `pnpm deploy` applies migrations and deploys production. `pnpm deploy:preview` deploys the
   preview environment, whose edition clock runs ahead so editors can prepare doors before December.
4. Put `/editorial*` and `/api/editorial*` behind Cloudflare Access; see
   [Moving editors to Cloudflare Access](docs/INFRASTRUCTURE.md#moving-editors-to-cloudflare-access).

## Documentation

- [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md): architecture, configuration, environments,
  security model, observability.
- [docs/ROADMAP.md](docs/ROADMAP.md): editorial principles and planned phases.
- [CONTRIBUTING.md](CONTRIBUTING.md): how to contribute code or suggest incidents.
- [SECURITY.md](SECURITY.md): reporting a vulnerability in this site.
- [AGENTS.md](AGENTS.md): conventions for AI coding agents working in this repository.

## License

[GPL-3.0](LICENSE).
