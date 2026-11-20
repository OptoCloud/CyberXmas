/// <reference types="node" />
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';

const origin = process.argv[2] ?? 'http://127.0.0.1:8787';
const request = (path: string) => fetch(new URL(path, origin), { signal: AbortSignal.timeout(3000) });
const deadline = Date.now() + 30000;
let calendar: Response | undefined;
while (!calendar) {
  try {
    calendar = await request('/calendar?demo=1');
  } catch (error) {
    if (Date.now() >= deadline) throw error;
    await wait(300);
  }
}

assert.equal(calendar.status, 200);
const html = await calendar.text();
assert.match(html, /The Cyber Incident Christmas Calendar/);
const asset = html.match(/(?:src|href)=["']([^"']*\/_app\/immutable\/[^"']+)["']/)?.[1];
assert.ok(asset, 'Calendar HTML references a built asset');
assert.equal((await request(asset!)).status, 200);

for (const [path, collection] of [['/api/edition', 'calendar'], ['/api/incidents', 'items'], ['/api/tips', 'items']]) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  assert.deepEqual((await response.json())[collection], [], path);
}
assert.equal((await request('/api/incidents/1')).status, 404);
console.log('Packaged Worker smoke checks passed.');
