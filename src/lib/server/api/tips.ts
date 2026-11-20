// Community tips: a public review queue, submission (GitHub sign-in + Turnstile + rate limits)
// and likes. Nothing here can publish or schedule a report.
import type { TipBoard } from '#lib/domain/community.ts';
import { feedFilters, isCategory } from '#lib/domain/incidents.ts';
import { tipSource } from '#lib/domain/tip-sources.ts';
import { isBoundedText, isRecord } from '#lib/util/validate.ts';
import { currentViewer, sessionCookie } from '../auth/community-session.ts';
import { withinLimits } from '../clients/cloudflare/rate-limit.ts';
import { turnstilePassed, verifyTurnstile } from '../clients/cloudflare/turnstile.ts';
import { getCveRecordState } from '../clients/cve.ts';
import { countTipsSince, findPublicTipAuthor, insertTip, listPublicTips, setTipLike } from '../db/community.ts';
import { cachedPublic } from '../http/cache.ts';
import { readCookie } from '../http/cookies.ts';
import { isSameOrigin, readJsonBody } from '../http/request.ts';
import { error, json, tooManyAttempts } from '../http/respond.ts';
import type { ApiHandler } from '../context.ts';

export const listTips: ApiHandler = async ({ request, locals: { ctx } }) => {
  const { features, env, config } = ctx;
  const { page } = feedFilters(new URL(request.url).searchParams, config.feed);
  const { pageSize } = config.feed;
  const render = async () => {
    const viewer = await currentViewer(request, ctx);
    const rows = await listPublicTips(ctx.db, viewer?.id ?? null, pageSize + 1, (page - 1) * pageSize);
    return json({
      items: rows.slice(0, pageSize), page, hasMore: rows.length > pageSize,
      viewer: viewer?.login ?? null,
      signIn: features.signIn,
      siteKey: features.tipSubmission ? env.TURNSTILE_SITE_KEY! : null,
      canReview: features.tipReview
    } satisfies TipBoard);
  };
  // Signed-out visitors all see the same board, so it is served from the edge cache. It stays out
  // of browser caches, because the same URL answers differently right after sign-in.
  return readCookie(request, sessionCookie) ? render() : cachedPublic(request, ctx, `/api/tips?page=${page}`, render, { browser: false });
};

export const submitTip: ApiHandler = async ({ request, locals: { ctx } }) => {
  const { env, config, features, http } = ctx;
  if (!isSameOrigin(request)) return error(403, 'Origin not permitted');
  const viewer = await currentViewer(request, ctx);
  if (!viewer) return error(401, 'Sign in with GitHub first');
  if (!features.tipSubmission) return error(503, 'Community actions are temporarily closed');

  const address = request.headers.get('CF-Connecting-IP');
  if (!address) return error(403, 'Unable to verify this connection');
  if (!(await withinLimits(env.TIP_LIMIT!, `account:${viewer.id}`, `address:${address}`))) return tooManyAttempts();
  const dayAgo = new Date(ctx.now.getTime() - 86400000).toISOString();
  if (await countTipsSince(ctx.db, viewer.id, dayAgo) >= config.community.tipsPerDay) {
    return error(429, 'You have reached the daily tip limit. Try again tomorrow.', { 'Retry-After': '3600' });
  }

  const body = await readJsonBody(request, config.http.maxBodyBytes);
  const { title, summary, category, sourceUrl = '', cve = '', token } = isRecord(body) ? body : {};
  const { tipTitleMax, tipSummaryMax, turnstileAction } = config.community;
  if (!isBoundedText(title, tipTitleMax) || !isBoundedText(summary, tipSummaryMax) || !isCategory(category)
    || !isBoundedText(token, 2048)) {
    return error(400, 'Check the required fields and complete verification');
  }
  const source = tipSource(cve, sourceUrl);
  if (!source) return error(400, 'Enter one CVE ID or a direct HTTPS article or advisory link from a trusted source');

  const verdict = await verifyTurnstile(http, { secret: env.TURNSTILE_SECRET!, token, remoteIp: address });
  if (!verdict) return error(503, 'Verification is temporarily unavailable');
  if (!turnstilePassed(verdict, new URL(request.url).hostname, turnstileAction)) {
    return error(400, 'Verification expired or failed. Try again.');
  }
  if (source.cve) {
    const state = await getCveRecordState(http, source.cve);
    if (state === 'unavailable') return error(503, 'CVE verification is temporarily unavailable');
    if (state === 'missing') return error(422, 'That CVE is not a published CVE Program record');
  }
  const added = await insertTip(ctx.db, {
    category, title: title.trim(), summary: summary.trim(), sourceUrl: source.url, submitter: viewer,
    submittedAt: ctx.now.toISOString()
  });
  return added ? json(added, 201) : error(409, 'A tip with that source was already submitted');
};

export const voteTip: ApiHandler<{ id: number }> = async ({ request, locals: { ctx }, params: { id } }) => {
  if (!isSameOrigin(request)) return error(403, 'Origin not permitted');
  const viewer = await currentViewer(request, ctx);
  if (!viewer) return error(401, 'Sign in with GitHub first');
  if (!ctx.features.tipReview) return error(503, 'Community actions are temporarily closed');
  if (!(await withinLimits(ctx.env.REVIEW_LIMIT!, String(viewer.id)))) return tooManyAttempts();

  const body = await readJsonBody(request, ctx.config.http.maxBodyBytes);
  const liked = isRecord(body) ? body.liked : undefined;
  if (typeof liked !== 'boolean') return error(400, 'Invalid vote');
  const author = await findPublicTipAuthor(ctx.db, id);
  if (author === null) return error(404, 'Tip is no longer in review');
  if (author === viewer.id) return error(403, 'You cannot like your own tip');
  await setTipLike(ctx.db, id, viewer.id, liked);
  return json({ ok: true });
};
