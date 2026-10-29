/**
 * The sidebar, in a real browser (installed Edge), signed in for real through local Inventory.
 *
 *   desktop  the sidebar is there with Today, Customers, Duplicates; the page you are on is marked;
 *            moving by the sidebar works; who is signed in; light and dark
 *   tablet   (834px, an iPad in portrait) and phone (390px): the sidebar is out of the way until the
 *            menu button; it opens with focus on the first place; Escape, the dimmed page, and
 *            choosing a place all close it; no sideways scroll
 *   sales    no Duplicates (only those who may merge see it)
 *
 *   node scripts/verify-shell-ui.mjs      (CRM on 4008, the app on 5176)
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
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
};
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function as(browser, who, viewport) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: 'token', value: tokenFor(who), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}

async function main() {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    // ── Desktop ──
    {
      const { ctx, page } = await as(browser, 'owner', { width: 1366, height: 860 });
      await page.goto(`${APP}/today`);
      const side = page.locator('#crm-sidebar');
      await side.locator('.crm-tab', { hasText: 'Today' }).waitFor({ timeout: 20000 });
      check('desktop: the sidebar is on screen', await side.isVisible());
      check('desktop: no phone bar', !(await page.locator('.crm-mobilebar').isVisible()));
      const places = await side.locator('.crm-tab .crm-tab-label').allInnerTexts();
      check('desktop (owner): the places in shop words: To do today, This week, At the door, All customers, Customer groups, Saved lists, Messages (duplicates live on All customers)', JSON.stringify(places) === JSON.stringify(['To do today', 'This week', 'At the door', 'All customers', 'Customer groups', 'Saved lists', 'Messages']), places);
      check('desktop: Today is marked as where you are', /\bon\b/.test(await side.locator('.crm-tab', { hasText: 'Today' }).getAttribute('class')));
      const width = await side.evaluate(el => el.getBoundingClientRect().width);
      check('desktop: 240px wide, like Inventory\'s', Math.round(width) === 240, width);
      check('desktop: who is signed in is at its foot', (await side.locator('.crm-me-name').innerText()).trim().length > 0);
      await page.screenshot({ path: path.join(shots, 'shell-desktop-dark.png') });

      await side.locator('.crm-tab', { hasText: 'Customers' }).click();
      await page.waitForURL(/\/customers$/);
      await page.getByTestId('customer-row').first().waitFor({ timeout: 20000 });
      check('desktop: Customers by the sidebar, and it is marked now', /\bon\b/.test(await side.locator('.crm-tab', { hasText: 'Customers' }).getAttribute('class')) && !/\bon\b/.test(await side.locator('.crm-tab', { hasText: 'Today' }).getAttribute('class')));
      check('desktop: the page sits beside the sidebar, not under it', await page.evaluate(() => {
        const s = document.querySelector('#crm-sidebar').getBoundingClientRect();
        const m = document.querySelector('.crm-main').getBoundingClientRect();
        return m.left >= s.right - 1;
      }));

      const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      // Light and dark moved to the top bar, on the right (the owner, 29 Oct).
      const topbar = page.locator('.crm-topbar');
      await topbar.getByRole('button', { name: /Switch to/ }).click();
      const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      check('desktop: light and dark switch from the top bar', before !== after && ['light', 'dark'].includes(after), { before, after });
      await page.screenshot({ path: path.join(shots, `shell-desktop-${after}.png`) });
      await topbar.getByRole('button', { name: /Switch to/ }).click();
      await ctx.close();
    }

    // ── Tablet and phone ──
    for (const [label, viewport] of [['tablet', { width: 834, height: 1112 }], ['phone', { width: 390, height: 844 }]]) {
      const { ctx, page } = await as(browser, 'owner', viewport);
      await page.goto(`${APP}/today`);
      await page.getByRole('button', { name: 'Open menu' }).waitFor({ timeout: 20000 });
      const side = page.locator('#crm-sidebar');
      check(`${label}: the sidebar is out of the way until asked for`, !(await side.isVisible()));
      check(`${label}: no sideways scroll`, await noOverflow(page));

      await page.getByRole('button', { name: 'Open menu' }).click();
      await side.locator('.crm-tab', { hasText: 'Today' }).waitFor({ state: 'visible' });
      await page.waitForTimeout(350);
      check(`${label}: the menu opens, focus on the first place`, await page.evaluate(() => document.activeElement?.closest('.crm-tab')?.textContent?.includes('To do today') ?? false));
      if (label === 'phone') await page.screenshot({ path: path.join(shots, 'shell-phone-open.png') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(350);
      check(`${label}: Escape closes it, focus back on the menu button`, !(await side.isVisible()) && await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Open menu'));

      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.waitForTimeout(350);
      await page.locator('.crm-sidebar-overlay').click({ position: { x: viewport.width - 20, y: viewport.height / 2 } });
      await page.waitForTimeout(350);
      check(`${label}: a tap on the dimmed page closes it`, !(await side.isVisible()));

      await page.getByRole('button', { name: 'Open menu' }).click();
      await side.locator('.crm-tab', { hasText: 'Customers' }).click();
      await page.waitForURL(/\/customers$/);
      await page.waitForTimeout(350);
      check(`${label}: choosing a place goes there and closes the menu`, !(await side.isVisible()));
      await page.getByTestId('customer-row').first().waitFor({ timeout: 20000 });
      check(`${label}: Customers, no sideways scroll`, await noOverflow(page));
      if (label === 'phone') await page.screenshot({ path: path.join(shots, 'shell-phone-customers.png') });
      await ctx.close();
    }

    // ── Sales: no Duplicates ──
    {
      const { ctx, page } = await as(browser, 'sales', { width: 1366, height: 860 });
      await page.goto(`${APP}/today`);
      const side = page.locator('#crm-sidebar');
      await side.locator('.crm-tab', { hasText: 'Today' }).waitFor({ timeout: 20000 });
      const places = await side.locator('.crm-tab .crm-tab-label').allInnerTexts();
      check('sales: the same five places (no Messages: campaign:view is not theirs)', JSON.stringify(places) === JSON.stringify(['To do today', 'At the door', 'All customers', 'Customer groups', 'Saved lists']), places);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} shell UI check(s) FAILED.` : '\nAll shell UI checks passed.');
  process.exitCode = failures ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
