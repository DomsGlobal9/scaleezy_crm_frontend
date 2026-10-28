/**
 * Segments, in a real browser (installed Edge), signed in for real through local Inventory, against
 * the local database. Every number on screen is checked against what the API says for the same rules.
 *
 *   owner   no segments yet -> the starter ideas; try one; change a rule and see the count follow;
 *           add and take away rules; save with a name; open it; change it; remove it
 *   sales   may try rules out, never sees a Save
 *   phone   the list and the builder, no sideways scroll
 *
 *   node scripts/verify-segments-ui.mjs      (CRM on 4008, the app on 5176)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const API = process.env.CRM_URL || 'http://localhost:4008';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const backend = path.resolve(here, '..', '..', 'backend');
const NAME = `CHECK-SEG-UI ${Date.now() % 100000}`;

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
};
const tokens = {};
const tokenFor = (who) => (tokens[who] ??= execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim());
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const api = async (method, p, body) => {
  const res = await fetch(`${API}/api/v1${p}`, { method, headers: { Authorization: `Bearer ${tokenFor('owner')}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return res.json();
};
const people = async (rules) => (await api('POST', '/segments/preview', { rules })).data.summary.people;

async function as(browser, who, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: 'token', value: tokenFor(who), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}
/** The big "people" number once it has settled on what the API says. */
async function shownPeople(page, want) {
  try {
    await page.waitForFunction((w) => {
      const dd = document.querySelector('.sg-result [data-testid="numbers"] dd');
      return dd && !document.querySelector('.sg-fetching') && Number(dd.textContent.replace(/,/g, '')) === w;
    }, want, { timeout: 15000 });
  } catch { /* report what is there */ }
  return Number((await page.locator('.sg-result [data-testid="numbers"] dd').first().innerText()).replace(/,/g, ''));
}

async function main() {
  // Start from a shop with no segments, as a shop meeting the screen for the first time.
  for (const s of (await api('GET', '/segments')).data) await api('DELETE', `/segments/${s.id}`);

  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { ctx, page } = await as(browser, 'owner');
    await page.goto(`${APP}/segments`);
    await page.getByTestId('starter').first().waitFor({ timeout: 20000 });
    check('no segments yet: the four starter ideas, each as a sentence', (await page.getByTestId('starter').count()) === 4 && /Customers who spent at least ₹20,000 and haven't been back in 60 days/.test(await page.getByTestId('starter').first().innerText()));
    await page.screenshot({ path: path.join(shots, 'segments-empty.png') });

    await page.getByTestId('starter').first().click();
    await page.waitForURL(/\/segments\/new\?starter=/);
    await page.getByTestId('rule').first().waitFor();
    check('trying "Big spenders not seen lately": its two rules, its name filled in', (await page.getByTestId('rule').count()) === 2 && (await page.getByLabel('Name').inputValue()) === 'Big spenders not seen lately');
    let want = await people({ spentAtLeast: 20000, notSeenForDays: 60 });
    check(`the count on screen is who meets it now (${want})`, await shownPeople(page, want) === want);

    // Change the amount: the count follows.
    const amount = page.getByLabel('Spent at least (₹)');
    await amount.fill('1000');
    want = await people({ spentAtLeast: 1000, notSeenForDays: 60 });
    check(`₹1,000 instead: the count follows by itself (${want})`, await shownPeople(page, want) === want);
    check('...and the sentence says so', /spent at least ₹1,000 and haven't been back in 60 days/.test(await page.getByTestId('sentence').innerText()));

    // Take a rule away, add another.
    await page.getByRole('button', { name: /Remove: Haven't been back/ }).click();
    await page.getByRole('combobox', { name: 'Add a rule' }).click();
    await page.getByRole('option', { name: 'WhatsApp offers…' }).click();
    want = await people({ spentAtLeast: 1000, whatsapp: 'agreed' });
    check(`one rule out, "agreed to WhatsApp" in: the count follows (${want})`, await shownPeople(page, want) === want && (await page.getByTestId('rule').count()) === 2);
    const rows = await page.getByTestId('customer-row').count();
    check('the people meeting it are listed below, as on the Customers screen', rows === Math.min(25, want), { rows, want });

    // A rule that cannot be: said plainly, Save held back.
    await page.getByRole('combobox', { name: 'Add a rule' }).click();
    await page.getByRole('option', { name: 'Spent at most…' }).click();
    await page.getByLabel('Spent at most (₹)').fill('10');
    await page.getByTestId('rules-problem').waitFor({ timeout: 15000 });
    check('at most below at least: "nobody can be in it", in plain words, and Save waits', /nobody can be in it/.test(await page.getByTestId('rules-problem').innerText()) && await page.getByRole('button', { name: 'Save list' }).isDisabled());
    await page.getByRole('button', { name: /Remove: Spent at most/ }).click();
    await shownPeople(page, want);
    check('the rule taken away: the problem goes, by itself, and no error is left on screen', (await page.getByTestId('rules-problem').count()) === 0 && (await page.locator('[role="status"], .go3958317564').filter({ hasText: 'nobody can be in it' }).count()) === 0);
    await page.screenshot({ path: path.join(shots, 'segments-builder.png'), fullPage: true });

    // Save it.
    await page.getByLabel('Name').fill(NAME);
    await page.getByRole('button', { name: 'Save list' }).click();
    await page.waitForURL(/\/segments\/[0-9a-f-]{36}$/);
    await page.getByTestId('segment-name').waitFor();
    check('saved: its own page, with its name and its sentence', (await page.getByTestId('segment-name').innerText()) === NAME && /spent at least ₹1,000 and agreed to WhatsApp offers/.test(await page.locator('.sg-sentence').innerText()));
    check('...and who is in it now', Number((await page.locator('[data-testid="numbers"] dd').first().innerText()).replace(/,/g, '')) === want);
    await page.screenshot({ path: path.join(shots, 'segments-view.png'), fullPage: true });

    await page.locator('#crm-sidebar .crm-tab', { hasText: 'Saved lists' }).click();
    await page.getByTestId('segment').first().waitFor();
    check('the Segments list: the new one, with its numbers', (await page.getByTestId('segment').filter({ hasText: NAME }).count()) === 1 && /\b(person|people)\b/.test(await page.getByTestId('segment').filter({ hasText: NAME }).innerText()));
    await page.screenshot({ path: path.join(shots, 'segments-list.png') });

    // Change it.
    await page.getByTestId('segment').filter({ hasText: NAME }).click();
    await page.getByRole('link', { name: 'Change' }).click();
    await page.getByTestId('rule').first().waitFor();
    await page.getByLabel('Spent at least (₹)').fill('20000');
    want = await people({ spentAtLeast: 20000, whatsapp: 'agreed' });
    await shownPeople(page, want);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForURL(/\/segments\/[0-9a-f-]{36}$/);
    await page.waitForFunction(() => /₹20,000/.test(document.querySelector('.sg-sentence')?.textContent ?? ''), null, { timeout: 15000 });
    check('changed: the sentence and the people follow', /spent at least ₹20,000/.test(await page.locator('.sg-sentence').innerText()) && Number((await page.locator('[data-testid="numbers"] dd').first().innerText()).replace(/,/g, '')) === want);

    // Remove it.
    await page.getByRole('button', { name: 'Remove' }).click();
    check('removing asks first, saying nobody\'s record changes', /Nobody's record changes/.test(await page.locator('.sg-confirm').innerText()));
    await page.locator('.sg-confirm').getByRole('button', { name: 'Remove' }).click();
    await page.waitForURL(/\/segments$/);
    await page.getByTestId('starter').first().waitFor({ timeout: 15000 });
    check('removed: gone from the list (back to the starter ideas)', (await page.getByTestId('segment').count()) === 0);
    await ctx.close();

    // Sales: may try, never sees Save.
    {
      const { ctx: c2, page: p2 } = await as(browser, 'sales');
      await p2.goto(`${APP}/segments`);
      await p2.getByRole('link', { name: /Try a list/ }).click();
      await p2.getByTestId('rule').first().waitFor();
      const w = await people({ spentAtLeast: 10000 });
      check('sales: tries rules out and sees who meets them', await shownPeople(p2, w) === w);
      check('...but has no Name or Save (saving is for the owner or an admin)', (await p2.getByLabel('Name').count()) === 0 && (await p2.getByRole('button', { name: /Save/ }).count()) === 0);
      await c2.close();
    }

    // Phone.
    {
      const { ctx: c3, page: p3 } = await as(browser, 'owner', { width: 390, height: 844 });
      await p3.goto(`${APP}/segments`);
      await p3.getByTestId('starter').first().waitFor({ timeout: 20000 });
      check('phone: the Segments list, no sideways scroll', await noOverflow(p3));
      await p3.getByTestId('starter').nth(1).click();
      await p3.getByTestId('rule').first().waitFor();
      await p3.waitForTimeout(800);
      check('phone: the builder, no sideways scroll', await noOverflow(p3));
      await p3.screenshot({ path: path.join(shots, 'segments-phone.png'), fullPage: true });
      await c3.close();
    }
  } finally {
    await browser.close();
    for (const s of (await api('GET', '/segments')).data.filter(s => s.name.startsWith('CHECK-SEG-UI'))) await api('DELETE', `/segments/${s.id}`);
  }
  console.log(failures ? `\n${failures} segments UI check(s) FAILED.` : '\nAll segments UI checks passed.');
  process.exitCode = failures ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
