/**
 * Notes, follow-ups, Today and duplicates in a real browser (Edge), against the running service (4008)
 * and app (5176) on the LOCAL databases. Signed in for real; everything checked on screen.
 *
 *   npm run verify:work-ui     (fixtures: local-test-logins, local-customer-page, local-today)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const backend = path.resolve(here, '..', '..', 'backend');
const SHOP = 'verify-suites-tenant';
const STAMP = `CHECK-UI-${Date.now() % 100000}`;
const API = process.env.CRM_URL || 'http://localhost:4008';

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
};
const run = (...args) => execFileSync('npm', ['run', '--silent', ...args], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const tokenFor = (who) => run('login:test', '--', who);
const shopTool = (...args) => run('shop:test', '--', ...args);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function as(browser, who, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: 'token', value: tokenFor(who), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}

async function main() {
  shopTool('cleanchecks', SHOP);
  shopTool('unpair', SHOP);
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });

  // Sales signs in once so they are on the team list (a follow-up can be for them).
  { const { ctx, page } = await as(browser, 'sales'); await page.goto(`${APP}/today`); await page.getByRole('heading', { name: 'Today' }).waitFor({ timeout: 20000 }); await ctx.close(); }

  // ── The customer page's working card ──
  {
    const { ctx, page } = await as(browser, 'owner');
    await page.goto(`${APP}/customers?q=Lakshmi`);
    await page.getByTestId('customer-row').filter({ hasText: 'Lakshmi Devi' }).first().click();
    const card = page.getByTestId('work-card');
    await card.waitFor({ timeout: 20000 });
    check('the customer page has the follow-ups and notes card', await card.getByRole('heading', { name: 'Follow-ups' }).isVisible() && await card.getByRole('heading', { name: 'Notes' }).isVisible());

    await card.getByRole('button', { name: 'Save follow-up' }).click();
    check('saving with nothing written: "Write what needs doing."', (await card.getByRole('alert').innerText()).includes('Write what needs doing.'));
    await card.getByLabel('Add a follow-up').fill(`${STAMP} ask about the blouse fitting`);
    await card.getByRole('radio', { name: 'Today' }).click();
    await card.getByRole('combobox', { name: 'Who' }).click();
    await page.getByRole('option', { name: 'Local SALES' }).click();
    await card.getByRole('button', { name: 'Save follow-up' }).click();
    const tag = card.getByTestId('followup').filter({ hasText: `${STAMP} ask about the blouse fitting` });
    await tag.waitFor({ timeout: 20000 });
    check('the follow-up appears as a tag, due today, for Local SALES', /Today/.test(await tag.innerText()) && /Local SALES/.test(await tag.innerText()), await tag.innerText());

    await card.getByLabel('Add a follow-up').fill(`${STAMP} send the new Banarasi photos`);
    await card.getByRole('radio', { name: 'Tomorrow' }).click();
    await card.getByRole('button', { name: 'Save follow-up' }).click();
    const tag2 = card.getByTestId('followup').filter({ hasText: `${STAMP} send the new Banarasi photos` });
    await tag2.waitFor({ timeout: 20000 });
    check('a second one, tomorrow, for me', /Tomorrow/.test(await tag2.innerText()));
    await tag2.getByRole('button', { name: /Mark done/ }).click();
    await card.getByText(/Done lately/).waitFor({ timeout: 20000 });
    await card.getByText(/Done lately/).click();
    const doneTag = card.getByTestId('followup').filter({ hasText: `${STAMP} send the new Banarasi photos` });
    check('marked done: it moves to "Done lately", with Undo', await doneTag.getAttribute('data-state') === 'done' && await doneTag.getByRole('button', { name: 'Undo' }).isVisible());

    await card.getByLabel('Write a note for the team').fill(`${STAMP} prefers WhatsApp after 6 pm`);
    await card.getByRole('button', { name: 'Save note' }).click();
    await card.getByTestId('note').filter({ hasText: `${STAMP} prefers WhatsApp after 6 pm` }).waitFor({ timeout: 20000 });
    check('a note appears at the top of the notes, with who wrote it', (await card.getByTestId('note').first().innerText()).includes('Verification Owner'));

    await page.getByRole('tab', { name: 'Notes & follow-ups' }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="event"]')].some(e => /Follow-up done/.test(e.textContent)), null, { timeout: 20000 });
    const titles = await page.locator('[data-testid="event"] .cp-ev-title').allInnerTexts();
    check('the timeline\'s "Notes & follow-ups" shows the note, the follow-ups added and the one done', titles.some(t => /^Follow-up added/.test(t)) && titles.some(t => /^Follow-up done/.test(t)) && titles.some(t => /^Note by Verification Owner/.test(t)), titles.slice(0, 6));
    await page.getByRole('tab', { name: 'Everything' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(shots, 'work-customer-desktop.png'), fullPage: false });
    await ctx.close();
  }

  // A promise to Anitha (a real phone), for Sales, due today: for the WhatsApp message.
  const ownerHeaders = { Authorization: `Bearer ${tokenFor('owner')}`, 'Content-Type': 'application/json' };
  const anithaId = (await (await fetch(`${API}/api/v1/customers?search=9848022301`, { headers: ownerHeaders })).json()).data.customers[0].id;
  const salesId = (await (await fetch(`${API}/api/v1/staff`, { headers: ownerHeaders })).json()).data.find(x => x.name === 'Local SALES').id;
  const shopDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  await fetch(`${API}/api/v1/customers/${anithaId}/followups`, { method: 'POST', headers: ownerHeaders, body: JSON.stringify({ body: `${STAMP} tell her the kurti is in`, dueOn: shopDay, assigneeId: salesId }) });

  // ── Today, for Sales ──
  {
    const { ctx, page } = await as(browser, 'sales');
    await page.goto(`${APP}/today`);
    await page.getByRole('heading', { name: 'Today' }).waitFor({ timeout: 20000 });
    const badge = page.locator('.crm-tab', { hasText: 'Today' }).locator('.crm-badge');
    await badge.waitFor({ timeout: 20000 });
    const before = Number(await badge.innerText());
    const rows = page.getByTestId('talk-row');
    const promise = rows.filter({ hasText: `${STAMP} ask about the blouse fitting` });
    await promise.waitFor({ timeout: 20000 });
    check('Sales sees the promise the owner gave them, first, with the customer to call', /You promised/.test(await promise.innerText()) && /Lakshmi Devi/.test(await promise.innerText()) && (await rows.first().getAttribute('data-kind')) === 'promise');
    check('the Today tab carries a badge with what is due', before >= 1, before);
    check('no birthdays on Today (Inventory wishes customers by itself)', (await rows.filter({ hasText: /happy birthday|Birthday today/i }).count()) === 0);
    const notSeen = await rows.filter({ hasText: /Not seen in/ }).allInnerTexts();
    check('regulars not seen: Gayathri Iyer first, 75 days, ₹48,200 over 3 bills', /Gayathri Iyer/.test(notSeen[0] ?? '') && /Not seen in 75 days/.test(notSeen[0]) && /₹48,200 over 3 bills/.test(notSeen[0]), notSeen);
    const gayathri = rows.filter({ hasText: 'Gayathri Iyer' });
    check('Gayathri never agreed to WhatsApp: no WhatsApp, "a call is best"', /No WhatsApp consent: a call is best/.test(await gayathri.innerText()) && (await gayathri.getByRole('button', { name: 'WhatsApp' }).count()) === 0);

    // A promise to someone with a phone: the message, in her language, opened on this phone.
    const anitha = rows.filter({ hasText: `${STAMP} tell her the kurti is in` });
    await anitha.waitFor({ timeout: 20000 });
    await anitha.getByRole('button', { name: 'WhatsApp' }).click();
    const box = anitha.getByLabel('The message');
    await box.waitFor();
    check('WhatsApp: a short message written for her, ending with the shop\'s name', /^Hello Anitha/.test(await box.inputValue()) && /Sri Lakshmi Silks/.test(await box.inputValue()), await box.inputValue());
    check('...the five languages stay out of the way until asked for', (await anitha.getByRole('button', { name: 'తెలుగు' }).count()) === 0);
    await anitha.getByRole('button', { name: /change language/ }).click();
    await anitha.getByRole('button', { name: 'తెలుగు' }).click();
    await page.waitForFunction(() => /గారు/.test(document.querySelector('[data-testid="compose"] textarea')?.value ?? ''), null, { timeout: 10000 });
    check('...Telugu in two taps, and it says so', /గారు/.test(await box.inputValue()) && /In తెలుగు/.test(await anitha.innerText()));
    const href = await anitha.getByTestId('open-whatsapp').getAttribute('href');
    check('...and "Open WhatsApp" opens her number with that message', href?.startsWith('https://wa.me/919848022301?text=') && decodeURIComponent(href.split('text=')[1]).includes('గారు'), href);
    await page.screenshot({ path: path.join(shots, 'work-today-desktop.png'), fullPage: true });

    await promise.getByRole('button', { name: 'Done' }).click();
    await promise.waitFor({ state: 'detached', timeout: 20000 });
    await page.waitForFunction((n) => { const b = [...document.querySelectorAll('.crm-tab')].find(t => /To do today/.test(t.textContent))?.querySelector('.crm-badge'); return !b || Number(b.textContent) < n; }, before, { timeout: 20000 });
    check('Done on the promise: off the list, and the badge goes down', true);
    await gayathri.getByRole('button', { name: 'Done' }).click();
    await gayathri.waitFor({ state: 'detached', timeout: 20000 });
    const doneToday = page.getByTestId('done-today');
    check('Done on Gayathri: "Done today" says so', /Gayathri Iyer \(got in touch/.test(await doneToday.innerText()), await doneToday.innerText());
    await doneToday.getByRole('button', { name: 'Show' }).click();
    await doneToday.locator('li', { hasText: 'Gayathri Iyer' }).getByRole('button', { name: 'Undo' }).click();
    await rows.filter({ hasText: 'Gayathri Iyer' }).waitFor({ timeout: 20000 });
    check('Undo: she is back on the list', true);
    await page.goto(`${APP}/customers`);
    await page.getByRole('heading', { name: 'All customers' }).waitFor({ timeout: 20000 });
    check('Sales has no "Check duplicates" (on All customers, nor in the sidebar)', (await page.getByTestId('check-duplicates').count()) === 0 && (await page.locator('.crm-tab', { hasText: /duplicates/i }).count()) === 0);
    await page.goto(`${APP}/duplicates`);
    await page.getByRole('heading', { name: 'Only an owner or admin can merge customers' }).waitFor({ timeout: 20000 });
    check('...and the Duplicates page says plainly that it is for owners and admins', true);
    await ctx.close();
  }

  // ── Duplicates, for the owner ──
  {
    shopTool('pair', SHOP);
    const { ctx, page } = await as(browser, 'owner');
    await page.goto(`${APP}/customers`);
    const dupes = page.getByTestId('check-duplicates');
    await dupes.waitFor({ timeout: 20000 });
    await page.waitForFunction(() => /Check duplicates\s*1/.test(document.querySelector('[data-testid="check-duplicates"]')?.textContent ?? ''), null, { timeout: 20000 }).catch(() => {});
    check('All customers: "Check duplicates" with the count waiting (1)', /Check duplicates\s*1/.test(await dupes.innerText()), await dupes.innerText());
    check('...and duplicates are no longer in the sidebar', (await page.locator('.crm-tab', { hasText: /duplicates/i }).count()) === 0);
    await dupes.click();
    await page.waitForURL(/\/duplicates$/);
    const pair = page.getByTestId('pair').filter({ hasText: 'Sowmya Reddy' });
    await pair.waitFor({ timeout: 20000 });
    check('the pair to review: Sowmya Reddy and Anitha Reddy side by side', /Anitha Reddy/.test(await pair.innerText()));
    check('...the reason in plain words (family phone)', /family often shares one phone/.test(await pair.innerText()));
    check('...the phone matches (quiet), the names differ (marked)', (await pair.locator('.dp-field.same', { hasText: 'Phone' }).count()) === 1);
    check('Check duplicates has a way back to All customers', (await page.getByRole('link', { name: 'All customers' }).filter({ hasText: 'All customers' }).count()) >= 1);
    await page.screenshot({ path: path.join(shots, 'work-duplicates-desktop.png'), fullPage: false });
    check('Merge stays off until one is chosen to keep', await pair.getByRole('button', { name: /Merge into/ }).isDisabled());
    await pair.getByRole('radio', { name: 'Anitha Reddy' }).click();
    await pair.getByRole('button', { name: 'Merge into Anitha Reddy' }).click();
    await page.getByText('Merged into one customer').waitFor({ timeout: 20000 });
    await page.getByRole('tab', { name: 'Merged' }).click();
    const merged = page.getByTestId('pair').filter({ hasText: 'Sowmya Reddy' });
    await merged.waitFor({ timeout: 20000 });
    check('merged: it moves to the Merged tab, saying who merged it', /Merged by Verification Owner/.test(await merged.innerText()));
    await merged.getByRole('button', { name: 'Undo the merge' }).click();
    await page.getByText('Merge undone: two customers again').waitFor({ timeout: 20000 });
    await page.getByRole('tab', { name: /To review/ }).click();
    const back = page.getByTestId('pair').filter({ hasText: 'Sowmya Reddy' });
    await back.waitFor({ timeout: 20000 });
    check('undo: the pair is back to review', true);
    await back.getByRole('button', { name: 'Different people' }).click();
    await page.getByText('Kept as two different people').waitFor({ timeout: 20000 });
    await page.getByRole('tab', { name: 'Kept apart' }).click();
    await page.getByTestId('pair').filter({ hasText: 'Sowmya Reddy' }).waitFor({ timeout: 20000 });
    check('"Different people": it moves to Kept apart', true);
    await ctx.close();
  }

  // ── On a phone ──
  {
    const { ctx, page } = await as(browser, 'owner', { width: 390, height: 844 });
    await page.goto(`${APP}/today`);
    await page.getByRole('heading', { name: 'Today' }).waitFor({ timeout: 20000 });
    await page.getByTestId('talk-row').first().waitFor({ timeout: 20000 });
    check('phone, Today: no sideways scroll', await noOverflow(page));
    await page.screenshot({ path: path.join(shots, 'work-today-phone.png'), fullPage: true });
    await page.goto(`${APP}/customers?q=Lakshmi`);
    await page.getByTestId('customer-row').filter({ hasText: 'Lakshmi Devi' }).first().click();
    await page.getByTestId('work-card').waitFor({ timeout: 20000 });
    check('phone, customer page with the working card: no sideways scroll', await noOverflow(page));
    await page.screenshot({ path: path.join(shots, 'work-customer-phone.png'), fullPage: false });
    await page.goto(`${APP}/duplicates`);
    await page.getByRole('heading', { name: 'Check duplicates' }).waitFor({ timeout: 20000 });
    await page.getByRole('tab', { name: 'Kept apart' }).click();
    await page.getByTestId('pair').first().waitFor({ timeout: 20000 });
    check('phone, duplicates: no sideways scroll', await noOverflow(page));
    await page.screenshot({ path: path.join(shots, 'work-duplicates-phone.png'), fullPage: false });
    await ctx.close();
  }

  await browser.close();
  await fetch(`${API}/api/v1/customers/${anithaId}/language`, { method: 'PUT', headers: ownerHeaders, body: JSON.stringify({ language: 'en' }) });
  shopTool('cleanchecks', SHOP);
  shopTool('unpair', SHOP);
  console.log(failures === 0 ? '\nAll work UI checks passed.' : `\n${failures} work UI check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
