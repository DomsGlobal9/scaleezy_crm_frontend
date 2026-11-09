/**
 * Win back regulars and the weekly limit, in a real browser (installed Edge), signed in for real, local
 * database only: the owner's switch, their offer (a bad one refused plainly), what the customer gets,
 * "No more than … a week", and "Won back" on This week. Sales staff do not see any of it.
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

async function main() {
  const before = sql(`select coalesce(winback_on::text, 'false') || '|' || coalesce(winback_offer, '') || '|' || weekly_limit from crm.message_settings where client_id = '${SHOP}'`);
  sql(`update crm.message_settings set winback_on = false, winback_offer = null, weekly_limit = 2 where client_id = '${SHOP}'`);
  // For This week: one regular sent a win-back this week, who then bought.
  const someone = sql(`select c.id from crm.customers c where c.client_id = '${SHOP}' and c.merged_into_id is null and c.removed_at is null and exists (select 1 from crm.identities i where i.customer_id = c.id) limit 1`);
  const identity = sql(`select id from crm.identities where customer_id = '${someone}' limit 1`);
  const camp = randomUUID(), rec = randomUUID(), bill = randomUUID();
  sql(`insert into crm.message_campaigns (id, client_id, kind, name, text, audience, audience_text, status, started_at, for_day, created_at, updated_at)
       values ('${camp}', '${SHOP}', 'winback', 'Win back regulars, ui check', 'x', '{}'::jsonb, '1 regular', 'done', now() - interval '2 hours', 'ui-check-${camp.slice(0, 8)}', now(), now())`);
  sql(`insert into crm.message_recipients (id, client_id, campaign_id, customer_id, state, handed_at, created_at)
       values ('${rec}', '${SHOP}', '${camp}', '${someone}', 'handed', now() - interval '2 hours', now())`);
  sql(`insert into crm.timeline_events (id, client_id, customer_id, identity_id, source, ref, kind, occurred_at, title, amount, counts_spend, created_at, updated_at)
       values ('${bill}', '${SHOP}', '${someone}', '${identity}', 'verify', 'wb-ui-${bill.slice(0, 8)}', 'bill', now() - interval '1 hour', 'Bill WB-UI', 6200, true, now(), now())`);

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
    check('what the customer gets, with the default offer and STOP', /Meena, we've missed you at your shop\. ₹500 off anything this month\. Show this message at the counter\. Reply STOP/.test(await preview.innerText()), await preview.innerText());

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

    // This week: "Won back".
    await page.goto(`${APP}/week`);
    const card = page.getByTestId('winback');
    await card.waitFor({ timeout: 20000 });
    const words = await card.innerText();
    check('This week: "Won back", sent and came back', /Won back/.test(words) && /1 regular was sent your offer\. 1 came back and bought\./.test(words), words);

    // Sales staff: no automatic messages to change.
    const sales = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await sales.addCookies([{ name: 'token', value: tokenFor('sales'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const sp = await sales.newPage();
    await sp.goto(`${APP}/settings`);
    await sp.waitForLoadState('networkidle');
    check('sales staff do not see the win-back switch', (await sp.getByTestId('winback-switch').count()) === 0);
  } finally {
    await browser.close();
    sql(`delete from crm.timeline_events where id = '${bill}'`);
    sql(`delete from crm.message_recipients where id = '${rec}'`);
    sql(`delete from crm.message_campaigns where id = '${camp}'`);
    const [on, off, lim] = before.split('|');
    sql(`update crm.message_settings set winback_on = ${on === 'true'}, winback_offer = ${off ? `'${off.replace(/'/g, "''")}'` : 'null'}, weekly_limit = ${Number(lim) || 2} where client_id = '${SHOP}'`);
  }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
