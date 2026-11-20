<script lang="ts">
  import { onMount } from 'svelte';
  import type { CandidateRow, EditorialDenied, EditorialQueue, PendingTipRow, ReportRow } from '#lib/domain/editorial.ts';
  import { categories, type Category } from '#lib/domain/incidents.ts';

  interface Draft {
    category: Category; title: string; summary: string; takeaway: string; sourceUrl: string;
    occurredAt: string; historical: boolean; cvss: number | null;
  }

  class RequestError extends Error {
    readonly status: number;
    readonly auth: EditorialDenied['auth'] | undefined;
    constructor(message: string, status: number, auth?: EditorialDenied['auth']) {
      super(message);
      this.status = status;
      this.auth = auth;
    }
  }

  const empty = (): Draft => ({ category: 'outage', title: '', summary: '', takeaway: '', sourceUrl: '', occurredAt: '', historical: false, cvss: null });
  let token = $state('');
  /** False when Cloudflare Access alone authenticates editors, so no key is needed. */
  let needsKey = $state(true);
  let queue = $state<EditorialQueue | null>(null);
  let report = $state<Draft>(empty());
  let selected = $state<number | null>(null);
  let candidate = $state<CandidateRow | null>(null);
  let tipId = $state<number | null>(null);
  let door = $state('');
  let busy = $state(false);
  let status = $state('');
  let error = $state('');

  async function request<T = { ok: true }>(data?: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = data ? { 'Content-Type': 'application/json' } : {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch('/api/editorial', {
      method: data ? 'POST' : 'GET', headers, body: data ? JSON.stringify(data) : undefined
    });
    const result = await response.json();
    if (!response.ok) throw new RequestError(result.error ?? result.message, response.status, result.auth);
    return result as T;
  }

  async function run(work: () => Promise<void>, message = '') {
    busy = true;
    status = error = '';
    try { await work(); if (message) status = message; }
    catch (failure) { error = (failure as Error).message; }
    finally { busy = false; }
  }

  async function refresh() {
    queue = await request<EditorialQueue>();
  }

  // Try without a key first: behind Cloudflare Access the desk may already be authorized.
  onMount(() => {
    request<EditorialQueue>().then((result) => { queue = result; }, (failure: RequestError) => {
      if (failure.status === 401) needsKey = failure.auth !== 'access';
      if (failure.status !== 401 || failure.auth === 'access') error = failure.message;
    });
  });

  function choose(row: ReportRow | null | undefined) {
    candidate = null;
    tipId = null;
    selected = row?.id ?? null;
    report = row ? {
      category: row.category, title: row.title, summary: row.summary, takeaway: row.takeaway,
      sourceUrl: row.source_url, occurredAt: row.occurred_at?.slice(0, 10) ?? '',
      historical: Boolean(row.historical), cvss: row.cvss
    } : empty();
    door = '';
  }

  function use(row: CandidateRow) {
    choose(null);
    candidate = row;
    report.title = row.title;
    report.sourceUrl = row.source_url;
    report.category = row.category;
    if (row.category === 'outage') report.occurredAt = row.occurred_at.slice(0, 10);
  }

  function review(row: CandidateRow, status: 'reviewed' | 'dismissed') {
    return request({ action: 'review', provider: row.provider, externalId: row.external_id, status });
  }

  function useTip(row: PendingTipRow) {
    choose(null);
    tipId = row.id;
    report = { ...report, category: row.category, title: row.title, summary: row.summary, sourceUrl: row.source_url };
  }

  async function save() {
    const { id } = await request<{ id: number }>({ action: 'save', id: selected, tipId,
      candidate: candidate ? { provider: candidate.provider, externalId: candidate.external_id } : null,
      report: {
      ...report, cvss: report.category === 'vulnerability' ? report.cvss ?? null : null
    } });
    selected = id;
    candidate = null;
    tipId = null;
    await refresh();
  }

  async function publish(schedule: boolean) {
    const match = /^(\d{4})-12-(\d{2})$/.exec(door);
    if (schedule && !match) throw new Error('Choose a December date from day 1 to 24');
    await request({ action: 'publish', id: selected, door: schedule && match ? { year: Number(match[1]), day: Number(match[2]) } : null });
    await refresh();
  }

  function lock() {
    token = '';
    queue = null;
    status = error = '';
    choose(null);
  }

  let current = $derived(queue?.reports.find((row) => row.id === selected));
</script>

<svelte:head>
  <title>Editorial desk | CyberXmas</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<header class="site-header"><div class="wrap header-inner"><a class="brand" href="/">CyberXmas</a><a href="/">Public site</a></div></header>
<main class="wrap">
  <div class="page-heading"><p class="eyebrow">PRIVATE WORKSPACE</p><h1>Editorial desk</h1></div>
  {#if error}<p class="notice" role="alert">{error}</p>{/if}
  {#if status}<p class="notice" role="status">{status}</p>{/if}
  {#if !queue}
    {#if needsKey}
      <form class="filter-form" onsubmit={(event) => { event.preventDefault(); run(refresh); }}>
        <label>Editor key <input type="password" bind:value={token} required autocomplete="off" /></label>
        <button class="primary" type="submit" disabled={busy}>Unlock desk</button>
      </form>
    {/if}
  {:else}
    <div class="filter-form"><p>Signed in as <strong>{queue.editor}</strong></p><button onclick={() => run(refresh, 'Queue refreshed.')} disabled={busy}>Refresh</button><button onclick={lock} disabled={busy}>Lock</button></div>
    <section class="section">
      <h2>Daily AI shortlist</h2>
      <p>Suggestions only. Check the original sources before drafting or publishing.</p>
      {#if !queue.aiReview.enabled}<p class="notice">Daily AI review is disabled.</p>{/if}
      {#if queue.aiReview.digest}
        {@const digest = queue.aiReview.digest}
        <p><time datetime={digest.day}>{digest.day}</time> (UTC) &middot; {digest.tipCount} community tips &middot; {digest.candidateCount} imported leads</p>
        {#if digest.status !== 'ready'}
          <p class="notice">{digest.status === 'failed' ? 'AI review failed. The queues are still available below.' : 'AI review is running.'}</p>
        {:else}
          <ol>
            {#each digest.shortlist as row}
              <li><a href={row.sourceUrl} rel="noreferrer">{row.title}</a> &middot; {row.kind} &middot; {row.reason}</li>
            {:else}<li>No recommendations for this run.</li>{/each}
          </ol>
        {/if}
      {:else if queue.aiReview.enabled}<p class="notice">No digest yet. The shortlist runs daily at 06:15 UTC.</p>{/if}
      {#if queue.aiReview.enabled}
        <p><button disabled={busy} onclick={() => run(async () => { await request({ action: 'run_job', job: 'ai_review' }); await refresh(); }, 'AI review finished.')}>Run AI review now</button></p>
      {/if}
    </section>
    <section class="section">
      <h2>Community tips</h2>
      {#each queue.tips as row (row.id)}
        <div class="story editorial-row">
          <div><strong>{row.title}</strong><p>{categories[row.category]} &middot; {row.likes} {row.likes === 1 ? 'like' : 'likes'} &middot; {row.summary}</p></div>
          <div class="actions">
            <a href={row.source_url} rel="noreferrer">Source</a>
            <button disabled={busy} onclick={() => useTip(row)}>Start draft</button>
            <button disabled={busy} onclick={() => run(async () => { await request({ action: 'dismiss_tip', tipId: row.id }); await refresh(); }, 'Tip dismissed.')}>Dismiss</button>
          </div>
        </div>
      {:else}<p class="notice">No pending tips.</p>{/each}
    </section>
    <section class="section">
      <h2>Candidate queue</h2>
      <p><button disabled={busy} onclick={() => run(async () => {
        const { results } = await request<{ results: ({ provider: string; count: number } | { provider: string; error: string })[] }>({ action: 'run_job', job: 'collect' });
        await refresh();
        status = `Collection finished: ${results.map((result) => 'error' in result ? `${result.provider} failed` : `${result.provider} ${result.count}`).join(', ')}.`;
      })}>Run collection now</button></p>
      {#each queue.sources as source (source.provider)}
        <p>{source.provider}: {source.last_error ?? `${source.candidate_count} candidates collected`} &middot; {source.attempted_at}</p>
      {/each}
      {#each queue.candidates as row (`${row.provider}:${row.external_id}`)}
        <div class="story editorial-row">
          <div><strong>{row.title}</strong><p>{row.provider} &middot; {row.impact} &middot; {row.provider_status}</p></div>
          <div class="actions">
            <a href={row.source_url} rel="noreferrer">Source</a>
            <button disabled={busy} onclick={() => use(row)}>Start draft</button>
            <button disabled={busy} onclick={() => run(async () => { await review(row, 'dismissed'); await refresh(); }, 'Candidate dismissed.')}>Dismiss</button>
          </div>
        </div>
      {:else}<p class="notice">No pending candidates.</p>{/each}
    </section>
    <section class="section">
      <h2>Reports</h2>
      <div class="filter-form">
        <label>Saved reports <select value={selected ?? ''} onchange={(event) => choose(queue?.reports.find((row) => row.id === Number(event.currentTarget.value)))} disabled={busy}>
          <option value="">New draft</option>
          {#each queue.reports as row (row.id)}
            <option value={row.id}>{row.title} ({row.day ? `door ${row.day}, ${row.year}` : row.published_at ? 'published' : 'draft'})</option>
          {/each}
        </select></label>
        <button onclick={() => choose(null)} disabled={busy}>New draft</button>
      </div>
      <form class="editor-form" onsubmit={(event) => { event.preventDefault(); run(save, 'Report saved.'); }}>
        <label>Title <input bind:value={report.title} maxlength="250" required /></label>
        <label>Category <select bind:value={report.category}>{#each Object.entries(categories) as [key, label] (key)}<option value={key}>{label}</option>{/each}</select></label>
        <label>Summary <textarea bind:value={report.summary} maxlength="3000" rows="5" required></textarea></label>
        <label>Defensive takeaway <textarea bind:value={report.takeaway} maxlength="1500" rows="3" required></textarea></label>
        <label>Original source URL <input type="url" bind:value={report.sourceUrl} maxlength="2048" required /></label>
        <label>Incident date <input type="date" bind:value={report.occurredAt} required={report.historical} /></label>
        <label class="editor-checkbox"><input type="checkbox" bind:checked={report.historical} /> Historical retrospective</label>
        {#if report.category === 'vulnerability'}<label>CVSS <input type="number" min="0" max="10" step=".1" bind:value={report.cvss} /></label>{/if}
        <button class="primary" type="submit" disabled={busy}>Save report</button>
      </form>
      {#if current}
        <div class="filter-form">
          {#if current.published_at}
            <button disabled={busy} onclick={() => run(async () => { await request({ action: 'withdraw', id: selected }); await refresh(); }, 'Report withdrawn.')}>Withdraw publication</button>
          {:else}
            <button disabled={busy} onclick={() => run(() => publish(false), 'Saved report published.')}>Publish saved report</button>
            <label>December door date ({queue.timezone}) <input type="date" bind:value={door} /></label>
            <button disabled={busy || !door} onclick={() => run(() => publish(true), 'Saved report scheduled.')}>Schedule saved report</button>
          {/if}
        </div>
      {/if}
    </section>
    <section class="section"><h2>Recent activity</h2>
      <ul>{#each queue.audit as event (event.id)}<li>{event.created_at} &middot; {event.action.replaceAll('_', ' ')} {event.incident_id ? `#${event.incident_id}` : ''} {event.detail ?? ''}</li>{/each}</ul>
    </section>
  {/if}
</main>
