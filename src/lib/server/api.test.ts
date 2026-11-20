/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callback, login, logout } from './api/community.ts';
import { getQueue, postAction } from './api/editorial.ts';
import { getEdition, getIncident, listIncidents } from './api/public.ts';
import { listTips, submitTip, voteTip } from './api/tips.ts';
import { createContext } from './context.ts';
import type { Env } from './env.ts';
import { runCollection, scheduled } from './jobs/index.ts';
import { caller, createDatabase, defaultDate, limiter, origin } from './testing.ts';
import type { Fetch } from './clients/http.ts';

const now = new Date(defaultDate);
const editorToken = 'test-editor-key-not-used-in-production';
const oauth = { GITHUB_CLIENT_ID: 'test-client-id', GITHUB_CLIENT_SECRET: 'test-client-secret' };

function setup(t: import('node:test').TestContext) {
  const { sqlite, DB } = createDatabase(t);
  const call = caller(DB);
  const insert = sqlite.prepare(`
    INSERT INTO incidents (id, category, title, summary, takeaway, source_url, published_at)
    VALUES (?, ?, ?, 'Summary', 'Mitigation', 'https://example.com/advisory', ?)
  `);
  const json = async (response: Response | Promise<Response>) => (await response).json();
  return {
    sqlite, DB, call, json,
    add: (id: number, title: string, publication: string | null, category = 'outage') => insert.run(id, category, title, publication),
    slot: (year: number, day: number, id: number) => sqlite.prepare('INSERT INTO calendar_entries VALUES (?, ?, ?)').run(year, day, id),
    edition: (query = '', date?: string) => call(getEdition, `/api/edition${query}`, { date }),
    feed: (query = '', date?: string) => call(listIncidents, `/api/incidents${query}`, { date }),
    incident: (id: number, date?: string) => call(getIncident, `/api/incidents/${id}`, { date, params: { id } })
  };
}

test('calendar, feed and detail share the publication and UTC door embargo', async (t) => {
  const { add, slot, edition, feed, incident, json } = setup(t);
  add(1, 'Prior year report', '2025-12-01T00:00:00Z');
  add(2, 'First door', '2026-12-01T00:00:00Z');
  add(3, 'Second door', '2026-11-30T00:00:00Z');
  add(4, 'Unpublished draft', null);
  add(5, 'Timed feed story', '2026-12-01T19:00:00-05:00');
  slot(2025, 1, 1);
  slot(2026, 1, 2);
  slot(2026, 2, 3);
  slot(2026, 3, 4);

  const current = await json(edition());
  assert.deepEqual(current.calendar.map(({ day }: { day: number }) => day), [1]);
  assert.deepEqual(current.years, [2026, 2025]);
  assert.equal(current.timezone, 'UTC');
  assert.deepEqual(current.feed.map(({ id }: { id: number }) => id), [2, 1]);
  assert.deepEqual((await json(feed())).items.map(({ id }: { id: number }) => id), [2, 1]);
  for (const id of [3, 4, 5]) assert.equal((await incident(id)).status, 404);
  const midnight = '2026-12-02T00:00:00Z';
  assert.equal((await incident(3, midnight)).status, 200);
  assert.equal((await incident(5, midnight)).status, 200);
  assert.deepEqual((await json(edition('', midnight))).calendar.map(({ day }: { day: number }) => day), [1, 2]);
  assert.equal((await json(edition('?year=2025'))).calendar[0].id, 1);
  assert.equal((await edition('?year=2027')).status, 404);
  assert.throws(() => slot(2026, 1, 5), /UNIQUE constraint/);
  assert.throws(() => slot(2026, 24, 2), /UNIQUE constraint/);
});

test('feed filters published reports and paginates without repeating entries', async (t) => {
  const { add, feed, json } = setup(t);
  for (let id = 1; id <= 13; id++) add(id, `Router incident ${id}`, '2026-11-25T00:00:00Z');
  add(14, 'Router incident', '2026-11-25T00:00:00Z', 'attack');
  add(15, 'Unrelated outage', '2026-11-25T00:00:00Z');

  const read = (page: number) => json(feed(`?category=outage&q=router&page=${page}`));
  const first = await read(1);
  const second = await read(2);
  assert.equal(first.items.length, 12);
  assert.equal(first.items[0].id, 13);
  assert.equal(first.hasMore, true);
  assert.deepEqual(second.items.map(({ id }: { id: number }) => id), [1]);
  assert.equal(second.hasMore, false);
});

test('outage ingestion deduplicates by provider and never publishes candidates', async (t) => {
  const { sqlite, DB, feed, json } = setup(t);
  const event = {
    id: 'outage1', name: 'Provider disruption', impact: 'major', status: 'identified',
    created_at: '2026-11-18T16:00:00Z', updated_at: '2026-11-18T17:00:00Z',
    shortlink: 'https://other.invalid/example'
  };
  const collect = (fetch: Fetch, date: string, env: Partial<Env> = {}) =>
    runCollection(createContext({ DB, ...env } as Env, { now: new Date(date), fetch }));
  const first = '2026-11-19T10:00:00.000Z';
  const second = '2026-11-19T11:00:00.000Z';
  const third = '2026-11-19T12:00:00.000Z';
  const cisa = () => Response.json({ vulnerabilities: [
    { cveID: 'CVE-2026-1234', vulnerabilityName: 'Sample advisory', dateAdded: '2026-11-18' }
  ] });
  await collect(async (url, options) => {
    if (url.startsWith('https://www.cisa.gov/')) return cisa();
    assert.match(url, /^https:\/\/www\.(cloudflarestatus|githubstatus)\.com\/api\/v2\/incidents\.json$/);
    assert.equal(options?.redirect, 'manual');
    return Response.json({ incidents: [event, event, { ...event, id: '../invalid' }] });
  }, first);
  sqlite.exec("UPDATE editorial_candidates SET review_status = 'dismissed' WHERE provider = 'github'");
  const failures = await collect(async (url) => url.includes('cisa.gov') ? cisa() : url.includes('cloudflare')
    ? new Response('Unavailable', { status: 503 })
    : Response.json({ incidents: [{ ...event, status: 'resolved', updated_at: '2026-11-18T18:00:00Z' }] }), second);
  assert.deepEqual(failures, [{ provider: 'cloudflare', error: 'HTTP 503' }, { provider: 'github', count: 1 }, { provider: 'cisa', count: 1 }]);

  const state = sqlite.prepare("SELECT * FROM editorial_source_state WHERE provider = 'cloudflare'").get()!;
  assert.equal(state.succeeded_at, first);
  assert.equal(state.attempted_at, second);
  assert.equal(state.last_error, 'HTTP 503');
  await collect(async (url) => url.includes('cisa.gov') ? cisa() : Response.json({ incidents: [event] }), third);
  assert.equal(sqlite.prepare("SELECT last_error FROM editorial_source_state WHERE provider = 'cloudflare'").get()!.last_error, null);
  assert.equal(sqlite.prepare("SELECT category FROM editorial_candidates WHERE provider = 'cisa'").get()!.category, 'vulnerability');
  const rows = sqlite.prepare("SELECT * FROM editorial_candidates WHERE category = 'outage' ORDER BY provider").all();
  assert.equal(rows.length, 2);
  assert.equal(rows[1]!.source_url, 'https://www.githubstatus.com/incidents/outage1');
  assert.equal(rows[1]!.provider_status, 'resolved');
  assert.equal(rows[1]!.review_status, 'dismissed');
  assert.equal(rows[1]!.first_seen_at, first);
  assert.deepEqual((await json(feed('?q=Provider'))).items, []);

  // COLLECTOR_SOURCES limits which collectors run.
  const requested: string[] = [];
  const only = await collect(async (url) => { requested.push(url); return cisa(); }, third, { COLLECTOR_SOURCES: 'cisa' });
  assert.deepEqual(only, [{ provider: 'cisa', count: 1 }]);
  assert.equal(requested.length, 1);
});

test('editor authentication, explicit scheduling, UTC reveal and withdrawal', async (t) => {
  const { call, incident, json } = setup(t);
  const env = { EDITOR_TOKEN: editorToken };
  const headers = { Authorization: `Bearer ${editorToken}`, 'Content-Type': 'application/json' };
  const admin = (body?: unknown, extra: Record<string, string> = {}) => body
    ? call(postAction, '/api/editorial', { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body), env })
    : call(getQueue, '/api/editorial', { headers, env });
  assert.equal((await call(getQueue, '/api/editorial')).status, 503);
  const denied = await call(getQueue, '/api/editorial', { env });
  assert.equal(denied.status, 401);
  assert.equal((await denied.json()).auth, 'token');
  const report = { category: 'outage', title: 'Reviewed outage', summary: 'Service disruption', takeaway: 'Test failover',
    sourceUrl: 'https://example.com/status', occurredAt: '2021-12-01', historical: true };
  assert.equal((await admin({ action: 'save', report }, { Origin: 'https://unrelated.test' })).status, 403);
  assert.equal((await admin({ action: 'save', report: { ...report, occurredAt: '2021-02-29' } })).status, 400);
  const created = await admin({ action: 'save', report });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.equal((await incident(id)).status, 404);
  const door = { year: 2026, day: 2 };
  assert.equal((await admin({ action: 'publish', id, door })).status, 200);
  const other = await json(admin({ action: 'save', report: { ...report, title: 'Another report' } }));
  assert.equal((await admin({ action: 'publish', id: other.id, door })).status, 409);
  assert.equal((await incident(other.id, '2026-12-02T00:00:00Z')).status, 404);
  assert.equal((await incident(id)).status, 404);
  assert.equal((await incident(id, '2026-12-02T00:00:00Z')).status, 200);
  assert.equal((await admin({ action: 'withdraw', id })).status, 200);
  assert.equal((await incident(id, '2026-12-02T00:00:00Z')).status, 404);
  const queue = await json(admin());
  assert.equal(queue.editor, 'shared editor key');
  assert.deepEqual(queue.audit.map((event: { action: string }) => event.action), [
    'publication_removed', 'report_created', 'publication_set', 'door_assigned', 'report_created'
  ]);
});

test('doors open at midnight in the configured edition time zone', async (t) => {
  const { call, json, sqlite } = setup(t);
  const env = { EDITOR_TOKEN: editorToken, EDITION_TIMEZONE: 'Europe/Oslo' };
  const headers = { Authorization: `Bearer ${editorToken}`, 'Content-Type': 'application/json' };
  const post = (body: unknown, date?: string) =>
    call(postAction, '/api/editorial', { method: 'POST', headers, body: JSON.stringify(body), env, date });
  const report = { category: 'outage', title: 'Oslo door', summary: 'Summary', takeaway: 'Takeaway',
    sourceUrl: 'https://example.com/status', historical: false };
  const { id } = await json(post({ action: 'save', report }));
  // 23:30 UTC on Dec 1 is already Dec 2 in Oslo (UTC+1), so door 2 is "today" and may be scheduled.
  assert.equal((await post({ action: 'publish', id, door: { year: 2026, day: 1 } }, '2026-12-01T23:30:00Z')).status, 400);
  assert.equal((await post({ action: 'publish', id, door: { year: 2026, day: 3 } }, '2026-12-01T23:30:00Z')).status, 200);
  assert.equal(sqlite.prepare('SELECT published_at FROM incidents WHERE id = ?').get(id)!.published_at, '2026-12-02T23:00:00.000Z');

  const detail = (date: string) => call(getIncident, `/api/incidents/${id}`, { date, env, params: { id } });
  assert.equal((await detail('2026-12-02T22:59:59Z')).status, 404);
  assert.equal((await detail('2026-12-02T23:00:00Z')).status, 200);
  const edition = await json(call(getEdition, '/api/edition', { date: '2026-12-02T23:00:00Z', env }));
  assert.deepEqual([edition.today, edition.timezone, edition.calendar.length], ['2026-12-03', 'Europe/Oslo', 1]);
});

async function signIn(call: ReturnType<typeof caller>, env: Partial<Env>, identity: unknown, stateOverride?: string) {
  const start = await call(login, '/api/community/login', { env });
  const authorization = new URL(start.headers.get('Location')!);
  const [flow] = start.headers.getSetCookie();
  const [, verifier] = flow!.split(';')[0]!.split('.');
  assert.match(flow!, /Secure; HttpOnly; SameSite=Lax/);
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorization.searchParams.get('code_challenge'),
    Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url'));
  const params = new URLSearchParams({ code: 'test-code', state: stateOverride ?? authorization.searchParams.get('state')! });
  let calls = 0;
  const result = await call(callback, `/api/community/callback?${params}`, {
    env, headers: { Cookie: flow!.split(';')[0]! },
    fetch: async (url, options) => {
      calls++;
      if (url === 'https://github.com/login/oauth/access_token') {
        assert.equal((options!.body as URLSearchParams).get('code_verifier'), verifier);
        assert.equal((options!.body as URLSearchParams).get('redirect_uri'), `${origin}/api/community/callback`);
        return Response.json({ access_token: 'test-provider-token' });
      }
      assert.equal(url, 'https://api.github.com/user');
      assert.equal((options!.headers as Record<string, string>).Authorization, 'Bearer test-provider-token');
      return Response.json(identity);
    }
  });
  assert.equal(calls, stateOverride ? 0 : 2);
  return result;
}

test('GitHub sign-in validates state and issues a revocable, expiring session', async (t) => {
  const { sqlite, call } = setup(t);
  const identity = { id: 501, login: 'test-viewer' };
  const rejected = await signIn(call, oauth, identity, 'forged');
  assert.equal(rejected.headers.get('Location'), '/submit?signin=failed');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_sessions').get()!.n, 0);
  const accepted = await signIn(call, oauth, identity);
  assert.equal(accepted.headers.get('Location'), '/submit');
  const session = accepted.headers.getSetCookie().find((value) => value.startsWith('__Host-cyberxmas-session='))!;
  assert.match(session, /Secure; HttpOnly; SameSite=Lax/);
  const headers = { Cookie: session.split(';')[0]! };
  assert.notEqual(sqlite.prepare('SELECT token_hash FROM community_sessions').get()!.token_hash, headers.Cookie.split('=')[1]);
  const viewer = async (date?: string, cookies = headers) =>
    (await (await call(listTips, '/api/tips', { headers: cookies, env: oauth, date })).json()).viewer;
  assert.equal(await viewer(), identity.login);
  assert.equal(await viewer('2027-01-01T00:00:00Z'), null);
  assert.equal((await call(logout, '/api/community/logout', { method: 'POST', headers, env: oauth })).status, 403);
  assert.equal((await call(logout, '/api/community/logout', { method: 'POST', headers: { ...headers, Origin: origin }, env: oauth })).status, 200);
  assert.equal(await viewer(), null);
});

test('daily AI reviews public tips and imported leads once and keeps its recommendations private', async (t) => {
  const { DB, sqlite, call, feed, json } = setup(t);
  sqlite.exec(`INSERT INTO community_tips (category, title, summary, source_url, submitter_github_id, review_status)
    VALUES ('outage', 'Public outage', 'Not sent to AI', 'https://www.githubstatus.com/incidents/abc', 10, 'pending'),
           ('outage', 'Legacy private tip', 'Private', 'https://example.com/legacy', NULL, 'pending'),
           ('outage', 'Dismissed tip', 'Removed', 'https://www.githubstatus.com/incidents/xyz', 20, 'dismissed');
    INSERT INTO community_tip_likes VALUES (1, 21);
    INSERT INTO editorial_candidates (provider, external_id, title, source_url, impact, provider_status,
      occurred_at, provider_updated_at, first_seen_at, category)
    VALUES ('cisa', 'CVE-2025-12345', 'Vendor advisory', 'https://www.cisa.gov/news-events/alerts/example',
      'major', 'active', '2026-12-01', '2026-12-01', '2026-12-01', 'vulnerability')`);
  const controller = { cron: '15 6 * * *', scheduledTime: now.getTime() };
  const env = { DB, EDITOR_TOKEN: editorToken, AI_REVIEW_ENABLED: 'true' } as Env;
  let calls = 0;
  const AI = { run: async (_model: string, { messages }: Record<string, unknown>) => {
    calls++;
    const content = (messages as { content: string }[])[1]!.content;
    const input = JSON.parse(content);
    assert.deepEqual(input.map(({ title }: { title: string }) => title), ['Public outage', 'Vendor advisory']);
    assert.equal(input[0].likes, 1);
    assert.equal(input[0].source, 'www.githubstatus.com');
    assert.doesNotMatch(content, /Not sent to AI|\/incidents\/abc|submitter/);
    return { response: { recommendations: [
      { id: 1, reason: 'broad impact', sourceUrl: 'https://invented.test' },
      { id: 1, reason: 'broad impact' },
      { id: 999, reason: 'broad impact' },
      { id: 2, reason: 'invented text' }
    ] } };
  } };
  await scheduled(controller, { ...env, AI, AI_REVIEW_ENABLED: 'false' });
  assert.equal(calls, 0);
  await scheduled(controller, { ...env, AI });
  await scheduled(controller, { ...env, AI });
  assert.equal(calls, 1);
  assert.equal((await call(getQueue, '/api/editorial', { env })).status, 401);
  const editorial = async () => (await json(call(getQueue, '/api/editorial', {
    headers: { Authorization: `Bearer ${editorToken}` }, env
  }))).aiReview.digest;
  const digest = await editorial();
  assert.deepEqual(digest.shortlist, [{ title: 'Public outage', sourceUrl: 'https://www.githubstatus.com/incidents/abc',
    kind: 'community tip', reason: 'broad impact' }]);
  assert.deepEqual([digest.tipCount, digest.candidateCount], [1, 1]);
  const publicQueue = await json(call(listTips, '/api/tips'));
  assert.deepEqual(publicQueue.items.map((row: { title: string; likes: number }) => [row.title, row.likes]), [['Public outage', 1]]);
  assert.equal(Object.hasOwn(publicQueue, 'aiReview'), false);
  assert.deepEqual((await json(feed())).items, []);

  sqlite.exec(`INSERT INTO community_tips (category,title,summary,source_url,submitter_github_id)
    VALUES ('outage','Next tip','Public','https://www.githubstatus.com/incidents/next',10)`);
  const later = { ...controller, scheduledTime: now.getTime() + 86400000 };
  await assert.rejects(scheduled(later, { ...env, AI: { run: async () => ({ response: 'not JSON' }) } }), /Daily AI review failed/);
  assert.equal((await editorial()).status, 'failed');
  assert.equal(sqlite.prepare("SELECT ai_reviewed_at FROM community_tips WHERE title = 'Next tip'").get()!.ai_reviewed_at, null);
  await assert.rejects(scheduled({ ...controller, cron: '*/5 * * * *' }, env), /No job is configured/);
});

test('verified tips enter ranked public review while only moderators can publish or schedule', async (t) => {
  const { sqlite, call, edition, feed, incident, json } = setup(t);
  const env: Partial<Env> = {
    ...oauth, TURNSTILE_SITE_KEY: 'test-site-key', TURNSTILE_SECRET: 'test-only', TIP_LIMIT: limiter(true), REVIEW_LIMIT: limiter(true),
    EDITOR_TOKEN: editorToken
  };
  async function session(id: number) {
    const response = await signIn(call, env, { id, login: `reviewer-${id}` });
    return response.headers.getSetCookie().find((value) => value.startsWith('__Host-cyberxmas-session='))!.split(';')[0]!;
  }
  const author = await session(1);
  const reviewer = await session(2);
  sqlite.exec(`INSERT INTO community_tips (category, title, summary, source_url)
    VALUES ('outage', 'Legacy private tip', 'Private intake', 'https://example.com/legacy')`);
  const body = { title: 'Reader outage tip', summary: 'The service stopped responding.', category: 'outage',
    sourceUrl: 'https://cloudflarestatus.com/incidents/abc123/?utm_source=spam#update', token: 'test-challenge' };
  const verified = { success: true, hostname: 'calendar.test', action: 'incident_tip' };
  const submit = ({ data = body as Record<string, unknown>, auth = author, verification = verified, bindings = env, state = 'PUBLISHED' } = {}) =>
    call(submitTip, '/api/tips', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': '192.0.2.1', Cookie: auth },
      body: JSON.stringify(data), env: bindings,
      fetch: async (url, options) => {
        if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
          assert.equal((options!.body as URLSearchParams).get('remoteip'), '192.0.2.1');
          return Response.json(verification);
        }
        assert.equal(url, 'https://cveawg.mitre.org/api/cve/CVE-2025-12345');
        return Response.json({ cveMetadata: { cveId: 'CVE-2025-12345', state } });
      }
    });
  const list = async (Cookie = '') => (await json(call(listTips, '/api/tips', { headers: { Cookie }, env }))).items;
  const like = (tip: number, liked: boolean, Cookie = reviewer, Origin = origin) => call(voteTip, `/api/tips/${tip}/like`, {
    method: 'PUT', headers: { Origin, Cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ liked }), env, params: { id: tip }
  });
  assert.equal((await submit({ auth: '' })).status, 401);
  assert.equal((await submit({ verification: { ...verified, action: 'wrong' } })).status, 400);
  assert.equal((await submit({ bindings: { ...env, TIP_LIMIT: limiter(false) } })).status, 429);
  for (const sourceUrl of ['https://example.com/status', 'https://www.cloudflarestatus.com.evil.test/incidents/1234',
    'https://www.cloudflarestatus.com/', 'https://github.com/octo/team/issues/1', 'https://www.cloudflarestatus.com:8080/incidents/123']) {
    assert.equal((await submit({ data: { ...body, sourceUrl } })).status, 400);
  }
  assert.deepEqual(await list(), []);
  const posted = await submit();
  assert.equal(posted.status, 201);
  const { id } = await posted.json();
  assert.equal((await submit({ data: { ...body, sourceUrl: 'https://www.cloudflarestatus.com/incidents/abc123' } })).status, 409);
  assert.equal((await list())[0].sourceUrl, 'https://www.cloudflarestatus.com/incidents/abc123');
  const cve = { ...body, title: 'CVE report', sourceUrl: '', cve: 'cve-2025-12345' };
  assert.equal((await submit({ data: cve, state: 'REJECTED' })).status, 422);
  const publishedCve = await submit({ data: cve });
  assert.equal(publishedCve.status, 201);
  const { id: cveId } = await publishedCve.json();
  assert.equal((await submit({ data: { ...body, sourceUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2025-12345' } })).status, 409);
  assert.deepEqual((await list()).map((tip: { id: number }) => tip.id), [cveId, id]);
  assert.equal(Object.hasOwn((await list())[0], 'submitter_github_id'), false);
  assert.equal((await like(id, true, '')).status, 401);
  assert.equal((await like(id, true, reviewer, 'https://elsewhere.test')).status, 403);
  assert.equal((await like(id, true, author)).status, 403);
  assert.equal((await like(id, true)).status, 200);
  assert.equal((await like(id, true)).status, 200);
  assert.deepEqual((await list(reviewer)).map((tip: { id: number; likes: number; liked: number }) => [tip.id, tip.likes, tip.liked]),
    [[id, 1, 1], [cveId, 0, 0]]);
  assert.equal((await like(id, false)).status, 200);
  assert.equal((await list())[0].id, cveId);
  await like(id, true);
  assert.deepEqual((await json(feed())).items, []);
  assert.deepEqual((await json(edition())).calendar, []);
  assert.equal((await call(getQueue, '/api/editorial', { headers: { Cookie: reviewer }, env })).status, 401);
  const headers = { Authorization: `Bearer ${editorToken}`, 'Content-Type': 'application/json' };
  const admin = (data?: unknown) => data
    ? call(postAction, '/api/editorial', { method: 'POST', headers, body: JSON.stringify(data), env })
    : call(getQueue, '/api/editorial', { headers, env });
  assert.equal((await json(admin())).tips[0].likes, 1);
  const convert = { action: 'save', tipId: id, report: { ...body, historical: false, takeaway: 'Test failover.' } };
  const drafted = await admin(convert);
  assert.equal(drafted.status, 201);
  assert.equal((await admin(convert)).status, 409);
  const { id: reportId } = await drafted.json();
  assert.equal((await incident(reportId)).status, 404);
  assert.equal((await like(id, true)).status, 404);
  assert.equal((await admin({ action: 'dismiss_tip', tipId: cveId })).status, 200);
  assert.deepEqual(await list(), []);
  assert.equal((await admin({ action: 'publish', id: reportId, door: { year: 2026, day: 2 } })).status, 200);
  assert.equal((await incident(reportId)).status, 404);
  assert.equal((await incident(reportId, '2026-12-02T00:00:00Z')).status, 200);
});
