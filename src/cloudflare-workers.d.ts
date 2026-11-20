// The Workers runtime module the API route reads bindings from.
declare module 'cloudflare:workers' {
  export const env: import('#lib/server/env.ts').Env;
  export function waitUntil(promise: Promise<unknown>): void;
}
