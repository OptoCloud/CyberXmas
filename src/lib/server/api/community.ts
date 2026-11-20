// GitHub sign-in for community members: OAuth authorization code flow with PKCE and state.
import { randomToken, randomTokenPattern, sha256Base64Url } from '#lib/util/crypto.ts';
import { endSession, flowCookie, startSession } from '../auth/community-session.ts';
import { exchangeGitHubCode, getGitHubIdentity, githubAuthorizeUrl, type GitHubOAuthApp } from '../clients/github.ts';
import type { ApiHandler, Context } from '../context.ts';
import { readCookie, secureCookie } from '../http/cookies.ts';
import { isSameOrigin } from '../http/request.ts';
import { error, json, redirect } from '../http/respond.ts';

const callbackUrl = (request: Request) => `${new URL(request.url).origin}/api/community/callback`;
const oauthApp = ({ env }: Context): GitHubOAuthApp => ({ clientId: env.GITHUB_CLIENT_ID!, clientSecret: env.GITHUB_CLIENT_SECRET! });
const notConfigured = () => error(503, 'GitHub sign-in is not configured');

export const login: ApiHandler = async ({ request, locals: { ctx } }) => {
  if (!ctx.features.signIn) return notConfigured();
  const state = randomToken();
  const verifier = randomToken();
  const location = githubAuthorizeUrl(oauthApp(ctx), {
    redirectUri: callbackUrl(request), state, codeChallenge: await sha256Base64Url(verifier)
  });
  return redirect(location, secureCookie(flowCookie, `${state}.${verifier}`, ctx.config.community.oauthFlowSeconds));
};

export const callback: ApiHandler = async ({ request, locals: { ctx } }) => {
  if (!ctx.features.signIn) return notConfigured();
  const clearFlow = secureCookie(flowCookie, '', 0);
  const fail = () => redirect('/submit?signin=failed', clearFlow);
  const { searchParams } = new URL(request.url);
  const [state = '', verifier = ''] = (readCookie(request, flowCookie) ?? '').split('.');
  const code = searchParams.get('code');
  if (!code || code.length > 256 || !randomTokenPattern.test(verifier) || !randomTokenPattern.test(state)
    || state !== searchParams.get('state')) return fail();

  let identity;
  try {
    const accessToken = await exchangeGitHubCode(ctx.http, oauthApp(ctx), { code, redirectUri: callbackUrl(request), verifier });
    identity = accessToken ? await getGitHubIdentity(ctx.http, accessToken) : null;
  } catch {
    return fail();
  }
  if (!identity) return fail();
  return redirect('/submit', clearFlow, await startSession(ctx, identity));
};

export const logout: ApiHandler = async ({ request, locals: { ctx } }) => {
  if (!isSameOrigin(request)) return error(403, 'Origin not permitted');
  return json({ ok: true }, 200, { 'Set-Cookie': await endSession(request, ctx) });
};
