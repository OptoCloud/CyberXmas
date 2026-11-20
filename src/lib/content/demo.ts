// Fictional stories for ?demo=1 and `pnpm dev`. Never shown as live intelligence.
import type { Edition, PublicIncident } from '#lib/domain/incidents.ts';

const sample: PublicIncident[] = ([
  {
    id: 1, day: 1, category: 'breach', title: 'The forgotten data export',
    summary: 'A fictional team discovers a customer data export that outlived the project that created it.',
    takeaway: 'Give exports an owner and an expiration date. Review access after a project closes.',
    publishedAt: '2026-12-01'
  },
  {
    id: 2, day: 2, category: 'vulnerability', title: 'The update that could not wait',
    summary: 'In this fictional advisory, a vendor releases an urgent fix for an internet-facing service.',
    takeaway: 'Identify exposed installations, apply the vendor update, and verify versions afterward.',
    publishedAt: '2026-12-02', cvss: 9.1
  },
  {
    id: 3, day: 3, category: 'outage', title: 'When the fallback failed',
    summary: 'A fictional cloud outage shows how a shared dependency can take out both a primary service and its backup.',
    takeaway: 'Map shared dependencies and test failover without relying on the primary control plane.',
    publishedAt: '2026-12-03'
  },
  {
    id: 4, category: 'research', title: 'Can your recovery team find the runbook?',
    summary: 'A fictional tabletop exercise explores what happens when the tools hosting recovery instructions are unavailable.',
    takeaway: 'Keep an offline copy of critical recovery steps and validate it in an exercise.',
    publishedAt: '2026-12-03'
  },
  {
    id: 5, day: 1, category: 'attack', title: 'The restore that had to start from scratch',
    summary: 'A fictional organization looks back on recovering services after a ransomware incident.',
    takeaway: 'Keep isolated backups and rehearse restoring critical systems in priority order.',
    historical: 1, occurredAt: '2021-08-16', publishedAt: '2025-12-01'
  }
] satisfies (Partial<PublicIncident> & Pick<PublicIncident, 'id' | 'category' | 'title' | 'summary' | 'takeaway' | 'publishedAt'>)[])
  .map((story) => ({ cvss: null, historical: 0, occurredAt: null, sourceUrl: '', ...story }));

export const demoFeed = [...sample].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id - a.id);

export function demoEdition(year: number): Edition {
  return {
    year,
    today: '2026-12-03',
    timezone: 'UTC',
    calendar: sample.filter((incident) => incident.day && incident.publishedAt.startsWith(String(year))),
    feed: demoFeed.slice(0, 4),
    years: [2026, 2025],
    shiftDays: 0,
    timeTravel: false
  };
}
