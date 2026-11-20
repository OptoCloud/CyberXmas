<script lang="ts">
  import { onMount } from 'svelte';
  import TipForm from './TipForm.svelte';
  import type { PublicTip, TipBoard } from '#lib/domain/community.ts';
  import { categories } from '#lib/domain/incidents.ts';

  let board = $state<TipBoard | null>(null);
  let error = $state('');
  let status = $state('');
  let busy = $state(false);
  let revision = 0;

  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(path, {
      method,
      ...(body !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data as T;
  }

  async function refresh(page = 1) {
    const run = ++revision;
    const next = await request<TipBoard>(`/api/tips?page=${page}`);
    if (run !== revision) return;
    board = next;
    if (page > 1 && !next.items.length) await refresh(1);
  }

  async function run(action: () => Promise<void>) {
    busy = true;
    error = '';
    try { await action(); } catch (failure) { error = (failure as Error).message || 'Could not load community tips.'; }
    finally { busy = false; }
  }

  onMount(() => {
    run(async () => {
      await refresh();
      if (new URL(location.href).searchParams.get('signin') === 'failed') error = 'GitHub sign-in did not complete. Try again.';
    });
    return () => { revision++; };
  });

  function posted() {
    status = 'Tip posted to public review. It is not a published incident report.';
    refresh(1).catch((failure: Error) => { error = failure.message; });
  }

  const currentPage = () => board?.page ?? 1;

  async function like(tip: PublicTip) {
    await run(async () => {
      try { await request(`/api/tips/${tip.id}/like`, 'PUT', { liked: !tip.liked }); }
      finally { await refresh(currentPage()); }
    });
  }
</script>

{#if error}<p class="notice" role="alert">{error}</p>{/if}
{#if !board && busy}<p class="notice" role="status">Loading community tips&hellip;</p>{/if}
{#if board}
  {#if board.viewer}
    <div class="filter-form">
      <p>Signed in as <strong>{board.viewer}</strong></p>
      <button type="button" disabled={busy} onclick={() => run(async () => { await request('/api/community/logout', 'POST'); await refresh(currentPage()); })}>Sign out</button>
    </div>
    {#if board.siteKey}
      <p>Tips appear publicly as soon as you send them. Tip headlines, categories, source domains, and like counts can be included in the editor&rsquo;s AI shortlist. Include only information already public in your source.</p>
      <TipForm siteKey={board.siteKey} onsubmitted={posted} />
    {:else}
      <p class="notice">New submissions are temporarily closed.</p>
    {/if}
  {:else if board.signIn}
    <p><a class="button primary" href="/api/community/login" data-sveltekit-reload>Sign in with GitHub</a> to send or like tips.</p>
  {:else}
    <p class="notice">GitHub sign-in is not available yet. You can still read the queue.</p>
  {/if}

  <section id="review" class="section" aria-labelledby="review-title">
    <h2 id="review-title">Public review queue</h2>
    <p>Ranked by likes. Tips are unverified leads; only a moderator can publish a report or schedule a calendar door.</p>
    <p role="status">{status}</p>
    <div class="story-grid">
      {#each board.items as tip (tip.id)}
        <article class="story">
          <div class="badges"><span class="badge" data-category={tip.category}>{categories[tip.category]}</span></div>
          <h3>{tip.title}</h3>
          <p>{tip.summary}</p>
          <div class="actions">
            <a href={tip.sourceUrl} rel="noreferrer nofollow ugc">Read source</a>
            {#if board.viewer && board.canReview && tip.canLike}
              <button type="button" disabled={busy} aria-pressed={Boolean(tip.liked)} aria-label={`Like ${tip.title}`} onclick={() => like(tip)}>
                {tip.liked ? 'Liked' : 'Like'} &middot; {tip.likes}
              </button>
            {:else}
              <span>{tip.likes} {tip.likes === 1 ? 'like' : 'likes'}</span>
            {/if}
          </div>
        </article>
      {:else}
        <p class="notice">No tips waiting for review.</p>
      {/each}
    </div>
    {#if board.page > 1 || board.hasMore}
      <div class="pagination" aria-label="Review queue pages">
        <button type="button" disabled={busy || board.page === 1} onclick={() => run(() => refresh(currentPage() - 1))}>Previous</button>
        <span>Page {board.page}</span>
        <button type="button" disabled={busy || !board.hasMore} onclick={() => run(() => refresh(currentPage() + 1))}>Next</button>
      </div>
    {/if}
  </section>
{/if}
