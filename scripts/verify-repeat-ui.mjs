/**
 * Repeat customers on All customers, worst cases, in a real browser (installed Edge), signed in for real, local only:
 * every row's tap lists exactly its number; keyboard works; on a phone nothing scrolls sideways; light theme;
 * a server without the card's numbers (not yet updated) shows no card and no error; a shop with bills but no
 * budgets shows Repeat customers and hides an all-zero By budget.
 *
 *   node scripts/verify-repeat-ui.mjs      (CRM on 4008, the app on 5176, local Inventory on 4016)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const backend = path.resolve(here, '..', '..', 'backend');
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`); if (!ok) failures += 1; };
const token = execFileSync('npm', ['run', '--silent', 'login:test', '--', 'owner'], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const num = (t) => Number(String(t).replace(/[^\d]/g, ''));

async function open(browser, opts = {}, route) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1366, height: 900 }, colorScheme: opts.colorScheme ?? 'dark', ...(opts.mobile ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  if (route) await page.route('**/api/v1/customers/overview', route);
  await page.goto(`${APP}/customers`);
  return { ctx, page };
}

/** How many customers the list says after a tap: "1–50 of N" when there are pages, else the rows. */
async function listCount(page) {
  await page.getByTestId('filters-on').waitFor({ timeout: 15000 });
  await page.getByTestId('customer-row').first().waitFor({ timeout: 15000 }).catch(() => {});
  const info = page.getByTestId('page-info');
  return (await info.count()) ? num((await info.innerText()).match(/of ([\d,]+)/)[1]) : page.getByTestId('customer-row').count();
}

async function main() {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    // ── Every row, by mouse and by keyboard ──
    const { ctx, page } = await open(browser);
    const card = page.getByTestId('overview-repeat');
    await card.waitFor({ timeout: 20000 });
    for (const key of ['1', '2-4', '5-']) {
      const row = page.getByTestId(`overview-${key}`);
      const want = num(await row.locator('b').innerText());
      // The filtered answer itself, not the list still on screen from before the tap.
      const [res] = await Promise.all([page.waitForResponse(r => r.url().includes('/api/v1/customers?') && r.url().includes('rules=') && r.request().method() === 'GET', { timeout: 20000 }), row.click()]);
      const answer = await res.json();
      await page.waitForFunction((n) => { const i = document.querySelector('[data-testid="page-info"]'); return i ? i.textContent.includes(`of ${n.toLocaleString('en-IN')}`) : document.querySelectorAll('[data-testid="customer-row"]').length === n; }, answer.data.total, { timeout: 15000 }).catch(() => {});
      const got = await listCount(page);
      check(`  ...the server's answer is the same ${want}`, answer.data.total === want, { want, total: answer.data.total });
      check(`tap "${await row.locator('span').first().innerText().catch(() => key)}": the list has the same ${want}`, got === want, { want, got });
      await page.goto(`${APP}/customers`);
      await card.waitFor({ timeout: 20000 });
    }
    const shown = (await card.innerText()).match(/\(([\d,]+) of ([\d,]+)\)/);
    const rows = await Promise.all(['1', '2-4', '5-'].map(async k => num(await page.getByTestId(`overview-${k}`).locator('b').innerText())));
    check('"N of M" adds up: M is all three rows, N is 2 to 4 plus 5 or more', !!shown && num(shown[2]) === rows[0] + rows[1] + rows[2] && num(shown[1]) === rows[1] + rows[2], { shown: shown?.[0], rows });
    await page.getByTestId('overview-5-').focus();
    await page.keyboard.press('Enter');
    check('keyboard: Enter on a row opens it too', /5 or more/.test(await page.getByTestId('filters-on').innerText().catch(() => '')));
    await ctx.close();

    // ── On a phone ──
    const phone = await open(browser, { viewport: { width: 375, height: 812 }, mobile: true });
    await phone.page.getByTestId('overview-repeat').waitFor({ timeout: 20000 });
    const wide = await phone.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('phone: nothing scrolls sideways', wide <= 1, wide);
    const box = await phone.page.getByTestId('overview-repeat').boundingBox();
    check('phone: the card fits the screen', !!box && box.x >= 0 && box.x + box.width <= 375, box);
    await phone.page.getByTestId('overview-repeat').screenshot({ path: path.join(shots, 'overview-repeat-phone.png') });
    await phone.ctx.close();

    // ── Light theme ──
    const light = await open(browser, { colorScheme: 'light' });
    await light.page.getByTestId('overview-repeat').waitFor({ timeout: 20000 });
    await light.page.evaluate(() => { try { localStorage.setItem('theme', 'light'); } catch { /* fine */ } document.documentElement.setAttribute('data-theme', 'light'); });
    const colours = await light.page.getByTestId('overview-1').evaluate(el => { const s = getComputedStyle(el.querySelector('b')); return { color: s.color }; });
    check('light theme: the numbers are dark on light, readable', /rgb\((\d+), (\d+), (\d+)\)/.test(colours.color) && colours.color.match(/\d+/g).slice(0, 3).every(v => Number(v) < 120), colours);
    await light.page.getByTestId('customer-overview').screenshot({ path: path.join(shots, 'overview-repeat-light.png') });
    await light.ctx.close();

    // ── A server not updated yet: no repeat numbers ──
    const old = await open(browser, {}, async route => { const res = await route.fetch(); const body = await res.json(); delete body.data.repeat; await route.fulfill({ response: res, json: body }); });
    await old.page.getByTestId('customer-overview').waitFor({ timeout: 20000 });
    check('an older server: By budget as before, no Repeat customers, no error', (await old.page.getByTestId('overview-repeat').count()) === 0 && /By budget/.test(await old.page.getByTestId('customer-overview').innerText()));
    await old.ctx.close();

    // ── Bills but no budgets yet ──
    const nob = await open(browser, {}, async route => { const res = await route.fetch(); const body = await res.json(); body.data.budget = body.data.budget.map(b => ({ ...b, count: 0 })); body.data.kinds = []; await route.fulfill({ response: res, json: body }); });
    await nob.page.getByTestId('overview-repeat').waitFor({ timeout: 20000 });
    const text = await nob.page.getByTestId('customer-overview').innerText();
    check('no budgets yet: Repeat customers shows, an all-zero By budget does not', !/By budget/.test(text) && /Repeat customers/.test(text), text.slice(0, 200));
    await nob.ctx.close();

    // ── Nobody has bought: no card ──
    const none = await open(browser, {}, async route => { const res = await route.fetch(); const body = await res.json(); body.data.repeat = body.data.repeat.map(r => ({ ...r, count: 0 })); await route.fulfill({ response: res, json: body }); });
    await none.page.getByTestId('customer-overview').waitFor({ timeout: 20000 });
    check('nobody bought yet: no Repeat customers card (never "0% of 0")', (await none.page.getByTestId('overview-repeat').count()) === 0);
    await none.ctx.close();
  } finally { await browser.close(); }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exitCode = failures ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
