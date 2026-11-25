/**
 * The next five in a real browser, signed in for real (the mockups approved 19 Nov): the owner's switches (parcel
 * updates, money owed, bring a friend) and levels in Settings; on a customer's page their level, Send picks, bring a
 * friend (a code to share, and a new customer saying who sent them); every width. Local only; put back at the end.
 *
 *   node scripts/verify-next-ui.mjs      (CRM on 4008, the app on 5176, local Inventory on 4016)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const API = process.env.CRM_API_URL || 'http://localhost:4008/api/v1';
const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..', '..', 'backend');
const shots = path.join(here, 'screenshots');
const N = String(Date.now() % 100000).padStart(5, '0');
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)?.slice(0, 300)}`}`); if (!ok) failures += 1; };
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const vis = (page, id) => page.getByTestId(id).locator('visible=true').first();
const settle = (page) => page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
let TOKEN = '';
const api = async (method, p, body) => {
  const r = await fetch(`${API}${p}`, { method, headers: { Cookie: `token=${TOKEN}`, Origin: APP, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
async function signedIn(browser, viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 1024 });
  await ctx.addCookies([{ name: 'token', value: TOKEN, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}

async function main() {
  TOKEN = tokenFor('owner');
  const before = { referral: (await api('GET', '/shop/referral')).body.data, parcel: (await api('GET', '/shop/parcel')).body.data, dues: (await api('GET', '/shop/dues')).body.data };
  const levelsBefore = (await api('GET', '/groups/levels')).body.data.groups.filter(g => g.isLevel).map(g => ({ key: g.key, pointsPer100: g.pointsPer100, perk: g.perk }));
  const GOLD = `UIGold ${N}`, PLAT = `UIPlat ${N}`;
  await api('POST', '/groups', { name: GOLD }); await api('PATCH', `/groups/${encodeURIComponent(GOLD.toLowerCase())}/rules`, { autoMinSpend: 1000000, autoDays: 365 });
  await api('POST', '/groups', { name: PLAT }); await api('PATCH', `/groups/${encodeURIComponent(PLAT.toLowerCase())}/rules`, { autoMinSpend: 2000000, autoDays: 365 });
  const people = sql("select c.id from crm.customers c where c.client_id='verify-suites-tenant' and c.removed_at is null and c.merged_into_id is null and c.phone is not null and c.customer_type <> 'WALK_IN' and exists (select 1 from crm.identities i where i.customer_id=c.id and i.source='inventory' and i.removed_at is null) order by c.created_at limit 600").split('\n');
  const bought = new Set(sql("select distinct customer_id from crm.timeline_events where client_id='verify-suites-tenant' and counts_spend").split('\n'));
  const agreed = new Set(sql("select customer_id from (select distinct on (customer_id) customer_id, granted from crm.consents where client_id='verify-suites-tenant' and purpose='offers' order by customer_id, at desc) x where granted").split('\n'));
  // A regular who agreed to offers (picks can go to them), and one who did not (the card says so).
  const regular = people.find(p => bought.has(p) && agreed.has(p)) ?? people.find(p => agreed.has(p)) ?? people.find(p => bought.has(p));
  const notAgreed = people.find(p => !agreed.has(p) && p !== regular);
  const newbie = people.find(p => !bought.has(p));
  await api('POST', '/groups/members', { group: GOLD, customerIds: [regular] });
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    console.log('\n1. Settings: the owner\'s switches');
    let { ctx, page } = await signedIn(browser, { width: 1280, height: 900 });
    await page.goto(`${APP}/settings?section=automatic`); await settle(page);
    for (const id of ['parcel', 'dues', 'referral']) check(`"${id}" is a row in Automatic messages`, await vis(page, `auto-open-${id}`).isVisible());
    await page.goto(`${APP}/settings?section=automatic&msg=referral`); await settle(page);
    if (!before.referral.on) {
      await vis(page, 'referral-switch').click();
      await page.waitForFunction(() => document.querySelector('[data-testid=referral-switch]')?.getAttribute('aria-checked') === 'true', null, { timeout: 8000 }).catch(() => {});
    }
    check('bring a friend switched on from Settings', (await vis(page, 'referral-switch').getAttribute('aria-checked')) === 'true');
    await vis(page, 'referral-points').fill('300');
    await page.getByRole('button', { name: 'Save' }).first().click();
    await page.waitForTimeout(800);
    check('points each saved: 300', (await api('GET', '/shop/referral')).body.data.points === 300);

    console.log('\n2. Settings: levels');
    await page.goto(`${APP}/settings?section=levels`); await settle(page);
    const lv = vis(page, 'levels-settings');
    check('the groups with a spending rule are listed to make levels', await lv.isVisible() && (await lv.innerText()).includes(GOLD) && (await lv.innerText()).includes(PLAT));
    const goldRow = lv.locator('li').filter({ hasText: GOLD });
    await goldRow.getByTestId('level-on').check();
    await goldRow.getByTestId('level-points').fill('2');
    await goldRow.getByPlaceholder('Free fall and pico').fill('Free fall and pico');
    const platRow = lv.locator('li').filter({ hasText: PLAT });
    await platRow.getByTestId('level-on').check();
    await platRow.getByTestId('level-points').fill('3');
    await vis(page, 'levels-save').click();
    await page.waitForTimeout(1500);
    const saved = (await api('GET', '/groups/levels')).body.data.groups.filter(g => g.isLevel).map(g => [g.name, g.pointsPer100]);
    check('saved: Gold 2 and Platinum 3 points per ₹100', saved.some(([n, p]) => n === GOLD && p === 2) && saved.some(([n, p]) => n === PLAT && p === 3), saved);
    await page.screenshot({ path: path.join(shots, 'next-levels-settings.png') });

    console.log('\n3. A regular\'s page');
    await page.goto(`${APP}/customers/${regular}`); await settle(page);
    const level = vis(page, 'level-card');
    await level.waitFor({ timeout: 10000 }).catch(() => {});
    check('their level, its perk, and how far to the next', await level.isVisible() && (await level.innerText()).includes(GOLD) && /Free fall and pico/.test(await level.innerText()) && new RegExp(`more for ${PLAT}`).test(await level.innerText()), await level.innerText().catch(() => ''));
    const ref = vis(page, 'referral-card');
    await ref.waitFor({ timeout: 8000 }).catch(() => {});
    await vis(page, 'referral-make').click();
    await vis(page, 'referral-code').waitFor({ timeout: 8000 }).catch(() => {});
    const code = (await vis(page, 'referral-code').innerText().catch(() => '')).trim();
    check('bring a friend: a code to share, made in one tap', /^[A-Z]{1,8}-[A-Z2-9]{3}$/.test(code), code);
    await vis(page, 'picks-open').click();
    const sheet = vis(page, 'picks-sheet');
    await sheet.waitFor({ timeout: 8000 });
    await page.waitForFunction(() => document.querySelector('[data-testid=picks-none]') || document.querySelector('[data-testid=pick]'), null, { timeout: 10000 }).catch(() => {});
    check('Send picks opens the pieces to choose (or says plainly there are none)', await sheet.isVisible() && ((await page.getByTestId('pick').locator('visible=true').count()) > 0 || await vis(page, 'picks-none').isVisible()));
    check('...Send waits until something is chosen', await vis(page, 'picks-send').isDisabled());
    await page.keyboard.press('Escape');
    check('nothing owed: no money-owed card', (await page.getByTestId('dues-card').locator('visible=true').count()) === 0);
    await page.screenshot({ path: path.join(shots, 'next-customer-laptop.png'), fullPage: true });

    if (notAgreed) {
      await page.goto(`${APP}/customers/${notAgreed}`); await settle(page);
      await vis(page, 'picks-no-consent').waitFor({ timeout: 8000 }).catch(() => {});
      check('someone who did not agree to offers: the card says picks cannot go, no button', await vis(page, 'picks-no-consent').isVisible() && (await page.getByTestId('picks-open').locator('visible=true').count()) === 0);
    }
    console.log('\n4. A new customer says who sent them');
    await page.goto(`${APP}/customers/${newbie}`); await settle(page);
    await vis(page, 'referral-input').fill(code.toLowerCase());
    await vis(page, 'referral-whose').waitFor({ timeout: 8000 }).catch(() => {});
    check('the code typed in small letters: whose it is, with a tick', (await vis(page, 'referral-whose').innerText().catch(() => '')).length > 0 && await vis(page, 'referral-save').isVisible());
    await vis(page, 'referral-save').click();
    await page.getByText(/Came with/).locator('visible=true').first().waitFor({ timeout: 8000 }).catch(() => {});
    check('saved: "Came with …\'s code · points on the first bill"', await page.getByText(/Came with .*points on the first bill/).locator('visible=true').first().isVisible());
    await ctx.close();

    console.log('\n5. Every width');
    for (const [label, width, height] of [['small phone', 360, 760], ['phone', 390, 844], ['tablet', 768, 1024], ['laptop', 1280, 900]]) {
      ({ ctx, page } = await signedIn(browser, { width, height }));
      await page.goto(`${APP}/customers/${regular}`); await settle(page);
      await vis(page, 'level-card').waitFor({ timeout: 10000 }).catch(() => {});
      const a = await fits(page);
      const cardsOk = await page.evaluate(() => [...document.querySelectorAll('.nx-card')].every(c => c.getBoundingClientRect().right <= window.innerWidth + 1));
      await vis(page, 'picks-open').click();
      await vis(page, 'picks-sheet').waitFor({ timeout: 8000 });
      const sheetOk = await vis(page, 'picks-sheet').evaluate(el => el.getBoundingClientRect().right <= window.innerWidth + 1 && el.getBoundingClientRect().left >= -1);
      if (width === 390) await page.screenshot({ path: path.join(shots, 'next-customer-phone.png'), fullPage: true });
      await page.keyboard.press('Escape');
      await page.goto(`${APP}/settings?section=automatic`); await settle(page);
      const b = await fits(page);
      await page.goto(`${APP}/settings?section=levels`); await settle(page);
      const c = await fits(page);
      const small = await page.evaluate(() => [...document.querySelectorAll('.nx-card button, .pe-toggle, .nx-lv-name')].filter(el => { const r = el.getBoundingClientRect(); return r.height && r.height < 32; }).length);
      check(`${label} (${width}): customer page, picks sheet, Settings fit; nothing too small to tap`, a && cardsOk && sheetOk && b && c && small === 0, { a, cardsOk, sheetOk, b, c, small });
      await ctx.close();
    }
  } finally {
    await browser.close();
    await api('PUT', '/groups/levels', { levels: levelsBefore });
    for (const g of [GOLD, PLAT]) await api('DELETE', `/groups/${encodeURIComponent(g.toLowerCase())}`);
    await api('PUT', '/shop/referral', { on: before.referral.on, points: before.referral.points });
    sql(`delete from crm.referrals where client_id='verify-suites-tenant' and friend_id='${newbie}'`);
    sql(`delete from crm.referral_codes where client_id='verify-suites-tenant' and customer_id in ('${regular}','${newbie}')`);
  }
  console.log(failures ? `\n${failures} check(s) FAILED.` : '\nAll next-features UI checks passed.');
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
