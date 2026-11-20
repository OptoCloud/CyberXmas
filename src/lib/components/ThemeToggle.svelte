<script lang="ts">
  import { onMount } from 'svelte';
  import { applyThemeMode, storedThemeMode, themeModes, type ThemeMode } from '#lib/ui/theme.ts';

  let mode = $state<ThemeMode>('auto');

  function choose(next: ThemeMode) {
    mode = next;
    applyThemeMode(next);
  }

  onMount(() => {
    mode = storedThemeMode();
    // AUTO follows dark mode and the clock, so re-check when either changes.
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const recheck = () => { if (mode === 'auto') applyThemeMode('auto', false); };
    dark.addEventListener('change', recheck);
    const timer = setInterval(recheck, 60000);
    return () => { dark.removeEventListener('change', recheck); clearInterval(timer); };
  });
</script>

<span class="theme-toggle" role="radiogroup" aria-label="Theme">
  {#each themeModes as option (option)}
    <button type="button" role="radio" aria-checked={mode === option} onclick={() => choose(option)}>{option}</button>
  {/each}
</span>
