/**
 * The Groups card on a customer's page (18 Nov, the approved mockup), in a real browser (installed Edge), signed
 * in for real, LOCAL only. Inventory's "Change groups in CRM" button opens this page.
 *   their groups shown ("auto" when the rule added them); add from the list (with counts); the till's copy
 *   follows; × takes out at once, or asks first naming the offer aimed at the group; Keep leaves them in;
 *   make a new group and add them (owner); 20 groups: said plainly; HTML in a name is text; Escape and a click
 *   away close the list; Sales adds and takes out but cannot make groups; the warehouse only sees; a phone fits
 *   node scripts/verify-customer-groups-ui.mjs      (CRM on 4008, the app on 5176, Inventory on 4016)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const API = 'http://localhost:4008';
const SHOP = 'verify-suites-tenant';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const backend = path.resolve(here, '..', '..', 'backend');
const STAMP = `CG${Date.now() % 100000}`;
let failures = 0;
const check = (name, ok, detail) => { if (ok) console.log(`PASS  ${name}`); else { failures += 1; console.log(`FAIL  ${name}${detail === undefined ? '' : `  -- ${JSON.stringify(detail)?.slice(0, 300)}`}`); } };
const tokens = {};
const tokenFor = (who) => (tokens[who] ??= execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim());
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const api = async (method, p, body) => (await fetch(`${API}/api/v1${p}`, { method, headers: { Authorization: `Bearer ${tokenFor('owner')}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(250); } return false; }

async function as(browser, who, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => { try { localStorage.setItem('scale_easy_theme', 'light'); } catch {} });
  await ctx.addCookies([{ name: 'token', value: tokenFor(who), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  page.on('dialog', d => { console.log('      a dialog opened (HTML ran?):', d.message()); failures += 1; d.dismiss().catch(() => {}); });
  return { ctx, page };
}

async function main() {
  fs.mkdirSync(shots, { recursive: true });
  // A customer known to CRM and Inventory, so the till's copy can be checked.
  const row = sql(`select c.id || '|' || c.name || '|' || i.external_id from crm.customers c join crm.identities i on i.customer_id = c.id and i.source = 'inventory' and i.removed_at is null
    join customers ic on ic.id = i.external_id and ic.deleted_at is null where c.client_id = '${SHOP}' and c.merged_into_id is null and c.removed_at is null and c.name like 'Anitha%' limit 1`);
  const [cid, cname, invId] = row.split('|');
  const first = cname.split(/\s+/)[0];
  const tagsBefore = sql(`select coalesce(array_to_string(tags, '|'), '') from crm.customers where id = '${cid}'`);
  const G1 = `${STAMP} Silk lovers`, G2 = `${STAMP} VIP`, XSS = `${STAMP} <img src=x onerror=alert(1)>`;
  for (const n of [G1, G2, XSS]) await api('POST', '/groups', { name: n });
  const OFFER = randomUUID();
  sql(`insert into offers (id, client_id, offer_code, name, value_type, value, starts_at, status, customer_tags, updated_at) values ('${OFFER}', '${SHOP}', '${STAMP}', '${STAMP} VIP 10% off', 'PERCENTAGE', 10, now(), 'ACTIVE', ARRAY['${G2}'], now())`);
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { ctx, page } = await as(browser, 'owner');
    await page.goto(`${APP}/customers/${cid}`);
    const card = page.getByTestId('groups-card');
    await card.waitFor({ timeout: 30000 });
    check('the Groups card is on the customer page, beside Follow-ups', (await page.getByTestId('work-card').getByTestId('groups-card').count()) === 1);
    check('"Used at the till for offers"', /Used at the till for offers/.test(await card.innerText()));

    await card.getByTestId('group-add').click();
    await card.getByTestId('group-menu').waitFor();
    await card.getByTestId('group-choice').first().waitFor({ timeout: 15000 });
    const opts = await card.getByTestId('group-choice').allInnerTexts();
    check('"Add to a group" lists the groups with how many are in each', opts.some(t => t.includes(G1) && /\d+ customers?/.test(t)), opts.filter(t => t.includes(STAMP)));
    check('the owner sees "Make a new group…"', (await card.getByTestId('group-new').count()) === 1);
    await page.keyboard.press('Escape');
    check('Escape closes the list', (await card.getByTestId('group-menu').count()) === 0);
    await card.getByTestId('group-add').click();
    await page.mouse.click(10, 10);
    check('a click away closes it too', (await card.getByTestId('group-menu').count()) === 0);

    await card.getByTestId('group-add').click();
    await card.getByTestId('group-choice').filter({ hasText: G1 }).click();
    await card.getByTestId('group-chip').filter({ hasText: G1 }).waitFor({ timeout: 10000 });
    check('added: the group shows on their page at once', true);
    const tillHas = await until(async () => sql(`select coalesce(array_to_string(tags, '|'), '') from customers where id = '${invId}'`).split('|').includes(G1));
    check('...and the till\'s copy in Inventory has it within moments', tillHas, sql(`select tags from customers where id = '${invId}'`));
    await card.getByTestId('group-add').click();
    check('...and it is no longer offered in the list', !(await card.getByTestId('group-choice').allInnerTexts()).some(t => t.includes(G1)));
    await card.getByTestId('group-choice').filter({ hasText: G2 }).click();
    await card.getByTestId('group-chip').filter({ hasText: G2 }).waitFor({ timeout: 10000 });
    await card.getByTestId('group-add').click();
    await card.getByTestId('group-choice').filter({ hasText: `${STAMP} <img` }).click();
    const xssChip = card.getByTestId('group-chip').filter({ hasText: `${STAMP} <img` });
    await xssChip.waitFor({ timeout: 10000 });
    check('a group named with HTML shows as text, nothing runs', (await xssChip.locator('img').count()) === 0);
    await page.screenshot({ path: path.join(shots, 'customer-groups-card.png') });

    // × on a group no offer is aimed at: out at once.
    await card.getByTestId('group-chip').filter({ hasText: G1 }).getByTestId('group-out').click();
    await until(async () => (await card.getByTestId('group-chip').filter({ hasText: G1 }).count()) === 0);
    check('× on a group with no offer: taken out at once', (await card.getByTestId('group-chip').filter({ hasText: G1 }).count()) === 0);
    // × on a group a live offer is aimed at: asks, naming the offer; Keep leaves them in.
    await card.getByTestId('group-chip').filter({ hasText: G2 }).getByTestId('group-out').click();
    const ask = card.getByTestId('group-out-ask');
    await ask.waitFor({ timeout: 10000 });
    check('× on a group an offer is aimed at: asks first, naming the offer and what it means at the till', new RegExp(`Take ${first} out of ${STAMP} VIP\\?[\\s\\S]*"${STAMP} VIP 10% off" will no longer apply to ${first} at the till`).test(await ask.innerText()), await ask.innerText());
    await ask.getByRole('button', { name: /Keep/ }).click();
    check('"Keep … in": still in, nothing changed', (await card.getByTestId('group-chip').filter({ hasText: G2 }).count()) === 1 && (await card.getByTestId('group-out-ask').count()) === 0);
    await page.screenshot({ path: path.join(shots, 'customer-groups-ask.png') });
    await card.getByTestId('group-chip').filter({ hasText: G2 }).getByTestId('group-out').click();
    await card.getByTestId('group-out-yes').click();
    await until(async () => (await card.getByTestId('group-chip').filter({ hasText: G2 }).count()) === 0);
    check('"Take out": gone', (await card.getByTestId('group-chip').filter({ hasText: G2 }).count()) === 0);

    // "auto": the spending rule added them.
    sql(`update crm.customer_groups set auto_added = array_append(auto_added, '${cid}') where client_id = '${SHOP}' and name = '${G1}'`);
    await api('POST', '/groups/members', { group: G1, customerIds: [cid] }); // by hand: not auto
    await page.reload(); await card.waitFor();
    check('added by hand: no "auto"', !/auto/.test(await card.getByTestId('group-chip').filter({ hasText: G1 }).innerText()));
    sql(`update crm.customer_groups set auto_added = array_append(auto_added, '${cid}') where client_id = '${SHOP}' and name = '${G1}'`);
    await page.reload(); await card.waitFor();
    check('added by the spending rule: "auto", and the note says what it means', /auto/.test(await card.getByTestId('group-chip').filter({ hasText: G1 }).innerText()) && /spending rule added them/.test(await card.innerText()));

    // Make a new group and add them to it.
    await card.getByTestId('group-add').click();
    await card.getByTestId('group-new').click();
    await card.getByTestId('group-new-name').fill(`${STAMP} Wedding 2026`);
    await card.getByTestId('group-new-make').click();
    await card.getByTestId('group-chip').filter({ hasText: `${STAMP} Wedding 2026` }).waitFor({ timeout: 10000 });
    check('"Make a new group": made, and they are in it', true);
    await card.getByTestId('group-add').click();
    await card.getByTestId('group-new').click();
    await card.getByTestId('group-new-name').fill(G1.toUpperCase());
    await card.getByTestId('group-new-make').click();
    const dup = await card.getByTestId('groups-said').innerText({ timeout: 10000 }).catch(() => '');
    check('making a group that exists (other capitals): said plainly', /already a group called/.test(dup), dup);
    await page.keyboard.press('Escape');

    // 20 groups already.
    const full = Array.from({ length: 20 }, (_, i) => `${STAMP} t${i}`);
    sql(`update crm.customers set tags = ARRAY[${full.map(t => `'${t}'`).join(',')}] where id = '${cid}'`);
    await page.reload(); await card.waitFor();
    await card.getByTestId('group-add').click();
    await card.getByTestId('group-choice').filter({ hasText: G2 }).click();
    const said = await card.getByTestId('groups-said').innerText({ timeout: 10000 }).catch(() => '');
    check('someone in 20 groups: "in 20 groups already", not added', /in 20 groups already/.test(said), said);
    sql(`update crm.customers set tags = ${tagsBefore ? `string_to_array('${tagsBefore}', '|')` : `'{}'`} where id = '${cid}'`);
    await ctx.close();

    const sales = await as(browser, 'sales');
    await sales.page.goto(`${APP}/customers/${cid}`);
    const sc = sales.page.getByTestId('groups-card');
    await sc.waitFor({ timeout: 30000 });
    await sc.getByTestId('group-add').click();
    await sc.getByTestId('group-menu').waitFor();
    await sc.getByTestId('group-choice').first().waitFor({ timeout: 15000 });
    check('Sales: can add, but no "Make a new group"', (await sc.getByTestId('group-new').count()) === 0 && (await sc.getByTestId('group-choice').count()) > 0);
    await sc.getByTestId('group-choice').filter({ hasText: G2 }).click();
    await sc.getByTestId('group-chip').filter({ hasText: G2 }).waitFor({ timeout: 10000 });
    check('Sales adds them to a group', true);
    await sales.ctx.close();

    const wh = await as(browser, 'warehouse');
    await wh.page.goto(`${APP}/customers/${cid}`);
    const wc = wh.page.getByTestId('groups-card');
    const seen = await wc.waitFor({ timeout: 20000 }).then(() => true, () => false);
    check('the warehouse sees the groups but cannot add or take out', !seen || ((await wc.getByTestId('group-add').count()) === 0 && (await wc.getByTestId('group-out').count()) === 0));
    await wh.ctx.close();

    const phone = await as(browser, 'owner', { width: 390, height: 844 });
    await phone.page.goto(`${APP}/customers/${cid}`);
    await phone.page.getByTestId('groups-card').waitFor({ state: 'attached', timeout: 30000 });
    await phone.page.getByRole('tab', { name: 'Follow-ups & groups' }).click();
    const pc = phone.page.getByTestId('groups-card');
    await pc.waitFor({ timeout: 30000 });
    await pc.getByTestId('group-add').click();
    check('phone: the card and its list fit, nothing scrolls sideways', await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await phone.page.screenshot({ path: path.join(shots, 'customer-groups-phone.png') });
    await phone.ctx.close();
  } finally {
    await browser.close();
    sql(`delete from offers where id = '${OFFER}'`);
    sql(`update crm.customers set tags = ${tagsBefore ? `string_to_array('${tagsBefore}', '|')` : `'{}'`} where id = '${cid}'`);
    for (const g of (await api('GET', '/groups')).data ?? []) if (g.name.startsWith(STAMP)) await api('DELETE', `/groups/${encodeURIComponent(g.key)}`);
  }
  console.log(failures ? `\n${failures} customer groups UI check(s) FAILED.` : '\nAll customer groups UI checks passed.');
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
