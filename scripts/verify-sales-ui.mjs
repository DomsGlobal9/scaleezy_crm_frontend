/**
 * The Sales dashboard in a real browser (installed Edge), signed in for real, on a phone-sized screen,
 * local database and local Inventory only:
 *
 *   - the dashboard: its name, the numbers, a walk-in with what to know, "I'll take her"
 *   - a customer who did not scan: type her number, add her (she said yes to offers), and Inventory has her
 *   - what she wants: chips and a live count; "Show her" fills the screen with the shop's name and the
 *     pieces only (no menu, no "Sales dashboard", no tags or stock counts)
 *   - she picks 2; bring them (by photo and price tag); bought one, the other not her colour; finish
 *   - her timeline says so; Warehouse has no Sales dashboard; nothing runs off a phone screen
 *
 *   node scripts/verify-sales-ui.mjs      (CRM on 4008, the app on 5176, local Inventory on 4016)
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
const STAMP = String(Date.now() % 100000).padStart(5, '0');
const NEW_PHONE = `97${STAMP}${String(Date.now() % 1000).padStart(3, '0')}`;

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
};
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function main() {
  const [storeId, storeName] = sql(`select l.id || '|' || l.name from inventory_locations l join inventory_stocks s on s.location_id = l.id where l.client_id = '${SHOP}' and l.type::text = 'STORE' and s.quantity > 0 group by l.id, l.name order by sum(s.quantity) desc limit 1`).split('|');
  // A known customer at the door: one with bills, so the card has something to say.
  const regular = sql(`select c.id || '|' || c.name from crm.customers c where c.client_id = '${SHOP}' and c.merged_into_id is null and c.removed_at is null and c.phone is not null and exists (select 1 from crm.timeline_events t where t.customer_id = c.id and t.counts_spend) and not exists (select 1 from crm.sales_visits v where v.customer_id = c.id and v.ended_at is null) limit 1`).split('|');
  const arrivalId = randomUUID();
  sql(`insert into crm.door_arrivals (id, client_id, source, visit_id, customer_id, store_name, arrived_at, updated_at) values ('${arrivalId}', '${SHOP}', 'verify', 'sales-ui-${STAMP}', '${regular[0]}', '${storeName.replace(/'/g, "''")}', now() - interval '3 minutes', now())`);

  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  let newCustomer = null;
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([{ name: 'token', value: tokenFor('sales'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    await ctx.addInitScript((id) => { try { localStorage.setItem('crm_counter_store', id); } catch { /* fine */ } }, storeId);
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });

    await page.goto(`${APP}/sales`);
    await page.getByRole('heading', { name: 'Sales dashboard' }).waitFor({ timeout: 20000 });
    await page.getByTestId('sd-stats').waitFor({ timeout: 20000 });
    check('the page is called "Sales dashboard", with the three numbers', /in the shop/.test(await page.getByTestId('sd-stats').innerText()) && /brought back this week/.test(await page.getByTestId('sd-stats').innerText()));
    const card = page.getByTestId('sd-person').filter({ hasText: regular[1] }).first();
    await card.waitFor({ timeout: 20000 });
    const cardText = await card.innerText();
    check('a walk-in from the door: "Nobody yet", with what to know', /Nobody yet/.test(cardText) && (await card.getByTestId('cues').count()) === 1, cardText.slice(0, 200));
    check('the page fits a phone', await noOverflow(page));
    await page.screenshot({ path: path.join(shots, 'sales-dashboard.png'), fullPage: true });

    // A customer who did not scan: typed, not known, added.
    await page.getByTestId('sd-find').fill(NEW_PHONE);
    await page.getByTestId('sd-add').waitFor({ timeout: 15000 });
    check('an unknown number: "Not a customer yet", with the form', /Not a customer yet/.test(await page.getByTestId('sd-add').innerText()));
    await page.getByTestId('sd-name').fill(`Sowmya Screen ${STAMP}`);
    await page.getByRole('radio', { name: 'She said yes' }).click();
    await page.getByRole('combobox', { name: 'Birthday day' }).click();
    await page.getByRole('option', { name: '14' }).click();
    await page.getByRole('combobox', { name: 'Birthday month' }).click();
    await page.getByRole('option', { name: 'Nov' }).click();
    await page.getByTestId('sd-add-save').click();
    await page.waitForURL(/\/sales\/visit\//, { timeout: 30000 });
    const visitId = page.url().split('/').pop();
    newCustomer = sql(`select id || '|' || coalesce(whatsapp_offers::text, '') || '|' || coalesce(birthday, '') from customers where client_id = '${SHOP}' and phone = '+91${NEW_PHONE}' and deleted_at is null`);
    check('added: Inventory has her (the till finds her), with her yes and her birthday', newCustomer.split('|')[1] === 'true' && newCustomer.split('|')[2] === '11-14', newCustomer);
    check('straight into serving her', /Sowmya Screen/.test(await page.getByRole('heading', { level: 1 }).innerText()));

    // What she wants.
    await page.getByTestId('sv-ask').waitFor({ timeout: 20000 });
    await page.getByTestId('sv-sizes').waitFor({ timeout: 20000 });
    const before = await page.getByTestId('sv-show').innerText();
    await page.getByTestId('sv-sizes').getByRole('button').first().click();
    await page.waitForFunction((b) => document.querySelector('[data-testid="sv-show"]')?.textContent !== b, before, { timeout: 15000 });
    const after = await page.getByTestId('sv-show').innerText();
    check('choosing a size changes the count, live', /Show her \d+ piece/.test(after) && after !== before, { before, after });
    await page.getByTestId('sv-show').click();
    const her = page.getByTestId('sv-her');
    await her.waitFor({ timeout: 15000 });
    const herText = await her.innerText();
    check('her view: "Picked for you, Sowmya" with the shop\'s name', /Picked for you, Sowmya/.test(herText));
    check('...and nothing of the staff app: no "Sales dashboard", no tags or stock counts', !/Sales dashboard|Tag |in this store|Full story/.test(herText), herText.slice(0, 300));
    await page.waitForTimeout(600);
    check('...and no staff message is left showing on her screen', !(await page.locator('[role="status"]').filter({ hasText: /added|till/ }).isVisible().catch(() => false)));
    const covered = await page.evaluate(() => { const el = document.elementFromPoint(20, 400); return !!el?.closest('[data-testid="sv-her"]'); });
    check('...it covers the whole screen, menu included', covered);
    await page.screenshot({ path: path.join(shots, 'sales-show-her.png') });
    const pieces = page.getByTestId('sv-piece');
    await pieces.nth(0).click();
    await pieces.nth(1).click();
    check('she taps 2 hearts', /Done, bring 2/.test(await page.getByTestId('sv-picked').innerText()));
    await page.getByTestId('sv-picked').click();

    // Bring them.
    await page.getByTestId('sv-bring').waitFor({ timeout: 15000 });
    const bring = await page.getByTestId('sv-bring').innerText();
    check('bring these: 2, found by photo and price tag', /Bring 2 for Sowmya/.test(bring) && /price tag/.test(bring) && !/Shelf|Rack/.test(bring), bring.slice(0, 200));
    const boxes = page.getByTestId('sv-brought');
    await boxes.nth(0).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="sv-brought"][aria-checked="true"]').length === 1, null, { timeout: 15000 });
    await boxes.nth(1).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="sv-brought"][aria-checked="true"]').length === 2, null, { timeout: 15000 });
    check('ticked as brought, both', sql(`select count(*) from crm.sales_visit_items where visit_id = '${visitId}' and brought`) === '2');
    await page.getByTestId('sv-to-how').click();

    // How they went.
    await page.getByTestId('sv-how').waitFor({ timeout: 15000 });
    await page.getByTestId('sv-bought').nth(0).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="sv-bought"][aria-checked="true"]'), null, { timeout: 15000 });
    await page.getByTestId('sv-not_for_her').nth(1).click();
    await page.getByTestId('sv-why-colour').waitFor({ timeout: 15000 });
    await page.getByTestId('sv-why-colour').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="sv-why-colour"][aria-checked="true"]'), null, { timeout: 15000 });
    check('bill it at the till, by its tag', /Bill it at the till/.test(await page.getByTestId('sv-how').innerText()));
    check('the visit page fits a phone', await noOverflow(page));
    await page.getByTestId('sv-finish').click();
    await page.waitForURL(/\/sales$/, { timeout: 20000 });
    const line = sql(`select title || '|' || coalesce(detail, '') from crm.timeline_events where ref = 'visit:${visitId}'`);
    check('her timeline: served, shown 2, tried 2, bought one; the other not her colour', /^Served by .+ · shown 2 · tried 2 · bought /.test(line) && /not her colour/.test(line), line);

    // The walk-in: I'll take her.
    const card2 = page.getByTestId('sd-person').filter({ hasText: regular[1] }).first();
    await card2.getByTestId('sd-take').click();
    await page.waitForURL(/\/sales\/visit\//, { timeout: 20000 });
    const served = await page.getByRole('heading', { level: 1, name: regular[1] }).waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    check('"I\'ll take her" from the door: serving her', served, await page.locator('h1').allInnerTexts());
    await page.goto(`${APP}/sales`);
    const mine = page.getByTestId('sd-person').filter({ hasText: regular[1] }).first();
    await mine.waitFor({ timeout: 20000 });
    check('back on the dashboard: "With you", with Continue', /With you/.test(await mine.innerText()) && (await mine.getByRole('link', { name: 'Continue' }).count()) === 1);
    check('At the door knows who has her', sql(`select taken_in from crm.door_arrivals where id = '${arrivalId}'`) === 'crm');

    // Warehouse: no Sales dashboard.
    const wctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await wctx.addCookies([{ name: 'token', value: tokenFor('warehouse'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const wp = await wctx.newPage();
    await wp.goto(`${APP}/today`);
    await wp.waitForLoadState('networkidle');
    check('Warehouse has no Sales dashboard in the menu', (await wp.getByRole('link', { name: 'Sales dashboard' }).count()) === 0);

    // ── More scenarios ──
    // A number already known: she is found, no form.
    const regularPhone = sql(`select phone from crm.customers where id = '${regular[0]}'`);
    await page.goto(`${APP}/sales`);
    await page.getByTestId('sd-find').fill(regularPhone.replace('+91', ''));
    await page.getByTestId('sd-found').waitFor({ timeout: 15000 });
    check('a number we know: she is found, no "new customer" form', (await page.getByTestId('sd-found').innerText()).includes(regular[1]) && (await page.getByTestId('sd-add').count()) === 0);

    // One digit off the customer just added: "Is this …?", and Yes opens her.
    const near = NEW_PHONE.slice(0, -1) + String((Number(NEW_PHONE.slice(-1)) + 1) % 10);
    await page.getByTestId('sd-find').fill(near);
    await page.getByTestId('sd-add').waitFor({ timeout: 15000 });
    await page.getByTestId('sd-name').fill('Near Check');
    await page.getByTestId('sd-add-save').click();
    await page.getByTestId('sd-near').waitFor({ timeout: 15000 });
    check('one digit off: "Is this Sowmya …?" before adding anyone', /Is this Sowmya Screen/.test(await page.getByTestId('sd-near').innerText()));
    check('...and nobody was added for the typo', sql(`select count(*) from customers where client_id = '${SHOP}' and phone = '+91${near}'`) === '0');
    await page.getByRole('button', { name: "Yes, it's her" }).click();
    await page.waitForURL(/\/sales\/visit\//, { timeout: 20000 });
    check('"Yes, it\'s her": serving her, not someone new', await page.getByRole('heading', { level: 1, name: new RegExp(`Sowmya Screen ${STAMP}`) }).waitFor({ timeout: 15000 }).then(() => true).catch(() => false));

    // No phone at all.
    await page.goto(`${APP}/sales`);
    await page.getByTestId('sd-no-phone').click();
    await page.waitForURL(/\/sales\/visit\//, { timeout: 20000 });
    const noPhoneVisit = page.url().split('/').pop();
    check('no phone: serving "Customer without a phone"', await page.getByRole('heading', { level: 1, name: 'Customer without a phone' }).waitFor({ timeout: 15000 }).then(() => true).catch(() => false));
    await page.getByTestId('sv-show').waitFor({ timeout: 15000 });
    await page.getByTestId('sv-show').click();
    await page.getByTestId('sv-her').waitFor({ timeout: 15000 });
    check('her view without a name: "Picked for you"', /Picked for you\b/.test(await page.getByTestId('sv-her').innerText()) && !/Picked for you,/.test(await page.getByTestId('sv-her').innerText()));
    await page.getByTestId('sv-piece').first().click();
    await page.getByTestId('sv-picked').click();
    await page.getByTestId('sv-bring').waitFor({ timeout: 15000 });

    // Coming back to her later: Continue lands where she was (bring).
    await page.goto(`${APP}/sales/visit/${noPhoneVisit}`);
    check('coming back to a visit with picks: it opens at "Bring these"', await page.getByTestId('sv-bring').waitFor({ timeout: 15000 }).then(() => true).catch(() => false));
    await page.getByTestId('sv-to-how').click();
    await page.getByTestId('sv-not_tried').first().click();
    await page.waitForFunction(() => document.querySelector('[data-testid="sv-not_tried"][aria-checked="true"]'), null, { timeout: 15000 });
    await page.getByTestId('sv-finish').click();
    await page.waitForURL(/\/sales$/, { timeout: 20000 });
    check('...finished, and nothing written to any customer', sql(`select count(*) from crm.timeline_events where ref = 'visit:${noPhoneVisit}'`) === '0' && sql(`select (ended_at is not null)::text from crm.sales_visits where id = '${noPhoneVisit}'`) === 'true');

    // Light theme, on a laptop.
    const lctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await lctx.addCookies([{ name: 'token', value: tokenFor('sales'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    await lctx.addInitScript((id) => { try { localStorage.setItem('crm_counter_store', id); localStorage.setItem('scale_easy_theme', 'light'); } catch { /* fine */ } }, storeId);
    const lp = await lctx.newPage();
    await lp.goto(`${APP}/sales`);
    await lp.getByTestId('sd-stats').waitFor({ timeout: 20000 });
    check('light theme, on a laptop: it reads and fits', (await lp.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light' && await noOverflow(lp));
    await lp.screenshot({ path: path.join(shots, 'sales-dashboard-light.png'), fullPage: true });
  } finally {
    await browser.close();
    sql(`delete from crm.timeline_events where ref in (select 'visit:' || id from crm.sales_visits where customer_id in (select customer_id from crm.identities where external_id = '${(newCustomer ?? '').split('|')[0]}') or door_arrival_id = '${arrivalId}')`);
    sql(`delete from crm.sales_visits where door_arrival_id = '${arrivalId}' or customer_id in (select customer_id from crm.identities where source = 'inventory' and external_id = '${(newCustomer ?? 'none').split('|')[0]}')`);
    sql(`delete from crm.door_arrivals where id = '${arrivalId}'`);
    sql(`delete from crm.sales_visits where customer_id is null and door_arrival_id is null and started_at > now() - interval '2 hours'`);
    if (newCustomer) {
      const inv = newCustomer.split('|')[0];
      const cid = sql(`select customer_id from crm.identities where source = 'inventory' and external_id = '${inv}'`);
      if (cid) {
        for (const q of [`delete from crm.timeline_events where customer_id = '${cid}'`, `delete from crm.consents where customer_id = '${cid}'`, `delete from crm.balances where customer_id = '${cid}'`, `update crm.customers set profile_identity_id = null where id = '${cid}'`, `delete from crm.identities where customer_id = '${cid}'`, `delete from crm.merge_suggestions where customer_a_id = '${cid}' or customer_b_id = '${cid}'`, `delete from crm.customers where id = '${cid}'`]) { try { sql(q); } catch { /* fine */ } }
      }
      sql(`update customers set deleted_at = now(), phone = null where id = '${inv}'`);
    }
  }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
