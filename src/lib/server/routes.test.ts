/// <reference types="node" />
// The API surface is SvelteKit's file-based routing; this pins which methods each endpoint exposes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePositiveId } from '#lib/util/validate.ts';

const endpoints: Record<string, string[]> = {
  'api/edition': ['GET'],
  'api/incidents': ['GET'],
  'api/incidents/[id=id]': ['GET'],
  'api/tips': ['GET', 'POST'],
  'api/tips/[id=id]/like': ['PUT'],
  'api/editorial': ['GET', 'POST'],
  'api/community/login': ['GET'],
  'api/community/callback': ['GET'],
  'api/community/logout': ['POST']
};

test('each API route exports exactly its HTTP methods', async () => {
  for (const [route, methods] of Object.entries(endpoints)) {
    const module = await import(new URL(`../../routes/${route}/+server.ts`, import.meta.url).href);
    assert.deepEqual(Object.keys(module).sort(), [...methods].sort(), route);
  }
});

// src/params.ts defines the `id` matcher as parsePositiveId (it needs Vite to resolve
// @sveltejs/kit/params, so the parser is tested directly).
test('the id matcher accepts only canonical positive integers', () => {
  for (const [text, expected] of [['1', 1], ['42', 42], ['0', null], ['01', null], ['-1', null], ['1e3', null],
    ['9007199254740993', null], ['abc', null]] as const) {
    assert.equal(parsePositiveId(text), expected, text);
  }
});
