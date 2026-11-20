// GitHub-backed community sessions: a random token in a __Host- cookie, stored hashed in D1.
import { randomToken, randomTokenPattern, sha256Base64Url } from '#lib/util/crypto.ts';
import type { Context } from '../context.ts';
import { createSession, deleteSession, findSession, type Viewer } from '../db/community.ts';
import { readCookie, secureCookie } from '../http/cookies.ts';

export const flowCookie = '__Host-cyberxmas-oauth';
export const sessionCookie = '__Host-cyberxmas-session';

const seconds = (now: Date) => Math.floor(now.getTime() / 1000);

function sessionToken(request: Request): string | null {
  const token = readCookie(request, sessionCookie);
  return token && randomTokenPattern.test(token) ? token : null;
}

/** The signed-in community member, or null. Always null while sign-in is not configured. */
export async function currentViewer(request: Request, ctx: Context): Promise<Viewer | null> {
  if (!ctx.features.signIn) return null;
  const token = sessionToken(request);
  return token ? findSession(ctx.db, await sha256Base64Url(token), seconds(ctx.now)) : null;
}

/** Create a session and return its Set-Cookie value. */
export async function startSession(ctx: Context, viewer: Viewer): Promise<string> {
  const token = randomToken();
  const { sessionSeconds } = ctx.config.community;
  await createSession(ctx.db, await sha256Base64Url(token), viewer, seconds(ctx.now), seconds(ctx.now) + sessionSeconds);
  return secureCookie(sessionCookie, token, sessionSeconds);
}

/** Revoke the request's session, if any, and return a cookie that clears it. */
export async function endSession(request: Request, ctx: Context): Promise<string> {
  const token = sessionToken(request);
  if (token) await deleteSession(ctx.db, await sha256Base64Url(token));
  return secureCookie(sessionCookie, '', 0);
}
