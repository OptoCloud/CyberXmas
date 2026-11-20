<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import Seal from './Seal.svelte';
  import { doorSource } from '#lib/content/door-source.ts';

  // The unlock sequence: source code scrolls, warnings pop up around the door's seal, then the seal
  // breaks (or holds, for a locked door) and the verdict glitches in. A click or any key skips it.
  // Skipped entirely for reduced-motion preferences.
  interface Burst { x: string; y: string; delay: number; life: number; shift: number; tone: number; text: string; loading: boolean }

  const { day, denied = false, note = '' }: { day: number | null; denied?: boolean; note?: string } = $props();
  const duration = 3400;
  const profiles = [
    { name: 'Archive scan', warnings: ['SEALED RECORD', 'INDEX MISMATCH', 'SIGNAL RECOVERED'], checks: ['Mounting the archive', 'Verifying the index'] },
    { name: 'Change freeze', warnings: ['CHANGE FREEZE', 'CLOCK DRIFT', 'PATCH WINDOW CLOSED'], checks: ['Checking the release clock', 'Scanning the changelog'] },
    { name: 'Signal trace', warnings: ['DROPPED SIGNAL', 'BUFFER WARNING', 'TRACE ATTACHED'], checks: ['Rebuilding the trace', 'Syncing the capture'] },
    { name: 'Incident replay', warnings: ['REPLAY ONLY', 'STALE SNAPSHOT', 'TAMPER SEAL FOUND'], checks: ['Loading the timeline', 'Bypassing the seal'] }
  ];
  let profile = $derived(profiles[((day ?? 1) - 1) % profiles.length]!);
  let verdict = $derived(denied ? 'ACCESS DENIED' : 'ACCESS GRANTED');
  let caption = $derived(denied ? `${note.toUpperCase()} // SEAL HOLDS` : `${note.toUpperCase()} // ${profile.name.toUpperCase()}`);
  let source = $derived(doorSource(day ?? 0) || doorSource(((day ?? 1) - 1) % 24 + 1));

  let overlay: HTMLDivElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finish: ((completed: boolean) => void) | undefined;
  let release: (() => void) | undefined;
  let generation = 0;
  let bursts = $state<Burst[]>([]);

  const random = (min: number, max: number): number => min + Math.random() * (max - min);

  /** Three waves of pop-ups, spread over a grid so they never stack on the seal in the middle. */
  function scatter(): Burst[] {
    const compact = innerWidth < 600;
    const columns = compact ? 2 : 3;
    const rows = 3;
    return Array.from({ length: 3 }, (_, wave) => {
      const slots = Array.from({ length: columns * rows }, (_, index) => index).filter((slot) => slot !== (compact ? -1 : 4));
      return Array.from({ length: compact ? 4 : 5 }, (_, index) => {
        const [slot = 0] = slots.splice(Math.floor(random(0, slots.length)), 1);
        const loading = index === 1 || index === 3;
        return {
          x: ((slot % columns + random(.24, .76)) / columns * 100).toFixed(2),
          y: ((Math.floor(slot / columns) + random(.32, .68)) / rows * 100).toFixed(2),
          delay: Math.round(wave * 620 + random(0, 245)),
          life: Math.round(random(480, 880)),
          shift: Math.round(random(-14, 14)),
          tone: loading ? 1 : Math.floor(random(0, 3)),
          text: loading ? (denied && wave === 2 ? 'Checking unlock time' : profile.checks[(wave + index) % profile.checks.length]!)
            : (denied && wave > 0 ? 'EMBARGO ACTIVE' : profile.warnings[(wave + index) % profile.warnings.length]!),
          loading
        };
      });
    }).flat();
  }

  /** Skip on any click or key press, and swallow that click so it does not open another door. */
  function listenForSkip() {
    const swallow = (event: Event) => { event.preventDefault(); event.stopPropagation(); };
    const skip = (event: Event) => {
      if (event instanceof KeyboardEvent && ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(event.key)) return;
      event.preventDefault();
      if (event.type === 'pointerdown') {
        addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => removeEventListener('click', swallow, { capture: true }), 600);
      }
      stop(true);
    };
    addEventListener('pointerdown', skip, { capture: true });
    addEventListener('keydown', skip, { capture: true });
    release = () => {
      removeEventListener('pointerdown', skip, { capture: true });
      removeEventListener('keydown', skip, { capture: true });
    };
  }

  export function stop(completed = false) {
    generation++;
    clearTimeout(timer);
    release?.();
    release = undefined;
    if (overlay?.matches(':popover-open')) overlay.hidePopover();
    bursts = [];
    finish?.(completed);
    finish = undefined;
  }

  export async function play(): Promise<boolean> {
    stop();
    if (!overlay?.showPopover || matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    const run = generation;
    bursts = scatter();
    await tick();
    if (run !== generation || !overlay?.isConnected) return false;
    overlay.showPopover();
    listenForSkip();
    return new Promise<boolean>((resolve) => {
      finish = resolve;
      timer = setTimeout(() => stop(true), duration);
    });
  }

  onDestroy(() => stop());
</script>

<div class="hack-overlay" class:denied popover="manual" inert aria-hidden="true"
  style={`--reveal-duration:${duration}ms`} bind:this={overlay}>
  <div class="hack-static"></div>
  {#if bursts.length}
    <div class="hack-code"><pre>{source.repeat(12)}</pre></div>
  {/if}
  {#each bursts as burst, index (index)}
    <div class="hack-burst" class:loading={burst.loading} data-tone={burst.tone}
      style={`--x:${burst.x}%;--y:${burst.y}%;--delay:${burst.delay}ms;--life:${burst.life}ms;--shift:${burst.shift}px`}>
      {#if burst.loading}
        <span>{burst.text}&hellip;</span><span class="hack-progress"><i></i></span>
      {:else}
        <b>&#9888;</b> {burst.text}
      {/if}
    </div>
  {/each}
  {#if day !== null}<div class="hack-seal"><Seal {day} stage /></div>{/if}
  <div class="hack-verdict">
    <strong data-text={verdict}>{verdict}</strong>
    <span>{caption}</span>
  </div>
  <p class="hack-skip">Tap, click or press any key to skip</p>
</div>
