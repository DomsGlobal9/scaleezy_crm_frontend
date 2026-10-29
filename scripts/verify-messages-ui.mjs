/**
 * Messages (Phase 3) in a real browser (installed Edge), signed in for real. LOCAL database, local
 * Inventory (4016) and the stand-in WhatsApp Service (4099) only.
 *
 *   1. Messages in the sidebar; the three facts; "still sent from Inventory" until the owner moves them
 *   2. Shop settings: the owner moves campaigns to CRM
 *   3. A new message: who gets it, and who is left out and why; the words, a link, the bubble; saved as a draft
 *   4. Its page: a test to the shop's own number; Start asks first; sent; the numbers
 *   5. A note to one customer from their page
 *   6. Automatic: birthday wishes switched on
 *   7. Sales: no Messages, but a note to one customer
 *   8. On a phone: the list, the editor and a message's page fit
 *
 *   node scripts/verify-messages-ui.mjs      (CRM on 4008, the app on 5176, Inventory on 4016, stand-in on 4099)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const STUB = 'http://localhost:4099';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const backend = path.resolve(here, '..', '..', 'backend');
const SHOP = 'verify-suites-tenant';
const STAMP = String(Date.now() % 100000).padStart(5, '0');
const GROUP = `MsgUi${STAMP}`;
const START = new Date().toISOString();

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
};
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const ts = (script, args = []) => execFileSync('npx', ['ts-node', '--transpile-only', script, ...args], { cwd: backend, encoding: 'utf8', shell: true });
const stub = async (p, body) => (await fetch(`${STUB}/_stub/${p}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();

const made = [];
const phone = (n) => `+919004${STAMP}${n}`;
function customer(n, name, { agreed = false, tags = [GROUP] } = {}) {
  const id = `verify-msgui-${STAMP}-${n}`;
  made.push(id);
  sql(`INSERT INTO customers (id, client_id, customer_code, name, phone, tags, status, customer_type, whatsapp_offers, whatsapp_offers_at, loyalty_points, store_credit_paise, created_at, updated_at)
       VALUES ('${id}', '${SHOP}', 'MUI-${STAMP}-${n}', '${name}', '${phone(n)}', ARRAY[${tags.map(t => `'${t}'`).join(',')}]::text[], 'ACTIVE', 'REGISTERED', ${agreed}, ${agreed ? "now() - interval '1 hour'" : 'NULL'}, 0, 0, now(), now())`);
  return id;
}
const crmIdOf = (id) => sql(`select customer_id from crm.identities where source = 'inventory' and external_id = '${id}'`);

function cleanup(movedBefore) {
  const list = made.map(i => `'${i}'`).join(',') || "''";
  sql(`delete from crm.message_campaigns where client_id = '${SHOP}' and created_at >= '${START}'`);
  sql(`with c as (select customer_id from crm.identities where source = 'inventory' and external_id in (${list}))
       , d1 as (delete from crm.consents where customer_id in (select customer_id from c))
       , d2 as (delete from crm.timeline_events where customer_id in (select customer_id from c))
       , d3 as (delete from crm.balances where customer_id in (select customer_id from c))
       , d4 as (delete from crm.merge_suggestions where customer_a_id in (select customer_id from c) or customer_b_id in (select customer_id from c))
       select 1`);
  sql(`with c as (select customer_id from crm.identities where source = 'inventory' and external_id in (${list})), d as (delete from crm.identities where source = 'inventory' and external_id in (${list})) delete from crm.customers where id in (select customer_id from c)`);
  sql(`delete from crm.audit_log where client_id = '${SHOP}' and at >= '${START}' and (action like 'message.%' or action in ('shop.moved', 'wishes.changed'))`);
  sql(`delete from audit_logs where client_id = '${SHOP}' and created_at >= '${START}' and entity_type = 'CRM_HANDOVER'`);
  sql(`delete from customers where client_id = '${SHOP}' and id in (${list})`);
  sql(`delete from customer_groups where client_id = '${SHOP}' and key = '${GROUP.toLowerCase()}'`);
  sql(`update module_subscriptions set moved = '${movedBefore || '{}'}'::jsonb where client_id = '${SHOP}' and module = 'crm'`);
}

async function main() {
  const movedBefore = sql(`select moved::text from module_subscriptions where client_id = '${SHOP}' and module = 'crm'`);
  const hadSettings = sql(`select count(*) from crm.message_settings where client_id = '${SHOP}'`) !== '0';
  await stub('reset', {});
  sql(`INSERT INTO customer_groups (id, client_id, name, key, no_offer_messages, no_wishes, created_at, updated_at) VALUES ('${randomUUID()}', '${SHOP}', '${GROUP}', '${GROUP.toLowerCase()}', false, false, now(), now())`);
  const A = customer(1, `Anitha Ui${STAMP}`, { agreed: true });
  customer(2, `Bhavani Ui${STAMP}`, { agreed: true });
  customer(3, `Chitra Ui${STAMP}`);
  const H = customer(4, `Hema Ui${STAMP}`, { agreed: true, tags: [] });
  ts('src/scripts/support/refresh-customers.ts', made);

  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const ownerToken = tokenFor('owner');
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.addCookies([{ name: 'token', value: ownerToken, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });

    console.log('\n1. Messages');
    await page.goto(`${APP}/today`);
    await page.getByRole('link', { name: 'Messages' }).click();
    await page.waitForURL(/\/messages$/);
    await page.getByTestId('fact-whatsapp').waitFor({ timeout: 20000 });
    check('the three facts: linked, who agreed, how fast', /linked/.test(await page.getByTestId('fact-whatsapp').innerText()) && /agreed to offers/.test(await page.getByTestId('fact-agreed').innerText()) && /a day, 10 am to 8 pm/.test(await page.getByTestId('fact-pace').innerText()));
    check('"still sent from Inventory", with the way to Shop settings', /still sent from Inventory/.test(await page.getByTestId('not-moved').innerText()));

    console.log('\n2. Shop settings');
    await page.getByTestId('not-moved').getByRole('link', { name: 'Shop settings' }).click();
    const sw = page.getByTestId('campaigns-switch');
    await sw.waitFor({ timeout: 15000 });
    await sw.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="campaigns-switch"]')?.getAttribute('aria-checked') === 'true', null, { timeout: 15000 });
    check('the owner moves campaigns: Inventory records it', sql(`select coalesce(moved->>'campaigns', '') from module_subscriptions where client_id = '${SHOP}' and module = 'crm'`) === 'true');
    await page.screenshot({ path: path.join(shots, 'messages-settings.png') });

    console.log('\n3. A new message');
    await page.goto(`${APP}/messages`);
    await page.getByRole('link', { name: 'New message' }).click();
    await page.getByTestId('message-editor').waitFor();
    await page.getByLabel('Name (only the shop sees it)').fill('Diwali silk week');
    await page.getByRole('combobox', { name: 'Who gets it' }).click();
    await page.getByRole('option', { name: `Customer group: ${GROUP}` }).click();
    const who = page.getByTestId('who');
    await page.waitForFunction(() => /will get it/.test(document.querySelector('[data-testid="who"]')?.textContent ?? ''), null, { timeout: 15000 });
    check('who gets it: 3 chosen, 2 will get it, 1 has not agreed', /3 people chosen/.test(await who.innerText()) && /2 will get it/.test(await who.innerText()) && /1 have not agreed/.test(await who.innerText()), await who.innerText());
    await page.getByLabel('Message', { exact: true }).fill('Hi {name}, our Diwali silk week starts Friday.');
    await page.getByRole('button', { name: 'Add a link' }).click();
    await page.getByLabel("The page's address").fill('https://example.com/silk');
    const bubble = page.locator('.ms-bub');
    check('the bubble shows what Meena sees, the link and the STOP line', /Hi Meena, our Diwali silk week starts Friday\. shop\.link/.test(await bubble.innerText()) && /Reply STOP to stop these messages/.test(await bubble.innerText()), await bubble.innerText());
    await page.screenshot({ path: path.join(shots, 'messages-editor.png') });
    await page.getByRole('button', { name: 'Save draft' }).click();
    await page.waitForURL(/\/messages\/[0-9a-f-]{36}$/, { timeout: 15000 });
    const detail = page.getByTestId('message-detail');
    await detail.waitFor();
    check('saved as a draft, on its own page', (await page.getByTestId('status').innerText()) === 'Draft');

    console.log('\n4. Test, start, sent');
    await page.getByRole('button', { name: 'Send me a test' }).click();
    await page.getByText(/Test sent to the shop's own number, ending 2338\./).waitFor({ timeout: 15000 });
    check('a test goes to the shop\'s own number', (await stub('messages')).some(m => m.to === '919848022338' && m.text.startsWith('[Test]')));
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    check('Start asks first', await page.getByRole('button', { name: 'Yes, start sending' }).isVisible());
    await page.screenshot({ path: path.join(shots, 'messages-start.png') });
    await page.getByRole('button', { name: 'Yes, start sending' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent === 'Sending', null, { timeout: 15000 });
    ts('src/scripts/support/run-message-tick.ts');
    const sent = (await stub('messages')).filter(m => m.to.startsWith(`919004${STAMP}`));
    check('the two who agreed got it; Chitra did not', sent.length === 2 && sent.every(m => /\/l\/[A-Za-z0-9]{7}/.test(m.text)) && !sent.some(m => m.to === phone(3).slice(1)), sent.map(m => m.to));
    await page.reload();
    await page.getByTestId('stats').waitFor({ timeout: 15000 });
    await page.waitForFunction(() => /2\s*sent of 2/.test(document.querySelector('[data-testid="stats"]')?.textContent ?? ''), null, { timeout: 15000 });
    check('its page: 2 sent of 2', true);
    await page.screenshot({ path: path.join(shots, 'messages-detail.png') });
    await page.getByRole('link', { name: 'All messages' }).click();
    const row = page.getByTestId('message').filter({ hasText: 'Diwali silk week' });
    await row.waitFor({ timeout: 15000 });
    check('the list shows it with its numbers', /2 sent/.test(await row.innerText()), await row.innerText());
    await page.screenshot({ path: path.join(shots, 'messages-list.png') });

    console.log('\n5. A note to one customer');
    await page.goto(`${APP}/customers/${crmIdOf(H)}`);
    await page.getByTestId('message-one').click();
    await page.getByTestId('send-one').waitFor();
    await page.getByRole('textbox', { name: /Message to Hema/ }).fill('Hi Hema, your blouse is ready to try.');
    await page.getByTestId('send-one').getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByText('Sent to Hema on WhatsApp.').waitFor({ timeout: 15000 });
    check('sent at once, on WhatsApp', (await stub('messages')).some(m => m.to === phone(4).slice(1) && /blouse is ready/.test(m.text)));
    await page.goto(`${APP}/customers/${crmIdOf(A)}`);
    await page.getByTestId('profile').waitFor({ timeout: 15000 });
    check('Anitha (who just had an offer) still shows Message: the 3-day rule answers at Send', await page.getByTestId('message-one').isVisible());
    await page.getByTestId('message-one').click();
    await page.getByRole('textbox', { name: /Message to Anitha/ }).fill('One more thing');
    await page.getByTestId('send-one').getByRole('button', { name: 'Send', exact: true }).click();
    const err = page.getByTestId('send-one').getByRole('alert');
    await err.waitFor({ timeout: 15000 });
    check('...and says why, plainly', /last 3 days/.test(await err.innerText()), await err.innerText());
    await page.keyboard.press('Escape');

    console.log('\n6. Automatic');
    await page.goto(`${APP}/messages?tab=automatic`);
    const bday = page.getByTestId('wish-birthday');
    await bday.waitFor({ timeout: 15000 });
    const bSwitch = bday.getByRole('switch');
    const wasOn = (await bSwitch.getAttribute('aria-checked')) === 'true';
    await bSwitch.click();
    await page.waitForFunction((want) => document.querySelector('[data-testid="wish-birthday"] [role="switch"]')?.getAttribute('aria-checked') === want, String(!wasOn), { timeout: 15000 });
    check('birthday wishes switch on and off, and say what happens', /from 10 am|Switch on to send/.test(await bday.innerText()));
    await page.screenshot({ path: path.join(shots, 'messages-automatic.png') });
    await ctx.close();

    console.log('\n7. Sales');
    const sctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await sctx.addCookies([{ name: 'token', value: tokenFor('sales'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const sp = await sctx.newPage();
    await sp.goto(`${APP}/customers/${crmIdOf(H)}`);
    await sp.getByTestId('profile').waitFor({ timeout: 20000 });
    check('Sales has no Messages in the sidebar', (await sp.getByRole('link', { name: 'Messages' }).count()) === 0);
    check('...but can message one customer', await sp.getByTestId('message-one').isVisible());
    await sp.goto(`${APP}/messages`);
    await sp.getByText('Messages are not part of your role').waitFor({ timeout: 15000 });
    check('...and Messages says it is not part of their role', true);
    await sctx.close();

    console.log('\n8. On a phone');
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await pctx.addCookies([{ name: 'token', value: ownerToken, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const pp = await pctx.newPage();
    await pp.goto(`${APP}/messages`);
    await pp.getByTestId('message').first().waitFor({ timeout: 20000 });
    check('the list fits', await noOverflow(pp));
    await pp.screenshot({ path: path.join(shots, 'messages-list-phone.png'), fullPage: true });
    await pp.goto(`${APP}/messages/new`);
    await pp.getByTestId('message-editor').waitFor();
    check('the editor fits', await noOverflow(pp));
    await pp.screenshot({ path: path.join(shots, 'messages-editor-phone.png'), fullPage: true });
    await pctx.close();
  } finally {
    await browser.close();
    if (!hadSettings) sql(`delete from crm.message_settings where client_id = '${SHOP}'`);
    cleanup(movedBefore);
    await stub('reset', {});
  }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
