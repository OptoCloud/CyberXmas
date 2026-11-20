// Private editorial desk: review queues, drafting, scheduling doors, publishing and withdrawal.
// Every write is conditional in SQL, so racing editors get a 409 instead of a lost update.
import { doorDate, doorOpensAt, isDoorDay } from '#lib/domain/edition.ts';
import type {
  AuditEvent, CandidateRow, EditorialQueue, PendingTipRow, ReportRow, SourceStateRow
} from '#lib/domain/editorial.ts';
import { parseReport } from '#lib/domain/reports.ts';
import { isPositiveId, isRecord } from '#lib/util/validate.ts';
import { authenticateEditor } from '../auth/editor.ts';
import { pendingCandidates, reviewCandidate, sourceStates } from '../db/candidates.ts';
import { dismissTip, pendingTips } from '../db/community.ts';
import { latestDigest, parseDigest } from '../db/digests.ts';
import {
  auditTrail, createReport, createReportFromCandidate, createReportFromTip, publishReport,
  reportQueue, scheduleReport, updateReport, withdrawReport
} from '../db/incidents.ts';
import type { ApiHandler, Context } from '../context.ts';
import { purgePublic } from '../http/cache.ts';
import { runAiReview } from '../jobs/ai-review.ts';
import { runCollection } from '../jobs/collect.ts';
import { isSameOriginOrUnset, readJsonBody } from '../http/request.ts';
import { error, json } from '../http/respond.ts';

export const getQueue: ApiHandler = async ({ request, locals: { ctx } }) => {
  const { editor, response } = await authenticateEditor(request, ctx);
  if (response) return response;
  const { db, config } = ctx;
  const limits = config.editorial.queue;
  const [reports, candidates, sources, audit, tips, digests] = await db.batch([
    reportQueue(db, limits.reports),
    pendingCandidates(db, limits.candidates),
    sourceStates(db),
    auditTrail(db, limits.audit),
    pendingTips(db, limits.tips),
    latestDigest(db)
  ]);
  const rows = <T>(result: { results: unknown[] } | undefined) => (result?.results ?? []) as T[];
  return json({
    editor: editor.name,
    timezone: config.edition.timezone,
    reports: rows<ReportRow>(reports), candidates: rows<CandidateRow>(candidates), sources: rows<SourceStateRow>(sources),
    audit: rows<AuditEvent>(audit), tips: rows<PendingTipRow>(tips),
    aiReview: { enabled: config.aiReview.enabled, digest: parseDigest(digests!.results[0]) }
  } satisfies EditorialQueue);
};

export const postAction: ApiHandler = async ({ request, locals: { ctx } }) => {
  const { response } = await authenticateEditor(request, ctx);
  if (response) return response;
  if (!isSameOriginOrUnset(request)) return error(403, 'Origin not permitted');
  const data = await readJsonBody(request, ctx.config.http.maxBodyBytes);
  if (!isRecord(data)) return error(400, 'Expected a JSON request');
  const result = await runAction(data, ctx);
  if (result.ok && ['save', 'publish', 'withdraw'].includes(data.action as string)) {
    await purgePublic(request, ctx, isPositiveId(data.id) ? data.id : undefined);
  }
  return result;
};

async function runAction(data: Record<string, unknown>, ctx: Context): Promise<Response> {
  const { db, config, clock } = ctx;
  // Run a scheduled job now, so the desk can test collection and the AI review without waiting.
  if (data.action === 'run_job') {
    if (data.job === 'collect') return json({ ok: true, results: await runCollection(ctx) });
    if (data.job === 'ai_review') {
      if (!ctx.features.aiReview) return error(409, 'AI review is not enabled');
      try { await runAiReview(ctx, { rerun: true }); }
      catch { return error(502, 'AI review failed. Try again later.'); }
      return json({ ok: true });
    }
    return error(400, 'Unknown job');
  }

  if (data.action === 'dismiss_tip' && isPositiveId(data.tipId)) {
    return await dismissTip(db, data.tipId) ? json({ ok: true }) : error(409, 'Tip is no longer pending');
  }

  if (data.action === 'review') {
    const { status, provider, externalId } = data;
    if ((status !== 'reviewed' && status !== 'dismissed') || typeof provider !== 'string' || typeof externalId !== 'string') {
      return error(400, 'Invalid review');
    }
    return await reviewCandidate(db, provider, externalId, status) ? json({ ok: true }) : error(409, 'Candidate is no longer pending');
  }

  const id = data.id;
  if (id != null && !isPositiveId(id)) return error(400, 'Invalid report ID');

  if (data.action === 'save') {
    const report = parseReport(data.report, config.editorial.reportMax);
    if (!report) return error(400, 'Enter valid report fields, an HTTPS source, and a date for historical stories');
    if (data.tipId != null) {
      if (id != null || data.candidate != null || !isPositiveId(data.tipId)) return error(400, 'Invalid tip');
      const saved = await createReportFromTip(db, report, data.tipId);
      return saved ? json(saved, 201) : error(409, 'Tip is no longer pending');
    }
    if (data.candidate != null) {
      const { provider, externalId } = isRecord(data.candidate) ? data.candidate : {};
      if (id != null || typeof provider !== 'string' || typeof externalId !== 'string') return error(400, 'Invalid candidate');
      const saved = await createReportFromCandidate(db, report, provider, externalId);
      return saved ? json(saved, 201) : error(409, 'Candidate is no longer pending');
    }
    const saved = id == null ? await createReport(db, report) : await updateReport(db, id, report);
    return saved ? json(saved, id == null ? 201 : 200) : error(404, 'Report not found');
  }

  if (data.action === 'publish' && id != null) {
    const door = data.door;
    if (door != null) {
      const { year, day } = isRecord(door) ? door : {};
      if (!Number.isInteger(year) || (year as number) < clock.year || (year as number) > clock.year + 1 || !isDoorDay(day)) {
        return error(400, 'Choose a December door this year or next year');
      }
      if (doorDate(year as number, day) < clock.today) return error(400, 'Choose today or a future door');
      const opensAt = doorOpensAt(year as number, day, config.edition.timezone).toISOString();
      return await scheduleReport(db, id, year as number, day, opensAt)
        ? json({ ok: true }) : error(409, 'Door taken or report is not an unscheduled draft');
    }
    return await publishReport(db, id, clock.timestamp) ? json({ ok: true }) : error(409, 'Report is not an unscheduled draft');
  }

  if (data.action === 'withdraw' && id != null) {
    return await withdrawReport(db, id) ? json({ ok: true }) : error(409, 'Report is not scheduled or published');
  }
  return error(400, 'Invalid editorial action');
}
