/**
 * Leads and appointments in a real browser, signed in for real (the Leads inbox mockup approved 25 Nov).
 * A retail shop: Leads only (no appointments). A lead is added from Instagram, shows its source, is taken, marked hot,
 * called, replied to on WhatsApp from CRM (never a staff phone), given a follow-up day, shown pieces, and put in Not now.
 * A boutique on CRM: Visits and booking from the lead, a clash and "Book anyway", moving, the customer's page. Every width.
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
const PHONE2 = `96${STAMP}555`.slice(0, 10);
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)?.slice(0, 300)}`}`); if (!ok) failures += 1; };
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const seed = (mode) => JSON.parse(execFileSync('npx', ['ts-node', '--transpile-only', 'src/scripts/support/boutique-seed.ts', mode, STAMP], { cwd: backend, encoding: 'utf8', shell: true }).trim().split('\n').pop());
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const settle = (page) => page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = dayKey(new Date());
const tomorrow = dayKey(new Date(Date.now() + 86_400_000));
const stub = async () => (await (await fetch('http://localhost:4099/_stub/messages')).json());
const until = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 10000 }).then(() => true, () => false);

let TOKEN = '';
async function signedIn(browser, viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 1024 });
  await ctx.addCookies([{ name: 'token', value: TOKEN, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}
const panelSays = (page, re) => until(page, (src) => new RegExp(src).test(document.querySelector('[data-testid=lead-panel]')?.innerText ?? ''), re.source);

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
    const welcome = (await page.locator('.ld-welcome').count()) > 0;
    if (welcome) await page.screenshot({ path: path.join(shots, 'leads-none-yet.png') });
    check(`/leads: ${welcome ? 'no leads yet: one welcome that says where leads come from, with Add a lead' : 'the inbox views (Waiting, Follow up today, Mine, Not taken, Hot)'}; no Visits in a retail shop`,
      await page.getByTestId('lead-add').isVisible() && (welcome ? /Shop floor visit/.test(await page.locator('.ld-welcome').innerText()) && !/website enquiry/.test(await page.locator('.ld-welcome').innerText()) : await page.getByTestId('lead-view-waiting').isVisible() && await page.getByTestId('lead-view-unassigned').isVisible()) && (await page.getByTestId('lead-view-visits').count()) === 0);

    console.log('\n2. The Leads inbox in a retail shop');
    await page.getByTestId('lead-add').click();
    await page.getByTestId('lead-phone').fill(PHONE2);
    await page.getByTestId('lead-name').fill(`UI Lead Divya ${STAMP}`);
    await page.getByTestId('lead-detail').fill('Reel: Kanchi silk launch');
    await page.getByTestId('lead-ask').fill('Is the green Kanchi silk still there?');
    await page.getByTestId('lead-save').click();
    const row = page.getByTestId('lead').filter({ hasText: `UI Lead Divya ${STAMP}` });
    await row.waitFor({ timeout: 10000 }).catch(() => {});
    const panel = page.getByTestId('lead-panel');
    await panelSays(page, new RegExp(`UI Lead Divya ${STAMP}`));
    check('added from Instagram: the row shows the source; it opens beside the list with where it came from',
      await row.isVisible() && /Instagram/.test(await row.innerText()) && /Reel: Kanchi silk launch/.test(await panel.innerText()) && /green Kanchi/.test(await panel.innerText()), await row.innerText().catch(() => ''));
    check('the source chip counts it', (await page.getByTestId('lead-source-instagram').count()) === 1 && /\d/.test(await page.getByTestId('lead-source-instagram').innerText()));
    check('a retail lead has no Book', (await panel.getByTestId('lead-book').count()) === 0);
    await page.getByTestId('lead-view-unassigned').click(); await settle(page);
    check('Not taken: it is there', await row.isVisible());
    await page.getByTestId('lead-view-all').click(); await settle(page);
    await row.click();
    await panelSays(page, new RegExp(`UI Lead Divya ${STAMP}`));
    await panel.getByTestId('lead-take').click();
    check('Take it: the lead is mine (the owner shows, the history says so)', await panelSays(page, /took it/) && (await panel.getByTestId('lead-take').count()) === 0);
    await panel.getByTestId('lead-temp-hot').click();
    await until(page, () => document.querySelector('[data-testid=lead-temp-hot]')?.getAttribute('aria-checked') === 'true');
    await page.getByTestId('lead-view-hot').click(); await settle(page);
    check('Hot: marked hot, it is in the Hot view', await row.isVisible());
    await page.getByTestId('lead-view-mine').click(); await settle(page);
    check('Mine: it is in Mine', await row.isVisible());
    await row.click();
    await panelSays(page, new RegExp(`UI Lead Divya ${STAMP}`));
    await panel.getByTestId('lead-log-call').click();
    await page.getByTestId('call-box').getByRole('radio', { name: 'No answer' }).click();
    await page.getByTestId('call-save').click();
    check('Log a call: "called, no answer" is in the history', await panelSays(page, /called · no answer/));
    await panel.getByTestId('lead-text').fill(`Hi Divya, yes, the green one is here. ${STAMP}`);
    await panel.getByTestId('lead-send').click();
    await until(page, (st) => [...document.querySelectorAll('.rp-bubble.me')].some(b => b.textContent.includes(st)), STAMP);
    const sent = (await stub()).filter(m => String(m.to).endsWith(PHONE2) && m.text.includes(STAMP));
    check('Send: CRM sends it from the shop\'s number as typed; it shows on the right', sent.length === 1 && /green one is here/.test(sent[0].text) && await panel.locator('.rp-bubble.me').filter({ hasText: STAMP }).isVisible(), sent);
    await panel.getByTestId('follow-day').fill(today);
    await panel.getByTestId('follow-save').click();
    await panelSays(page, /Follow up/);
    await page.getByTestId('lead-view-follow-up').click(); await settle(page);
    check('a follow-up day of today: it is in Follow up today', await row.isVisible());
    await page.getByTestId('lead-search').fill(`Divya ${STAMP}`); await page.waitForTimeout(500); await settle(page);
    check('search finds it by name', (await page.getByTestId('lead').count()) === 1 && await row.isVisible());
    await page.getByTestId('lead-view-all').click(); await settle(page);
    await row.click();
    await panelSays(page, new RegExp(`UI Lead Divya ${STAMP}`));
    // Show them pieces from the shop's stock, as a reply; the link opens the online shop to buy (24 Nov).
    await panel.getByTestId('lead-picks').click();
    const picks = page.getByTestId('picks-sheet');
    await page.waitForFunction(() => document.querySelector('[data-testid=picks-none]') || document.querySelector('[data-testid=pick]'), null, { timeout: 12000 }).catch(() => {});
    const pieceCount = await picks.getByTestId('pick').count();
    if (pieceCount > 0) {
      await picks.getByTestId('pick').nth(0).click();
      if (pieceCount > 1) await picks.getByTestId('pick').nth(1).click();
      await page.getByTestId('picks-send').click();
      await picks.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
      const sentPicks = (await stub()).filter(m => String(m.to).endsWith(PHONE2) && /as you asked/.test(m.text));
      check('Send pieces: they go on WhatsApp as a reply with a link to buy online; the history says so', sentPicks.length === 1 && /buy online here: http/.test(sentPicks[0].text) && await panelSays(page, /sent \d* ?pieces/), sentPicks.map(m => m.text));
    } else {
      check('Send pieces opens the pieces (none in this shop: said plainly)', await page.getByTestId('picks-none').isVisible());
      await page.keyboard.press('Escape');
    }
    await panel.getByTestId('lead-notnow').click();
    await page.getByTestId('not-now').getByRole('radio').first().click();
    await page.getByTestId('not-now').getByRole('button', { name: 'Save' }).click();
    check('Not now: it leaves the open leads', await panelSays(page, /Not now/) && await until(page, (n) => ![...document.querySelectorAll('[data-testid=lead]')].some(r => r.textContent.includes(n)), `UI Lead Divya ${STAMP}`));
    await page.screenshot({ path: path.join(shots, 'leads-inbox-laptop.png') });
    await ctx.close();

    console.log('\n3. A boutique on CRM: a lead, a reply, booking from it');
    const s = seed('seed');
    ({ ctx, page } = await signedIn(browser, { width: 1366, height: 900 }));
    await page.goto(`${APP}/leads`); await settle(page);
    check('the menu now has Appointments and Leads; Leads has Visits', (await page.getByRole('link', { name: /Appointments/ }).count()) > 0 && (await page.getByRole('link', { name: /Leads/ }).count()) > 0 && await page.getByTestId('lead-view-visits').isVisible());
    await page.getByTestId('lead-add').click();
    await page.getByTestId('lead-phone').fill(PHONE);
    await page.getByTestId('lead-name').fill(`UI Lead Kavya ${STAMP}`);
    await page.getByTestId('lead-ask').fill('Bridal lehenga for a February wedding');
    await page.getByTestId('lead-save').click();
    const card = page.getByTestId('lead').filter({ hasText: `UI Lead Kavya ${STAMP}` });
    await card.waitFor({ timeout: 10000 }).catch(() => {});
    const bp = page.getByTestId('lead-panel');
    check('added: the lead, open beside the list with what they asked', await card.isVisible() && await panelSays(page, /Bridal lehenga/));
    await bp.getByTestId('lead-text').fill(`Hi Kavya, can you come in on Saturday? ${STAMP}`);
    await bp.getByTestId('lead-send').click();
    await until(page, (st) => [...document.querySelectorAll('.rp-bubble.me')].some(b => b.textContent.includes(st)), STAMP);
    const out = (await stub()).filter(m => String(m.to).endsWith(PHONE) && m.text.includes(STAMP));
    check('Send: from the shop\'s number, as typed; it shows in the history', out.length === 1 && /Saturday/.test(out[0].text), out);
    await page.goto(`${APP}/leads?show=talking`); await settle(page);
    check('...they move to Talking', await card.waitFor({ timeout: 10000 }).then(() => true, () => false), page.url());
    await card.click();
    await panelSays(page, new RegExp(`UI Lead Kavya ${STAMP}`));
    await bp.getByTestId('lead-book').click();
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
    await page.getByTestId('lead-view-visits').click(); await settle(page);
    check('Visits: she is coming in tomorrow', await card.waitFor({ timeout: 10000 }).then(() => true, () => false) && /11:00/.test(await card.innerText()), await card.innerText().catch(() => ''));

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
    check('the lead is Booked now', await page.getByTestId('lead').filter({ hasText: `UI Lead Kavya ${STAMP}` }).isVisible());
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
      const small = await page.evaluate(() => [...document.querySelectorAll('.bk-chip, .ld-row')].filter(el => el.getBoundingClientRect().height && el.getBoundingClientRect().height < 34).length);
      // A phone: the list, then the lead on its own with a way back; a laptop: both side by side.
      const wide = width >= 1024;
      if (!wide) await page.getByTestId('lead').first().click();
      const opened = await page.getByTestId('lead-panel').waitFor({ timeout: 10000 }).then(() => true, () => false);
      const c = await fits(page);
      const listHidden = wide || (await page.getByTestId('lead').count()) === 0;
      const panelSmall = await page.evaluate(() => [...document.querySelectorAll('.lp-acts button, .lp-acts a, .lp-t')].filter(el => el.getBoundingClientRect().height && el.getBoundingClientRect().height < 36).length);
      if (width === 390) await page.screenshot({ path: path.join(shots, 'leads-phone.png'), fullPage: true });
      let back = true;
      if (!wide) { await page.getByRole('button', { name: 'Back to the leads' }).click(); back = await page.getByTestId('lead').first().waitFor({ timeout: 8000 }).then(() => true, () => false); }
      check(`${label} (${width}): nothing off the screen; the booking sheet fits; the lead opens ${wide ? 'beside the list' : 'on its own with Back'}; tap targets big enough`,
        a && b && c && sheetFits && n === 2 && small === 0 && opened && listHidden && panelSmall === 0 && back, { a, b, c, sheetFits, n, small, opened, listHidden, panelSmall, back });
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
