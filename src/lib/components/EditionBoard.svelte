<script lang="ts">
  // Status tiles above the calendar: today's door, a threat level from recent reports, the next
  // seal and progress through the edition. Everything is derived from the published edition.
  import { doorCount } from '#lib/domain/edition.ts';
  import { categories, type Edition } from '#lib/domain/incidents.ts';

  const { edition, nextDoor, countdown, link }: {
    edition: Edition;
    nextDoor: { date: string } | null;
    countdown: string;
    link: (pathname: string) => string;
  } = $props();

  const levels = ['Low', 'Guarded', 'Elevated', 'High', 'Severe'] as const;
  const dayFormat = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  let todayNumber = $derived(edition.today.slice(5, 7) === '12' ? Number(edition.today.slice(8)) : 0);
  let live = $derived(edition.calendar.find((entry) => entry.day === todayNumber) ?? null);
  let latest = $derived(live ?? edition.calendar.at(-1) ?? null);

  /** Severity of the worst report published in the week up to today: CVSS when there is one. */
  let threat = $derived.by(() => {
    const since = new Date(Date.parse(edition.today) - 7 * 86400000).toISOString().slice(0, 10);
    const recent = [...edition.calendar, ...edition.feed].filter((item) => item.publishedAt.slice(0, 10) >= since && item.publishedAt.slice(0, 10) <= edition.today);
    const worst = Math.max(-1, ...recent.map((item) => item.cvss ?? (item.category === 'attack' || item.category === 'breach' ? 7 : 3)));
    const level = worst < 0 ? 0 : worst < 4 ? 1 : worst < 7 ? 2 : worst < 9 ? 3 : 4;
    return { level, label: levels[level]!, reports: new Set(recent.map((item) => item.id)).size };
  });
</script>

<div class="board" aria-label="Edition status">
  <a class="tile live" href={latest ? link(`/incidents/${latest.id}`) : undefined} aria-disabled={!latest}>
    <span class="tile-key">{live ? `Door ${String(live.day).padStart(2, '0')} · live now` : latest ? `Door ${String(latest.day).padStart(2, '0')} · latest seal` : 'No seals broken yet'}</span>
    <strong class="tile-value">{latest?.title ?? 'The first door opens 1 December'}</strong>
    {#if latest}<span class="tile-note">{categories[latest.category]} &middot; opened at midnight {edition.timezone}</span>{/if}
  </a>
  <div class="tile">
    <span class="tile-key">Threat level</span>
    <strong class="tile-value">{threat.label}</strong>
    <span class="threat-bar" data-level={threat.level} aria-hidden="true">{#each levels as level, index (level)}<i class:on={index <= threat.level}></i>{/each}</span>
    <span class="tile-note">{threat.reports ? `Worst of ${threat.reports} ${threat.reports === 1 ? 'report' : 'reports'} this week` : 'No reports this week'}</span>
  </div>
  <div class="tile">
    <span class="tile-key">Next seal</span>
    <strong class="tile-value mono">{nextDoor ? countdown || dayFormat.format(new Date(nextDoor.date)) : 'Done'}</strong>
    <span class="tile-note">{nextDoor ? `Door ${nextDoor.date.slice(8)} · ${dayFormat.format(new Date(nextDoor.date))}` : `All ${doorCount} doors are open`}</span>
  </div>
  <div class="tile">
    <span class="tile-key">Seals broken</span>
    <strong class="tile-value">{edition.calendar.length} / {doorCount}</strong>
    <span class="meter" aria-hidden="true"><i style={`width:${edition.calendar.length / doorCount * 100}%`}></i></span>
  </div>
</div>
