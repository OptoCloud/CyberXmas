// IANA time zone arithmetic using Intl (full ICU in Workers, browsers and Node.js).

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    formatters.set(timeZone, format);
  }
  return format;
}

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try { formatter(value); return true; } catch { return false; }
}

interface WallClock { year: number; month: number; day: number; hour: number; minute: number; second: number }

function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(instant)
    .filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, Number(value)]));
  return parts as unknown as WallClock;
}

/** The calendar date (YYYY-MM-DD) of `instant` in `timeZone`. */
export function zonedDay(instant: Date, timeZone: string): string {
  const { year, month, day } = wallClock(instant, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Milliseconds `timeZone` is ahead of UTC at `instant`. */
function offset(instant: number, timeZone: string): number {
  const { year, month, day, hour, minute, second } = wallClock(new Date(instant), timeZone);
  return Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(instant / 1000) * 1000;
}

/** The first instant of calendar date `day` (YYYY-MM-DD) in `timeZone`. */
export function zonedMidnight(day: string, timeZone: string): Date {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const local = Date.UTC(year, month - 1, date);
  // Two passes settle the offset across DST transitions near midnight.
  let guess = local - offset(local, timeZone);
  guess = local - offset(guess, timeZone);
  // If midnight was skipped by a DST jump, the day starts at the first valid instant after it.
  return new Date(zonedDay(new Date(guess), timeZone) < day ? guess + 3600000 : guess);
}
