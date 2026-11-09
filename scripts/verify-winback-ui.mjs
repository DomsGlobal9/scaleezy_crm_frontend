/**
 * Win back regulars and the weekly limit, in a real browser (installed Edge), signed in for real, local
 * database only: the owner's switch, their offer (a bad one refused plainly), what the customer gets,
 * "Valid for", "No more than … a week", and "Won back" on This week. Sales staff do not see the settings.
 * The counter side: the offer and code on the customer's page (Sales sees it too), "Mark as given" with the
 * bill, gone once given, search by the code, and the count on Today.
 *
 *   node scripts/verify-winback-ui.mjs      (CRM on 4008, the app on 5176, local Inventory on 4016)
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

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
};
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const settings = () => sql(`select winback_on::text || '|' || coalesce(winback_offer, '') || '|' || weekly_limit from crm.message_settings where client_id = '${SHOP}'`);
const CODE = `UICHECK${String(Date.now() % 10000).padStart(4, '0')}`;

async function main() {
  const before = sql(`select coalesce(winback_on::text, 'false') || '|' || coalesce(winback_offer, '') || '|' || weekly_limit || '|' || winback_days from crm.message_settings where client_id = '${SHOP}'`);
  sql(`update crm.message_settings set winback_on = false, winback_offer = null, weekly_limit = 2, winback_days = 30 where client_id = '${SHOP}'`);
  // For This week: one regular sent a win-back this week, who then bought.
  const someone = sql(`select c.id from crm.customers c where c.client_id = '${SHOP}' and c.merged_into_id is null and c.removed_at is null and exists (select 1 from crm.identities i where i.customer_id = c.id) limit 1`);
  const identity = sql(`select id from crm.identities where customer_id = '${someone}' limit 1`);
  const camp = randomUUID(), rec = randomUUID(), bill = randomUUID(), rec2 = randomUUID(), offer2 = randomUUID();
  const CODE2 = `UISALES${String(Date.now() % 10000).padStart(4, '0')}`;
  sql(`insert into crm.message_campaigns (id, client_id, kind, name, text, audience, audience_text, status, started_at, for_day, created_at, updated_at)
       values ('${camp}', '${SHOP}', 'winback', 'Win back regulars, ui check', 'x', '{}'::jsonb, '1 regular', 'done', now() - interval '2 hours', 'ui-check-${camp.slice(0, 8)}', now(), now())`);
  sql(`insert into crm.message_recipients (id, client_id, campaign_id, customer_id, state, handed_at, created_at)
       values ('${rec}', '${SHOP}', '${camp}', '${someone}', 'handed', now() - interval '2 hours', now())`);
  const camp2 = randomUUID();
  sql(`insert into crm.message_campaigns (id, client_id, kind, name, text, audience, audience_text, status, started_at, for_day, created_at, updated_at)
       values ('${camp2}', '${SHOP}', 'winback', 'Win back regulars, ui check 2', 'x', '{}'::jsonb, '1 regular', 'done', now() - interval '20 days', 'ui-check-${camp2.slice(0, 8)}', now(), now())`);
  sql(`insert into crm.message_recipients (id, client_id, campaign_id, customer_id, state, handed_at, created_at)
       values ('${rec2}', '${SHOP}', '${camp2}', '${someone}', 'handed', now() - interval '20 days', now())`);
  sql(`insert into crm.timeline_events (id, client_id, customer_id, identity_id, source, ref, kind, occurred_at, title, amount, counts_spend, created_at, updated_at)
       values ('${bill}', '${SHOP}', '${someone}', '${identity}', 'verify', 'wb-ui-${bill.slice(0, 8)}', 'bill', now() - interval '1 hour', 'Bill WB-UI', 6200, true, now(), now())`);
  const offerId = randomUUID();
  sql(`insert into crm.winback_offers (id, client_id, customer_id, recipient_id, code, offer, valid_until, sent_at)
       values ('${offerId}', '${SHOP}', '${someone}', '${rec}', '${CODE}', '₹500 off anything.', to_char(now() + interval '30 days', 'YYYY-MM-DD'), now() - interval '2 hours')`);

  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.addCookies([{ name: 'token', value: tokenFor('owner'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });

    await page.goto(`${APP}/settings`);
    const box = page.getByTestId('automatic-messages');
    await box.waitFor({ timeout: 20000 });
    await page.getByTestId('winback-switch').waitFor({ timeout: 20000 });
    const text = await box.innerText();
    check('"Win back regulars" is in Automatic messages, with the shop\'s rule', /Win back regulars/.test(text) && /\d+\+ bills, not seen for \d+ days\. Once each/.test(text), text.slice(0, 300));
    const sw = page.getByTestId('winback-switch');
    check('off to start', (await sw.getAttribute('aria-checked')) === 'false');
    const preview = page.getByTestId('winback-preview');
    check('what the customer gets: the default offer, their code, how long, and STOP', /Meena, we've missed you at your shop\. ₹500 off anything\. Show this message at the counter\.\s+Code MEENA4821 · valid till 30 days from sending Reply STOP/.test(await preview.innerText()), await preview.innerText());
    const valid = page.getByRole('combobox', { name: 'How long the offer lasts' });
    check('"Valid for" shows 30 days', /30 days/.test(await valid.innerText()), await valid.innerText());
    await valid.click();
    await page.getByRole('option', { name: '45 days' }).click();
    await page.getByText('How long the offer lasts is saved.').waitFor({ timeout: 15000 });
    check('changed to 45 days, and saved', sql(`select winback_days from crm.message_settings where client_id = '${SHOP}'`) === '45');
    check('...and the team line is there', /Your staff see the offer and code on the customer's page/.test(await box.innerText()));

    // A bad offer: refused in plain words, nothing saved.
    const offer = page.getByTestId('winback-offer');
    await offer.fill('₹300 off at https://shop.example');
    await page.getByTestId('winback-save').click();
    const err = page.getByTestId('winback-error');
    await err.waitFor({ timeout: 15000 });
    check('an offer with a link: refused, plainly', /Leave links out of the offer/.test(await err.innerText()), await err.innerText());
    check('...and nothing saved', settings().split('|')[1] === '');
    await offer.fill('₹300 off any saree this month');
    await page.getByTestId('winback-save').click();
    await page.getByText('The offer is saved.').waitFor({ timeout: 15000 });
    check('a good offer is saved, with a full stop', settings().split('|')[1] === '₹300 off any saree this month.', settings());
    check('the preview shows the new offer', /₹300 off any saree this month\./.test(await preview.innerText()));
    check('the error has gone', (await err.count()) === 0);

    await sw.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="winback-switch"]')?.getAttribute('aria-checked') === 'true', null, { timeout: 15000 });
    check('switched on, and saved in CRM', settings().startsWith('true|'));

    // "No more than": the shared Select, never a native one.
    const limit = page.getByRole('combobox', { name: 'Offers per customer per week' });
    check('"No more than" shows 2 a week', /2 a week/.test(await limit.innerText()), await limit.innerText());
    check('it is the shop\'s own Select, not a native one', (await box.locator('select:not([aria-hidden="true"])').count()) === 0);
    await limit.click();
    await page.getByRole('option', { name: '3 a week' }).click();
    await page.getByText('The weekly limit is saved.').waitFor({ timeout: 15000 });
    check('changed to 3 a week, and saved', settings().endsWith('|3'), settings());
    await box.screenshot({ path: path.join(shots, 'winback-settings.png') });

    await sw.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="winback-switch"]')?.getAttribute('aria-checked') === 'false', null, { timeout: 15000 });
    check('...and off again', settings().startsWith('false|'));

    // Phone width: nothing runs off the side.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('winback-switch').scrollIntoViewIfNeeded();
    check('fits a phone screen', await noOverflow(page));
    await page.setViewportSize({ width: 1366, height: 900 });

    // Today: the count of offers out.
    await page.goto(`${APP}/today`);
    const todayCard = page.getByTestId('winback-today');
    await todayCard.waitFor({ timeout: 20000 });
    check('Today: "Win-back offers open" with a count, not a list', /Win-back offers open/.test(await todayCard.innerText()) && /\d+/.test(await todayCard.locator('strong').innerText()), await todayCard.innerText());

    // Search: the code from the customer's phone, in small letters.
    await page.goto(`${APP}/customers?q=${CODE.toLowerCase()}`);
    const hit = page.getByText(`Win-back code ${CODE}`).first();
    await hit.waitFor({ timeout: 20000 });
    check('searching the code finds them, saying why', (await hit.count()) === 1);

    // The customer's page: the offer and code, and "Mark as given" with the bill.
    await page.goto(`${APP}/customers/${someone}`);
    const offerBox = page.getByTestId('winback-offer');
    await offerBox.waitFor({ timeout: 20000 });
    const ob = await offerBox.innerText();
    check('their page: "Give them the win-back offer", the offer, the code, until when', /Give them the win-back offer/.test(ob) && /₹500 off anything/.test(ob) && ob.includes(CODE) && /valid till \d+ \w+/.test(ob), ob);
    await page.getByTestId('winback-give').click();
    const panel = page.getByTestId('winback-give-panel');
    await panel.waitFor({ timeout: 10000 });
    const billPick = page.getByRole('combobox', { name: 'The bill it was given on' });
    check('the bill since the message is picked for you', /WB-UI · ₹6,200/.test(await billPick.innerText()), await billPick.innerText());
    await offerBox.screenshot({ path: path.join(shots, 'winback-offer-customer.png') });
    await page.getByTestId('winback-give-confirm').click();
    await page.getByText('Marked as given.').waitFor({ timeout: 15000 });
    await page.waitForFunction(() => !document.querySelector('[data-testid="winback-offer"]'), null, { timeout: 15000 });
    check('given: the offer is gone from their page', (await page.getByTestId('winback-offer').count()) === 0);
    check('given with that bill, by the owner, in CRM', sql(`select (given_at is not null)::text || '|' || coalesce(given_bill_id, '') from crm.winback_offers where id = '${offerId}'`) === `true|${bill}`);
    await page.goto(`${APP}/customers/${someone}?tab=timeline`);
    await page.getByText(/Win-back ₹500 off anything · given with bill WB-UI ₹6,200/).first().waitFor({ timeout: 20000 }).catch(() => {});
    check('their timeline: "Win-back ₹500 off anything · given with bill WB-UI ₹6,200"', (await page.getByText(/Win-back ₹500 off anything · given with bill WB-UI ₹6,200/).count()) >= 1);

    // This week: "Won back", with the one used.
    await page.goto(`${APP}/week`);
    const card = page.getByTestId('winback');
    await card.waitFor({ timeout: 20000 });
    const words = await card.innerText();
    check('This week: sent, came back, and used on its bill', /Won back/.test(words) && /1 regular was sent your offer\. 1 came back and bought; 1 used the offer, on ₹6,200 of bills\./.test(words), words);

    // Sales staff: no automatic messages to change.
    const sales = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await sales.addCookies([{ name: 'token', value: tokenFor('sales'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const sp = await sales.newPage();
    await sp.goto(`${APP}/settings`);
    await sp.waitForLoadState('networkidle');
    check('sales staff do not see the win-back switch', (await sp.getByTestId('winback-switch').count()) === 0);
    // Sales at the counter: a second open offer, seen and given by Sales.
    sql(`insert into crm.winback_offers (id, client_id, customer_id, recipient_id, code, offer, valid_until, sent_at)
         values ('${offer2}', '${SHOP}', '${someone}', '${rec2}', '${CODE2}', '₹500 off anything.', to_char(now() + interval '30 days', 'YYYY-MM-DD'), now() - interval '1 hour')`);
    await sp.goto(`${APP}/customers/${someone}`);
    const salesBox = sp.getByTestId('winback-offer');
    await salesBox.waitFor({ timeout: 20000 });
    check('Sales sees the offer and code on the customer\'s page', (await salesBox.innerText()).includes(CODE2));
    await sp.getByTestId('winback-give').click();
    await sp.getByRole('combobox', { name: 'The bill it was given on' }).click();
    await sp.getByRole('option', { name: 'Not in the list yet' }).click();
    await sp.getByTestId('winback-give-confirm').click();
    await sp.getByText('Marked as given.').waitFor({ timeout: 15000 });
    check('Sales marks it given, the bill not in CRM yet', sql(`select (given_at is not null)::text || '|' || coalesce(given_bill_id, 'none') from crm.winback_offers where id = '${offer2}'`) === 'true|none');
    await sp.setViewportSize({ width: 390, height: 844 });
    await sp.goto(`${APP}/customers/${someone}`);
    await sp.waitForLoadState('networkidle');
    check('the customer page fits a phone', await noOverflow(sp));
  } finally {
    await browser.close();
    sql(`delete from crm.timeline_events where id = '${bill}' or ref in ('winback-given:${offerId}', 'winback-given:${offer2}')`);
    sql(`delete from crm.winback_offers where id in ('${offerId}', '${offer2}')`);
    sql(`delete from crm.audit_log where action = 'winback.given' and details->>'offerId' in ('${offerId}', '${offer2}')`);
    sql(`delete from crm.message_recipients where id = '${rec}'`);
    sql(`delete from crm.message_recipients where id = '${rec2}'`);
    sql(`delete from crm.message_campaigns where id in ('${camp}', '${camp2}')`);
    const [on, off, lim, days] = before.split('|');
    sql(`update crm.message_settings set winback_on = ${on === 'true'}, winback_offer = ${off ? `'${off.replace(/'/g, "''")}'` : 'null'}, weekly_limit = ${Number(lim) || 2}, winback_days = ${Number(days) || 30} where client_id = '${SHOP}'`);
  }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
