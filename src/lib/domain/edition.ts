// Calendar rules shared by the API and the UI. A door's date is a plain YYYY-12-DD day;
// it opens at local midnight in the edition time zone.
import { zonedDay, zonedMidnight } from '#lib/util/time.ts';

export const doorCount = 24;
/** Preview time travel: the cookie that holds a visitor's chosen edition date. */
export const editionDateCookie = 'cyberxmas-date';
export const days: readonly number[] = Array.from({ length: doorCount }, (_, index) => index + 1);

export const isDoorDay = (day: unknown): day is number => Number.isInteger(day) && (day as number) >= 1 && (day as number) <= doorCount;

export const doorDate = (year: number, day: number): string => `${year}-12-${String(day).padStart(2, '0')}`;

/** The instant a door opens. */
export const doorOpensAt = (year: number, day: number, timeZone: string): Date => zonedMidnight(doorDate(year, day), timeZone);

export interface EditionClock {
  /** The current instant, ISO 8601 UTC. */
  timestamp: string;
  /** Today's date in the edition time zone. */
  today: string;
  /** The current edition year in the edition time zone. */
  year: number;
}

export function editionClock(now: Date, timeZone: string): EditionClock {
  const today = zonedDay(now, timeZone);
  return { timestamp: now.toISOString(), today, year: Number(today.slice(0, 4)) };
}
