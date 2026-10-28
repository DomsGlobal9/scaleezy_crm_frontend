/**
 * Drives the customer page in a real browser against the running CRM service and web app, signed
 * in with the cookie Inventory sets. What the screen shows is checked against the service's own
 * answer, so a wrong number or a missing event fails here.
 *
 *   npm run verify:customer-page-ui      (service on 4008, web app on 5176, LOCAL database with
 *                                          backend/src/scripts/fixtures/local-customer-page.sql loaded)
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
/** A real sign-in through the LOCAL Inventory server (backend/src/scripts/test-login.ts): CRM holds no signing secret. */
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const rupees = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const phone = (p) => { const m = /^\+91(\d{5})(\d{5})$/.exec(p || ''); return m ? `+91 ${m[1]} ${m[2]}` : (p || ''); };
const day = (iso) => { const d = new Date(iso); return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) }); };

async function api(token, p) {
  const res = await fetch(`${API}${p}`, { headers: { authorization: `Bearer ${token}` } });
  return (await res.json()).data;
}

async function signedIn(browser, token, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { context, page };
}

async function main() {
  const owner = tokenFor('owner');
  // The customer with the most bills in the test shop: the busiest page.
  const list = await api(owner, '/customers?pageSize=100');
  const busiest = [...list.customers].sort((a, b) => b.orders - a.orders)[0];
  const quiet = list.customers.find(c => c.orders === 0);
  const expected = await api(owner, `/customers/${busiest.id}`);
  const firstPage = await api(owner, `/customers/${busiest.id}/timeline?limit=30`);
  const returnsOnly = await api(owner, `/customers/${busiest.id}/timeline?kind=returns&limit=30`);

  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });

  // ── From the list to the page, on a laptop ──
  {
    const { context, page } = await signedIn(browser, owner, { width: 1280, height: 900 });
    await page.goto(`${APP}/customers`);
    const box = page.getByLabel('Search customers');
    await box.fill(busiest.name);
    await page.waitForURL(/[?&]q=/, { timeout: 10000 });
    const row = page.getByTestId('customer-row').filter({ hasText: busiest.name }).first();
    await row.waitFor({ timeout: 10000 });
    await row.click();
    await page.waitForURL(new RegExp(`/customers/${busiest.id}$`), { timeout: 10000 });
    check('clicking a list row opens that customer', true);

    const profile = page.getByTestId('profile');
    await profile.waitFor({ timeout: 15000 });
    const p = expected.profile;
    const ptext = await profile.innerText();
    const wants = [p.name, p.code, p.phone ? phone(p.phone) : null, p.email, ...p.tags].filter(Boolean);
    check('profile shows name, code, phone (+91 spaced), email and groups', wants.every(w => ptext.includes(w)), wants.filter(w => !ptext.includes(w)));
    if (p.birthday) {
      const [mm, dd] = p.birthday.split('-').map(Number);
      const want = `${dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mm - 1]}`;
      check(`birthday shown as "${want}"`, ptext.includes(want));
    }
    const consent = await page.getByTestId('consent').innerText();
    if (p.consent.whatsappOffers && !p.consent.stoppedAt) {
      check('consent says yes, with who recorded it', /WhatsApp offers: yes/.test(consent) && (!p.consent.by || consent.includes(p.consent.by)), consent);
    } else {
      check('consent says not agreed (or STOP)', /not agreed|STOP/.test(consent), consent);
    }

    const n = expected.numbers;
    check(`lifetime spend ${rupees(n.lifetimeSpend)} and ${n.bills} bills`, (await page.getByTestId('num-spend').innerText()).includes(rupees(n.lifetimeSpend)) && (await page.getByTestId('num-spend').innerText()).includes(`${n.bills} bills`));
    if (n.averageBill !== null) check(`average bill ${rupees(n.averageBill)}`, (await page.getByTestId('num-average').innerText()).includes(rupees(n.averageBill)));
    if (n.lastVisit) check(`last visit ${day(n.lastVisit)}`, (await page.getByTestId('num-last').innerText()).includes(day(n.lastVisit)));
    check(`points ${n.loyaltyPoints.toLocaleString('en-IN')}`, (await page.getByTestId('num-points').innerText()).includes(n.loyaltyPoints.toLocaleString('en-IN')));
    check(`store credit ${rupees(n.storeCredit)}`, (await page.getByTestId('num-credit').innerText()).includes(rupees(n.storeCredit)));
    check(`returns ${n.returns}, ${rupees(n.refunded)} refunded`, (await page.getByTestId('num-returns').innerText()).includes(`${rupees(n.refunded)} refunded`));
    const tastes = (await page.getByTestId('tastes').innerText()).toLowerCase();
    if (expected.favourites.kinds.length) check('what they buy is spelled out', tastes.includes(expected.favourites.kinds[0].toLowerCase()));
    if (expected.favourites.colours.length) check(`their colours are named (${expected.favourites.colours.join(', ')})`, expected.favourites.colours.every(c => tastes.includes(c)));
    check('never "buys mostly other"', !/buys mostly other/.test(tastes), tastes);

    // The timeline: the first page as the service gave it, in order.
    const events = page.getByTestId('event');
    await events.first().waitFor({ timeout: 15000 });
    check(`timeline shows the first ${firstPage.events.length} events`, await events.count() === firstPage.events.length, await events.count());
    const titles = await events.locator('.cp-ev-title').allInnerTexts();
    check('timeline in the service\'s order, newest first', JSON.stringify(titles) === JSON.stringify(firstPage.events.map(e => e.title)));
    const firstBill = firstPage.events.find(e => e.kind === 'bill' && !e.flag);
    if (firstBill) {
      const t = await events.filter({ hasText: firstBill.title }).first().innerText();
      check(`a bill row shows its amount ${rupees(firstBill.amount)}`, t.includes(rupees(firstBill.amount)), t);
    }
    const note = firstPage.events.find(e => e.kind === 'note');
    if (note) check('a note shows its words, without a made-up time', (await events.filter({ hasText: note.detail }).first().locator('.cp-when').count()) === 0);
    check('days are headed', (await page.locator('.cp-day').count()) >= 1);
    await page.screenshot({ path: path.join(shots, 'customer-page-desktop.png'), fullPage: true });

    // Show earlier.
    if (firstPage.nextBefore) {
      const before = await events.count();
      await page.getByRole('button', { name: 'Show earlier' }).click();
      await page.waitForFunction((n) => document.querySelectorAll('[data-testid="event"]').length > n, before, { timeout: 15000 });
      const second = await api(owner, `/customers/${busiest.id}/timeline?limit=30&before=${encodeURIComponent(firstPage.nextBefore)}`);
      check(`"Show earlier" adds the next ${second.events.length}`, await events.count() === before + second.events.length, await events.count());
      const ids = await events.evaluateAll(els => els.map(el => el.dataset.id));
      check('no event appears twice after "Show earlier"', new Set(ids).size === ids.length, ids.length - new Set(ids).size);
    }

    // A filter chip.
    await page.getByRole('tab', { name: 'Returns' }).click();
    // Wait for the returns themselves: while the filter loads, the list is briefly empty, and an
    // empty list would pass "every event is a return" trivially.
    await page.waitForFunction(() => { const els = [...document.querySelectorAll('[data-testid="event"]')]; return els.length > 0 && els.every(el => el.dataset.kind === 'return'); }, null, { timeout: 15000 });
    check(`"Returns" shows only returns, ${returnsOnly.events.length} of them`, await events.count() === returnsOnly.events.length, await events.count());
    check('the chosen chip is marked', await page.getByRole('tab', { name: 'Returns' }).getAttribute('aria-selected') === 'true');

    // Back to the list as it was left.
    await page.getByRole('button', { name: 'Customers' }).click();
    await page.waitForURL(/\/customers\?q=/, { timeout: 10000 });
    check('"← Customers" goes back to the list with the search kept', (await page.getByLabel('Search customers').inputValue()) === busiest.name);
    await context.close();
  }

  // ── The same page on a phone ──
  {
    const { context, page } = await signedIn(browser, owner, { width: 390, height: 844 });
    await page.goto(`${APP}/customers/${busiest.id}`);
    await page.getByTestId('event').first().waitFor({ timeout: 15000 });
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    check('phone: no sideways scroll', widths.scroll <= widths.inner, widths);
    const overflow = await page.evaluate(() => {
      const w = window.innerWidth;
      return [...document.querySelectorAll('main *')]
        .filter(el => !el.closest('.cp-chips') && el.getBoundingClientRect().right > w + 1)
        .map(el => el.className || el.tagName).slice(0, 5);
    });
    check('phone: nothing sticks out past the right edge (the chip row scrolls on its own)', overflow.length === 0, overflow);
    await page.screenshot({ path: path.join(shots, 'customer-page-phone.png'), fullPage: true });
    await context.close();
  }

  // ── Edges ──
  {
    const { context, page } = await signedIn(browser, owner, { width: 1280, height: 800 });
    if (quiet) {
      await page.goto(`${APP}/customers/${quiet.id}`);
      await page.getByTestId('timeline-empty').waitFor({ timeout: 15000 });
      check(`${quiet.name} (no bills): "Nothing here yet", last visit "Not yet"`, (await page.getByTestId('num-last').innerText()).includes('Not yet'));
    }
    await page.goto(`${APP}/customers/00000000-0000-4000-8000-000000000000`);
    await page.getByRole('heading', { name: 'This customer could not be found' }).waitFor({ timeout: 15000 });
    const text = await page.locator('body').innerText();
    check('an unknown customer: one plain sentence, no toast, nothing technical', !/404|Not found\.|statusCode|undefined/.test(text) && (await page.locator('[role="status"]').count()) === 0, text.slice(0, 200));
    await context.close();
  }
  {
    const { context, page } = await signedIn(browser, tokenFor('warehouse'), { width: 1280, height: 800 });
    await page.goto(`${APP}/customers/${busiest.id}`);
    await page.getByRole('heading', { name: 'You cannot see customers' }).waitFor({ timeout: 15000 });
    check('a role without customer access sees the plain refusal, not the page', (await page.getByTestId('profile').count()) === 0);
    await context.close();
  }

  await browser.close();
  console.log(failures === 0 ? '\nAll customer page UI checks passed.' : `\n${failures} UI check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
