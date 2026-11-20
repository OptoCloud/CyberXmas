/// <reference types="node" />
// Guards against SQL injection regressions. All SQL lives in src/lib/server/db, every value is
// passed with .bind(), and template-literal interpolation may only splice in fixed SQL fragments
// declared as string constants in the same module.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const dbDir = fileURLToPath(new URL('./', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|js|svelte)$/.test(entry.name) && !/\.test\.ts$|testing\.ts$/.test(entry.name) ? [path] : [];
  });
}

/** Interpolations in `source` that are not top-level constant SQL fragments of the same module. */
function unsafeInterpolations(source: string): string[] {
  const fragment = /^const (\w+) =\s*(['"`])((?:(?!\2)[^$]|\$(?!\{))*)\2;?$/gms;
  const fragments = new Set([...source.matchAll(fragment)].map((match) => match[1]));
  return [...source.matchAll(/\$\{\s*([^}]*?)\s*\}/g)].map((match) => match[1]!).filter((name) => !fragments.has(name));
}

test('SQL is only prepared inside src/lib/server/db', () => {
  const offenders = sourceFiles(join(root, 'src'))
    .filter((file) => !file.startsWith(dbDir) && readFileSync(file, 'utf8').includes('.prepare('));
  assert.deepEqual(offenders.map((file) => relative(root, file)), []);
});

test('db modules interpolate only fixed SQL fragments, never values', () => {
  for (const file of readdirSync(dbDir).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
    assert.deepEqual(unsafeInterpolations(readFileSync(join(dbDir, file), 'utf8')), [], `${file} interpolates a value into SQL`);
  }
});

test('the interpolation guard rejects values and dynamic fragments', () => {
  assert.deepEqual(unsafeInterpolations("const where = 'a = ?';\ndb.prepare(`SELECT 1 WHERE ${where}`);"), []);
  assert.deepEqual(unsafeInterpolations('db.prepare(`SELECT * FROM t WHERE id = ${id}`);'), ['id']);
  assert.deepEqual(unsafeInterpolations("const order = `ORDER BY ${column}`;\ndb.prepare(`SELECT 1 ${order}`);"), ['column', 'order']);
  assert.deepEqual(unsafeInterpolations("function q(sort) { const by = 'x'; return `ORDER BY ${by}`; }"), ['by']);
});
