/**
 * Every new flow, end to end, through the screens of BOTH apps (19 Nov, the owner: "test everything through ui
 * every flow"): Inventory's app and CRM's, signed in for real, LOCAL only, as a shop would click.
 *
 *   1. Inventory → CRM, groups: Inventory's customer page shows groups read only, with "Change groups in CRM";
 *      it opens the same customer in CRM; a group made and joined there shows back in Inventory within moments;
 *      taken out in CRM, gone in Inventory. Inventory has no "Add to group" and no Customer groups settings.
 *   2. Campaigns and wishes are CRM's: Inventory's /campaigns says so and opens Messages in CRM; Inventory's
 *      Loyalty settings keep the birthday gift, with no wish switches, and say wishes are made in CRM.
 *   3. A message with a picture uploaded from the computer, to that group: made ready by CRM, kept by CRM,
 *      saved as a template, started, and WhatsApp handed the picture from CRM's own storage. Only who agreed.
 *   4. From the template: words and picture filled in. A product photo: copied into CRM. Copy of a sent message.
 *   5. Wishes in CRM: switched on and off from Messages, with the birthday points line explained.
 *   6. A phone: the new screens fit.
 *   node scripts/verify-cross-app-ui.mjs   (CRM 4008 + app 5176, Inventory 4016 + its app 5193, stand-in 4099)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CRM = process.env.CRM_APP_URL || 'http://localhost:5176';
const INV = process.env.INVENTORY_APP_URL || 'http://localhost:5193';
const CRM_API = 'http://localhost:4008/api/v1';
const STUB = 'http://localhost:4099';
const SHOP = 'verify-suites-tenant';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const backend = path.resolve(here, '..', '..', 'backend');
const STAMP = String(Date.now() % 100000).padStart(5, '0');
const GROUP = `Xapp ${STAMP}`;
const START = new Date().toISOString();
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)?.slice(0, 300)}`}`); if (!ok) failures += 1; };
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const ts = (script, args = []) => execFileSync('npx', ['ts-node', '--transpile-only', script, ...args], { cwd: backend, encoding: 'utf8', shell: true });
const token = execFileSync('npm', ['run', '--silent', 'login:test', '--', 'owner'], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const api = (method, p, body) => fetch(`${CRM_API}${p}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json());
const stub = async (p, body) => (await fetch(`${STUB}/_stub/${p}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// Three customers of the shop, made in Inventory: two said yes to offers.
const made = [];
const phone = (n) => `+919007${STAMP}${n}`;
function customer(n, name, agreed) {
  const id = randomUUID(); // Inventory's customer ids are uuids
  made.push(id);
  sql(`INSERT INTO customers (id, client_id, customer_code, name, phone, tags, status, customer_type, whatsapp_offers, whatsapp_offers_at, loyalty_points, store_credit_paise, created_at, updated_at)
       VALUES ('${id}', '${SHOP}', 'XAP-${STAMP}-${n}', '${name}', '${phone(n)}', '{}'::text[], 'ACTIVE', 'REGISTERED', ${agreed}, ${agreed ? "now() - interval '1 hour'" : 'NULL'}, 0, 0, now(), now())`);
  return id;
}
const invTags = (id) => sql(`select coalesce(array_to_string(tags, '|'), '') from customers where id = '${id}'`).split('|').filter(Boolean);

async function main() {
  fs.mkdirSync(shots, { recursive: true });
  await stub('reset', {});
  const A = customer(1, `Anjali Xapp${STAMP}`, true);
  const B = customer(2, `Bhargavi Xapp${STAMP}`, true);
  const C = customer(3, `Chandana Xapp${STAMP}`, false);
  ts('src/scripts/support/refresh-customers.ts', made);
  const crmId = (inv) => sql(`select customer_id from crm.identities where source = 'inventory' and external_id = '${inv}'`);

  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('scale_easy_theme', 'light'); } catch {} });
  await ctx.addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const errors = [];
  ctx.on('page', p => p.on('pageerror', e => errors.push(`${p.url()}: ${e.message}`)));
  let jpeg;
  try {
    const inv = await ctx.newPage();
    inv.on('pageerror', e => errors.push(`${inv.url()}: ${e.message}`));

    console.log('\n1. Inventory → CRM: groups');
    await inv.goto(`${INV}/customers/${A}`);
    const invCard = inv.locator('.card', { has: inv.getByRole('heading', { name: 'Groups', exact: true }) });
    await invCard.waitFor({ timeout: 30000 });
    check('Inventory\'s customer page: groups read only, "In no groups"', /In no groups/.test(await invCard.innerText()) && /made and changed in ScaleEzy CRM/.test(await invCard.innerText()));
    const link = invCard.getByRole('link', { name: 'Change groups in CRM' });
    check('..."Change groups in CRM" opens this customer in CRM', (await link.getAttribute('href')) === `${CRM}/customers/from/inventory/${A}`, await link.getAttribute('href'));
    await inv.screenshot({ path: path.join(shots, 'xapp-inventory-groups.png') });
    // It opens in a new tab (target=_blank): the same address, in a tab of its own.
    const crmTab = await ctx.newPage();
    await crmTab.goto(await link.getAttribute('href'));
    const card = crmTab.getByTestId('groups-card');
    await card.waitFor({ timeout: 30000 });
    check('...in CRM: the same customer\'s page, with the Groups card', new RegExp(`Anjali Xapp${STAMP}`).test(await crmTab.locator('main').innerText()) && /\/customers\/[0-9a-f-]{36}/.test(crmTab.url()), crmTab.url());
    await card.getByTestId('group-add').click();
    await card.getByTestId('group-new').click();
    await card.getByTestId('group-new-name').fill(GROUP);
    await card.getByTestId('group-new-make').click();
    await card.getByTestId('group-chip').filter({ hasText: GROUP }).waitFor({ timeout: 15000 });
    check('in CRM: a new group made from her page, and she is in it', true);
    await crmTab.goto(`${CRM}/customers/from/inventory/${B}`);
    await crmTab.getByTestId('groups-card').waitFor({ timeout: 30000 });
    await crmTab.getByTestId('groups-card').getByTestId('group-add').click();
    await crmTab.getByTestId('groups-card').getByTestId('group-choice').filter({ hasText: GROUP }).click();
    await crmTab.getByTestId('groups-card').getByTestId('group-chip').filter({ hasText: GROUP }).waitFor({ timeout: 15000 });
    await crmTab.goto(`${CRM}/customers/from/inventory/${C}`);
    await crmTab.getByTestId('groups-card').waitFor({ timeout: 30000 });
    await crmTab.getByTestId('groups-card').getByTestId('group-add').click();
    await crmTab.getByTestId('groups-card').getByTestId('group-choice').filter({ hasText: GROUP }).click();
    await crmTab.getByTestId('groups-card').getByTestId('group-chip').filter({ hasText: GROUP }).waitFor({ timeout: 15000 });
    check('...and Bhargavi and Chandana added from theirs', true);
    let shown = false;
    for (let i = 0; i < 12 && !shown; i++) {
      await inv.reload();
      await invCard.waitFor({ timeout: 30000 });
      shown = (await invCard.innerText()).includes(GROUP);
      if (!shown) await wait(1000);
    }
    check('back in Inventory: her page shows the group within moments', shown, await invCard.innerText());
    check('...and Inventory\'s own record has it (the till reads this)', invTags(A).includes(GROUP) && invTags(B).includes(GROUP), { A: invTags(A), B: invTags(B) });
    await inv.goto(`${INV}/customers`);
    await inv.waitForTimeout(2500);
    check('Inventory\'s customer list: no "Add to group"', (await inv.getByRole('button', { name: /Add to group/i }).count()) === 0);
    await inv.goto(`${INV}/settings`);
    await inv.waitForTimeout(2500);
    check('Inventory\'s Settings: no Customer groups section', (await inv.getByText('Customer groups', { exact: true }).count()) === 0);

    console.log('\n2. Campaigns and wishes are CRM\'s');
    // Campaigns and wishes are CRM's alone (19 Nov, the owner: "completely remove from Inventory, no confusion").
    await inv.goto(`${INV}/dashboard`);
    await inv.waitForTimeout(3000);
    const nav = await inv.locator('nav, aside, header').allInnerTexts();
    check('Inventory\'s menu has no Campaigns', !nav.some(t => /\bCampaigns?\b/i.test(t)), nav.join(' | ').slice(0, 300));
    await inv.goto(`${INV}/campaigns`);
    await inv.waitForTimeout(3000);
    const there = await inv.locator('main').innerText().catch(() => '');
    check('an old /campaigns address: no campaigns page, nothing about campaigns or CRM\'s Messages', !/campaign/i.test(there) && !/Open Messages in CRM/.test(there), { url: inv.url(), text: there.slice(0, 200) });
    await inv.screenshot({ path: path.join(shots, 'xapp-inventory-old-campaigns.png') });
    await inv.goto(`${INV}/settings?section=LOYALTY`);
    await inv.waitForTimeout(3000);
    const loyalty = await inv.locator('main').innerText();
    check('Inventory\'s Loyalty settings: only points, no wish switches, no messages wording', /Loyalty points/.test(loyalty) && !/wish|festival message|campaign/i.test(loyalty) && (await inv.getByRole('switch', { name: /wish/i }).count()) === 0, loyalty.slice(0, 400));
    const msgTab = await ctx.newPage();
    await msgTab.goto(`${CRM}/campaigns`);
    await msgTab.getByRole('heading', { name: /Campaigns/ }).first().waitFor({ timeout: 30000 });
    check('CRM\'s Messages: nothing about Inventory sending anything', !/from Inventory|still sent/i.test(await msgTab.locator('main').innerText()));
    await msgTab.close();

    console.log('\n3. A message with a picture from the computer, to the group');
    const page = crmTab;
    // A real photo, made by the browser itself: a JPEG the shop could have taken.
    const art = await browser.newPage({ viewport: { width: 600, height: 800 } });
    await art.setContent(`<body style="margin:0;background:linear-gradient(160deg,#164B1E,#A6D92B);font:bold 64px sans-serif;color:#fff;display:grid;place-items:center;height:800px">Silk week ${STAMP}</body>`);
    jpeg = path.join(shots, `xapp-${STAMP}.jpg`);
    await art.screenshot({ path: jpeg, type: 'jpeg', quality: 85 });
    await art.close();
    await page.goto(`${CRM}/campaigns/new`);
    await page.getByTestId('message-editor').waitFor({ timeout: 30000 });
    await page.getByLabel('Name (only the shop sees it)').fill(`Xapp silk week ${STAMP}`);
    await page.getByRole('combobox', { name: 'Who gets it' }).click();
    await page.getByRole('option', { name: `Customer group: ${GROUP}` }).click();
    await page.waitForFunction(() => /will get it/.test(document.querySelector('[data-testid="who"]')?.textContent ?? ''), null, { timeout: 15000 });
    const who = await page.getByTestId('who').innerText();
    check('the group made from customer pages is there to send to: 3 chosen, 2 will get it', /3 people chosen/.test(who) && /2 will get it/.test(who), who);
    await page.getByLabel('Message', { exact: true }).fill('Hi {name}, our new silk sarees are in. Come and see them. {shop}');
    await page.getByRole('button', { name: 'Add a picture' }).click();
    await page.getByTestId('picture-picker').getByTestId('pp-file').setInputFiles(jpeg);
    await page.getByTestId('picture-picker').waitFor({ state: 'detached', timeout: 30000 });
    const previewSrc = await page.locator('.ms-bub img, [data-testid="message-editor"] img').first().getAttribute('src');
    check('uploaded from the computer: CRM made it ready and keeps it (its own address)', /localhost:4008\/api\/v1\/pictures\/[0-9a-f]{32}\.jpg$/.test(previewSrc ?? ''), previewSrc);
    const file = await fetch(previewSrc);
    check('...the picture opens, a JPEG', file.status === 200 && file.headers.get('content-type') === 'image/jpeg');
    await page.screenshot({ path: path.join(shots, 'xapp-crm-editor.png') });
    await page.getByTestId('save-as-template').click();
    await page.getByTestId('template-name').fill(`Xapp template ${STAMP}`);
    await page.getByTestId('template-save').click();
    await page.getByTestId('save-template').waitFor({ state: 'detached', timeout: 15000 });
    check('saved as a template', true);
    await page.getByRole('button', { name: 'Save draft' }).click();
    await page.waitForURL(/\/campaigns\/[0-9a-f-]{36}$/, { timeout: 15000 });
    const sentId = page.url().split('/').pop();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, start sending' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent === 'Sending', null, { timeout: 15000 });
    ts('src/scripts/support/run-message-tick.ts');
    const sent = (await stub('messages')).filter(m => m.to.startsWith(`919007${STAMP}`));
    check('started: the two who agreed got it on WhatsApp; Chandana (no answer) did not', sent.length === 2 && !sent.some(m => m.to === phone(3).slice(1)), sent.map(m => m.to));
    check('...with the picture from CRM\'s own storage, and their own name', sent.every(m => m.image === previewSrc) && sent.some(m => m.text.startsWith('Hi Anjali,')), sent.map(m => [m.image, m.text.slice(0, 20)]));

    console.log('\n4. Ready-made templates, points, a list by points');
    await page.goto(`${CRM}/campaigns/new`);
    await page.getByTestId('start-from-template').click();
    const tplDialog = page.getByTestId('templates');
    await tplDialog.getByTestId('templates-starters').waitFor({ timeout: 15000 });
    const pointsStarter = tplDialog.getByTestId('template').filter({ hasText: 'Your points' });
    check('"Ready-made" templates are listed, and cannot be deleted', (await tplDialog.locator('[data-starter="yes"]').count()) === 5 && (await tplDialog.locator('[data-starter="yes"]').getByRole('button', { name: /Delete/ }).count()) === 0);
    await pointsStarter.getByTestId('template-use').click();
    await page.waitForTimeout(500);
    const bubbleText = await page.locator('.ms-bub').innerText();
    check('the "Your points" one: the preview fills {points} and {points_value} (1,250 points, worth ₹125)', /you have 1,250 points at .*worth ₹125/.test(bubbleText), bubbleText);
    check('...and the hint explains {points} and {points_value}', /\{points\} the loyalty points they have and \{points_value\} what those are worth/.test(await page.getByTestId('message-editor').innerText()));
    await page.goto(`${CRM}/segments/new`);
    const addRule = page.getByRole('combobox', { name: 'Add a rule' });
    await addRule.waitFor({ timeout: 20000 });
    await addRule.click();
    const option = page.getByRole('option', { name: 'Have at least … points' });
    check('a saved list can use "Have at least … points"', await option.isVisible({ timeout: 8000 }).catch(() => false));
    await option.click().catch(() => {});
    await page.waitForTimeout(1500);
    const listText = await page.locator('main').innerText();
    check('...chosen, the list says who: "have at least … points"', /have at least/i.test(listText) && /points/.test(listText), listText.slice(0, 300));

    console.log('\n5. From the template, a product photo, a copy');
    await page.goto(`${CRM}/campaigns/new`);
    await page.getByTestId('start-from-template').click();
    await page.getByTestId('templates').getByTestId('template').filter({ hasText: `Xapp template ${STAMP}` }).getByTestId('template-use').click();
    check('from the template: the words and the same picture filled in', /our new silk sarees are in/.test(await page.getByLabel('Message', { exact: true }).inputValue()) && (await page.locator(`img[src="${previewSrc}"]`).count()) > 0);
    await page.getByRole('button', { name: 'Remove the picture' }).click();
    await page.getByRole('button', { name: 'Add a picture' }).click();
    const picker = page.getByTestId('picture-picker');
    await picker.getByTestId('pp-tab-products').click();
    await picker.getByTestId('pp-photo').first().waitFor({ timeout: 20000 });
    const productSrc = await picker.getByTestId('pp-photo').first().locator('img').getAttribute('src');
    await picker.getByTestId('pp-photo').first().click();
    await picker.getByTestId('pp-use').click();
    const productAnswer = await picker.waitFor({ state: 'detached', timeout: 30000 }).then(() => 'used', async () => picker.getByTestId('pp-error').innerText().catch(() => 'no message'));
    const usedSrc = await page.locator(`[data-testid="message-editor"] img, .ms-bub img`).first().getAttribute('src').catch(() => null);
    check('a product photo: copied into CRM (or Inventory\'s plain answer when its file is not reachable locally)', (productAnswer === 'used' && usedSrc !== productSrc && /\/api\/v1\/pictures\//.test(usedSrc ?? '')) || /could not be loaded|not stored with ScaleEzy/.test(productAnswer), { productAnswer, usedSrc, productSrc });
    if (productAnswer !== 'used') await page.keyboard.press('Escape');
    await page.goto(`${CRM}/campaigns`);
    const row = page.getByTestId('message').filter({ hasText: `Xapp silk week ${STAMP}` });
    await row.waitFor({ timeout: 20000 });
    await row.getByTestId('message-copy').click();
    await page.waitForURL(u => /\/campaigns\/[0-9a-f-]{36}$/.test(String(u)) && !String(u).endsWith(sentId), { timeout: 15000 });
    check('Copy on the sent message: a new draft "Copy of …", with the picture', /Copy of Xapp silk week/.test(await page.getByTestId('message-detail').innerText()) && (await page.getByTestId('status').innerText()) === 'Draft');

    console.log('\n6. Wishes, in CRM');
    await page.goto(`${CRM}/campaigns`);
    await page.getByRole('tab', { name: 'Automatic' }).click();
    const wish = page.getByTestId('wish-birthday');
    await wish.waitFor({ timeout: 20000 });
    check('birthday wishes are under Messages in CRM, explaining the points line, nothing about Inventory', /birthday points/.test(await wish.innerText()) && !/from Inventory|move here/i.test(await page.locator('main').innerText()));
    const wasOn = (await wish.getByRole('switch').getAttribute('aria-checked')) === 'true';
    await wish.getByRole('switch').click();
    await page.waitForFunction((want) => document.querySelector('[data-testid="wish-birthday"] [role="switch"]')?.getAttribute('aria-checked') === want, String(!wasOn), { timeout: 15000 });
    check('the owner switches birthday wishes ' + (wasOn ? 'off' : 'on') + ' here', true);
    await wish.getByRole('switch').click();
    await page.waitForFunction((want) => document.querySelector('[data-testid="wish-birthday"] [role="switch"]')?.getAttribute('aria-checked') === want, String(wasOn), { timeout: 15000 });
    check('...and back as it was', true);

    console.log('\n7. Taken out in CRM, gone in Inventory');
    await page.goto(`${CRM}/customers/from/inventory/${A}`);
    const cardA = page.getByTestId('groups-card');
    await cardA.waitFor({ timeout: 30000 });
    await cardA.getByTestId('group-chip').filter({ hasText: GROUP }).getByTestId('group-out').click();
    await cardA.getByTestId('group-chip').filter({ hasText: GROUP }).waitFor({ state: 'detached', timeout: 15000 });
    let gone = false;
    for (let i = 0; i < 12 && !gone; i++) {
      await inv.goto(`${INV}/customers/${A}`);
      await invCard.waitFor({ timeout: 30000 });
      gone = !(await invCard.innerText()).includes(GROUP);
      if (!gone) await wait(1000);
    }
    check('her Inventory page no longer shows the group', gone);

    console.log('\n8. A phone');
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await phoneCtx.addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const ph = await phoneCtx.newPage();
    await ph.goto(`${CRM}/customers/from/inventory/${B}`);
    await ph.getByRole('tab', { name: 'Follow-ups & groups' }).click();
    await ph.getByTestId('groups-card').waitFor({ timeout: 30000 });
    check('phone, CRM customer page with the Groups card: nothing scrolls sideways', await noOverflow(ph));
    await ph.screenshot({ path: path.join(shots, 'xapp-phone-groups.png') });
    await ph.goto(`${INV}/customers/${B}`);
    await ph.getByRole('heading', { name: 'Groups', exact: true }).waitFor({ timeout: 30000 });
    check('phone, Inventory\'s customer page with its read-only groups: nothing scrolls sideways', await noOverflow(ph));
    await phoneCtx.close();

    check('no page error in either app', errors.length === 0, errors.slice(0, 5));
  } finally {
    await browser.close();
    const list = made.map(i => `'${i}'`).join(',');
    sql(`delete from crm.message_recipients where campaign_id in (select id from crm.message_campaigns where client_id = '${SHOP}' and created_at >= '${START}')`);
    sql(`delete from crm.message_campaigns where client_id = '${SHOP}' and created_at >= '${START}'`);
    sql(`delete from crm.message_templates where client_id = '${SHOP}' and name like 'Xapp template ${STAMP}%'`);
    const groups = (await api('GET', '/groups')).data ?? [];
    for (const g of groups) if (g.name === GROUP) await api('DELETE', `/groups/${encodeURIComponent(g.key)}`);
    sql(`with c as (select customer_id from crm.identities where source = 'inventory' and external_id in (${list})) select 1`);
    sql(`delete from customers where client_id = '${SHOP}' and id in (${list})`);
    if (jpeg) fs.rmSync(jpeg, { force: true });
  }
  console.log(failures ? `\n${failures} cross-app UI check(s) FAILED.` : '\nAll cross-app UI checks passed.');
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
