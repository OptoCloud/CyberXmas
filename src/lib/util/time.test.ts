/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTimeZone, zonedDay, zonedMidnight } from './time.ts';

test('zonedMidnight finds the first instant of a local day', () => {
  const midnight = (day: string, zone: string) => zonedMidnight(day, zone).toISOString();
  assert.equal(midnight('2026-12-02', 'UTC'), '2026-12-02T00:00:00.000Z');
  assert.equal(midnight('2026-12-02', 'Europe/Oslo'), '2026-12-01T23:00:00.000Z');
  assert.equal(midnight('2026-12-02', 'America/New_York'), '2026-12-02T05:00:00.000Z');
  assert.equal(midnight('2026-12-02', 'Pacific/Kiritimati'), '2026-12-01T10:00:00.000Z');
  assert.equal(midnight('2026-12-02', 'Asia/Kolkata'), '2026-12-01T18:30:00.000Z');
  // Cuba springs forward at midnight, so 8 March 2026 starts at 01:00 local (UTC-4).
  assert.equal(midnight('2026-03-08', 'America/Havana'), '2026-03-08T05:00:00.000Z');
});

test('zonedDay reads the local calendar date', () => {
  assert.equal(zonedDay(new Date('2026-12-01T23:30:00Z'), 'Europe/Oslo'), '2026-12-02');
  assert.equal(zonedDay(new Date('2026-12-01T23:30:00Z'), 'UTC'), '2026-12-01');
  assert.equal(isTimeZone('Europe/Oslo'), true);
  assert.equal(isTimeZone('Not/AZone'), false);
});
