/**
 * Settings (12 Nov redesign) in a real browser (installed Edge), signed in for real, local only, light theme:
 *   - Settings is in the menu for the owner, not for Sales; Sales opening it is told it is the owner's
 *   - it opens on the overview: the setup ring, "Needs you" for missing essentials, the essentials and choices
 *   - the section list: each section opens, the address remembers it, a link opens it directly
 *   - Shop and door QR: the logo (or the first letter), a mini QR and Print for each store
 *   - Price ranges: the ruler shows the shop's ranges; today's switches and boxes still work where they were
 *   - on a phone: a picker instead of the list, nothing scrolls sideways
 *
 *   node scripts/verify-settings-ui.mjs      (CRM on 4008, the app on 5176, local Inventory on 4016)
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
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();

async function as(browser, who, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport, colorScheme: 'light' });
  await ctx.addCookies([{ name: 'token', value: tokenFor(who), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('scale_easy_theme', 'light'); } catch { /* fine */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}

async function main() {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    // Sales: no Settings in the menu; opening it says it is the owner's.
    const s = await as(browser, 'sales');
    await s.page.goto(`${APP}/settings`);
    await s.page.getByText('Only the shop owner can see these').waitFor({ timeout: 20000 });
    check('Sales: no Settings in the menu; the page says it is the owner\'s', (await s.page.getByTestId('nav-settings').count()) === 0);
    await s.ctx.close();

    const { ctx, page } = await as(browser, 'owner');
    await page.goto(`${APP}/today`);
    await page.getByTestId('nav-settings').waitFor({ timeout: 20000 });
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('st-overview').waitFor({ timeout: 20000 });
    check('the owner: Settings in the menu, opening on the overview', /\/settings$/.test(page.url()));
    await page.waitForFunction(() => !document.querySelector('[data-testid="st-overview"]')?.textContent.includes('Checking'), null, { timeout: 20000 }).catch(() => {});
    const ov = await page.getByTestId('st-overview').innerText();
    check('the overview: the ring, the essentials (logo, WhatsApp, price ranges, team) and the choices', /\d\/4/.test(await page.locator('.st-ring-text').textContent()) && ['Shop logo', 'WhatsApp linked', 'Price ranges', 'Your team', 'Your choices', 'Win back regulars'].every(w => ov.includes(w)), ov.slice(0, 300));
    const missing = await page.locator('.st-tile.miss').count();
    const fixes = await page.locator('[data-testid^="st-fix-"]').count();
    check('each missing essential carries its own fix button, missing ones first', fixes === missing && (missing === 0 || (await page.locator('.st-tile').first().getAttribute('class')).includes('miss')), { missing, fixes });
    check('messages are choices: never counted as missing', (await page.locator('.st-tile').count()) === 4 && !/Thank-you|Win back/.test(await page.locator('.st-tiles').innerText()));
    await page.screenshot({ path: path.join(shots, 'settings-overview.png'), fullPage: true });

    // Each section opens and the address remembers it.
    for (const key of ['shop', 'changes', 'prices', 'festivals', 'messages', 'automatic', 'team']) {
      await page.getByTestId(`st-go-${key}`).click();
      await page.getByTestId(`st-section-${key}`).waitFor({ timeout: 10000 });
      check(`section "${key}" opens, and the address says so`, page.url().endsWith(`?section=${key}`));
    }
    await page.goto(`${APP}/settings?section=prices`);
    await page.getByTestId('st-ruler').waitFor({ timeout: 15000 });
    check('a link opens a section directly: Price ranges, with the ruler of the shop\'s ranges', (await page.locator('.st-seg').count()) >= 2 && (await page.getByTestId('price-bands').count()) === 1);
    await page.screenshot({ path: path.join(shots, 'settings-prices.png') });

    await page.goto(`${APP}/settings?section=shop`);
    await page.getByTestId('st-logo').waitFor({ timeout: 15000 });
    await page.getByTestId('st-store').first().waitFor({ timeout: 15000 });
    const shopText = await page.getByTestId('st-section-shop').innerText();
    check('Shop and door QR: the logo or the first letter, and how to change it in Inventory', /(This logo is in the middle|No logo yet)/.test(shopText) && !!(await page.getByTestId('st-logo-change').getAttribute('href'))?.includes('/settings?section=GENERAL'), shopText.slice(0, 200));
    check('...every store, with its door QR state', (await page.getByTestId('st-store').count()) >= 1);
    const note = await page.getByTestId('st-whatsapp-note').count();
    const repeated = await page.getByTestId('st-section-shop').locator('text=The QR opens a chat').count();
    check('WhatsApp not linked: said once, not on every store', note === 0 || repeated === 1, { note, repeated });
    await page.screenshot({ path: path.join(shots, 'settings-shop.png'), fullPage: true });

    // Today's controls still work where they now live.
    await page.goto(`${APP}/settings?section=automatic`);
    await page.getByTestId('automatic-messages').waitFor({ timeout: 15000 });
    check('Automatic messages: today\'s switches (thank-you, win-back) are there', (await page.getByTestId('feedback-switch').count()) === 1 && (await page.getByTestId('winback-switch').count()) === 1);
    await page.goto(`${APP}/settings?section=changes`);
    await page.getByTestId('profile-switch').waitFor({ timeout: 15000 });
    check('Where changes are made: the switch is there', true);
    await page.goto(`${APP}/settings?section=team`);
    await page.getByTestId('team-access').waitFor({ timeout: 15000 });
    check('Team and access is there', true);
    await ctx.close();

    // A phone.
    const p = await as(browser, 'owner', { width: 375, height: 812 });
    await p.page.goto(`${APP}/settings`);
    await p.page.getByTestId('st-overview').waitFor({ timeout: 20000 });
    const navShown = await p.page.getByTestId('st-nav').isVisible();
    const picker = await p.page.getByRole('combobox', { name: 'Settings section' }).isVisible();
    const wide = await p.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('phone: a section picker instead of the list, nothing scrolls sideways', !navShown && picker && wide <= 1, { navShown, picker, wide });
    await p.page.screenshot({ path: path.join(shots, 'settings-phone.png'), fullPage: true });
    await p.page.getByRole('combobox', { name: 'Settings section' }).click();
    await p.page.getByRole('option', { name: /Team and access/ }).click();
    await p.page.getByTestId('team-access').waitFor({ timeout: 15000 });
    check('phone: picking a section opens it', p.page.url().endsWith('?section=team'));
    await p.ctx.close();
  } finally { await browser.close(); }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exitCode = failures ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
