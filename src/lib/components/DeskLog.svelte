<script lang="ts">
  // A terminal-style log beside the calendar: seals broken and reports published, newest first,
  // built from the published edition, ending with the countdown to the next seal.
  import { doorOpensAt } from '#lib/domain/edition.ts';
  import { categories, type Edition } from '#lib/domain/incidents.ts';

  const { edition, countdown, nextDoor, link }: {
    edition: Edition;
    countdown: string;
    nextDoor: { date: string } | null;
    link: (pathname: string) => string;
  } = $props();

  const limit = 8;
  const stamp = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });

  interface Line { at: string; kind: string; text: string; href: string }

  let lines = $derived.by(() => {
    const doors: Line[] = edition.calendar.map((entry) => ({
      at: doorOpensAt(edition.year, entry.day!, edition.timezone).toISOString(),
      kind: `door ${String(entry.day).padStart(2, '0')}`, text: 'seal broken', href: link(`/incidents/${entry.id}`)
    }));
    const doorIds = new Set(edition.calendar.map((entry) => entry.id));
    const reports: Line[] = edition.feed.filter((item) => !doorIds.has(item.id)).map((item) => ({
      at: item.publishedAt, kind: categories[item.category].toLowerCase(), text: item.title, href: link(`/incidents/${item.id}`)
    }));
    return [...doors, ...reports].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  });
</script>

<aside class="desk-log" aria-label="Recent activity">
  <p class="desk-log-title"><span>$ tail -f desk.log</span><span class="desk-log-live">live</span></p>
  <ol>
    {#each lines as line (line.kind + line.at + line.text)}
      <li><time datetime={line.at}>{stamp.format(new Date(line.at))}</time><a href={line.href}><b>{line.kind}</b> {line.text}</a></li>
    {:else}
      <li><time>--</time><span>no activity yet</span></li>
    {/each}
    <li class="desk-log-next"><time>next</time><span>{nextDoor ? `seal ${nextDoor.date.slice(8)} in ${countdown || stamp.format(new Date(nextDoor.date))}` : 'every seal is broken'}</span></li>
  </ol>
</aside>
