/**
 * Festival buying on the customer page, and the shop's festivals, in a real browser (installed Edge),
 * signed in for real, local database only. The customer, Lakshmi Prasanna, and their bills are made
 * by backend/src/scripts/support/festival-fixture.ts (the same as verify-festivals).
 *
 *   owner   the festival part of "What they wear": the share, Dasara every year, the two Diwalis,
 *           Sankranti, what they never bought for; the shop's festivals: switch one on and off,
 *           correct a date and put it back
 *   sales   sees festival buying, not the link; the festivals page is read only
 *   phone   no sideways scroll on either; screenshots in the light theme
 *
 *   node scripts/verify-festivals-ui.mjs      (CRM on 4008, the app on 5176)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const API = process.env.CRM_API_URL || 'http://localhost:4008/api/v1';
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
const fixture = (cmd) => run('npx', ['ts-node', '--transpile-only', 'src/scripts/support/festival-fixture.ts', cmd]).split(/\s+/).pop();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const put = (token, p, body) => fetch(`${API}${p}`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function as(browser, token, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('scale_easy_theme', 'light'); } catch {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}

async function main() {
  const id = fixture('setup');
  const owner = tokenFor('owner');
  const sales = tokenFor('sales');
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { ctx, page } = await as(browser, owner);
    await page.goto(`${APP}/customers/${id}`);
    await page.getByTestId('tastes').waitFor({ timeout: 25000 });
    const line = await page.getByTestId('tastes').innerText();
    check('What they wear: one line names the festivals they buy for, with the share and a way to the Festivals tab', /Festivals\s+Diwali, Sankranti \/ Pongal, Dasara every year · \d+% of their spending · See festivals/.test(line), line);
    const short = page.getByTestId('festival-soon-short');
    if (await short.count()) check('...and the near one, said short', /^Diwali is in \d+ days and they bought for it the last 2 years — about ₹10,500 each time\.$/.test(await short.innerText()), await short.innerText());
    await page.getByRole('button', { name: 'See festivals' }).click();
    const fb = page.getByTestId('festivals');
    await fb.waitFor({ timeout: 15000 });
    check('"See festivals" opens the Festivals tab, with festival buying in full', await page.getByRole('tab', { name: 'Festivals' }).getAttribute('aria-selected') === 'true' && /[?&]tab=festivals/.test(page.url()));
    const share = await page.getByTestId('festival-share').innerText();
    check('the share of their spending at festival time', /^\d+% of what they spend is in the three weeks before a festival$/.test(share), share);
    const rows = await page.getByTestId('festival').allInnerTexts();
    check('one row each: Diwali, Dasara, Sankranti (nearest first)', rows.length === 3 && /^Diwali/.test(rows[0]) && rows.some(t => /^Dasara/.test(t)) && rows.some(t => /^Sankranti/.test(t)), rows);
    const dasara = page.getByTestId('festival').filter({ hasText: 'Dasara' });
    check('Dasara: every year a filled dot, "Every year", sarees in gold and green', (await dasara.locator('.fb-y.on').count()) === 4 && /Every year/.test(await dasara.innerText()) && /Every year · this year ₹12,000 on \d+ \w+ · sarees · gold, green|Every year · Usually ₹12,000 · sarees · gold, green/.test(await dasara.innerText()), await dasara.innerText());
    const diwali = page.getByTestId('festival').filter({ hasText: 'Diwali' });
    check('Diwali: two years filled, usually ₹10,000 – ₹11,000, sarees and blouses', (await diwali.locator('.fb-y.on').count()) === 2 && /Usually ₹10,000 – ₹11,000 · sarees, blouses · red/.test(await diwali.innerText()), await diwali.innerText());
    check('Sankranti: once, ₹6,000, langas, yellow', /₹6,000 · langas · yellow/.test(await page.getByTestId('festival').filter({ hasText: 'Sankranti' }).innerText()));
    const soon = page.getByTestId('festival-soon');
    if (await soon.count()) check('the line at the top: Diwali is near and they bought the last 2 years, about ₹10,500 each time', /^Diwali is in \d+ days and they bought for it the last 2 years — about ₹10,500 each time, sarees, blouses in red/.test(await soon.innerText()), await soon.innerText());
    check('what they never bought for: New Year or Ugadi', await fb.getByText('Has not bought for New Year or Ugadi.').count() === 1);
    await page.screenshot({ path: path.join(shots, 'festivals-customer-desktop.png'), fullPage: true });

    await page.getByTestId('festival-dates').click();
    await page.waitForURL(/\/festivals$/);
    await page.getByRole('heading', { name: "The shop's festivals" }).waitFor();
    const list = page.getByTestId('festival-row');
    await list.first().waitFor();
    check('the shop\'s festivals: seven, five ticked', (await list.count()) === 7 && (await page.locator('.fs-row input[type=checkbox]:checked').count()) === 5);
    const christmas = page.getByLabel('Christmas counts');
    await christmas.click();
    await page.waitForFunction(() => document.querySelectorAll('.fs-row input[type=checkbox]:checked').length === 6, null, { timeout: 10000 }).catch(() => {});
    check('the owner ticks Christmas: six count', (await page.locator('.fs-row input[type=checkbox]:checked').count()) === 6);
    await christmas.click();
    await page.waitForFunction(() => document.querySelectorAll('.fs-row input[type=checkbox]:checked').length === 5, null, { timeout: 10000 }).catch(() => {});
    check('...and unticks it again', (await page.locator('.fs-row input[type=checkbox]:checked').count()) === 5);

    const dRow = list.filter({ hasText: 'Diwali' });
    const builtIn = await dRow.getByTestId('festival-date').innerText();
    await dRow.getByRole('button', { name: 'Change date' }).click();
    const input = dRow.locator('input[type=date]');
    const was = await input.inputValue();
    const next = new Date(`${was}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    await input.fill(next.toISOString().slice(0, 10));
    await dRow.getByRole('button', { name: 'Save' }).click();
    await dRow.getByText('you changed it').waitFor({ timeout: 10000 });
    check('the owner moves Diwali a day: shown, with the built-in date beside it', (await dRow.getByTestId('festival-date').innerText()) !== builtIn && /built in: /.test(await dRow.innerText()));
    await page.screenshot({ path: path.join(shots, 'festivals-settings-desktop.png'), fullPage: true });
    await dRow.getByRole('button', { name: 'Use the built-in date' }).click();
    await dRow.getByText('you changed it').waitFor({ state: 'detached', timeout: 10000 });
    check('...and puts the built-in date back', (await dRow.getByTestId('festival-date').innerText()) === builtIn);
    await ctx.close();

    {
      const { ctx: c2, page: p2 } = await as(browser, sales);
      await p2.goto(`${APP}/customers/${id}?tab=festivals`);
      await p2.getByTestId('festivals').waitFor({ timeout: 25000 });
      check('sales: sees festival buying, without the link to change the festivals', (await p2.getByTestId('festival').count()) === 3 && (await p2.getByTestId('festival-dates').count()) === 0);
      await p2.goto(`${APP}/festivals`);
      await p2.getByTestId('festival-row').first().waitFor({ timeout: 15000 });
      check('...the festivals page is read only for them', (await p2.locator('.fs-row input[type=checkbox]:not([disabled])').count()) === 0 && (await p2.getByRole('button', { name: 'Change date' }).count()) === 0);
      await c2.close();
    }
    {
      const { ctx: c3, page: p3 } = await as(browser, owner, { width: 390, height: 844 });
      await p3.goto(`${APP}/customers/${id}?tab=festivals`);
      await p3.getByTestId('festival').first().waitFor({ timeout: 25000 });
      check('phone: the customer page, no sideways scroll', await noOverflow(p3));
      await p3.getByTestId('festivals').screenshot({ path: path.join(shots, 'festivals-customer-phone.png') });
      await p3.goto(`${APP}/festivals`);
      await p3.getByTestId('festival-row').first().waitFor({ timeout: 15000 });
      check('phone: the shop\'s festivals, no sideways scroll', await noOverflow(p3));
      await p3.screenshot({ path: path.join(shots, 'festivals-settings-phone.png'), fullPage: true });
      await c3.close();
    }
  } finally {
    await browser.close();
    // Whatever happened above, the shop's festivals go back to the built-in ones.
    await put(owner, '/festivals/christmas', { on: false }).catch(() => {});
    await fetch(`${API}/festivals`, { headers: { authorization: `Bearer ${owner}` } })
      .then(r => r.json()).then(b => Promise.all(b.data.festivals.filter(f => f.next?.corrected).map(f => put(owner, `/festivals/${f.key}/date`, { year: f.next.year, date: null })))).catch(() => {});
    fixture('clear');
  }
  console.log(failures ? `\n${failures} festival UI check(s) FAILED.` : '\nAll festival UI checks passed.');
  process.exitCode = failures ? 1 : 0;
}

main().catch(e => { console.error(e); try { fixture('clear'); } catch {} process.exitCode = 1; });
