/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listIncidents } from '../api/public.ts';
import { listTips } from '../api/tips.ts';
import { caller, createDatabase } from '../testing.ts';

/** A stand-in for the Workers Cache API that records its keys. */
function fakeEdgeCache(t: import('node:test').TestContext) {
  const store = new Map<string, Response>();
  const scope = globalThis as { caches?: unknown };
  const previous = scope.caches;
  scope.caches = { default: {
    match: async (key: Request) => store.get(key.url)?.clone(),
    put: async (key: Request, response: Response) => { store.set(key.url, response); },
    delete: async (key: Request) => store.delete(key.url)
  } };
  t.after(() => { scope.caches = previous; });
  return store;
}

const settled = () => new Promise((resolve) => setImmediate(resolve));

test('junk query strings share one cache entry and do not reach the database again', async (t) => {
  const store = fakeEdgeCache(t);
  const call = caller(createDatabase(t).DB);
  const first = await call(listIncidents, '/api/incidents?utm=1');
  await settled();
  assert.equal(first.headers.get('X-Edge-Cache'), 'MISS');
  assert.equal((await call(listIncidents, '/api/incidents?other=2&page=1')).headers.get('X-Edge-Cache'), 'HIT');
  assert.equal((await call(listIncidents, '/api/incidents?q=router')).headers.get('X-Edge-Cache'), 'MISS');
  await settled();
  assert.deepEqual([...store.keys()].map((url) => new URL(url).search), ['?q=&category=&page=1', '?q=router&category=&page=1']);
});

test('the tip board is cached at the edge for signed-out visitors only, never in browsers', async (t) => {
  const store = fakeEdgeCache(t);
  const call = caller(createDatabase(t).DB);
  const anonymous = await call(listTips, '/api/tips?x=1');
  await settled();
  assert.equal(anonymous.headers.get('Cache-Control'), 'no-store');
  assert.equal((await call(listTips, '/api/tips')).headers.get('X-Edge-Cache'), 'HIT');
  const signedIn = await call(listTips, '/api/tips', { headers: { Cookie: '__Host-cyberxmas-session=anything' } });
  assert.equal(signedIn.headers.get('X-Edge-Cache'), null);
  assert.equal(signedIn.headers.get('Cache-Control'), 'no-store');
  assert.equal(store.size, 1);
});
