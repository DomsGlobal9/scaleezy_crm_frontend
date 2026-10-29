/**
 * Changing offers and dates, deleting a customer, and the owner's Shop settings, in a real browser
 * (installed Edge), signed in for real. LOCAL database and local Inventory (4016) only: every change
 * goes through CRM to Inventory and is checked in Inventory's own table.
 *
 *   1. Dates: "Change" and "Add" beside them; the editor; Inventory's "That day does not exist"
 *      sentence; 29 Feb saved; the header shows it at once
 *   2. Offers: the answer at the top of the record; yes saved with who; STOP and no phone say why
 *   3. Delete (owner): More -> Delete; REMOVE needs the last 4 digits, then the customer is gone;
 *      blocked by store credit shows Inventory's sentence and only Close
 *   4. Sales: no More menu; Shop settings say they are the owner's
 *   5. Shop settings: the switch turns moved.profile on and off in Inventory
 *   6. On a phone: the page, the editor and the delete box fit
 *
 *   node scripts/verify-profile-ui.mjs      (CRM on 4008, the app on 5176, Inventory on 4016)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const backend = path.resolve(here, '..', '..', 'backend');
const SHOP = 'verify-suites-tenant';
const STAMP = String(Date.now() % 100000).padStart(5, '0');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
};
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const refresh = (ids) => execFileSync('npx', ['ts-node', '--transpile-only', 'src/scripts/support/refresh-customers.ts', ...ids], { cwd: backend, encoding: 'utf8', shell: true });

const made = [];
const phone = (n) => `+919002${STAMP}${n}`;
function customer(key, name, { phone: ph, stopped = false, credit = 0, birthday = null } = {}) {
  const id = `verify-profui-${STAMP}-${key}`;
  made.push(id);
  const p = ph === null ? 'NULL' : `'${ph ?? phone(made.length)}'`;
  sql(`INSERT INTO customers (id, client_id, customer_code, name, phone, birthday, status, customer_type, whatsapp_offers, whatsapp_stopped_at, loyalty_points, store_credit_paise, created_at, updated_at)
       VALUES ('${id}', '${SHOP}', 'PUI-${STAMP}-${key}', '${name}', ${p}, ${birthday ? `'${birthday}'` : 'NULL'}, 'ACTIVE', 'REGISTERED', false, ${stopped ? 'now()' : 'NULL'}, 0, ${credit}, now(), now())`);
  return id;
}
const crmIdOf = (id) => sql(`select customer_id from crm.identities where source = 'inventory' and external_id = '${id}'`);
const invField = (id, col) => sql(`select coalesce(${col}::text, '') from customers where id = '${id}'`);

function cleanup() {
  if (!made.length) return;
  const list = made.map(i => `'${i}'`).join(',');
  sql(`delete from audit_logs where client_id = '${SHOP}' and entity_id in (${list})`);
  sql(`delete from customers where client_id = '${SHOP}' and id in (${list})`);
  sql(`with c as (select customer_id from crm.identities where source = 'inventory' and external_id in (${list}))
       , d1 as (delete from crm.consents where customer_id in (select customer_id from c))
       , d2 as (delete from crm.timeline_events where customer_id in (select customer_id from c))
       , d3 as (delete from crm.balances where customer_id in (select customer_id from c))
       , d4 as (delete from crm.merge_suggestions where customer_a_id in (select customer_id from c) or customer_b_id in (select customer_id from c))
       , d5 as (delete from crm.audit_log where subject_id in (select customer_id from c))
       select 1`);
  sql(`with c as (select customer_id from crm.identities where source = 'inventory' and external_id in (${list})), d as (delete from crm.identities where source = 'inventory' and external_id in (${list})) delete from crm.customers where id in (select customer_id from c)`);
}

async function choose(page, label, option) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function main() {
  const a = customer('dates', `Prof UI ${STAMP}`, { birthday: '03-14' });
  const stop = customer('stop', `Prof Stop ${STAMP}`, { stopped: true });
  const nophone = customer('nophone', `Prof Nophone ${STAMP}`, { phone: null });
  const gone = customer('gone', `Prof Gone ${STAMP}`);
  const credit = customer('credit', `Prof Credit ${STAMP}`, { credit: 120000 });
  refresh(made);
  const id = (x) => crmIdOf(x);
  const movedBefore = sql(`select coalesce(moved->>'profile', '') from module_subscriptions where client_id = '${SHOP}' and module = 'crm'`);

  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const ownerToken = tokenFor('owner');
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.addCookies([{ name: 'token', value: ownerToken, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });

    console.log('\n1. Dates');
    await page.goto(`${APP}/customers/${id(a)}`);
    await page.getByTestId('profile').waitFor({ timeout: 20000 });
    const reach = page.locator('.cp-reach');
    check('the header says "Birthday 14 Mar" with Change, and Add for the anniversary',
      /Birthday 14 Mar/.test(await reach.innerText()) && await page.getByRole('button', { name: 'Change birthday' }).isVisible() && await page.getByRole('button', { name: 'Add anniversary' }).isVisible(), await reach.innerText());
    await page.getByRole('button', { name: 'Change birthday' }).click();
    const editor = page.getByTestId('dates-editor');
    await editor.waitFor();
    await choose(page, 'Birthday: day', '30');
    await choose(page, 'Birthday: month', 'February');
    await page.getByRole('button', { name: 'Save dates' }).click();
    const err = page.getByTestId('dates-error');
    await err.waitFor({ timeout: 15000 });
    check('30 February: Inventory\'s own sentence, shown as it comes', /That day does not exist\. Check the month and day\./.test(await err.innerText()), await err.innerText());
    check('...and nothing changed in Inventory', invField(a, 'birthday') === '03-14');
    await page.screenshot({ path: path.join(shots, 'profile-dates-error.png') });
    await choose(page, 'Birthday: day', '29');
    await choose(page, 'Anniversary: day', '2');
    await choose(page, 'Anniversary: month', 'November');
    await page.getByRole('button', { name: 'Save dates' }).click();
    await editor.waitFor({ state: 'detached', timeout: 15000 });
    await page.waitForFunction(() => /Birthday 29 Feb/.test(document.querySelector('.cp-reach')?.textContent ?? ''), null, { timeout: 15000 });
    check('29 Feb and 2 Nov are saved in Inventory', invField(a, 'birthday') === '02-29' && invField(a, 'anniversary') === '11-02', [invField(a, 'birthday'), invField(a, 'anniversary')]);
    check('...and the header shows them at once', /Birthday 29 Feb/.test(await reach.innerText()) && /Anniversary 2 Nov/.test(await reach.innerText()), await reach.innerText());

    console.log('\n2. WhatsApp offers');
    const chip = page.getByTestId('consent');
    check('the offers chip says "Change"', /Change/.test(await chip.innerText()), await chip.innerText());
    await chip.click();
    const answer = page.getByTestId('offers-answer');
    await answer.waitFor({ timeout: 15000 });
    check('the answer is at the top, "No offers" chosen, Save off until it changes',
      (await page.getByRole('radio', { name: /No offers/ }).getAttribute('aria-checked')) === 'true' && await page.getByTestId('offers-save').isDisabled());
    await page.getByRole('radio', { name: /Yes, send offers/ }).click();
    await page.getByTestId('offers-save').click();
    await page.getByText('Saved: they agreed to offers on WhatsApp.').waitFor({ timeout: 15000 });
    check('yes is saved in Inventory', invField(a, 'whatsapp_offers') === 'true');
    await page.getByText(/Last changed by Verification Owner on/).waitFor({ timeout: 10000 });
    check('...the box says who changed it last', true);
    await page.screenshot({ path: path.join(shots, 'profile-offers.png') });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => /WhatsApp offers: yes/.test(document.querySelector('[data-testid="consent"]')?.textContent ?? ''), null, { timeout: 15000 });
    check('the chip says yes at once', /WhatsApp offers: yes · taken by Verification Owner/.test(await chip.innerText()), await chip.innerText());

    await page.goto(`${APP}/customers/${id(stop)}`);
    await page.getByTestId('consent').click();
    const locked = page.getByTestId('offers-locked');
    await locked.waitFor({ timeout: 15000 });
    check('after STOP: why, and nothing to choose', /replied STOP on .*Only they can start them again, by messaging the shop\./.test(await locked.innerText()) && (await page.getByRole('radio').count()) === 0, await locked.innerText());
    await page.keyboard.press('Escape');
    await page.goto(`${APP}/customers/${id(nophone)}`);
    await page.getByTestId('consent').click();
    await locked.waitFor({ timeout: 15000 });
    check('no phone: why, and nothing to choose', /There is no phone number for them, so offers cannot be turned on\. Add one in Inventory first\./.test(await locked.innerText()), await locked.innerText());
    await page.keyboard.press('Escape');

    console.log('\n3. Delete (the owner)');
    await page.goto(`${APP}/customers/${id(gone)}`);
    await page.getByRole('button', { name: /More/ }).click();
    check('the menu says only the owner sees it', await page.getByText('Only the owner sees this.').isVisible());
    await page.getByRole('menuitem', { name: /Delete customer/ }).click();
    const dlg = page.getByTestId('delete-customer');
    await page.getByTestId('delete-what').waitFor({ timeout: 15000 });
    check('REMOVE: "deleted for good", with their try-ons and check-ins', /No bills, so they are deleted for good\./.test(await dlg.innerText()) && /is deleted from Inventory and CRM/.test(await dlg.innerText()), await dlg.innerText());
    const last4 = phone(made.indexOf(gone) + 1).slice(-4);
    check(`it asks for the last 4 digits (…${last4})`, (await dlg.innerText()).includes(`(…${last4})`));
    const go = page.getByTestId('delete-go');
    await page.getByTestId('delete-confirm').fill('0000');
    check('the button stays off until the digits match', await go.isDisabled());
    await page.screenshot({ path: path.join(shots, 'profile-delete.png') });
    await page.getByTestId('delete-confirm').fill(last4);
    await go.click();
    await page.waitForURL(/\/customers$/, { timeout: 20000 });
    await page.getByText(`Prof Gone ${STAMP} was deleted.`).waitFor({ timeout: 10000 });
    check('deleted: back on the list, with the sentence', true);
    check('...gone from Inventory', sql(`select count(*) from customers where id = '${gone}'`) === '0');
    check('...and forgotten in CRM', sql(`select name from crm.customers where id = '${id(gone)}'`) === 'Removed customer');

    await page.goto(`${APP}/customers/${id(credit)}`);
    await page.getByRole('button', { name: /More/ }).click();
    await page.getByRole('menuitem', { name: /Delete customer/ }).click();
    const blocked = page.getByTestId('delete-blocked');
    await blocked.waitFor({ timeout: 15000 });
    check('store credit: Inventory\'s sentence, and only Close', /store credit/.test(await blocked.innerText()) && (await dlg.locator('.pe-btns button').allInnerTexts()).join() === 'Close' && (await page.getByTestId('delete-go').count()) === 0, await blocked.innerText());
    await page.screenshot({ path: path.join(shots, 'profile-delete-blocked.png') });
    await page.keyboard.press('Escape');

    console.log('\n5. Shop settings');
    await page.getByRole('link', { name: /Shop settings/ }).click();
    await page.waitForURL(/\/settings$/);
    const sw = page.getByTestId('profile-switch');
    await sw.waitFor({ timeout: 15000 });
    const startOn = (await sw.getAttribute('aria-checked')) === 'true';
    await sw.click();
    await page.waitForFunction((want) => document.querySelector('[data-testid="profile-switch"]')?.getAttribute('aria-checked') === want, String(!startOn), { timeout: 15000 });
    check('the switch changes moved.profile in Inventory', sql(`select coalesce(moved->>'profile', '') from module_subscriptions where client_id = '${SHOP}' and module = 'crm'`) === String(!startOn));
    await page.screenshot({ path: path.join(shots, 'profile-settings.png') });
    await sw.click();
    await page.waitForFunction((want) => document.querySelector('[data-testid="profile-switch"]')?.getAttribute('aria-checked') === want, String(startOn), { timeout: 15000 });
    check('...and back', sql(`select coalesce(moved->>'profile', '') from module_subscriptions where client_id = '${SHOP}' and module = 'crm'`) === String(startOn));
    await ctx.close();

    console.log('\n4. Sales');
    const sctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await sctx.addCookies([{ name: 'token', value: tokenFor('sales'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const sp = await sctx.newPage();
    await sp.goto(`${APP}/customers/${id(a)}`);
    await sp.getByTestId('profile').waitFor({ timeout: 20000 });
    check('Sales can change dates, but has no More menu', await sp.getByRole('button', { name: 'Change birthday' }).isVisible() && (await sp.getByRole('button', { name: /^More/ }).count()) === 0);
    check('Sales\' name is not a link to Shop settings', (await sp.getByRole('link', { name: /Shop settings/ }).count()) === 0);
    await sp.goto(`${APP}/settings`);
    await sp.getByText('Only the shop owner can see these').waitFor({ timeout: 15000 });
    check('Shop settings tell Sales they are the owner\'s', true);
    await sctx.close();

    console.log('\n6. On a phone');
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await pctx.addCookies([{ name: 'token', value: ownerToken, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const pp = await pctx.newPage();
    await pp.goto(`${APP}/customers/${id(a)}`);
    await pp.getByTestId('profile').waitFor({ timeout: 20000 });
    check('the page fits', await noOverflow(pp));
    await pp.getByRole('button', { name: 'Change birthday' }).click();
    await pp.getByTestId('dates-editor').waitFor();
    check('the dates editor fits', await noOverflow(pp));
    await pp.screenshot({ path: path.join(shots, 'profile-dates-phone.png'), fullPage: true });
    await pp.getByRole('button', { name: 'Cancel' }).click();
    await pp.getByRole('button', { name: /More/ }).click();
    await pp.getByRole('menuitem', { name: /Delete customer/ }).click();
    await pp.getByTestId('delete-what').waitFor({ timeout: 15000 });
    const box = await pp.getByTestId('delete-customer').boundingBox();
    check('the delete box fits the screen', !!box && box.x >= 0 && box.x + box.width <= 390, box);
    await pp.screenshot({ path: path.join(shots, 'profile-delete-phone.png') });
    await pctx.close();
  } finally {
    await browser.close();
    if (movedBefore !== '') sql(`update module_subscriptions set moved = jsonb_set(coalesce(moved, '{}'::jsonb), '{profile}', '${movedBefore}'::jsonb) where client_id = '${SHOP}' and module = 'crm'`);
    cleanup();
  }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); try { cleanup(); } catch { /* already reported */ } process.exit(1); });
