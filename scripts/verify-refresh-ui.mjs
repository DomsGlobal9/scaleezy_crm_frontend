/**
 * All customers keeps itself up to date (the owner, 12 Nov: "only after refreshing it shows"), in a real
 * browser (installed Edge), signed in for real, local only. A customer arriving from elsewhere (the till,
 * Inventory, another person's Sales dashboard) appears without pressing refresh:
 *   1. while the page is open (it asks again every minute)
 *   2. when going back to All customers from another screen (it asks again on opening)
 *   3. when the window comes back into view
 * and the counts on the cards follow.
 *
 *   node scripts/verify-refresh-ui.mjs      (CRM on 4008, the app on 5176, local Inventory on 4016)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..', '..', 'backend');
const SHOP = 'verify-suites-tenant';
const STAMP = Date.now();
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`); if (!ok) failures += 1; };
const token = execFileSync('npm', ['run', '--silent', 'login:test', '--', 'owner'], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const made = [];
/** A customer that arrived from elsewhere, straight into CRM's own copy, as the feed puts them there. */
function arrive(name) {
  const id = randomUUID();
  made.push(id);
  sql(`insert into crm.customers (id, client_id, name, name_key, first_source, first_seen_at, customer_type, search_text, codes, tags, created_at, updated_at)
       values ('${id}', '${SHOP}', '${name}', lower('${name}'), 'verify', now(), 'REGISTERED', lower('${name}'), '{}', '{}', now(), now())`);
  return id;
}
const count = async (page) => Number(((await page.getByTestId('count').innerText()).match(/[\d,]+/) ?? ['0'])[0].replace(/,/g, ''));

async function main() {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
    await page.goto(`${APP}/customers`);
    await page.getByTestId('customer-row').first().waitFor({ timeout: 20000 });
    const before = await count(page);

    // 1. While the page is open: within a minute (and a little), no refresh.
    const a = `Refreshcheck Open ${STAMP}`;
    arrive(a);
    const t0 = Date.now();
    const seen = await page.getByTestId('customer-row').filter({ hasText: a }).first().waitFor({ timeout: 75000 }).then(() => true).catch(() => false);
    check(`a customer who arrives while the page is open shows up by itself (${Math.round((Date.now() - t0) / 1000)} s, no refresh)`, seen);
    check('...and the count goes up with them', (await count(page)) === before + 1, { before, now: await count(page) });

    // 2. Going back to All customers from another screen: straight away.
    await page.getByRole('link', { name: 'To do today' }).click();
    await page.waitForURL(/\/today/);
    const b = `Refreshcheck Back ${STAMP}`;
    arrive(b);
    await page.getByRole('link', { name: 'All customers' }).click();
    const t1 = Date.now();
    const back = await page.getByTestId('customer-row').filter({ hasText: b }).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    check(`going back to All customers shows a new customer at once (${((Date.now() - t1) / 1000).toFixed(1)} s)`, back);

    // 3. The window comes back into view (another tab, the till, then back to CRM).
    const c = `Refreshcheck Focus ${STAMP}`;
    arrive(c);
    await page.evaluate(() => { window.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
    const t2 = Date.now();
    const focus = await page.getByTestId('customer-row').filter({ hasText: c }).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    check(`coming back to the window shows a new customer at once (${((Date.now() - t2) / 1000).toFixed(1)} s)`, focus);
  } finally {
    if (made.length) sql(`delete from crm.customers where id in (${made.map(i => `'${i}'`).join(',')})`);
    await browser.close();
  }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exitCode = failures ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
