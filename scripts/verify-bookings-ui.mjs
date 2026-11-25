/**
 * Appointments and leads (the mockup approved 20 Nov) in a real browser, signed in for real. A shop that does not use
 * Boutique sees none of it; a boutique on CRM adds a lead, replies on WhatsApp from CRM (never a staff phone), books
 * from the lead, sees a clash and books anyway, moves one, and sees it on the customer's page. Every width.
 *
 *   node scripts/verify-bookings-ui.mjs      (CRM on 4008, the app on 5176, local Inventory on 4016, WhatsApp stub on 4099)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..', '..', 'backend');
const shots = path.join(here, 'screenshots');
const STAMP = String(Date.now() % 100000).padStart(5, '0');
const PHONE = `97${STAMP}444`.slice(0, 10);
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)?.slice(0, 300)}`}`); if (!ok) failures += 1; };
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const seed = (mode) => JSON.parse(execFileSync('npx', ['ts-node', '--transpile-only', 'src/scripts/support/boutique-seed.ts', mode, STAMP], { cwd: backend, encoding: 'utf8', shell: true }).trim().split('\n').pop());
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const settle = (page) => page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const tomorrow = dayKey(new Date(Date.now() + 86_400_000));
const stub = async () => (await (await fetch('http://localhost:4099/_stub/messages')).json());

let TOKEN = '';
async function signedIn(browser, viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 1024 });
  await ctx.addCookies([{ name: 'token', value: TOKEN, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}

async function main() {
  seed('clear');
  TOKEN = tokenFor('owner');
  await fetch('http://localhost:4099/_stub/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: 'verify-suites-tenant', status: 'CONNECTED', linkedDaysAgo: 30 }) }).catch(() => {});
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    console.log('\n1. A retail shop (no Boutique): Leads, no appointments, nothing of stitching');
    let { ctx, page } = await signedIn(browser, { width: 1366, height: 900 });
    await page.goto(`${APP}/today`); await settle(page);
    check('Leads is in the menu; Appointments and Due and ready (boutique) are not', (await page.getByRole('link', { name: /^Leads/ }).count()) > 0 && (await page.getByRole('link', { name: /^Appointments/ }).count()) === 0 && (await page.getByRole('link', { name: /Due and ready/ }).count()) === 0);
    await page.goto(`${APP}/appointments`); await settle(page);
    check('/appointments typed in: "for boutique shops", with the way to Leads', await page.getByTestId('appt-retail').isVisible() && /boutique shops/.test(await page.getByTestId('appt-retail').innerText()));
    await page.goto(`${APP}/leads`); await settle(page);
    check('/leads: the leads page, no booking and no Visits in a retail shop', await page.getByTestId('lead-add').isVisible() && (await page.getByTestId('lead-show-visits').count()) === 0);
    await ctx.close();

    console.log('\n2. Leads');
    const s = seed('seed');
    ({ ctx, page } = await signedIn(browser, { width: 1366, height: 900 }));
    await page.goto(`${APP}/leads`); await settle(page);
    check('the menu now has Appointments and Leads', (await page.getByRole('link', { name: /Appointments/ }).count()) > 0 && (await page.getByRole('link', { name: /Leads/ }).count()) > 0);
    await page.getByTestId('lead-add').click();
    await page.getByTestId('lead-phone').fill(PHONE);
    await page.getByTestId('lead-name').fill(`UI Lead Kavya ${STAMP}`);
    await page.getByTestId('lead-ask').fill('Bridal lehenga for a February wedding');
    await page.getByTestId('lead-save').click();
    const card = page.getByTestId('lead').filter({ hasText: `UI Lead Kavya ${STAMP}` });
    await card.waitFor({ timeout: 10000 }).catch(() => {});
    check('added: a New lead with what they asked', await card.isVisible() && /Bridal lehenga/.test(await card.innerText()) && /New/.test(await card.innerText()), await card.innerText().catch(() => ''));
    await card.getByTestId('lead-reply').click();
    const sheet = page.getByTestId('reply-sheet');
    await sheet.getByText('Bridal lehenga').first().waitFor({ timeout: 10000 }).catch(() => {});
    check('Reply opens a chat: their question shown', await sheet.isVisible() && /Bridal lehenga/.test(await sheet.innerText()));
    await page.getByTestId('reply-text').fill(`Hi Kavya, can you come in on Saturday? ${STAMP}`);
    await page.getByTestId('reply-send').click();
    await page.waitForFunction((st) => [...document.querySelectorAll('.rp-bubble.me')].some(b => b.textContent.includes(st)), STAMP, { timeout: 10000 }).catch(() => {});
    const out = (await stub()).filter(m => String(m.to).endsWith(PHONE) && m.text.includes(STAMP));
    check('Send: CRM sends it from the shop\'s number, as typed; it shows in the chat', out.length === 1 && /Saturday/.test(out[0].text) && await sheet.locator('.rp-bubble.me').filter({ hasText: STAMP }).isVisible(), out);
    await page.keyboard.press('Escape');
    await page.getByTestId('lead-show-talking').click(); await settle(page);
    const talking = await page.getByTestId('lead').filter({ hasText: `UI Lead Kavya ${STAMP}` }).waitFor({ timeout: 10000 }).then(() => true, () => false);
    check('...they move to Talking', talking && /show=talking/.test(page.url()), page.url());
    // Show them pieces from the shop's stock, as a reply; the link opens the online shop to buy (24 Nov).
    await page.getByTestId('lead').filter({ hasText: `UI Lead Kavya ${STAMP}` }).getByTestId('lead-picks').click();
    const picks = page.getByTestId('picks-sheet');
    await page.waitForFunction(() => document.querySelector('[data-testid=picks-none]') || document.querySelector('[data-testid=pick]'), null, { timeout: 12000 }).catch(() => {});
    const pieceCount = await picks.getByTestId('pick').count();
    if (pieceCount > 0) {
      await picks.getByTestId('pick').nth(0).click();
      if (pieceCount > 1) await picks.getByTestId('pick').nth(1).click();
      await page.getByTestId('picks-send').click();
      await picks.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
      const sentPicks = (await stub()).filter(m => String(m.to).endsWith(PHONE) && /as you asked/.test(m.text));
      check('Send pieces on the lead: the pieces go on WhatsApp as a reply, with a link to buy online', sentPicks.length === 1 && /buy online here: http/.test(sentPicks[0].text), sentPicks.map(m => m.text));
    } else {
      check('Send pieces on the lead opens the pieces (none in this shop: said plainly)', await page.getByTestId('picks-none').isVisible());
      await page.keyboard.press('Escape');
    }

    console.log('\n3. Booking from the lead');
    await page.getByTestId('lead').filter({ hasText: `UI Lead Kavya ${STAMP}` }).getByTestId('lead-book').click();
    const book = page.getByTestId('book-sheet');
    check('Book opens with the lead already chosen', await book.isVisible() && (await book.innerText()).includes(`UI Lead Kavya ${STAMP}`));
    await book.getByRole('radio', { name: 'Trial' }).click();
    await page.getByTestId('book-day').fill(tomorrow);
    await page.getByTestId('book-time').fill('11:00');
    await page.getByTestId('book-staff').fill('Meena');
    await page.getByTestId('book-save').click();
    await book.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    const told = (await stub()).filter(m => String(m.to).endsWith(PHONE) && /is booked for/.test(m.text));
    check('booked; she is told the time on WhatsApp by CRM', !(await book.isVisible()) && told.length === 1 && /11:00 am/.test(told[0].text), told.map(m => m.text));

    console.log('\n4. Appointments, a clash, moving');
    await page.goto(`${APP}/appointments?view=tomorrow`); await settle(page);
    await page.getByTestId('appt-book').click();
    await page.getByTestId('book-search').fill(s.name.slice(0, 12));
    await page.locator('.bk-found button').filter({ hasText: s.name }).first().click({ timeout: 10000 });
    await page.getByTestId('book-day').fill(tomorrow);
    await page.getByTestId('book-time').fill('11:15');
    await page.getByTestId('book-staff').fill('Meena');
    await page.getByTestId('book-save').click();
    const clash = page.getByTestId('book-clash');
    await clash.waitFor({ timeout: 8000 }).catch(() => {});
    check('the same person at the same time: who is there, and "Book anyway"', await clash.isVisible() && /Meena already has UI Lead Kavya/.test(await clash.innerText()), await clash.innerText().catch(() => ''));
    await clash.getByRole('button', { name: 'Book anyway' }).click();
    await page.getByTestId('book-sheet').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=appt]').length >= 2, null, { timeout: 10000 }).catch(() => {});
    const cards = page.getByTestId('appt');
    check('Tomorrow: both, in time order', (await cards.count()) === 2 && /11:00/.test(await cards.nth(0).innerText()) && /11:15/.test(await cards.nth(1).innerText()), await cards.allInnerTexts());
    await cards.filter({ hasText: s.name }).getByTestId('appt-move').click();
    await page.getByTestId('book-time').fill('12:30');
    await page.getByTestId('book-save').click();
    await page.getByTestId('book-sheet').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=appt]')].some(c => c.textContent.includes('12:30')), null, { timeout: 10000 }).catch(() => {});
    check('Move: the new time shows', /12:30/.test(await cards.filter({ hasText: s.name }).innerText()), await cards.allInnerTexts());
    await page.goto(`${APP}/appointments?view=week`); await settle(page);
    check('laptop, This week: a column a day', await page.getByTestId('appt-week').isVisible() && (await page.getByTestId('appt-slot').count()) >= 2);
    await page.screenshot({ path: path.join(shots, 'appointments-week.png') });

    console.log('\n5. On the customer\'s page');
    await page.goto(`${APP}/customers/${s.customerId}`); await settle(page);
    const strip = page.getByTestId('appt-strip');
    check('the next appointment is in the strip under the header', await strip.isVisible() && /Trial tomorrow 12:30 pm with Meena/.test(await strip.innerText()), await strip.innerText().catch(() => ''));
    await strip.click();
    await page.getByTestId('customer-appointments').waitFor({ timeout: 8000 }).catch(() => {});
    check('...it opens Boutique work, which lists her appointments', await page.getByTestId('customer-appointments').isVisible() && /Trial/.test(await page.getByTestId('customer-appointments').innerText()));

    console.log('\n6. The lead after booking');
    await page.goto(`${APP}/leads?show=booked`); await settle(page);
    const booked = page.getByTestId('lead').filter({ hasText: `UI Lead Kavya ${STAMP}` });
    check('the lead is Booked now', await booked.isVisible());
    await page.goto(`${APP}/leads?show=booked`); await settle(page);
    await ctx.close();

    console.log('\n7. Every device');
    for (const [label, width, height] of [['small phone', 360, 760], ['phone', 390, 844], ['tablet', 768, 1024], ['laptop', 1280, 900]]) {
      ({ ctx, page } = await signedIn(browser, { width, height }));
      await page.goto(`${APP}/appointments?view=tomorrow`); await settle(page);
      const a = await fits(page);
      const n = await page.getByTestId('appt').count();
      await page.getByTestId('appt-book').click();
      const sheetFits = await fits(page) && await page.getByTestId('book-sheet').evaluate(el => el.getBoundingClientRect().right <= window.innerWidth + 1);
      if (width === 390) await page.screenshot({ path: path.join(shots, 'appointments-book-phone.png') });
      await page.keyboard.press('Escape');
      await page.goto(`${APP}/leads?show=booked`); await settle(page);
      const b = await fits(page);
      const small = await page.evaluate(() => [...document.querySelectorAll('.ap-acts button, .ap-acts a, .bk-chip')].filter(el => el.getBoundingClientRect().height && el.getBoundingClientRect().height < 36).length);
      if (width === 390) await page.screenshot({ path: path.join(shots, 'leads-phone.png') });
      check(`${label} (${width}): nothing off the screen; the booking sheet fits; tap targets 36px or more`, a && b && sheetFits && n === 2 && small === 0, { a, b, sheetFits, n, small });
      await ctx.close();
    }
  } finally {
    await browser.close();
    seed('clear');
  }
  console.log(failures ? `\n${failures} check(s) FAILED.` : '\nAll appointments and leads UI checks passed.');
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); try { seed('clear'); } catch { /* fine */ } process.exit(1); });
