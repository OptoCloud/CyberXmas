import { dev } from '$app/env';
import { loadPublicPage } from '#lib/server/api/pages.ts';
import type { LayoutServerLoad } from './$types';

// Public pages get their data during server rendering, so the first paint is complete.
export const load: LayoutServerLoad = (event) => loadPublicPage(event, dev);
