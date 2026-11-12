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

    // Not here: at once, with Undo (no confirm box: a mis-tap is undone instead).
    const a = card(page, aName);
    await a.waitFor({ timeout: 20000 });
    check('"I will take this" in neutral words (not "take her")', (await a.getByTestId('sd-take').innerText()).trim() === "I'll take this");
    await a.getByTestId('sd-not-here').click();
    const gone = await card(page, aName).waitFor({ state: 'detached', timeout: 10000 }).then(() => true).catch(() => false);
    check('Not here: the card goes at once', gone);
    await page.getByTestId('sd-undo').waitFor({ timeout: 5000 });
    await page.getByTestId('sd-undo-toast').screenshot({ path: path.join(shots, 'not-here-undo.png') });
    await page.getByTestId('sd-undo').click();
    const back = await card(page, aName).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    check('Undo: the card is back', back);
    await card(page, aName).getByTestId('sd-not-here').click();
    await card(page, aName).waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    check('...Not here again: the door scan is kept, marked not here, with who did it on the timeline', sql(`select count(*) from crm.door_arrivals where id = '${arrivals[0]}' and left_at is not null`) === '1' && sql(`select count(*) from crm.timeline_events where ref = 'door-left:${arrivals[0]}' and title like '%marked by%'`) === '1');

    // Take B, then Close: started by mistake.
    const b = card(page, bName);
    await b.getByTestId('sd-take').click();
    await page.waitForURL(/\/sales\/visit\//);
    check('the visit page links back to Shop floor', (await page.getByRole('link', { name: /Shop floor/ }).count()) >= 1);
    await page.getByRole('link', { name: /Shop floor/ }).first().click();
    await card(page, bName).waitFor({ timeout: 20000 });
    await card(page, bName).getByTestId('sd-close').click();
    const box = card(page, bName).getByTestId('sd-close-box');
    check('Close offers "Left the shop" and "Remove: started by mistake"', /Left the shop/.test(await box.innerText()) && (await box.getByTestId('sd-close-mistake').count()) === 1);
    await box.screenshot({ path: path.join(shots, 'close-card.png') });
    await box.getByTestId('sd-close-mistake').click();
    check('Remove asks once more (it cannot be undone)', /Remove this visit\? It cannot be undone\./.test(await box.innerText()));
    await box.getByTestId('sd-remove-yes').click();
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
    check('Left the shop: the card goes, the visit ends', left && sql(`select count(*) from crm.sales_visits where customer_id = '${bId}' and ended_at is not null and started_at > now() - interval '10 minutes'`) === '1');
    await page.getByTestId('sd-undo').click();
    const undone = await card(page, bName).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    check('Undo: the visit is open again, with them', undone && /With you/.test(await card(page, bName).innerText()) && sql(`select count(*) from crm.sales_visits where customer_id = '${bId}' and ended_at is null and started_at > now() - interval '10 minutes'`) === '1');
    await card(page, bName).getByTestId('sd-close').click();
    await card(page, bName).getByTestId('sd-close-left').click();
    await card(page, bName).waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});

    // The door QR on Shop floor (Inventory's screen is gone): shown and printable; made up here, as local WhatsApp is not linked.
    await page.route('**/api/v1/counter/door-qr**', route => route.fulfill({ json: { success: true, data: { shop: 'Sri Lakshmi Silks', store: 'Main Store', logo: null, code: 'IN-TEST01', text: 'Hi', number: '919000000001', link: 'https://wa.me/919000000001?text=Hi', fix: null, reason: null } } }));
    const pick = page.getByRole('combobox', { name: 'Your store' });
    if ((await pick.innerText()).includes('Choose')) { await pick.click(); await page.getByRole('option').nth(1).click(); }
    await page.getByTestId('sd-door-qr').click();
    await page.getByTestId('dq-standee').waitFor({ timeout: 15000 });
    const standee = await page.getByTestId('dq-standee').innerText();
    check('Door QR: the standee with the shop, the store, the code and the number', /Sri Lakshmi Silks/.test(standee) && /Main Store/i.test(standee) && /IN-TEST01/.test(standee) && /\+91 90000 00001/.test(standee) && (await page.locator('[data-testid="dq-standee"] svg').count()) >= 1, standee);
    check('...and Print', (await page.getByTestId('dq-print').count()) === 1);
    await page.getByTestId('dq-standee').screenshot({ path: path.join(shots, 'door-qr.png') });
    await page.emulateMedia({ media: 'print' });
    const printed = await page.evaluate(() => ({ standee: getComputedStyle(document.querySelector('[data-testid="dq-standee"]')).visibility, menu: getComputedStyle(document.querySelector('nav') || document.body).visibility }));
    check('printing shows only the standee', printed.standee === 'visible' && printed.menu === 'hidden', printed);
    await page.emulateMedia({ media: 'screen' });
    await page.unroute('**/api/v1/counter/door-qr**');
    await page.route('**/api/v1/counter/door-qr**', route => route.fulfill({ json: { success: true, data: { shop: 'Sri Lakshmi Silks', store: 'Main Store', code: 'IN-TEST01', link: null, fix: 'WHATSAPP', reason: "Link the shop's WhatsApp number in Settings first. The QR opens a chat with that number." } } }));
    await page.reload();
    await page.getByTestId('dq-fix').waitFor({ timeout: 15000 });
    check('WhatsApp not linked yet: says so, with the way to fix it, and no Print', /Link the shop's WhatsApp number/.test(await page.getByTestId('dq-fix').innerText()) && (await page.getByTestId('dq-print').count()) === 0);
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
