/// <reference types="node" />
// End-to-end check of the editorial and public flows in a real browser, against a running Worker
// (`pnpm preview`, or `wrangler dev --local`). It writes reports to the database it runs against,
// so point it at local or preview data only.
//
// Usage: pnpm test:e2e [origin]   (default http://127.0.0.1:8787)
// Needs EDITOR_TOKEN in the environment or in .dev.vars, and Google Chrome (or CHROME_PATH).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';

const origin = process.argv[2] ?? 'http://127.0.0.1:8787';
const token = process.env.EDITOR_TOKEN
  ?? (existsSync('.dev.vars') ? /^EDITOR_TOKEN=(\S+)$/m.exec(readFileSync('.dev.vars', 'utf8'))?.[1] : undefined);
assert.ok(token, 'Set EDITOR_TOKEN or add it to .dev.vars');

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const problems: string[] = [];
page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
page.on('response', (response) => { if (response.status() >= 500) problems.push(`${response.status()} ${response.url()}`); });

const step = (name: string) => console.log(`ok - ${name}`);
const run = Date.now();

async function unlockDesk(target: Page) {
  await target.goto(`${origin}/editorial`);
  await target.getByLabel('Editor key').fill(token!);
  await target.getByRole('button', { name: 'Unlock desk' }).click();
  await target.getByText('Signed in as').waitFor();
}

async function draft(target: Page, title: string, category: string, extra: () => Promise<void> = async () => {}) {
  await target.getByLabel('Title').fill(title);
  await target.getByLabel('Category').selectOption(category);
  await target.getByLabel('Summary').fill('A fictional end-to-end test report.');
  await target.getByLabel('Defensive takeaway').fill('Keep a break-glass path that does not depend on the control plane.');
  await target.getByLabel('Original source URL').fill('https://www.cloudflarestatus.com/');
  await extra();
  await target.getByRole('button', { name: 'Save report' }).click();
  await target.getByText('Report saved.').waitFor();
}

try {
  const title = `E2E outage ${run}`;
  await unlockDesk(page);
  step('editorial desk unlocks with the editor key');
  await draft(page, title, 'outage', () => page.getByLabel('Incident date').fill('2026-11-18'));
  step('report saves');
  await page.getByRole('button', { name: 'Publish saved report' }).click();
  await page.getByText('Saved report published.').waitFor();
  step('report publishes');

  await page.goto(`${origin}/incidents`);
  await page.getByRole('link', { name: title }).click();
  await page.getByRole('heading', { level: 1, name: title }).waitFor();
  await page.getByText('Keep a break-glass path').waitFor();
  step('published report is in the feed and its report page renders');
  await page.goto(`${origin}/`);
  await page.getByRole('complementary', { name: 'Recent activity' }).getByRole('link', { name: title }).waitFor();
  step('home page lists it in the desk log');

  // Schedule a report to a free door next December: always in the future, so always embargoed.
  const queue = await (await page.request.get(`${origin}/api/editorial`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const year = Number((await (await page.request.get(`${origin}/api/edition`)).json()).today.slice(0, 4)) + 1;
  const taken = new Set((queue.reports as { year: number | null; day: number | null }[]).filter((row) => row.year === year).map((row) => row.day));
  const day = Array.from({ length: 24 }, (_, index) => index + 1).find((candidate) => !taken.has(candidate));
  assert.ok(day, `every December ${year} door is already scheduled in this database`);
  const doorTitle = `E2E door ${run}`;
  await unlockDesk(page);
  await draft(page, doorTitle, 'research');
  await page.getByLabel(/December door date/).fill(`${year}-12-${String(day).padStart(2, '0')}`);
  await page.getByRole('button', { name: 'Schedule saved report' }).click();
  await page.getByText('Saved report scheduled.').waitFor();
  step(`report schedules to door ${day} of ${year}`);

  const edition = await (await page.request.get(`${origin}/api/edition?year=${year}`)).json();
  const feed = await (await page.request.get(`${origin}/api/incidents?q=${encodeURIComponent(doorTitle)}`)).json();
  assert.ok(!edition.calendar?.some((entry: { title: string }) => entry.title === doorTitle), 'door leaked into the calendar');
  assert.deepEqual(feed.items, [], 'door leaked into the feed');
  step('scheduled door stays embargoed in calendar and feed');

  await page.goto(`${origin}/calendar`);
  await page.locator('.doors li').first().waitFor();
  step('calendar renders');
  await page.goto(`${origin}/submit`);
  await page.getByRole('heading', { name: 'Public review queue' }).waitFor();
  step('submit page loads the review queue');

  assert.deepEqual(problems, [], 'no page errors or server errors');
  console.log('End-to-end checks passed.');
} catch (error) {
  await page.screenshot({ path: 'e2e-failure.png', fullPage: true }).catch(() => {});
  console.error('End-to-end check failed; screenshot saved to e2e-failure.png');
  if (problems.length) console.error(problems.join('\n'));
  throw error;
} finally {
  await browser.close();
}
