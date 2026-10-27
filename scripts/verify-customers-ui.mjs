/**
 * Drives the Customers screen in a real browser against the running CRM service and web app,
 * signed in exactly as a person is: with the cookie Inventory sets. Asserts what the screen SHOULD
 * show, taken from the service's own answer, so a wrong number on screen fails here.
 *
 *   npm run verify:ui      (service on 4008, web app on 5176, LOCAL database)
 *
 * Screenshots land in scripts/screenshots/ (ignored by git).
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const API = process.env.CRM_API_URL || 'http://localhost:4008/api/v1';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
mkdirSync(shots, { recursive: true });
const backend = path.resolve(here, '..', '..', 'backend');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
};

/** A login token for a local test account, signed as Inventory signs them (backend/src/scripts/mint-test-token.ts). */
const tokenFor = (role) => execFileSync('npm', ['run', '--silent', 'token:test', '--', role], { cwd: backend, encoding: 'utf8', shell: true }).trim();

const rupees = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const phone = (p) => { const m = /^\+91(\d{5})(\d{5})$/.exec(p || ''); return m ? `+91 ${m[1]} ${m[2]}` : (p || ''); };

async function apiList(token, query = '') {
  const res = await fetch(`${API}/customers?pageSize=25${query}`, { headers: { authorization: `Bearer ${token}` } });
  return (await res.json()).data;
}

async function signedIn(browser, token, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  if (token) await context.addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { context, page };
}

async function main() {
  const owner = tokenFor('SUPER_ADMIN');
  const warehouse = tokenFor('WAREHOUSE');
  const expected = await apiList(owner);

  // Edge is installed on this machine; Playwright's own Chromium build may not be.
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });

  // ── Signed out ──
  {
    const { context, page } = await signedIn(browser, null, { width: 1280, height: 800 });
    await page.goto(`${APP}/customers`);
    await page.getByRole('heading', { name: 'Sign in to Inventory first' }).waitFor({ timeout: 15000 });
    check('signed out: the page asks for the Inventory sign-in', true);
    const link = await page.getByRole('link', { name: 'Go to Inventory sign-in' }).getAttribute('href');
    check('signed out: the link goes to Inventory\'s login', /\/login$/.test(link), link);
    await page.screenshot({ path: path.join(shots, 'signed-out.png') });
    await context.close();
  }

  // ── A role without customer:view ──
  {
    const { context, page } = await signedIn(browser, warehouse, { width: 1280, height: 800 });
    await page.goto(`${APP}/customers`);
    await page.getByRole('heading', { name: 'You cannot see customers' }).waitFor({ timeout: 15000 });
    const text = await page.locator('body').innerText();
    check('no permission: one plain sentence, nothing technical', /Your role does not include seeing customers/.test(text) && !/403|Forbidden|permission \[/.test(text), text.slice(0, 200));
    await page.screenshot({ path: path.join(shots, 'no-permission.png') });
    await context.close();
  }

  // ── The owner, desktop ──
  {
    const { context, page } = await signedIn(browser, owner, { width: 1280, height: 800 });
    await page.goto(`${APP}/customers`);
    const rows = page.getByTestId('customer-row');
    await page.getByTestId('customer-table').waitFor({ timeout: 15000 });
    await rows.first().waitFor();
    check(`desktop: a table with ${expected.customers.length} rows (page 1 of ${expected.pages})`, await rows.count() === expected.customers.length, await rows.count());
    check('desktop: the count line names every customer in the shop', (await page.getByTestId('count').innerText()).includes(`${expected.total} customers`), await page.getByTestId('count').innerText());

    // Every cell on the first page says what the service said.
    let cellsOk = true;
    for (let i = 0; i < expected.customers.length; i += 1) {
      const c = expected.customers[i];
      const text = await rows.nth(i).innerText();
      const wants = [c.name, c.phone ? phone(c.phone) : null, c.email, rupees(c.totalSpent), ...(c.tags || [])].filter(Boolean);
      const missing = wants.filter(w => !text.includes(w));
      if (missing.length) { cellsOk = false; console.log(`      row ${i} (${c.name}) missing ${JSON.stringify(missing)}`); }
    }
    check('desktop: every row shows the name, phone (+91 spaced), email, groups and total spent the service gave', cellsOk);
    const spentRow = expected.customers.findIndex(c => c.lastVisit);
    if (spentRow >= 0) {
      const c = expected.customers[spentRow];
      const day = new Date(c.lastVisit).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(new Date(c.lastVisit).getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
      check(`desktop: last visit shown as a day ("${day}") for ${c.name}`, (await rows.nth(spentRow).innerText()).includes(day));
    }
    const noVisit = expected.customers.findIndex(c => !c.lastVisit);
    if (noVisit >= 0) check('desktop: a customer with no bills says "Not yet", not a blank', (await rows.nth(noVisit).innerText()).includes('Not yet'));
    await page.screenshot({ path: path.join(shots, 'customers-desktop.png'), fullPage: false });

    // Paging.
    if (expected.pages > 1) {
      const page2 = await apiList(owner, '&page=2');
      check('desktop: pager says "Page 1 of N"', (await page.getByTestId('page-info').innerText()).includes(`Page 1 of ${expected.pages}`));
      check('desktop: Previous is disabled on page 1', await page.getByRole('button', { name: 'Previous' }).isDisabled());
      await page.getByRole('button', { name: 'Next' }).click();
      await page.getByTestId('page-info').filter({ hasText: `Page 2 of ${expected.pages}` }).waitFor({ timeout: 10000 });
      await rows.first().filter({ hasText: page2.customers[0].name }).waitFor({ timeout: 10000 });
      check(`desktop: page 2 starts with ${page2.customers[0].name} and holds ${page2.customers.length}`, await rows.count() === page2.customers.length, await rows.count());
      if (expected.pages === 2) check('desktop: Next is disabled on the last page', await page.getByRole('button', { name: 'Next' }).isDisabled());
      await page.getByRole('button', { name: 'Previous' }).click();
      await page.getByTestId('page-info').filter({ hasText: 'Page 1 of' }).waitFor();
    } else {
      check('desktop: no pager when everything fits on one page', await page.getByTestId('page-info').count() === 0);
    }

    // Search: by name, by phone written with a space and with a trunk zero, by nothing.
    const box = page.getByLabel('Search customers');
    const withPhone = expected.customers.find(c => c.phone && /^\+91\d{10}$/.test(c.phone)) || (await apiList(owner, '&page=2')).customers.find(c => c.phone && /^\+91\d{10}$/.test(c.phone));
    const byName = await apiList(owner, `&search=${encodeURIComponent('devi')}`);
    await box.fill('devi');
    await page.getByTestId('count').filter({ hasText: byName.total === 1 ? '1 customer match' : `${byName.total} customers match` }).waitFor({ timeout: 10000 });
    check(`search "devi": ${byName.total} match, as the service says`, await rows.count() === byName.customers.length, await rows.count());
    check('search "devi": every row shown contains it', (await rows.allInnerTexts()).every(t => /devi/i.test(t)));
    if (withPhone) {
      const national = withPhone.phone.slice(3);
      const spaced = `${national.slice(0, 5)} ${national.slice(5)}`;
      await box.fill(spaced);
      await rows.first().filter({ hasText: withPhone.name }).waitFor({ timeout: 10000 });
      check(`search "${spaced}" finds ${withPhone.name}`, (await rows.allInnerTexts()).some(t => t.includes(withPhone.name)));
      await box.fill(`0${national}`);
      await page.waitForTimeout(600);
      await rows.first().filter({ hasText: withPhone.name }).waitFor({ timeout: 10000 });
      check(`search "0${national}" finds ${withPhone.name} too`, (await rows.allInnerTexts()).some(t => t.includes(withPhone.name)));
    }
    await box.fill('zzqq-nobody');
    await page.getByRole('heading', { name: 'Nobody matches that' }).waitFor({ timeout: 10000 });
    check('search for nonsense: a friendly empty state, not an error', true);
    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.getByTestId('count').filter({ hasText: `${expected.total} customers` }).waitFor({ timeout: 10000 });
    check('clearing the search brings everyone back', await rows.count() === expected.customers.length);
    await context.close();
  }

  // ── The owner, on a phone ──
  {
    const { context, page } = await signedIn(browser, owner, { width: 390, height: 844 });
    await page.goto(`${APP}/customers`);
    await page.getByTestId('customer-cards').waitFor({ timeout: 15000 });
    const rows = page.getByTestId('customer-row');
    await rows.first().waitFor();
    check(`phone: cards, ${expected.customers.length} of them`, await rows.count() === expected.customers.length, await rows.count());
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth, body: document.body.scrollWidth }));
    check('phone: no sideways scroll', widths.scroll <= widths.inner && widths.body <= widths.inner, widths);
    const first = expected.customers[0];
    const text = await rows.first().innerText();
    check(`phone: first card shows ${first.name} and ${rupees(first.totalSpent)}`, text.includes(first.name) && text.includes(rupees(first.totalSpent)), text);
    // Nothing on the card may stick out past the screen.
    const overflow = await page.evaluate(() => {
      const w = window.innerWidth;
      return [...document.querySelectorAll('[data-testid="customer-row"] *')].filter(el => el.getBoundingClientRect().right > w + 1).map(el => el.className || el.tagName).slice(0, 5);
    });
    check('phone: no element sticks out past the right edge', overflow.length === 0, overflow);
    await page.screenshot({ path: path.join(shots, 'customers-phone.png'), fullPage: false });
    await context.close();
  }

  await browser.close();
  console.log(failures === 0 ? '\nAll UI checks passed.' : `\n${failures} UI check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
