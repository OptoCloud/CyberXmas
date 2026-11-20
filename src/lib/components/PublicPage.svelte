<script lang="ts">
  import { page } from '$app/state';
  import App from './App.svelte';
  import type { PublicData } from '#lib/domain/pages.ts';
</script>

{#key page.url.href}
  <App href={page.url.href} data={page.data as PublicData} />
{/key}
