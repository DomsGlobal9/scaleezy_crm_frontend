/**
 * The Counter, in a real browser (installed Edge), signed in for real, local database only. Door
 * scans are written into local Inventory and delivered as Inventory delivers them
 * (backend/src/scripts/support/door-scan.ts), so "in the store now" is the real path.
 *
 *   owner   choose the store; the two who scanned (one a customer, one a number nobody has); take the
 *           customer -> their card opens; look up a made-up number (said why), a new number, a known
 *           one; a card with colours shows them as swatches; add a note on the card
 *   sales   sees who the owner is looking after
 *   phone   the Counter with a card open, no sideways scroll
 *
 *   node scripts/verify-counter-ui.mjs      (CRM on 4008, the app on 5176)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const backend = path.resolve(here, '..', '..', 'backend');
const NOTE = `CHECK-COUNTER ${Date.now() % 100000}: keep the blue Banarasi aside`;
const UNKNOWN = `+91 6${String(Date.now()).slice(-9)}`;

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
};
const run = (cmd, args) => execFileSync(cmd, args, { cwd: backend, encoding: 'utf8', shell: true }).trim();
const tokenFor = (who) => run('npm', ['run', '--silent', 'login:test', '--', who]);
const door = (...args) => run('npx', ['ts-node', '--transpile-only', 'src/scripts/support/door-scan.ts', ...args]).split('\n').pop();
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function as(browser, who, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: 'token', value: tokenFor(who), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}

async function main() {
  const scans = [door('scan', '+919848022301', '3'), door('scan', UNKNOWN.replace(/\s/g, ''), '1')];
  const lakshmi = sql("select id from crm.customers where client_id='verify-suites-tenant' and name='Lakshmi Devi' and merged_into_id is null limit 1");
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { ctx, page } = await as(browser, 'owner');
    await page.goto(`${APP}/counter`);
    await page.getByRole('combobox', { name: 'Your store' }).click();
    await page.getByRole('option', { name: 'Main Store', exact: true }).click();
    const arrivals = page.getByTestId('arrival');
    await arrivals.filter({ hasText: 'Anitha Reddy' }).first().waitFor({ timeout: 20000 });
    const texts = await arrivals.allInnerTexts();
    check('in the store now: Anitha Reddy, by name', texts.some(t => /Anitha Reddy/.test(t)));
    check('...and the number nobody has, "Not a customer yet"', texts.some(t => /Not a customer yet/.test(t)), texts);
    check('...each with the minutes since they came in ("Came in 3 min ago")', texts.some(t => /Anitha Reddy[\s\S]*Came in [34] min ago/.test(t)), texts);
    const qr = await page.getByTestId('door-qr').getAttribute('href');
    check('a link to the Door QR standee, which stays in Inventory (/customers/door-qr, new tab)', /\/customers\/door-qr$/.test(qr ?? '') && (await page.getByTestId('door-qr').getAttribute('target')) === '_blank', qr);
    await page.screenshot({ path: path.join(shots, 'counter-door.png') });

    await arrivals.filter({ hasText: 'Anitha Reddy' }).first().getByRole('button', { name: /I'll take them/ }).click();
    await page.getByTestId('counter-card').waitFor({ timeout: 15000 });
    check('"I\'ll take them" opens her card', (await page.getByTestId('card-name').innerText()) === 'Anitha Reddy' && /[?&]c=/.test(page.url()));
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="arrival"]')].some(a => /Anitha Reddy/.test(a.textContent) && /You are looking after them/.test(a.textContent)), null, { timeout: 15000 });
    check('...and the arrival says you are looking after them', true);

    // Look-ups.
    const phone = page.getByLabel('Their mobile number');
    await phone.fill('98765 43210');
    await page.getByRole('button', { name: 'Look up' }).click();
    await page.getByTestId('lookup-problem').waitFor({ timeout: 10000 });
    check('a made-up number: said why, in plain words', /does not look like a real number/.test(await page.getByTestId('lookup-problem').innerText()));
    await phone.fill(UNKNOWN);
    await page.getByRole('button', { name: 'Look up' }).click();
    await page.getByTestId('lookup-none').waitFor({ timeout: 10000 });
    check('a new number: "New customer", add them at the till', /New customer/.test(await page.getByTestId('lookup-none').innerText()));
    await phone.fill('98480 22307');
    await page.getByRole('button', { name: 'Look up' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="card-name"]')?.textContent === 'Gayathri Iyer', null, { timeout: 15000 });
    check('a known number opens their card (Gayathri Iyer), with what she usually spends', /Usually spends ₹13,500 – ₹16,400 a bill/.test(await page.getByTestId('spend').innerText()));

    // A card with colours.
    await page.goto(`${APP}/counter?c=${lakshmi}`);
    await page.getByTestId('colours').waitFor({ timeout: 15000 });
    const colours = await page.getByTestId('colours').innerText();
    check('her colours as swatches: Blue, Orange, Red', /Blue[\s\S]*Orange[\s\S]*Red/.test(colours) && (await page.locator('.ct-chip').count()) === 3, colours);
    check('the shelves need a store chosen first (no picks guessed)', (await page.getByTestId('picks-choose').count()) === 1 || (await page.getByTestId('picks-none').count()) === 1);

    await page.getByLabel('Add a note').fill(NOTE);
    await page.getByTestId('card-notes').getByRole('button', { name: 'Save' }).click();
    await page.waitForFunction((n) => document.querySelector('[data-testid="card-notes"]')?.textContent.includes(n), NOTE, { timeout: 15000 });
    check('a note added on the card shows on it at once', true);
    await page.screenshot({ path: path.join(shots, 'counter-card.png'), fullPage: true });
    await ctx.close();

    // Sales sees who has her.
    {
      const { ctx: c2, page: p2 } = await as(browser, 'sales');
      await p2.goto(`${APP}/counter`);
      const a = p2.getByTestId('arrival').filter({ hasText: 'Anitha Reddy' }).first();
      await a.waitFor({ timeout: 20000 });
      check('sales sees who is looking after Anitha, and no take button for her', /is looking after them/.test(await a.innerText()) && (await a.getByRole('button', { name: /I'll take them/ }).count()) === 0);
      await c2.close();
    }

    // Phone.
    {
      const { ctx: c3, page: p3 } = await as(browser, 'owner', { width: 390, height: 844 });
      await p3.goto(`${APP}/counter?c=${lakshmi}`);
      await p3.getByTestId('colours').waitFor({ timeout: 20000 });
      check('phone: the Counter with a card, no sideways scroll', await noOverflow(p3));
      await p3.screenshot({ path: path.join(shots, 'counter-phone.png'), fullPage: true });
      await c3.close();
    }
  } finally {
    await browser.close();
    door('clear', ...scans);
    sql(`delete from crm.notes where body like 'CHECK-COUNTER %'`);
  }
  console.log(failures ? `\n${failures} counter UI check(s) FAILED.` : '\nAll counter UI checks passed.');
  process.exitCode = failures ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
