/**
 * A1 in a real browser (installed Edge), signed in for real, local database only: the owner's
 * "Ask how the visit was" switch and Google review link in Shop settings, the "New in their size and
 * colour" switch (A2), and the week's ratings on
 * This week. (The customer's rating page waits for the owner's OK on its mockup.)
 *
 *   node scripts/verify-feedback-ui.mjs      (CRM on 4008, the app on 5176)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const backend = path.resolve(here, '..', '..', 'backend');
const SHOP = 'verify-suites-tenant';
const REVIEW = 'https://g.page/r/verify-ui/review';

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
};
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();

async function main() {
  const before = sql(`select coalesce(feedback_on::text, '') || '|' || coalesce(review_url, '') from crm.message_settings where client_id = '${SHOP}'`);
  sql(`update crm.message_settings set feedback_on = false, review_url = null where client_id = '${SHOP}'`);
  // Two answers this week, for This week's card: a customer of the test shop, any.
  const someone = sql(`select id from crm.customers where client_id = '${SHOP}' and merged_into_id is null and removed_at is null limit 1`);
  const fb = [randomUUID(), randomUUID()];
  sql(`insert into crm.feedback (id, client_id, customer_id, recipient_id, rating, at) values ('${fb[0]}', '${SHOP}', '${someone}', '${randomUUID()}', 5, now()), ('${fb[1]}', '${SHOP}', '${someone}', '${randomUUID()}', 2, now())`);

  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.addCookies([{ name: 'token', value: tokenFor('owner'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });

    await page.goto(`${APP}/settings`);
    const box = page.getByTestId('automatic-messages');
    await box.waitFor({ timeout: 20000 });
    check('Shop settings has Automatic messages: "Ask how the visit was"', /Ask how the visit was/.test(await box.innerText()));
    const sw = page.getByTestId('feedback-switch');
    await sw.click();
    const err = page.getByTestId('feedback-error');
    await err.waitFor({ timeout: 15000 });
    check('on without a review link: the reason, plainly', /Google review link first/.test(await err.innerText()) && (await sw.getAttribute('aria-checked')) === 'false', await err.innerText());
    await page.getByLabel('Google review link').fill(REVIEW);
    await page.getByRole('button', { name: 'Save the link' }).click();
    await page.getByText('The review link is saved.').waitFor({ timeout: 15000 });
    await sw.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="feedback-switch"]')?.getAttribute('aria-checked') === 'true', null, { timeout: 15000 });
    check('with the link: on, and saved in CRM', sql(`select feedback_on::text || '|' || review_url from crm.message_settings where client_id = '${SHOP}'`) === `true|${REVIEW}`);
    // A2: "New in their size and colour", on from the moment it is switched on, and off again.
    const arr = page.getByTestId('arrivals-switch');
    await arr.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="arrivals-switch"]')?.getAttribute('aria-checked') === 'true', null, { timeout: 15000 });
    check('"New in their size and colour" switches on, from now', sql(`select arrivals_on::text || '|' || (arrivals_seen_to is not null)::text from crm.message_settings where client_id = '${SHOP}'`) === 'true|true');
    await page.screenshot({ path: path.join(shots, 'feedback-settings.png'), fullPage: true });
    await arr.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="arrivals-switch"]')?.getAttribute('aria-checked') === 'false', null, { timeout: 15000 });
    check('...and off again', sql(`select arrivals_on::text from crm.message_settings where client_id = '${SHOP}'`) === 'false');

    await page.goto(`${APP}/week`);
    const card = page.getByTestId('feedback');
    await card.waitFor({ timeout: 20000 });
    check('This week: how the visits went, with the average and the low ones', /rated their visit: 3\.5 out of 5 on average/.test(await card.innerText()) && /3 or less/.test(await card.innerText()), await card.innerText());
    await ctx.close();

    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await pctx.addCookies([{ name: 'token', value: tokenFor('owner'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const pp = await pctx.newPage();
    await pp.goto(`${APP}/settings`);
    await pp.getByTestId('automatic-messages').waitFor({ timeout: 20000 });
    check('on a phone, Shop settings fit', await noOverflow(pp));
    await pctx.close();
  } finally {
    await browser.close();
    sql(`delete from crm.feedback where id in ('${fb[0]}', '${fb[1]}')`);
    sql(`delete from crm.audit_log where client_id = '${SHOP}' and action in ('feedback.settings', 'arrivals.settings') and at >= now() - interval '10 minutes'`);
    const [on, url] = before.split('|');
    if (before) sql(`update crm.message_settings set feedback_on = ${on === 'true'}, review_url = ${url ? `'${url}'` : 'null'} where client_id = '${SHOP}'`);
    else sql(`delete from crm.message_settings where client_id = '${SHOP}'`);
  }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
