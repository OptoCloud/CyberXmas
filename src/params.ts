// Route parameter matchers: https://svelte.dev/docs/kit/advanced-routing#Matching
import { defineParams } from '@sveltejs/kit/params';
import { parsePositiveId } from '#lib/util/validate.ts';

export const params = defineParams({
  /** A positive integer database ID; `params.id` is a number in matching routes. */
  id: (param) => parsePositiveId(param) ?? undefined
});
