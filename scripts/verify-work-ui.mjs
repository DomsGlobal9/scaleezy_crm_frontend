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

  // ── Today, for Sales ──
  {
    const { ctx, page } = await as(browser, 'sales');
    await page.goto(`${APP}/today`);
    await page.getByRole('heading', { name: 'Today' }).waitFor({ timeout: 20000 });
    const badge = page.locator('.crm-tab', { hasText: 'Today' }).locator('.crm-badge');
    await badge.waitFor({ timeout: 20000 });
    const before = Number(await badge.innerText());
    const tag = page.getByTestId('followup').filter({ hasText: `${STAMP} ask about the blouse fitting` });
    await tag.waitFor({ timeout: 20000 });
    check('Sales sees the follow-up the owner gave them, with the customer to call', /Lakshmi Devi/.test(await tag.innerText()));
    check('the Today tab carries a badge with what is due', before >= 1, before);
    const wishes = await page.getByTestId('wish').allInnerTexts();
    // The test shop has no automatic wishes on in Inventory, so the line says to wish her in person.
    check('birthdays this week: Chandrika Nair today, "Shop\'s WhatsApp wishes are off: wish in person"', wishes.some(t => /Chandrika Nair/.test(t) && /today/.test(t) && /WhatsApp wishes are off: wish in person/.test(t)), wishes);
    check('...Esther Thomas\'s anniversary, "No WhatsApp consent: wish in person"', wishes.some(t => /Esther Thomas/.test(t) && /Anniversary/.test(t) && /wish in person/.test(t)));
    const notSeen = await page.getByTestId('notseen').allInnerTexts();
    check('not seen lately: Gayathri Iyer first, 75 days, three bills', /Gayathri Iyer/.test(notSeen[0] ?? '') && /75 days ago/.test(notSeen[0]) && /3 bills/.test(notSeen[0]), notSeen);
    await page.screenshot({ path: path.join(shots, 'work-today-desktop.png'), fullPage: true });
    await tag.getByRole('button', { name: /Mark done/ }).click();
    await tag.waitFor({ state: 'detached', timeout: 20000 });
    await page.waitForFunction((n) => { const b = [...document.querySelectorAll('.crm-tab')].find(t => /Today/.test(t.textContent))?.querySelector('.crm-badge'); return !b || Number(b.textContent) < n; }, before, { timeout: 20000 });
    check('done from Today: it leaves the list and the badge goes down', true);
    check('Sales has no Duplicates tab', (await page.locator('.crm-tab', { hasText: 'Duplicates' }).count()) === 0);
    await page.goto(`${APP}/duplicates`);
    await page.getByRole('heading', { name: 'Only an owner or admin can merge customers' }).waitFor({ timeout: 20000 });
    check('...and the Duplicates page says plainly that it is for owners and admins', true);
    await ctx.close();
  }

  // ── Duplicates, for the owner ──
  {
    shopTool('pair', SHOP);
    const { ctx, page } = await as(browser, 'owner');
    await page.goto(`${APP}/duplicates`);
    const pair = page.getByTestId('pair').filter({ hasText: 'Sowmya Reddy' });
    await pair.waitFor({ timeout: 20000 });
    check('the pair to review: Sowmya Reddy and Anitha Reddy side by side', /Anitha Reddy/.test(await pair.innerText()));
    check('...the reason in plain words (family phone)', /family often shares one phone/.test(await pair.innerText()));
    check('...the phone matches (quiet), the names differ (marked)', (await pair.locator('.dp-field.same', { hasText: 'Phone' }).count()) === 1);
    check('the Duplicates tab carries the count', /Duplicates\s*1/.test(await page.locator('.crm-tab', { hasText: 'Duplicates' }).innerText()));
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
    await page.getByTestId('wish').first().waitFor({ timeout: 20000 });
    check('phone, Today: no sideways scroll', await noOverflow(page));
    await page.screenshot({ path: path.join(shots, 'work-today-phone.png'), fullPage: true });
    await page.goto(`${APP}/customers?q=Lakshmi`);
    await page.getByTestId('customer-row').filter({ hasText: 'Lakshmi Devi' }).first().click();
    await page.getByTestId('work-card').waitFor({ timeout: 20000 });
    check('phone, customer page with the working card: no sideways scroll', await noOverflow(page));
    await page.screenshot({ path: path.join(shots, 'work-customer-phone.png'), fullPage: false });
    await page.goto(`${APP}/duplicates`);
    await page.getByRole('heading', { name: 'Duplicates to review' }).waitFor({ timeout: 20000 });
    await page.getByRole('tab', { name: 'Kept apart' }).click();
    await page.getByTestId('pair').first().waitFor({ timeout: 20000 });
    check('phone, duplicates: no sideways scroll', await noOverflow(page));
    await page.screenshot({ path: path.join(shots, 'work-duplicates-phone.png'), fullPage: false });
    await ctx.close();
  }

  await browser.close();
  shopTool('cleanchecks', SHOP);
  shopTool('unpair', SHOP);
  console.log(failures === 0 ? '\nAll work UI checks passed.' : `\n${failures} work UI check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
