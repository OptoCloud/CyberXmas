/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base64UrlEncode, utf8 } from '#lib/util/encoding.ts';
import { getQueue } from '../../api/editorial.ts';
import { caller, createDatabase } from '../../testing.ts';
import { createHttpClient } from '../http.ts';
import { verifyAccessJwt } from './access.ts';

const audience = 'test-application-audience-tag';
const now = new Date('2026-12-01T12:00:00Z');
const seconds = Math.floor(now.getTime() / 1000);

async function issuer(teamDomain: string) {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'key-1', alg: 'RS256', use: 'sig' };
  let certRequests = 0;
  const fetch = async (url: string) => {
    assert.equal(url, `https://${teamDomain}/cdn-cgi/access/certs`);
    certRequests++;
    return Response.json({ keys: [jwk] });
  };
  async function sign(claims: Record<string, unknown>, header: Record<string, unknown> = {}) {
    const encode = (value: unknown) => base64UrlEncode(utf8.encode(JSON.stringify(value)));
    const body = `${encode({ alg: 'RS256', kid: 'key-1', ...header })}.${encode({
      iss: `https://${teamDomain}`, aud: [audience], sub: 'user-1', email: 'editor@example.com',
      iat: seconds - 10, nbf: seconds - 10, exp: seconds + 300, ...claims
    })}`;
    const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, utf8.encode(body)));
    return `${body}.${base64UrlEncode(signature)}`;
  }
  return { fetch, sign, certRequests: () => certRequests };
}

test('Access tokens are verified against the team signing keys and claims', async () => {
  const teamDomain = 'verify.cloudflareaccess.com';
  const { fetch, sign, certRequests } = await issuer(teamDomain);
  const http = createHttpClient(fetch, { userAgent: 'test', timeoutMs: 1000 });
  const options = { teamDomain, audience, now, clockSkewSeconds: 60, certsTtlSeconds: 3600 };
  const verify = (token: string | null) => verifyAccessJwt(http, token, options);

  assert.deepEqual(await verify(await sign({})), { subject: 'user-1', email: 'editor@example.com' });
  assert.equal(await verify(await sign({ aud: ['another-app'] })), null);
  assert.equal(await verify(await sign({ iss: 'https://other.cloudflareaccess.com' })), null);
  assert.equal(await verify(await sign({ exp: seconds - 120 })), null);
  assert.equal(await verify(await sign({ nbf: seconds + 120 })), null);
  assert.equal(await verify(await sign({}, { alg: 'none' })), null);
  const [header, payload] = (await sign({})).split('.');
  const forged = base64UrlEncode(utf8.encode(JSON.stringify({ ...JSON.parse(atob(payload!)), email: 'attacker@example.com' })));
  assert.equal(await verify(`${header}.${forged}.${(await sign({})).split('.')[2]}`), null);
  assert.equal(await verify(null), null);
  assert.equal(await verify('not.a.jwt'), null);
  assert.equal(certRequests(), 1, 'signing keys are cached');
});

test('EDITORIAL_AUTH=access admits editors through Cloudflare Access only', async (t) => {
  const teamDomain = 'desk.cloudflareaccess.com';
  const { fetch, sign } = await issuer(teamDomain);
  const call = caller(createDatabase(t).DB);
  const env = { EDITORIAL_AUTH: 'access', ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUD: audience };
  const desk = (headers: Record<string, string>, extra = {}) =>
    call(getQueue, '/api/editorial', { headers, env: { ...env, ...extra }, fetch, date: now.toISOString() });

  assert.equal((await desk({}, { ACCESS_AUD: '' })).status, 503);
  const denied = await desk({ Authorization: 'Bearer anything' });
  assert.equal(denied.status, 401);
  assert.equal((await denied.json()).auth, 'access');
  const allowed = await desk({ 'Cf-Access-Jwt-Assertion': await sign({}) });
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).editor, 'editor@example.com');

  // access_and_token requires both.
  const token = 'test-editor-key-not-used-in-production';
  const both = { EDITORIAL_AUTH: 'access_and_token', EDITOR_TOKEN: token };
  assert.equal((await desk({ 'Cf-Access-Jwt-Assertion': await sign({}) }, both)).status, 401);
  assert.equal((await desk({ 'Cf-Access-Jwt-Assertion': await sign({}), Authorization: `Bearer ${token}` }, both)).status, 200);
});
