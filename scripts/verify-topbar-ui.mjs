/**
 * The top bar (the mockup approved 29 Oct), in a real browser (installed Edge), signed in for real,
 * local database only.
 *
 *   1. Laptop: search in the middle -- part of a name, the best matches, arrows and Enter open one; "/"
 *      jumps to it; Enter with nothing picked opens All customers with the search filled in
 *   2. The bell: the count is what needs this person; a follow-up due today and someone waiting at the
 *      door, each a tap to where it is done; duplicates only for those who may merge
 *   3. Light/dark on the right, and no longer in the sidebar
 *   4. Phone: menu and logo left, search in the middle, bell and light/dark right; the search opens
 *      across the bar and Cancel closes it; nothing wider than the screen
 *
 *   node scripts/verify-topbar-ui.mjs      (CRM on 4008, the app on 5176)
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
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();

async function main() {
  // Someone to find, and something for the bell: a follow-up due today for the owner, and a person at the door.
  const [cid, cname] = sql(`select id || '|' || name from crm.customers where client_id = '${SHOP}' and merged_into_id is null and removed_at is null and customer_type <> 'WALK_IN' and length(name) >= 5 order by created_at limit 1`).split('|');
  const ownerId = sql(`select id from users where email = 'verify-suites@example.com' and client_id = '${SHOP}'`);
  const fu = randomUUID(), door = randomUUID();
  const today = sql(`select to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`);
  sql(`insert into crm.follow_ups (id, client_id, customer_id, body, due_on, assignee_id, assignee_name, created_by_name, created_at, updated_at) values ('${fu}', '${SHOP}', '${cid}', 'Topbar check: call about the blouse', '${today}', '${ownerId}', 'Verification Owner', 'verify-topbar', now(), now())`);
  sql(`insert into crm.door_arrivals (id, client_id, source, visit_id, customer_id, phone, store_name, arrived_at, created_at, updated_at) values ('${door}', '${SHOP}', 'inventory', 'topbar-${door}', '${cid}', null, 'Main Store', now() - interval '6 minutes', now(), now())`);
  const part = cname.trim().split(/\s+/)[0].slice(0, 4);

  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const ownerToken = tokenFor('owner');
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.addCookies([{ name: 'token', value: ownerToken, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });

    console.log('\n1. Search');
    await page.goto(`${APP}/today`);
    const search = page.getByTestId('top-search');
    await search.waitFor({ timeout: 20000 });
    const box = await page.locator('.crm-topbar').boundingBox();
    const sb = await page.locator('.crm-topbar .tb-search').boundingBox();
    check('the search sits in the middle of the top bar', !!box && !!sb && Math.abs((sb.x + sb.width / 2) - (box.x + box.width / 2)) < 30, { box, sb });
    await page.locator('main').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press('/');
    check('"/" jumps to the search', await search.evaluate(el => el === document.activeElement));
    await search.fill(part);
    const results = page.getByTestId('top-search-results');
    await results.getByRole('option').first().waitFor({ timeout: 15000 });
    check(`typing "${part}" shows matches, with the typed part marked`, (await results.getByRole('option').count()) >= 1 && (await results.locator('mark').count()) >= 1);
    await page.screenshot({ path: path.join(shots, 'topbar-search.png') });
    await search.press('ArrowDown');
    await search.press('Enter');
    await page.waitForURL(/\/customers\/[0-9a-f-]{36}$/, { timeout: 15000 });
    check('arrow down and Enter open that customer', true);
    await page.keyboard.press('/');
    await search.fill(part);
    await results.getByRole('option').first().waitFor({ timeout: 15000 });
    await search.press('Enter');
    await page.waitForURL(new RegExp(`/customers\\?q=${encodeURIComponent(part)}$`), { timeout: 15000 });
    await page.waitForFunction((want) => [...document.querySelectorAll('input')].some(i => i.value === want && !i.closest('.crm-topbar')), part, { timeout: 15000 });
    check('Enter with nothing picked opens All customers with the search filled in', true);

    console.log('\n2. The bell');
    const n = await page.evaluate(async () => (await (await fetch('http://localhost:4008/api/v1/notifications', { credentials: 'include' })).json()).data);
    // The laptop's bar (the phone bar's copy is in the page too, hidden).
    const bell = page.locator('.crm-topbar').getByTestId('bell');
    await page.waitForFunction((want) => (document.querySelector('.crm-topbar [data-testid="bell"] .tb-dot')?.textContent ?? '') === String(want), n.total > 99 ? '99+' : n.total, { timeout: 20000 });
    check('the bell shows how many things need this person', n.total >= 2 && n.followUps.count >= 1 && n.waiting.count >= 1, n);
    await bell.click();
    const panel = page.locator('.crm-topbar').getByTestId('bell-panel');
    await panel.waitFor();
    check('the follow-up due today is there', /follow-ups? due/.test(await panel.innerText()) && (await panel.innerText()).includes('Topbar check: call about the blouse'), await panel.innerText());
    check('and the person waiting at the door, with how long', /waiting at the door/.test(await panel.innerText()) && /Main Store, waiting [5-9] minutes/.test(await panel.innerText()), await panel.innerText());
    await page.screenshot({ path: path.join(shots, 'topbar-bell.png') });
    await panel.getByRole('link', { name: /follow-ups? due/ }).click();
    await page.waitForURL(/\/today$/, { timeout: 10000 });
    check('a tap goes where it is done: To do today', true);

    console.log('\n3. Light and dark');
    const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.locator('.crm-topbar').getByTestId('theme').click();
    const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    check('the switch on the right changes light and dark', before !== after && ['light', 'dark'].includes(after), { before, after });
    await page.locator('.crm-topbar').getByTestId('theme').click();
    check('...and it is no longer in the sidebar', (await page.locator('.crm-sidebar').getByRole('button', { name: /Switch to/ }).count()) === 0);
    await ctx.close();

    console.log('\n   Sales');
    const sctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await sctx.addCookies([{ name: 'token', value: tokenFor('sales'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const sp = await sctx.newPage();
    await sp.goto(`${APP}/today`);
    await sp.locator('.crm-topbar').getByTestId('bell').waitFor({ timeout: 20000 });
    const sn = await sp.evaluate(async () => (await (await fetch('http://localhost:4008/api/v1/notifications', { credentials: 'include' })).json()).data);
    check('Sales: no duplicates to review (merging is the owner\'s and admin\'s), and not the owner\'s follow-up', sn.duplicates === null && !sn.followUps.items.some(f => f.body.startsWith('Topbar check')), sn);
    await sctx.close();

    console.log('\n4. Phone');
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await pctx.addCookies([{ name: 'token', value: ownerToken, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const pp = await pctx.newPage();
    await pp.goto(`${APP}/today`);
    const bar = pp.locator('.crm-mobilebar');
    await bar.getByTestId('top-search-open').waitFor({ timeout: 20000 });
    const xs = await Promise.all([bar.getByRole('button', { name: 'Open menu' }), bar.locator('.crm-brand'), bar.getByTestId('top-search-open'), bar.getByTestId('bell'), bar.getByTestId('theme')].map(async l => (await l.boundingBox())?.x ?? -1));
    check('menu, logo, search, bell, light/dark, left to right', xs.every((x, i) => x >= 0 && (i === 0 || x > xs[i - 1])), xs);
    check('the page fits the phone', await noOverflow(pp));
    await pp.screenshot({ path: path.join(shots, 'topbar-phone.png') });
    await bar.getByTestId('top-search-open').click();
    const ms = bar.getByTestId('top-search');
    await ms.waitFor();
    check('the search opens across the bar, ready to type', await ms.evaluate(el => el === document.activeElement));
    await ms.fill(part);
    await bar.getByTestId('top-search-results').getByRole('option').first().waitFor({ timeout: 15000 });
    check('...with matches, and still fitting the phone', await noOverflow(pp));
    await pp.screenshot({ path: path.join(shots, 'topbar-phone-search.png') });
    await pp.getByRole('button', { name: 'Cancel' }).click();
    check('Cancel closes it', (await bar.getByTestId('top-search-open').count()) === 1);
    await pctx.close();
  } finally {
    await browser.close();
    sql(`delete from crm.follow_ups where id = '${fu}'`);
    sql(`delete from crm.door_arrivals where id = '${door}'`);
  }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
