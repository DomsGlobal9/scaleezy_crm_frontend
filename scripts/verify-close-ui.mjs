/**
 * Shop floor (12 Nov): the name, and closing a card in In the shop now, in a real browser (installed Edge),
 * signed in for real, local only.
 *   - the menu, the page and the back link say "Shop floor"; nothing says "Sales dashboard"
 *   - a walk-in nobody took: "Not here", with a short confirm and "Keep" to back out; the card goes
 *   - a visit: Close, "Started by mistake" (the walk-in is back to "Nobody yet"); then "She left" (the card goes)
 *   - Sales staff do not see Close on someone else's visit; the owner does
 *
 *   node scripts/verify-close-ui.mjs      (CRM on 4008, the app on 5176, local Inventory on 4016)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const backend = path.resolve(here, '..', '..', 'backend');
const SHOP = 'verify-suites-tenant';
const STAMP = Date.now();
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`); if (!ok) failures += 1; };
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const arrivals = [];
function walkIn(customerId, name) {
  const id = randomUUID();
  arrivals.push(id);
  sql(`insert into crm.door_arrivals (id, client_id, source, visit_id, customer_id, store_name, arrived_at, updated_at) values ('${id}', '${SHOP}', 'verify', 'close-ui-${name}-${STAMP}', '${customerId}', null, now() - interval '2 minutes', now())`);
  return id;
}

async function as(browser, who) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addCookies([{ name: 'token', value: tokenFor(who), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}
const card = (page, name) => page.getByTestId('sd-person').filter({ hasText: name }).first();

async function main() {
  const people = sql(`select c.id || '|' || c.name from crm.customers c where c.client_id = '${SHOP}' and c.merged_into_id is null and c.removed_at is null and c.phone is not null and not exists (select 1 from crm.sales_visits v where v.customer_id = c.id and v.ended_at is null) and not exists (select 1 from crm.door_arrivals d where d.customer_id = c.id and d.arrived_at > now() - interval '3 hours') order by c.first_seen_at limit 2`).split('\n').map(r => r.split('|'));
  const [[aId, aName], [bId, bName]] = people;
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { ctx, page } = await as(browser, 'owner');
    walkIn(aId, 'a');
    const bArrival = walkIn(bId, 'b');
    await page.goto(`${APP}/sales`);

    // The name.
    await page.getByRole('heading', { level: 1, name: /Shop floor/ }).waitFor({ timeout: 20000 });
    check('the page is called Shop floor', true);
    check('the menu says Shop floor', (await page.getByRole('link', { name: 'Shop floor' }).count()) === 1);
    check('nothing on the page says "Sales dashboard"', !/Sales dashboard/.test(await page.locator('body').innerText()));

    // Not here, with Keep.
    const a = card(page, aName);
    await a.waitFor({ timeout: 20000 });
    await a.getByTestId('sd-close').click();
    check('Not here asks first, in plain words', /Their card goes\. The door scan stays on their timeline\./.test(await a.getByTestId('sd-close-box').innerText()));
    await a.getByRole('button', { name: 'Keep' }).click();
    check('Keep backs out: the card stays', (await a.getByTestId('sd-close-box').count()) === 0 && (await card(page, aName).count()) === 1);
    await a.getByTestId('sd-close').click();
    await a.getByTestId('sd-not-here').click();
    const gone = await card(page, aName).waitFor({ state: 'detached', timeout: 10000 }).then(() => true).catch(() => false);
    check('Yes, not here: the card goes', gone);
    check('...and the door scan is kept, marked not here', sql(`select count(*) from crm.door_arrivals where id = '${arrivals[0]}' and left_at is not null`) === '1');

    // Take B, then Close: started by mistake.
    const b = card(page, bName);
    await b.getByTestId('sd-take').click();
    await page.waitForURL(/\/sales\/visit\//);
    check('the visit page links back to Shop floor', (await page.getByRole('link', { name: /Shop floor/ }).count()) >= 1);
    await page.getByRole('link', { name: /Shop floor/ }).first().click();
    await card(page, bName).waitFor({ timeout: 20000 });
    await card(page, bName).getByTestId('sd-close').click();
    const box = card(page, bName).getByTestId('sd-close-box');
    check('Close offers "left" and "started by mistake"', (await box.getByTestId('sd-close-left').count()) === 1 && (await box.getByTestId('sd-close-mistake').count()) === 1);
    await box.screenshot({ path: path.join(shots, 'close-card.png') });
    await box.getByTestId('sd-close-mistake').click();
    await page.waitForFunction((n) => [...document.querySelectorAll('[data-testid="sd-person"]')].some(el => el.textContent.includes(n) && el.textContent.includes('Nobody yet')), bName, { timeout: 10000 }).catch(() => {});
    check('Started by mistake: the walk-in is back to "Nobody yet"', /Nobody yet/.test(await card(page, bName).innerText()));
    check('...and the visit is gone', sql(`select count(*) from crm.sales_visits where customer_id = '${bId}' and started_at > now() - interval '10 minutes'`) === '0');

    // Take B again, then She left.
    await card(page, bName).getByTestId('sd-take').click();
    await page.waitForURL(/\/sales\/visit\//);
    await page.goto(`${APP}/sales`);
    await card(page, bName).waitFor({ timeout: 20000 });

    // Sales sees no Close on the owner's visit.
    const sales = await as(browser, 'sales');
    await sales.page.goto(`${APP}/sales`);
    const theirs = card(sales.page, bName);
    await theirs.waitFor({ timeout: 20000 });
    check('Sales does not see Close on someone else\'s visit', (await theirs.getByTestId('sd-close').count()) === 0);
    await sales.ctx.close();

    await card(page, bName).getByTestId('sd-close').click();
    await card(page, bName).getByTestId('sd-close-left').click();
    const left = await card(page, bName).waitFor({ state: 'detached', timeout: 10000 }).then(() => true).catch(() => false);
    check('She left: the card goes, the visit ends', left && sql(`select count(*) from crm.sales_visits where customer_id = '${bId}' and ended_at is not null and started_at > now() - interval '10 minutes'`) === '1');
    void bArrival;
    await ctx.close();
  } finally {
    sql(`delete from crm.timeline_events where client_id = '${SHOP}' and ref in (select 'visit:' || id from crm.sales_visits where customer_id in ('${aId}', '${bId}') and started_at > now() - interval '30 minutes')`);
    sql(`delete from crm.sales_visit_items where visit_id in (select id from crm.sales_visits where customer_id in ('${aId}', '${bId}') and started_at > now() - interval '30 minutes')`);
    sql(`delete from crm.sales_visits where customer_id in ('${aId}', '${bId}') and started_at > now() - interval '30 minutes'`);
    if (arrivals.length) sql(`delete from crm.door_arrivals where id in (${arrivals.map(i => `'${i}'`).join(',')})`);
    await browser.close();
  }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exitCode = failures ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
