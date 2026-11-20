// Response shapes of the community API, shared by the server and the UI.
import type { Category, FeedPage } from './incidents.ts';

export interface PublicTip {
  id: number;
  title: string;
  summary: string;
  category: Category;
  sourceUrl: string;
  likes: number;
  /** 1 when the viewer liked this tip. */
  liked: number;
  /** 1 when the viewer may like it (not their own); null when signed out. */
  canLike: number | null;
}

/** GET /api/tips */
export interface TipBoard extends FeedPage<PublicTip> {
  viewer: string | null;
  signIn: boolean;
  /** Turnstile site key; null while submissions are closed. */
  siteKey: string | null;
  canReview: boolean;
}
