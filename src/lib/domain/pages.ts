// What a public page shows, shared by the server load and the UI.
import type { TipBoard } from './community.ts';
import type { Edition, FeedPage, PublicIncident } from './incidents.ts';

export type PublicView = 'home' | 'calendar' | 'feed' | 'submit' | 'sources' | 'detail' | 'missing';

const views: Record<string, PublicView> = {
  '/': 'home', '/calendar': 'calendar', '/incidents': 'feed', '/submit': 'submit', '/sources': 'sources'
};

/** The view for a pathname, and the report ID on a report page. */
export function publicView(pathname: string): { view: PublicView; id: number | null } {
  const path = pathname.replace(/\/$/, '') || '/';
  const detail = /^\/incidents\/([1-9]\d*)$/.exec(path);
  return { view: views[path] ?? (detail ? 'detail' : 'missing'), id: detail ? Number(detail[1]) : null };
}

/** Everything a public page needs, loaded on the server so the first paint is complete. */
export interface PublicData {
  /** Fictional demo stories (?demo=1, or `pnpm dev`). */
  demo: boolean;
  edition: Edition | null;
  feed: FeedPage<PublicIncident> | null;
  incident: PublicIncident | null;
  /** The tip board on the submit page; null leaves the page to fetch it. */
  tips: TipBoard | null;
  /** Why the page's main content could not be loaded, or ''. */
  error: string;
}
