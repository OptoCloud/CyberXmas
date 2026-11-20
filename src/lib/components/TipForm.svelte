<script lang="ts">
  import { onMount } from 'svelte';
  import { categories } from '#lib/domain/incidents.ts';
  import { trustedTipSources } from '#lib/domain/tip-sources.ts';

  const { siteKey, onsubmitted }: { siteKey: string; onsubmitted: (id: number) => void } = $props();
  let widget: HTMLDivElement | undefined;
  let widgetId: string | undefined;
  let checking = $state(true);
  let token = $state('');
  let sending = $state(false);
  let sourceType = $state('link');
  let error = $state('');

  onMount(() => {
    let active = true;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    const render = () => {
      if (!active) return;
      try {
        widgetId = window.turnstile!.render(widget!, {
          sitekey: siteKey, action: 'incident_tip', theme: 'dark', size: 'flexible',
          callback: (value: string) => { token = value; },
          'expired-callback': () => { token = ''; },
          'error-callback': () => { token = ''; error = 'Could not verify this browser. Try reloading.'; }
        });
      } catch {
        error = 'Verification could not start. Try reloading.';
      }
      checking = false;
    };
    if (window.turnstile) render();
    else {
      script.onload = render;
      script.onerror = () => {
        if (active) { checking = false; error = 'Verification could not load. Try reloading.'; }
      };
      document.head.append(script);
    }
    return () => {
      active = false;
      if (widgetId != null) window.turnstile?.remove(widgetId);
      script.remove();
    };
  });

  async function submit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault();
    if (!token || sending) return;
    const form = event.currentTarget;
    sending = true;
    error = '';
    try {
      const body = Object.fromEntries(new FormData(form)) as Record<string, string>;
      const response = await fetch('/api/tips', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, token })
      });
      const { id, error: message } = await response.json();
      if (!response.ok) throw new Error(message);
      form.reset();
      sourceType = 'link';
      onsubmitted(id);
    } catch (failure) {
      error = (failure as Error).message || 'Could not send this tip. Try again.';
    } finally {
      token = '';
      sending = false;
      if (widgetId != null) window.turnstile?.reset(widgetId);
    }
  }
</script>

{#if error}<p class="notice" role="alert">{error}</p>{/if}
<form class="editor-form" onsubmit={submit}>
  <label>Incident headline <input name="title" maxlength="250" required /></label>
  <label>Category <select name="category" required>
    <option value="">Choose a category</option>
    {#each Object.entries(categories) as [key, label] (key)}<option value={key}>{label}</option>{/each}
  </select></label>
  <label>What happened? <textarea name="summary" rows="4" maxlength="1500" required></textarea></label>
  <label>Evidence <select bind:value={sourceType}>
    <option value="link">Trusted article or advisory</option>
    <option value="cve">Published CVE ID</option>
  </select></label>
  {#if sourceType === 'cve'}
    <label>CVE ID <input name="cve" maxlength="32" placeholder="CVE-2025-12345" required /></label>
  {:else}
    <label>Direct source link <input type="url" name="sourceUrl" maxlength="2048" placeholder="https://" required /></label>
    <details>
      <summary>Accepted sources</summary>
      <p>{trustedTipSources.map(([name]) => name).join(', ')}. Link to the article or advisory, not a homepage or discussion thread.</p>
    </details>
  {/if}
  {#if checking}<p role="status">Loading verification&hellip;</p>{/if}
  <div bind:this={widget}></div>
  <button class="primary" type="submit" disabled={!token || sending}>{sending ? 'Sending…' : 'Send tip'}</button>
</form>
