/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { defaults, loadConfig, variables } from './index.ts';
import { travelDays } from '#lib/server/context.ts';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
// wrangler.jsonc uses only whole-line comments.
interface WranglerEnv { vars: Record<string, string>; triggers: { crons: string[] } }
const wrangler = JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, '')) as WranglerEnv & {
  env?: Record<string, WranglerEnv>;
};
const environments: [string, WranglerEnv][] = [['production', wrangler], ...Object.entries(wrangler.env ?? {})];

test('defaults load without problems and are immutable', () => {
  const { config, problems } = loadConfig({});
  assert.deepEqual(problems, []);
  assert.deepEqual(config, defaults);
  assert.throws(() => { (config.edition as { timezone: string }).timezone = 'x'; }, TypeError);
});

test('variables override defaults and invalid values are reported, not applied', () => {
  const { config, problems } = loadConfig({
    EDITION_TIMEZONE: 'Europe/Oslo', COLLECTOR_SOURCES: 'cisa, github', AI_REVIEW_ENABLED: 'true',
    AI_REVIEW_MAX_TIPS: '10', ACCESS_TEAM_DOMAIN: 'https://Example.cloudflareaccess.com/', EDITORIAL_AUTH: 'access',
    COMMUNITY_SESSION_DAYS: '0', CRON_COLLECT: 'hourly', AI_REVIEW_MODEL: 'gpt', DB: {}
  });
  assert.equal(config.edition.timezone, 'Europe/Oslo');
  assert.deepEqual(config.collection.sources, ['cisa', 'github']);
  assert.equal(config.aiReview.enabled, true);
  assert.equal(config.aiReview.maxTips, 10);
  assert.equal(config.access.teamDomain, 'example.cloudflareaccess.com');
  assert.equal(config.editorial.auth, 'access');
  assert.equal(config.community.sessionSeconds, defaults.community.sessionSeconds);
  assert.equal(config.schedule.collect, defaults.schedule.collect);
  assert.deepEqual(problems.map((problem) => problem.split(':')[0]), ['AI_REVIEW_MODEL', 'COMMUNITY_SESSION_DAYS', 'CRON_COLLECT']);
  assert.deepEqual(loadConfig({ COLLECTOR_SOURCES: '' }).config.collection.sources, []);
  assert.match(loadConfig({ COLLECTOR_SOURCES: 'nvd' }).problems[0]!, /unknown source nvd/);
  assert.match(loadConfig({ EDITION_TIMEZONE: 'Mars/Olympus' }).problems[0]!, /IANA/);
});

test('wrangler.jsonc variables are valid and its cron triggers match the configured jobs', () => {
  const known = new Set(variables.map(({ name }) => name).concat(['GITHUB_CLIENT_ID', 'TURNSTILE_SITE_KEY']));
  for (const [name, environment] of environments) {
    const { config, problems } = loadConfig(environment.vars);
    assert.deepEqual(problems, [], name);
    assert.deepEqual([...environment.triggers.crons].sort(), [config.schedule.collect, config.schedule.aiReview].sort(), name);
    assert.deepEqual(Object.keys(environment.vars).filter((key) => !known.has(key)), [], name);
  }
  assert.equal(loadConfig(wrangler.vars).config.edition.shiftDays, 0, 'production never shifts the edition clock');
  assert.equal(loadConfig(wrangler.vars).config.edition.timeTravel, false, 'production never time travels');
});

test('preview time travel turns a chosen date into whole days, and only when enabled', () => {
  const now = new Date('2026-11-20T15:30:00Z');
  const on = loadConfig({ EDITION_TIME_TRAVEL: 'true' }).config;
  assert.equal(travelDays('2026-12-01', now, on), 11);
  assert.equal(travelDays('2026-11-19', now, on), -1);
  assert.equal(travelDays('2026-02-30', now, on), null);
  assert.equal(travelDays('2026-12-1', now, on), null);
  assert.equal(travelDays('2030-01-01', now, on), null);
  assert.equal(travelDays('2026-12-01', now, loadConfig({}).config), null);
});

test('every variable is documented in docs/INFRASTRUCTURE.md', () => {
  const docs = read('docs/INFRASTRUCTURE.md');
  assert.deepEqual(variables.map(({ name }) => name).filter((name) => !docs.includes(`\`${name}\``)), []);
});
