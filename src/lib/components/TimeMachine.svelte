<script lang="ts">
  import { untrack } from 'svelte';
  import { editionDateCookie } from '#lib/domain/edition.ts';

  // Preview only: pick the date the whole site behaves as of. The server reads the cookie and
  // enforces doors, embargo and scheduling for that day, so this tests the real behaviour.
  const { today, shiftDays }: { today: string; shiftDays: number } = $props();

  // The page reloads on every jump, so the starting date is all the picker needs.
  let chosen = $state(untrack(() => today));
  let year = $derived(today.slice(0, 4));
  let jumps = $derived([
    { label: '30 Nov', date: `${year}-11-30` },
    { label: '1 Dec', date: `${year}-12-01` },
    { label: '12 Dec', date: `${year}-12-12` },
    { label: '24 Dec', date: `${year}-12-24` },
    { label: '26 Dec', date: `${year}-12-26` }
  ]);

  function travel(date: string | null) {
    document.cookie = date
      ? `${editionDateCookie}=${date}; Path=/; Max-Age=2592000; SameSite=Lax`
      : `${editionDateCookie}=; Path=/; Max-Age=0; SameSite=Lax`;
    location.reload();
  }
</script>

<form class="time-machine" onsubmit={(event) => { event.preventDefault(); travel(chosen); }}>
  <span>Time machine: the site is behaving as of <b>{today}</b>{shiftDays ? ` (${shiftDays > 0 ? '+' : ''}${shiftDays} days)` : ''}.</span>
  <span class="time-machine-controls">
    <input type="date" aria-label="Edition date" bind:value={chosen} required />
    <button type="submit">Go</button>
    {#each jumps as jump (jump.date)}
      <button type="button" class:current={jump.date === today} onclick={() => travel(jump.date)}>{jump.label}</button>
    {/each}
    <button type="button" onclick={() => travel(null)}>Reset</button>
  </span>
</form>
