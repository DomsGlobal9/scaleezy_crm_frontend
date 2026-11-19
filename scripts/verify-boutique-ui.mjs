/**
 * Boutique work on the customer page, and Due and ready (the mockups approved 19 Nov), in a real browser signed in for
 * real. A shop that does not use Boutique sees none of it; once Boutique has sent its work, the tab, the strip and the
 * menu item appear. Checked at phone, tablet and laptop widths. Local only, made-up data only.
 *
 *   node scripts/verify-boutique-ui.mjs      (CRM on 4008, the app on 5176, local Inventory on 4016)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..', '..', 'backend');
const STAMP = String(Date.now() % 100000).padStart(5, '0');
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)?.slice(0, 300)}`}`); if (!ok) failures += 1; };
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const seed = (mode) => JSON.parse(execFileSync('npx', ['ts-node', '--transpile-only', 'src/scripts/support/boutique-seed.ts', mode, STAMP], { cwd: backend, encoding: 'utf8', shell: true }).trim().split('\n').pop());
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

async function signedIn(browser, viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 1024 });
  await ctx.addCookies([{ name: 'token', value: tokenFor('owner'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}
const settle = (page) => page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});

async function main() {
  seed('clear');
  const someone = sql("select id from crm.customers where client_id='verify-suites-tenant' and removed_at is null and merged_into_id is null limit 1");
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    console.log('\n1. A shop that does not use Boutique sees nothing of it');
    let { ctx, page } = await signedIn(browser, { width: 1366, height: 900 });
    await page.goto(`${APP}/customers/${someone}`); await settle(page);
    check('no "Boutique work" tab on a customer', (await page.getByRole('tab', { name: 'Boutique work' }).count()) === 0);
    check('no strip under the header', (await page.getByTestId('boutique-strip').count()) === 0);
    check('no "Due and ready" in the menu', (await page.getByRole('link', { name: /Due and ready/ }).count()) === 0);
    await page.goto(`${APP}/due`); await settle(page);
    check('/due typed in by hand: says the shop does not use Boutique', await page.getByText('This shop does not use Boutique').isVisible());
    await ctx.close();

    console.log('\n2. Once Boutique has sent its work');
    const s = seed('seed');
    ({ ctx, page } = await signedIn(browser, { width: 1366, height: 900 }));
    await page.goto(`${APP}/customers/${s.customerId}`); await settle(page);
    const strip = page.getByTestId('boutique-strip');
    check('the strip says what needs the shop: ready to collect, waiting, and the overdue one', await strip.isVisible() && /Silk blouse, boat neck is ready to collect/.test(await strip.innerText()) && /waiting 3 days/.test(await strip.innerText()) && /1 overdue/.test(await strip.innerText()), await strip.innerText().catch(() => ''));
    check('"Due and ready" is in the menu, with 1 overdue', (await page.getByRole('link', { name: /Due and ready/ }).count()) > 0 && /1/.test(await page.getByRole('link', { name: /Due and ready/ }).first().innerText()));
    await strip.click(); await page.waitForURL(/tab=boutique/, { timeout: 8000 }).catch(() => {});
    const opened = await page.waitForFunction(() => [...document.querySelectorAll('[role=tab]')].some(t => t.textContent.trim() === 'Boutique work' && t.getAttribute('aria-selected') === 'true'), null, { timeout: 8000 }).then(() => true, () => false);
    check('the strip opens the Boutique work tab', /tab=boutique/.test(page.url()) && opened, page.url());
    const jobs = page.getByTestId('boutique-job');
    check('open work: four jobs, the done one listed below', (await jobs.count()) === 4 && await page.getByText('Fall and pico · Kanchi silk').isVisible(), await jobs.count());
    const ready = jobs.filter({ hasText: 'Silk blouse' });
    check('the ready job: its step, balance, who, measurements on file', /Ready to collect/.test(await ready.innerText()) && /₹1,000/.test(await ready.innerText()) && /Meena/.test(await ready.innerText()) && /Measurements on file/.test(await ready.innerText()), await ready.innerText());
    check('...with Call and Open in Boutique', (await ready.getByRole('link', { name: /Call/ }).getAttribute('href'))?.startsWith('tel:') && (await ready.getByRole('link', { name: /Open in Boutique/ }).getAttribute('href')) === 'https://boutique.example/jobs/1');
    const late = jobs.filter({ hasText: 'Lehenga waist' });
    check('the late alteration says Overdue 2 days, with the day it was due', /Overdue 2 days/.test(await late.innerText()) && /Was due/.test(await late.innerText()), await late.innerText());
    const ship = jobs.filter({ hasText: 'Georgette' });
    check('the courier job: "Sent by courier", its steps end in Delivered (never "collect")', /Sent by courier/.test(await ship.innerText()) && /Delivered/.test(await ship.innerText()) && !/collect/i.test(await ship.innerText()), await ship.innerText());
    await page.getByRole('tab', { name: 'Timeline' }).click();
    await page.getByText(/Blouse stitching (Silk blouse, boat neck): ready to collect/).first().waitFor({ timeout: 10000 }).catch(() => {});
    check('each step is on her timeline', await page.getByText(/Blouse stitching \(Silk blouse, boat neck\): ready to collect/).first().isVisible());

    console.log('\n3. Due and ready');
    await page.goto(`${APP}/due`); await settle(page);
    const count = async k => Number((await page.getByTestId(`dr-count-${k}`).locator('b').innerText()));
    check('the four counts: 1 overdue, 1 due this week, 1 ready, 1 sent by courier', (await count('overdue')) === 1 && (await count('week')) === 1 && (await count('ready')) === 1 && (await count('shipped')) === 1, [await count('overdue'), await count('week'), await count('ready'), await count('shipped')]);
    const rows = page.getByTestId('dr-table').locator('tbody tr');
    check('laptop: one table, overdue first', (await rows.count()) === 4 && /days? late/.test(await rows.first().innerText()), await rows.first().innerText().catch(() => ''));
    await page.getByTestId('dr-count-ready').click(); await page.waitForURL(/show=ready/, { timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=dr-table] tbody tr').length === 1, null, { timeout: 8000 }).catch(() => {});
    check('a count is a filter: only what is ready', (await rows.count()) === 1 && /Ready · 3 days/.test(await rows.first().innerText()), await rows.count());
    await rows.first().click(); await settle(page);
    check('a row opens the customer on her Boutique work', /\/customers\/.+tab=boutique/.test(page.url()), page.url());
    await ctx.close();

    console.log('\n4. Every device');
    for (const [label, width, height] of [['small phone', 360, 760], ['phone', 390, 844], ['tablet', 768, 1024], ['laptop', 1280, 900]]) {
      ({ ctx, page } = await signedIn(browser, { width, height }));
      await page.goto(`${APP}/customers/${s.customerId}?tab=boutique`); await settle(page);
      const a = await fits(page);
      await page.goto(`${APP}/due`); await settle(page);
      const b = await fits(page);
      const cards = width < 861 ? await page.getByTestId('dr-item').count() : await page.getByTestId('dr-table').locator('tbody tr').count();
      check(`${label} (${width}): nothing runs off the screen; Due and ready shows ${width < 861 ? 'cards' : 'the table'}`, a && b && cards === 4, { a, b, cards });
      await ctx.close();
    }
  } finally {
    await browser.close();
    seed('clear');
  }
  console.log(failures ? `\n${failures} check(s) FAILED.` : '\nAll boutique UI checks passed.');
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); try { seed('clear'); } catch { /* fine */ } process.exit(1); });
