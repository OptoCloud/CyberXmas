<script lang="ts">
  // Today's seal. Both forms are rendered and the theme's stylesheet shows one: a holographic
  // tamper-evident sticker on the print theme, a smartcard chip on the CRT theme.
  // `stage` is the large version used by the unlock overlay, with circuit traces and a VOID underlay.
  const { day, stage = false }: { day: number; stage?: boolean } = $props();
  let label = $derived(day === 25 ? '✦' : String(day).padStart(2, '0'));
</script>

<span class="seal" class:seal-stage-size={stage} aria-hidden="true">
  <span class="seal-print">
    {#if stage}<span class="seal-void">{#each [1, 2, 3, 4, 5] as row (row)}<i>VOID VOID VOID</i>{/each}</span>{/if}
    <span class="seal-holo"><b>Sealed</b><span>{day === 25 ? label : `#${label}`}</span><small>Tamper evident</small></span>
  </span>
  <span class="seal-crt">
    <svg class="seal-chip" viewBox="0 0 60 48" overflow="visible">
      {#if stage}
        <path class="chip-trace" d="M-2 16h-28l-8-8h-30M-2 32h-22l-10 10h-36M62 16h26l8-8h32M62 32h20l12 12h34M30-2v-24l8-8" />
      {/if}
      <rect class="chip-body" x="1" y="1" width="58" height="46" rx="8" />
      <path class="chip-shine" d="M9 1h22L1 31V9a8 8 0 0 1 8-8z" />
      <path class="chip-lines" d="M1 16h18M1 32h18M41 16h18M41 32h18M19 1v14M19 33v14M41 1v14M41 33v14" />
      <rect class="chip-lines" x="19" y="15" width="22" height="18" rx="3" />
    </svg>
    <span class="chip-label">AUTH {label}</span>
  </span>
</span>
