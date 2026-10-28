/**
 * This week, in a real browser (installed Edge), signed in for real, local database only. The week's
 * work is made by backend/src/scripts/support/week-fixture.ts (the same as verify-week).
 *
 *   owner   "This week" in the sidebar; the headline sentence with the numbers; Local SALES and the
 *           owner credited with what came back; Priya's walk-in; who came back and how; Last week
 *   sales   no "This week" in the sidebar; the page says plainly it is for the owner and admins
 *   phone   no sideways scroll
 *
 *   node scripts/verify-week-ui.mjs      (CRM on 4008, the app on 5176)
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
const run = (cmd, args) => execFileSync(cmd, args, { cwd: backend, encoding: 'utf8', shell: true }).trim();
const tokenFor = (who) => run('npm', ['run', '--silent', 'login:test', '--', who]);
const fixture = (cmd) => run('npx', ['ts-node', '--transpile-only', 'src/scripts/support/week-fixture.ts', cmd]);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function as(browser, who, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: 'token', value: tokenFor(who), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}

async function main() {
  fixture('setup');
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { ctx, page } = await as(browser, 'owner');
    await page.goto(`${APP}/today`);
    await page.locator('#crm-sidebar .crm-tab', { hasText: 'This week' }).click();
    await page.waitForURL(/\/week$/);
    const lead = page.getByTestId('lead');
    await lead.waitFor({ timeout: 20000 });
    const leadText = await lead.innerText();
    check('the headline: customers who came back after a follow-up, and the money in their bills', /\d+ customers? came back and bought within two weeks of someone getting in touch — ₹[\d,]+ in their bills/.test(leadText), leadText);
    const people = await page.getByTestId('person').allInnerTexts();
    check('Local SALES credited: kept promises, and what came back (₹16,200)', people.some(t => /Local SALES/.test(t) && /kept \d+ promises?/.test(t) && /came back/.test(t) && /₹16,200/.test(t)), people);
    check('...and their promise running late is said', people.some(t => /Local SALES/.test(t) && /late/.test(t)));
    check('the owner credited for getting in touch (₹10,400)', people.some(t => /Verification Owner/.test(t) && /got in touch with 1 regular/.test(t) && /₹10,400/.test(t)), people);
    check('Priya credited for the walk-in she took at Inventory\'s counter', people.some(t => /Priya/.test(t) && /looked after 1 walk-in/.test(t)));
    const back = await page.getByTestId('came-back').allInnerTexts();
    check('who came back: Gayathri, after Local SALES kept a promise, with her bill', back.some(t => /Gayathri Iyer/.test(t) && /Local SALES kept a promise/.test(t) && /₹16,200/.test(t)), back);
    check('...Hemalatha, after the owner got in touch on WhatsApp', back.some(t => /Hemalatha K/.test(t) && /got in touch on WhatsApp/.test(t)));
    check('...but not Esther (past 14 days) nor Anitha (bought before the contact)', !back.some(t => /Esther Thomas|Anitha Reddy/.test(t)));
    await page.screenshot({ path: path.join(shots, 'week-desktop.png'), fullPage: true });

    await page.getByRole('tab', { name: 'Last week' }).click();
    await page.getByRole('heading', { name: 'Last week', exact: true }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="came-back"]')].some(e => /Bhavana Rao/.test(e.textContent)), null, { timeout: 15000 }).catch(() => {});
    check('Last week: Bhavana came back the day after a promise', (await page.getByTestId('came-back').allInnerTexts()).some(t => /Bhavana Rao/.test(t) && /back 1 day later/.test(t) && /₹38,500/.test(t)));
    await ctx.close();

    {
      const { ctx: c2, page: p2 } = await as(browser, 'sales');
      await p2.goto(`${APP}/today`);
      await p2.locator('#crm-sidebar .crm-tab').first().waitFor({ timeout: 20000 });
      check('sales: no "This week" in the sidebar', (await p2.locator('#crm-sidebar .crm-tab', { hasText: 'This week' }).count()) === 0);
      await p2.goto(`${APP}/week`);
      await p2.getByRole('heading', { name: 'This is for the owner and admins' }).waitFor({ timeout: 15000 });
      check('...and the page says plainly it is for the owner and admins', true);
      await c2.close();
    }
    {
      const { ctx: c3, page: p3 } = await as(browser, 'owner', { width: 390, height: 844 });
      await p3.goto(`${APP}/week`);
      await p3.getByTestId('lead').waitFor({ timeout: 20000 });
      await p3.getByTestId('person').first().waitFor({ timeout: 20000 });
      check('phone: this week, no sideways scroll', await noOverflow(p3));
      await p3.screenshot({ path: path.join(shots, 'week-phone.png'), fullPage: true });
      await c3.close();
    }
  } finally {
    await browser.close();
    fixture('clear');
  }
  console.log(failures ? `\n${failures} week UI check(s) FAILED.` : '\nAll week UI checks passed.');
  process.exitCode = failures ? 1 : 0;
}

main().catch(e => { console.error(e); try { fixture('clear'); } catch {} process.exitCode = 1; });
