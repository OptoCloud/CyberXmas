// Response shapes of the private editorial API, shared by the server and the editorial UI.
// Row types mirror the D1 tables (snake_case columns) because the desk shows them as stored.
import type { EditorialAuthMode } from '#lib/config/defaults.ts';
import type { Category } from './incidents.ts';

export interface ReportRow {
  id: number;
  category: Category;
  title: string;
  summary: string;
  takeaway: string;
  source_url: string;
  cvss: number | null;
  historical: number;
  occurred_at: string | null;
  published_at: string | null;
  year: number | null;
  day: number | null;
}

export interface CandidateRow {
  provider: string;
  external_id: string;
  title: string;
  source_url: string;
  impact: 'none' | 'minor' | 'major' | 'critical';
  provider_status: string;
  occurred_at: string;
  provider_updated_at: string;
  first_seen_at: string;
  review_status: 'pending' | 'dismissed' | 'reviewed';
  category: 'outage' | 'vulnerability';
}

export interface SourceStateRow {
  provider: string;
  attempted_at: string;
  succeeded_at: string | null;
  candidate_count: number;
  last_error: string | null;
}

export interface AuditEvent {
  id: number;
  action: string;
  incident_id: number | null;
  detail: string | null;
  /** The editor, on rows written by the desk API; null on rows written by triggers. */
  actor: string | null;
  created_at: string;
}

export interface PendingTipRow {
  id: number;
  title: string;
  summary: string;
  category: Category;
  source_url: string;
  likes: number;
  /** Null on tips from before sign-in was required. */
  submitter_github_id: number | null;
  submitter_login: string | null;
}

export interface BlockRow {
  github_id: number;
  login: string | null;
  blocked_at: string;
}

export interface ShortlistEntry {
  title: string;
  sourceUrl: string;
  kind: string;
  reason: string;
}

export interface Digest {
  day: string;
  status: 'running' | 'ready' | 'failed';
  tipCount: number;
  candidateCount: number;
  shortlist: ShortlistEntry[];
}

/** GET /api/editorial */
export interface EditorialQueue {
  /** Who is signed in: an Access identity or "shared editor key". */
  editor: string;
  /** Edition time zone in which scheduled doors open. */
  timezone: string;
  reports: ReportRow[];
  candidates: CandidateRow[];
  sources: SourceStateRow[];
  audit: AuditEvent[];
  tips: PendingTipRow[];
  blocks: BlockRow[];
  aiReview: { enabled: boolean; digest: Digest | null };
}

/** Body of a 401 from the editorial API. */
export interface EditorialDenied {
  error: string;
  auth: EditorialAuthMode;
}
