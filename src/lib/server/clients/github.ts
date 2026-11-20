// GitHub OAuth (authorization code + PKCE) and the authenticated-user endpoint.
// Sign-in requests no scopes and never stores the access token.
import { isRecord } from '#lib/util/validate.ts';
import { expectJson, type HttpClient } from './http.ts';

const maxBytes = 64 * 1024;

export interface GitHubIdentity {
  id: number;
  login: string;
}

export interface GitHubOAuthApp {
  clientId: string;
  clientSecret: string;
}

export function githubAuthorizeUrl(app: Pick<GitHubOAuthApp, 'clientId'>, options: {
  redirectUri: string; state: string; codeChallenge: string;
}): string {
  const query = new URLSearchParams({
    client_id: app.clientId, redirect_uri: options.redirectUri, scope: '', state: options.state,
    code_challenge: options.codeChallenge, code_challenge_method: 'S256'
  });
  return `https://github.com/login/oauth/authorize?${query}`;
}

/** Exchange an authorization code for an access token, or return null. */
export async function exchangeGitHubCode(http: HttpClient, app: GitHubOAuthApp, options: {
  code: string; redirectUri: string; verifier: string;
}): Promise<string | null> {
  const response = await http.request('https://github.com/login/oauth/access_token', {
    method: 'POST', headers: { Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: app.clientId, client_secret: app.clientSecret, code: options.code,
      redirect_uri: options.redirectUri, code_verifier: options.verifier
    })
  });
  if (!response.ok) return null;
  const data = await expectJson(response, maxBytes);
  const token = isRecord(data) ? data.access_token : null;
  return typeof token === 'string' && token ? token : null;
}

/** The signed-in user's numeric ID and login, or null if GitHub returns anything unexpected. */
export async function getGitHubIdentity(http: HttpClient, accessToken: string): Promise<GitHubIdentity | null> {
  const response = await http.request('https://api.github.com/user', {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return null;
  const identity = await expectJson(response, maxBytes);
  if (!isRecord(identity) || !Number.isSafeInteger(identity.id) || (identity.id as number) < 1
    || typeof identity.login !== 'string' || !/^[a-z0-9-]{1,39}$/i.test(identity.login)) return null;
  return { id: identity.id as number, login: identity.login };
}
