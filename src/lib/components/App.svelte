<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import CommunityTips from './CommunityTips.svelte';
  import DeskLog from './DeskLog.svelte';
  import DoorOverlay from './DoorOverlay.svelte';
  import EditionBoard from './EditionBoard.svelte';
  import Seal from './Seal.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import TimeMachine from './TimeMachine.svelte';
  import { sourceGroups } from '#lib/content/sources.ts';
  import { demoEdition, demoFeed } from '#lib/content/demo.ts';
  import { days, doorDate, doorOpensAt } from '#lib/domain/edition.ts';
  import {
    categories, feedFilters, pageSize, severity, severityLabels,
    type Edition, type FeedPage, type PublicIncident
  } from '#lib/domain/incidents.ts';
  import { zonedDay } from '#lib/util/time.ts';

  let { href }: { href: string } = $props();
  const url = new URL(untrack(() => href));
  const demo = url.searchParams.get('demo') === '1' || (import.meta.env.DEV && !url.searchParams.has('demo'));
  const path = url.pathname.replace(/\/$/, '') || '/';
  const detail = /^\/incidents\/([1-9]\d*)$/.exec(path);
  const view = path === '/' ? 'home' : path === '/calendar' ? 'calendar' : path === '/incidents' ? 'feed' : path === '/submit' ? 'submit' : path === '/sources' ? 'sources' : detail ? 'detail' : 'missing';
  const filters = feedFilters(url.searchParams);
  const defaultYear = 2026;
  const requestedYear = view === 'calendar' ? url.searchParams.get('year') : null;
  const brand = 'CyberXmas';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Dates are calendar days (YYYY-MM-DD) or UTC instants; format both in UTC so a day never shifts.
  const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });
  let edition = $state<Edition | null>(null);
  let feed = $state<FeedPage<PublicIncident> | null>(null);
  let incident = $state<PublicIncident | null>(null);
  let loading = $state(['home', 'calendar', 'feed', 'detail'].includes(view));
  let error = $state('');
  let opened = $state<PublicIncident | null>(null);
  let revealDay = $state<number | null>(null);
  let revealDenied = $state(false);
  let revealNote = $state('');
  let lockedNotice = $state('');
  let revealRun = 0;
  let doorDialog = $state<HTMLDialogElement>();
  let doorOverlay = $state<ReturnType<typeof DoorOverlay>>();
  let realNow = $state(Date.now());
  /** Preview deployments run the edition clock ahead; follow the server so countdowns agree. */
  let shiftDays = $derived(edition?.shiftDays ?? 0);
  let clock = $derived(realNow + shiftDays * 86400000);
  /** Doors open at midnight in the edition's time zone, which the API reports. */
  let timezone = $derived(edition?.timezone ?? 'UTC');
  let today = $derived(edition?.today ?? zonedDay(new Date(clock), timezone));
  let nextDoor = $derived(edition
    ? days.map((day) => ({ date: doorDate(edition!.year, day), opensAt: doorOpensAt(edition!.year, day, timezone).getTime() }))
      .find(({ date, opensAt }) => date > edition!.today && (demo || opensAt > clock)) ?? null
    : null);
  let countdown = $derived(nextDoor && !demo ? countdownText(nextDoor.opensAt - clock) : '');
  let entries = $derived(new Map(edition?.calendar.map((entry) => [entry.day, entry])));

  function link(pathname: string, params: Record<string, string | number | null | undefined> = {}): string {
    const query = new URLSearchParams(Object.entries(params)
      .filter(([, value]) => value !== '' && value != null).map(([key, value]) => [key, String(value)]));
    if (demo) query.set('demo', '1');
    return query.size ? `${pathname}?${query}` : pathname;
  }

  function feedLink(page: number): string {
    return link('/incidents', { q: filters.query, category: filters.category, page });
  }

  function formatDate(value: string | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
  }

  /** Postmark text for an instant or calendar day: ["07 DEC", "2026"]. */
  function stampDate(value: string): [string, string] {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? ['', '']
      : [`${number(date.getUTCDate())} ${months[date.getUTCMonth()]!.toUpperCase()}`, String(date.getUTCFullYear())];
  }

  function almanacLine(day: string): string {
    const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
    if (month === 12 && date === 25) return 'Christmas Day';
    const christmas = Date.UTC(month === 12 && date > 25 ? year + 1 : year, 11, 25);
    const remaining = Math.round((christmas - Date.UTC(year, month - 1, date)) / 86400000);
    return `${remaining} ${remaining === 1 ? 'day' : 'days'} to Christmas`;
  }

  function sourceLink(value: string): string {
    try {
      const source = new URL(value);
      return source.protocol === 'https:' && !source.username && !source.password ? source.href : '';
    } catch {
      return '';
    }
  }

  function number(day: number): string {
    return String(day).padStart(2, '0');
  }

  function countdownText(milliseconds: number): string {
    const minutes = Math.max(0, Math.ceil(milliseconds / 60000));
    const hours = Math.floor(minutes / 60);
    return `${Math.floor(hours / 24)}d ${hours % 24}h ${minutes % 60}m`;
  }

  async function animateDoor(day: number, denied = false, note = ''): Promise<number | null> {
    const run = ++revealRun;
    revealDay = day;
    revealDenied = denied;
    revealNote = note;
    lockedNotice = '';
    await tick();
    if (run !== revealRun || !doorDialog?.isConnected || !doorOverlay) return null;
    const completed = await doorOverlay.play();
    return completed && run === revealRun && doorDialog?.isConnected ? run : null;
  }

  async function reveal(entry: PublicIncident) {
    const day = entry.day ?? 0;
    const run = await animateDoor(day, false, `December ${day}`);
    if (run === null || run !== revealRun) return;
    opened = entry;
    await tick();
    if (run === revealRun && doorDialog?.isConnected && !doorDialog.open) doorDialog.showModal();
  }

  async function revealLocked(day: number, date: string) {
    const run = await animateDoor(day, true, `Sealed until ${formatDate(date)}`);
    if (run !== null && run === revealRun) lockedNotice = `Access denied. This door unlocks ${formatDate(date)} at midnight ${timezone}.`;
  }

  async function get<T>(pathname: string, signal: AbortSignal): Promise<T> {
    const response = await fetch(pathname, { signal });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error ?? result.message ?? 'Could not load the latest stories.');
    }
    return response.json();
  }

  onMount(() => {
    const controller = new AbortController();
    async function load() {
      // Other pages still need the edition's date for the masthead strip and the preview banner.
      if (view !== 'home' && view !== 'calendar') {
        if (demo) edition = demoEdition(defaultYear);
        else get<Edition>('/api/edition', controller.signal).then((value) => { edition = value; }, () => {});
      }
      try {
        if (view === 'home' || view === 'calendar') {
          if (demo) {
            const year = Number(requestedYear ?? defaultYear);
            if (![2026, 2025].includes(year)) throw new Error('Edition not found');
            edition = demoEdition(year);
          } else {
            const query = requestedYear === null ? '' : `?${new URLSearchParams({ year: requestedYear })}`;
            edition = await get<Edition>(`/api/edition${query}`, controller.signal);
          }
        } else if (view === 'feed') {
          const query = new URLSearchParams({ q: filters.query, category: filters.category, page: String(filters.page) });
          if (demo) {
            const matches = demoFeed.filter((item) => (!filters.category || item.category === filters.category)
              && `${item.title} ${item.summary}`.toLowerCase().includes(filters.query.toLowerCase()));
            feed = {
              items: matches.slice((filters.page - 1) * pageSize, filters.page * pageSize),
              page: filters.page,
              hasMore: filters.page * pageSize < matches.length
            };
          } else {
            feed = await get<FeedPage<PublicIncident>>(`/api/incidents?${query}`, controller.signal);
          }
        } else if (view === 'detail' && detail) {
          if (demo) {
            incident = demoFeed.find((item) => item.id === Number(detail[1])) ?? null;
            if (!incident) throw new Error('Incident not found');
          } else {
            incident = await get<PublicIncident>(`/api/incidents/${detail[1]}`, controller.signal);
          }
        }
      } catch (failure) {
        if (!controller.signal.aborted) error = (failure as Error).message;
      } finally {
        if (!controller.signal.aborted) loading = false;
      }
    }
    load();
    // Reload when the edition's day rolls over so a newly opened door appears.
    const timer = demo ? undefined : setInterval(() => {
      const previous = zonedDay(new Date(clock), timezone);
      realNow = Date.now();
      if (edition && previous !== zonedDay(new Date(clock), timezone)) load();
    }, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  });
</script>

<svelte:head>
  <title>{incident ? `${incident.title} | ${brand}` : view === 'feed' ? `Feed | ${brand}` : `${brand} | The Cyber Incident Christmas Calendar`}</title>
</svelte:head>

{#snippet badges(item: PublicIncident)}
  <div class="badges">
    <span class="badge" data-category={item.category}>{categories[item.category]}</span>
    {#if item.historical}<span class="badge" data-category="historical">Historical</span>{/if}
    {#if item.cvss != null}
      {@const rating = severity(item.cvss)}
      <span class="ticket" data-severity={rating}><b><span class="sr-only">CVSS </span>{item.cvss.toFixed(1)}</b><span>{severityLabels[rating]}</span></span>
    {/if}
  </div>
{/snippet}

{#snippet postmark(top: string, bottom: string)}
  <svg class="postmark" viewBox="0 0 132 64" aria-hidden="true">
    <circle cx="32" cy="32" r="29" />
    <circle cx="32" cy="32" r="22" />
    <text x="32" y="31">{top}</text>
    <text x="32" y="42" class="pm-small">{bottom}</text>
    <path d="M66 17q7-6 14 0t14 0t14 0t14 0M66 27q7-6 14 0t14 0t14 0t14 0M66 37q7-6 14 0t14 0t14 0t14 0M66 47q7-6 14 0t14 0t14 0t14 0" />
  </svg>
{/snippet}

{#snippet story(item: PublicIncident)}
  <article class="story">
    <p class="dateline"><time datetime={item.publishedAt}>{formatDate(item.publishedAt)}</time> &middot; Report No. {item.id}</p>
    <h3><a href={link(`/incidents/${item.id}`)}>{item.title}</a></h3>
    <p class="dek">{item.summary}</p>
    {@render badges(item)}
  </article>
{/snippet}

{#snippet calendar()}
  <section id="doors" class="section" aria-labelledby="calendar-title">
    <h2 id="calendar-title" class="sr-only">Calendar</h2>
    {#if edition && view === 'calendar'}
      <div class="section-heading">
        <form class="edition-form" method="GET" action="/calendar">
          {#if demo}<input type="hidden" name="demo" value="1" />{/if}
          <label for="year">Edition</label>
          <select id="year" name="year" value={edition.year}>
            {#each [...new Set([edition.year, ...edition.years])].sort((a, b) => b - a) as year (year)}
              <option value={year}>{year}</option>
            {/each}
          </select>
          <button type="submit">View</button>
        </form>
      </div>
    {/if}
    {#if edition}
      <div class="console">
        <EditionBoard {edition} {nextDoor} {countdown} {link} />
        <DeskLog {edition} {countdown} {nextDoor} {link} />
      </div>
    {/if}
    {#if edition}
      <p class="door-progress">{edition.calendar.length} of 24 seals broken{#if view === 'home' && edition.years.length > 1}{' · '}<a href={link('/calendar')}>Past editions</a>{/if}</p>
      <ol class="doors" aria-label="December calendar doors">
        {#each days as day (day)}
          {@const entry = entries.get(day)}
          {@const date = doorDate(edition.year, day)}
          {@const isToday = date === edition.today}
          <li style={`--door-i:${day}`} class:today={isToday}>
            {#if entry}
              <button type="button" class="door open" onclick={() => reveal(entry)} aria-haspopup="dialog"
                aria-current={isToday ? 'date' : undefined} aria-label={`Open December ${day}: ${entry.title}`}>
                <span class="stamp"><span class="stamp-frame">
                  <span class="stamp-micro">{brand} &middot; {edition.year}</span>
                  <strong class="stamp-number">{number(day)}</strong>
                  <span class="stamp-label">{isToday ? 'Open today' : categories[entry.category]}</span>
                </span></span>
                {#if isToday}<Seal {day} />{:else}<span class="void-residue" aria-hidden="true">VOID VOID<br />VOID VOID</span>{@render postmark(`${number(day)} DEC`, String(edition.year))}{/if}
              </button>
            {:else if date > edition.today}
              <button type="button" class="door locked" onclick={() => revealLocked(day, date)} aria-label={`December ${day}: sealed until ${formatDate(date)}`}>
                <span class="stamp"><span class="stamp-frame">
                  <span class="stamp-micro">{brand} &middot; {edition.year}</span>
                  <strong class="stamp-number">{number(day)}</strong>
                  <span class="stamp-label">Opens {day} Dec</span>
                </span></span>
              </button>
            {:else}
              <div class="door blank" aria-current={isToday ? 'date' : undefined}>
                <span class="stamp"><span class="stamp-frame">
                  <span class="stamp-micro">{brand} &middot; {edition.year}</span>
                  <strong class="stamp-number"><span class="sr-only">December </span>{number(day)}</strong>
                  <span class="stamp-label">No story</span>
                </span></span>
              </div>
            {/if}
          </li>
        {/each}
      </ol>
      <p class="locked-notice" role="status">{lockedNotice}</p>
    {/if}
  </section>
{/snippet}

<a class="skip" href="#content">Skip to content</a>
{#snippet holidayStamp()}
  <span class="stamp"><span class="stamp-frame">
    <span class="stamp-micro">Christmas seal &middot; 24 doors</span>
    <svg viewBox="0 0 120 84">
      <path class="holly-leaf" d="M60 50C52 36 38 28 12 30c5 5 4 10-3 13 7 3 8 8 4 13 9 0 13 3 14 9 6-4 13-4 17 1 2-8 8-13 16-16z" />
      <path class="holly-leaf" d="M60 50c8-14 22-22 48-20-5 5-4 10 3 13-7 3-8 8-4 13-9 0-13 3-14 9-6-4-13-4-17 1-2-8-8-13-16-16z" />
      <path class="holly-vein" d="M58 49Q38 36 16 32M62 49q20-13 42-17" />
      <circle class="berry" cx="54" cy="56" r="7" /><circle class="berry" cx="66" cy="55" r="7" /><circle class="berry" cx="60" cy="66" r="7" />
    </svg>
    <strong class="stamp-number">{today.slice(0, 4)}</strong>
    <span class="stamp-label">{brand}</span>
  </span></span>
{/snippet}

<!-- Home gets the full title and stamp; other pages a one-line title that links home. -->
<header class="masthead" class:compact={view !== 'home'}>
  <div class="wrap">
    <p class="masthead-strip">
      <span>Vol. {today.slice(0, 4)}</span>
      <span>{almanacLine(today)}</span>
      <span>Doors open at midnight, {timezone}</span>
      <ThemeToggle />
    </p>
    <div class="masthead-title">
      <div class="masthead-copy">
        <svelte:element this={view === 'home' ? 'h1' : 'p'} class="site-title"><a href={link('/')}>The Cyber Incident <em>Christmas Calendar</em></a></svelte:element>
        {#if view === 'home'}<p class="lede">Bringing the Christmas spirit to sysadmins and maintainers everywhere, one incident at a time.</p>{/if}
      </div>
      {#if view === 'home'}
        <figure class="masthead-stamp" aria-hidden="true">{@render holidayStamp()}<Seal day={25} /></figure>
      {/if}
    </div>
    <nav aria-label="Main navigation">
      <a href={link('/')} aria-current={view === 'home' || view === 'calendar' ? 'page' : undefined}>Home</a>
      <a href={link('/incidents')} aria-current={view === 'feed' || view === 'detail' ? 'page' : undefined}>Feed</a>
      <a href={link('/sources')} aria-current={view === 'sources' ? 'page' : undefined}>Sources</a>
      <a href="/submit" aria-current={view === 'submit' ? 'page' : undefined}>Send a tip</a>
    </nav>
  </div>
</header>

{#if demo}
  <div class="preview"><div class="wrap"><strong>Demo edition</strong> <span>All stories are fictional. The calendar is set to December 3, 2026.</span></div></div>
{:else if edition?.timeTravel}
  <div class="preview"><div class="wrap"><strong>Preview site</strong> <TimeMachine today={edition.today} {shiftDays} /></div></div>
{:else if shiftDays}
  <div class="preview"><div class="wrap"><strong>Preview site</strong> <span>Real collected incidents, but the calendar runs {shiftDays} {shiftDays === 1 ? 'day' : 'days'} ahead, so today is {formatDate(today)}. Nothing here is the published edition.</span></div></div>
{/if}

<main id="content" class="wrap" data-view={view}>
  {#if view === 'calendar'}
    <div class="page-heading"><p class="eyebrow">The Christmas countdown</p><h1>Calendar &amp; archive</h1></div>
  {:else if view === 'submit'}
    <div class="page-heading"><p class="eyebrow">From the community</p><h1>Send an incident tip</h1><p>Spotted something worth putting behind a door? Share a published CVE or a direct link from a trusted source, or <a href="#review">browse the review queue</a>.</p></div>
    <CommunityTips />
  {:else if view === 'sources'}
    <div class="page-heading"><p class="eyebrow">Follow the paper trail</p><h1>Sources and reading</h1><p>Newsrooms, vulnerability databases, vendor blogs, and status pages to check before you send a tip.</p></div>
    {#each sourceGroups as group (group.name)}
      <section class="section">
        <div class="section-heading"><h2>{group.name}</h2></div>
        <div class="story-grid">
          {#each group.links as [name, url, description] (url)}
            <article class="story"><h3><a href={url}>{name} <span aria-hidden="true">&nearr;</span></a></h3><p class="dek">{description}</p></article>
          {/each}
        </div>
      </section>
    {/each}
  {:else if view === 'feed'}
    <div class="page-heading"><p class="eyebrow">The year-round feed</p><h1>Incident feed</h1><p>Published reports on cyberattacks, outages, vulnerabilities, breaches, and research.</p></div>
    <form class="filter-form" method="GET" action="/incidents">
      {#if demo}<input type="hidden" name="demo" value="1" />{/if}
      <label>Search stories <input type="search" name="q" value={filters.query} maxlength="100" placeholder="Search title or summary" /></label>
      <label>Category <select name="category" value={filters.category}>
        <option value="">All categories</option>
        {#each Object.entries(categories) as [key, label] (key)}<option value={key}>{label}</option>{/each}
      </select></label>
      <button class="primary" type="submit">Filter stories</button>
      {#if filters.query || filters.category}<a href={link('/incidents')}>Clear</a>{/if}
    </form>
  {/if}

  {#if loading}<p class="notice" role="status">Loading reports&hellip;</p>{/if}
  {#if error}<p class="notice" role="alert">{error}. <a href={link('/')}>Back to home</a></p>{/if}
  {#if view === 'missing'}<section class="page-heading"><p class="eyebrow">Return to sender</p><h1>Page not found</h1><a href={link('/')}>Back to home</a></section>{/if}

  {#if view === 'home' && edition}
    {@render calendar()}
  {:else if view === 'calendar' && edition}
    {@render calendar()}
  {:else if view === 'feed' && feed}
    {#if feed.items.length}
      <div class="story-grid" class:lead={feed.page === 1}>{#each feed.items as item (item.id)}{@render story(item)}{/each}</div>
    {:else}
      <p class="notice">No published stories match this view.</p>
    {/if}
    {#if feed.page > 1 || feed.hasMore}
      <nav class="pagination" aria-label="Feed pages">
        {#if feed.page > 1}<a class="button" href={feedLink(feed.page - 1)}>Previous</a>{/if}
        <span>Page {feed.page}</span>
        {#if feed.hasMore}<a class="button" href={feedLink(feed.page + 1)}>Next</a>{/if}
      </nav>
    {/if}
  {:else if view === 'detail' && incident}
    {@const [stampTop, stampBottom] = stampDate(incident.publishedAt)}
    <article class="report">
      <a class="back" href={link('/incidents')}>&larr; Back to the feed</a>
      {@render badges(incident)}
      <h1>{incident.title}</h1>
      {@render postmark(stampTop, stampBottom)}
      <p class="meta">Report No. {incident.id} &middot; Published <time datetime={incident.publishedAt}>{formatDate(incident.publishedAt)}</time>{#if incident.occurredAt} &middot; Incident date <time datetime={incident.occurredAt}>{formatDate(incident.occurredAt)}</time>{/if}</p>
      <div class="report-panel">
        <h2>What happened</h2><p>{incident.summary}</p>
        <h2>Defensive takeaway</h2><p>{incident.takeaway}</p>
        {#if sourceLink(incident.sourceUrl)}<a href={sourceLink(incident.sourceUrl)} rel="noreferrer">Read the original source &nearr;</a>{/if}
      </div>
    </article>
  {/if}
</main>

<dialog class="door-dialog" bind:this={doorDialog} aria-labelledby="door-story-title" onclose={() => { doorOverlay?.stop(); opened = null; }}>
  {#if opened}
    <div class="door-reveal">
      <div class="section-heading">
        <p class="eyebrow">December {opened.day} &middot; Seal broken</p>
        <form method="dialog"><button aria-label="Close door preview">Close <span aria-hidden="true">&times;</span></button></form>
      </div>
      {@render postmark(`${number(opened.day ?? 0)} DEC`, edition ? String(edition.year) : '')}
      {@render badges(opened)}
      <h2 id="door-story-title">{opened.title}</h2>
      <p>{opened.summary}</p>
      <a class="button primary" href={link(`/incidents/${opened.id}`)}>Read the report</a>
    </div>
  {/if}
</dialog>
<DoorOverlay day={revealDay} denied={revealDenied} note={revealNote} bind:this={doorOverlay} />

<footer><div class="wrap footer-inner"><strong>{brand}</strong><span>Independent cybersecurity reporting &middot; All calendar dates {timezone} &middot; <a href="https://github.com/OptoCloud/CyberXmas" rel="noopener">Source on GitHub</a></span></div></footer>
