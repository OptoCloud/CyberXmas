/// <reference types="node" />
// Test helpers: an in-memory D1 stand-in backed by node:sqlite with every migration applied,
// and a way to call endpoint logic the way SvelteKit would.
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { TestContext } from 'node:test';
import { createContext } from './context.ts';
import type { ApiHandler } from './context.ts';
import type { Fetch } from './clients/http.ts';
import type { D1Database, D1PreparedStatement, Env } from './env.ts';

export const origin = 'https://calendar.test';
export const defaultDate = '2026-12-01T23:59:59Z';

export function createDatabase(t: TestContext) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  const migrations = new URL('../../../migrations/', import.meta.url);
  for (const migration of readdirSync(migrations).filter((file) => file.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(migration, migrations), 'utf8'));
  }
  const DB = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      const bind = (...args: unknown[]): D1PreparedStatement => {
        // D1 accepts ?NNN placeholders positionally; node:sqlite needs them as named parameters.
        const values = args as SQLInputValue[];
        const parameters: SQLInputValue[] | [Record<string, SQLInputValue>] = /\?\d/.test(sql)
          ? [Object.fromEntries(values.map((value, index) => [`?${index + 1}`, value]))]
          : values;
        return {
          bind,
          all: async () => ({ results: statement.all(...(parameters as SQLInputValue[])) }),
          first: async () => statement.get(...(parameters as SQLInputValue[])),
          run: async () => statement.run(...(parameters as SQLInputValue[]))
        } as unknown as D1PreparedStatement;
      };
      return bind();
    },
    batch: (statements: D1PreparedStatement[]) => Promise.all(statements.map((statement) => statement.all()))
  } as unknown as D1Database;
  return { sqlite, DB };
}

export interface CallOptions extends RequestInit {
  date?: string;
  env?: Partial<Env>;
  fetch?: Fetch;
  params?: Record<string, unknown>;
}

/** Invoke endpoint logic with a fresh Context, as src/hooks.server.ts would. */
export function caller(DB: D1Database) {
  return function call<P extends Record<string, unknown>>(handler: ApiHandler<P>, path: string, options: CallOptions = {}) {
    const { date = defaultDate, env = {}, fetch, params = {}, ...init } = options;
    const ctx = createContext({ DB, ...env } as Env, { now: new Date(date), ...(fetch ? { fetch } : {}) });
    return handler({ request: new Request(`${origin}${path}`, init), params: params as P, locals: { ctx } });
  };
}

/** A rate limiter that always allows or always refuses. */
export const limiter = (success: boolean) => ({ limit: async () => ({ success }) });
