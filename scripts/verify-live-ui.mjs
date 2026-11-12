/**
 * Instant updates in real browsers (installed Edge), signed in for real, local only. Shop floor already refreshes
 * every 20 s, so everything here must show within 3 s to count as live.
 *   - two people on Shop floor: a walk-in at the door shows on both at once; one takes them, the other sees who
 *   - All customers (a quiet page): a new customer appears without a refresh
 *   - offline, then back: what changed meanwhile shows once the line is back
 *   - the server not hearing the database: the tab falls back to the minute refresh
 *
 *   node scripts/verify-live-ui.mjs      (CRM on 4008, the app on 5176, local Inventory on 4016)
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
const LIVE_MS = 3000;
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`); if (!ok) failures += 1; };
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const arrivals = [];
const customers = [];

async function as(browser, who) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addCookies([{ name: 'token', value: tokenFor(who), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}
const live = (page) => page.evaluate(() => document.documentElement.dataset.live);
async function waitLive(page) { await page.waitForFunction(() => document.documentElement.dataset.live === 'on', null, { timeout: 15000 }).catch(() => {}); }
/** How long until `text` shows on the page (ms), or null if not within `ms`. */
async function showsWithin(page, text, ms = LIVE_MS) {
  const t0 = Date.now();
  return page.getByText(text).first().waitFor({ timeout: ms }).then(() => Date.now() - t0).catch(() => null);
}
function walkIn(customerId) {
  const id = randomUUID();
  arrivals.push(id);
  sql(`insert into crm.door_arrivals (id, client_id, source, visit_id, customer_id, store_name, arrived_at, updated_at) values ('${id}', '${SHOP}', 'verify', 'live-ui-${id}', '${customerId}', null, now(), now())`);
  return id;
}
function newCustomer(name) {
  const id = randomUUID();
  customers.push(id);
  sql(`insert into crm.customers (id, client_id, name, name_key, first_source, first_seen_at, customer_type, search_text, codes, tags, created_at, updated_at) values ('${id}', '${SHOP}', '${name}', lower('${name}'), 'verify', now(), 'REGISTERED', lower('${name}'), '{}', '{}', now(), now())`);
  return id;
}

async function main() {
  const [[pId, pName], [qId, qName]] = sql(`select c.id || '|' || c.name from crm.customers c where c.client_id = '${SHOP}' and c.removed_at is null and c.merged_into_id is null and c.phone is not null and not exists (select 1 from crm.sales_visits v where v.customer_id = c.id and v.ended_at is null) and not exists (select 1 from crm.door_arrivals d where d.customer_id = c.id and d.arrived_at > now() - interval '3 hours') order by c.first_seen_at desc limit 2`).split('\n').map(r => r.split('|'));
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const o = await as(browser, 'owner');
    const s = await as(browser, 'sales');
    await Promise.all([o.page.goto(`${APP}/sales`), s.page.goto(`${APP}/sales`)]);
    await Promise.all([waitLive(o.page), waitLive(s.page)]);
    check('both tabs are live (one line each)', (await live(o.page)) === 'on' && (await live(s.page)) === 'on', { owner: await live(o.page), sales: await live(s.page) });

    // A walk-in at the door: both see them at once.
    walkIn(pId);
    const [ms1, ms2] = await Promise.all([showsWithin(o.page, pName), showsWithin(s.page, pName)]);
    check(`a walk-in shows on both Shop floors within ${LIVE_MS / 1000} s, no refresh`, ms1 !== null && ms2 !== null, { owner: ms1, sales: ms2 });

    // The owner takes them: the salesperson sees who, at once.
    await o.page.getByTestId('sd-person').filter({ hasText: pName }).first().getByTestId('sd-take').click();
    await o.page.waitForURL(/\/sales\/visit\//);
    const t0 = Date.now();
    const taken = await s.page.waitForFunction((n) => [...document.querySelectorAll('[data-testid="sd-person"]')].some(el => el.textContent.includes(n) && /With /.test(el.textContent) && !/Nobody yet/.test(el.textContent)), pName, { timeout: LIVE_MS }).then(() => Date.now() - t0).catch(() => null);
    check(`taken by the owner: the salesperson sees "With …" within ${LIVE_MS / 1000} s`, taken !== null, taken);

    // A quiet page: All customers.
    await s.page.goto(`${APP}/customers`);
    await s.page.getByTestId('customer-row').first().waitFor({ timeout: 20000 });
    await waitLive(s.page);
    const name = `Livecheck ${STAMP}`;
    newCustomer(name);
    const ms3 = await showsWithin(s.page, name);
    check(`All customers: a new customer appears within ${LIVE_MS / 1000} s, no refresh`, ms3 !== null, ms3);

    // Offline, then back.
    await s.ctx.setOffline(true);
    await s.page.waitForTimeout(1500);
    const name2 = `Livecheck back ${STAMP}`;
    newCustomer(name2);
    await s.page.waitForTimeout(1500);
    check('offline: the change has not shown yet', (await s.page.getByText(name2).count()) === 0);
    await s.ctx.setOffline(false);
    const ms4 = await showsWithin(s.page, name2, 12000);
    check('back online: what changed meanwhile shows by itself (the line comes back, everything reloads once)', ms4 !== null, ms4);

    // The server not hearing the database: the minute refresh.
    const f = await as(browser, 'owner');
    await f.page.route('**/api/v1/live', route => route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: 'retry: 3000\nevent: ready\ndata: {"listening":false}\n\n' }));
    await f.page.goto(`${APP}/today`);
    await f.page.waitForFunction(() => document.documentElement.dataset.live === 'minute', null, { timeout: 15000 }).catch(() => {});
    check('the server not hearing the database: the tab refreshes on the minute instead', (await live(f.page)) === 'minute', await live(f.page));
    await f.ctx.close();

    void qId; void qName;
    await o.ctx.close(); await s.ctx.close();
  } finally {
    sql(`delete from crm.timeline_events where client_id = '${SHOP}' and ref in (select 'visit:' || id from crm.sales_visits where customer_id = '${pId}' and started_at > now() - interval '30 minutes')`);
    sql(`delete from crm.sales_visit_items where visit_id in (select id from crm.sales_visits where customer_id = '${pId}' and started_at > now() - interval '30 minutes')`);
    sql(`delete from crm.sales_visits where customer_id = '${pId}' and started_at > now() - interval '30 minutes'`);
    if (arrivals.length) sql(`delete from crm.door_arrivals where id in (${arrivals.map(i => `'${i}'`).join(',')})`);
    if (customers.length) sql(`delete from crm.customers where id in (${customers.map(i => `'${i}'`).join(',')})`);
    await browser.close();
  }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exitCode = failures ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
