# Roadmap

What CyberXmas is for, the editorial rules it follows, and the phases it grows through. The
technical side of each phase is in [INFRASTRUCTURE.md](INFRASTRUCTURE.md). Numbers below are
starting proposals to calibrate, not commitments.

## Editorial principles

- **One featured incident per day,** with no cap on additional approved feed stories. The calendar
  is a showcase, not a limit on the reporting.
- **Coverage:** vulnerabilities and advisories, cyberattacks (including ransomware and supply
  chain), breaches, major cloud and infrastructure outages, defensive research and historical
  retrospectives. A major attack or outage can outrank a CVSS 10 advisory. Show CVSS only for
  actual vulnerabilities.
- **Defensive only.** Report impact, verification, patches and lessons. Never publish exploit
  payloads or reproduction steps.
- **Evidence first.** Primary sources (NVD, CISA KEV, GitHub advisories, vendor advisories and
  official status pages) establish facts. Established reporting provides leads and context.
  Social media and community tips are leads, never sufficient evidence for high-impact claims.
- **Verification is separate from publication:** verified, community-sourced, unconfirmed or
  disputed. Community attention never establishes verification, and likes never publish.
- **Quiet days:** fall back to a significant recent incident, then verified research, then a
  clearly labelled historical incident from around that date. Always show the original date and
  never fabricate an event.
- **Reveal rules:** one approved feature per date, no incident repeated across doors, doors open at
  midnight in the displayed edition time zone, and embargoes enforced on the server for every read.

## Ranking proposal

A 100-point model: real-world impact 30, severity or technical importance 25, confirmed occurrence
or documented exploitation 20, community interest 15, recency 10. Compare within a category using
category-specific signals (outage scope and duration, breach scale, patch urgency).

## Phases

1. **Public prototype** (done). Calendar, feed and report views, demo data, archives, local
   Cloudflare preview, embargo and date-boundary tests.
2. **Editorial pilot** (in progress). Editorial desk, source collection, scheduling, historical
   fallback and audit events are live. Next: evidence records, duplicate merging, scoring,
   automatic daily selection with editor approval, alerts for failing sources and empty doors.
3. **Community launch** (in progress). GitHub sign-in, rate-limited tips with Turnstile, and likes
   are live. Next: trusted reviewers, corrections, duplicate and inaccuracy flags, discussion.
4. **Expansion.** Statistics (CVE trends, affected vendors, outage trends), reputation and
   badges for accepted work rather than volume, share graphics, notifications and year-end
   awards. Never auto-publish unreviewed community submissions.
