<script>
  import { page } from '$app/state';
  import App from './App.svelte';
</script>

{#key page.url.href}
  <App href={page.url.href} />
{/key}
