/**
 * The audit fixes of 15 Nov, on screen, in a real browser (installed Edge), signed in for real, local only.
 *   - Delete draft asks first; "Keep it" keeps it
 *   - back links say where they go: "← The list" from a saved list, "← Settings" on Festivals opened from Settings
 *   - Messages says nothing about WhatsApp or consent until it knows (no "not linked, 0 agreed" flash)
 *   - follow-ups and notes that fail to load say so, with Try again (never "Nothing to do for them")
 *   - a saved list that is gone says so instead of loading for ever
 *   - Today's first steps no longer promise birthdays
 *   - on a phone, a visit and the gap before it stay together on the customer page
 *
 *   node scripts/verify-fixes-ui.mjs      (CRM on 4008, the app on 5176)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const backend = path.resolve(here, '..', '..', 'backend');
const SHOP = 'verify-suites-tenant';
const STAMP = Date.now();
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`); if (!ok) failures += 1; };
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();

async function as(browser, who, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: 'token', value: tokenFor(who), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}

async function main() {
  const draftId = sql(`insert into crm.message_campaigns (id, client_id, kind, name, text, audience, audience_text, status, updated_at) values (gen_random_uuid(), '${SHOP}', 'manual', 'Fixes draft ${STAMP}', 'Hello', '{"everyone":true}', 'Everyone', 'draft', now()) returning id`).split('\n')[0];
  const segment = sql(`insert into crm.segments (id, client_id, name, rules, updated_at) values (gen_random_uuid(), '${SHOP}', 'Fixes list ${STAMP}', '{"visitsAtLeast":1}', now()) returning id`).split('\n')[0];
  const customer = sql(`select c.id from crm.customers c where c.client_id='${SHOP}' and c.removed_at is null and c.merged_into_id is null and (select count(distinct date(t.occurred_at)) from crm.timeline_events t where t.customer_id=c.id and t.counts_spend) >= 3 limit 1`)
    || sql(`select c.id from crm.customers c where c.client_id='${SHOP}' and c.removed_at is null and c.merged_into_id is null limit 1`);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const { ctx, page } = await as(browser, 'owner');

    console.log('\nDelete draft');
    await page.goto(`${APP}/messages/${draftId}`);
    await page.getByRole('button', { name: 'Delete draft' }).click();
    check('Delete draft asks first, in plain words', await page.getByText('Delete this draft?').isVisible());
    await page.getByRole('button', { name: 'Keep it' }).click();
    check('"Keep it" keeps it', sql(`select count(*) from crm.message_campaigns where id = '${draftId}'`) === '1' && await page.getByRole('button', { name: 'Delete draft' }).isVisible());
    await page.getByRole('button', { name: 'Delete draft' }).click();
    await page.getByTestId('draft-delete-yes').click();
    await page.waitForURL(/\/messages$/);
    check('"Yes, delete it" deletes it and goes back to Messages', sql(`select count(*) from crm.message_campaigns where id = '${draftId}'`) === '0');

    console.log('\nBack links');
    if (segment) {
      await page.goto(`${APP}/segments/${segment}`);
      const row = page.getByTestId('customer-row').first();
      await row.click({ timeout: 8000 }).catch(() => undefined);
      await page.waitForURL(/\/customers\//, { timeout: 8000 }).catch(() => undefined);
      const back = (await page.getByTestId('cp-back').innerText().catch(() => '')).trim();
      check('from a saved list, the customer page says "← The list"', back === 'The list', back);
      await page.getByTestId('cp-back').click();
      await page.waitForURL(/\/segments\//);
      check('...and goes back to it', page.url().includes(`/segments/${segment}`));
    }
    await page.goto(`${APP}/settings?section=festivals`);
    await page.getByTestId('st-festivals').click();
    await page.waitForURL(/\/festivals/);
    check('Festivals opened from Settings: "← Settings"', (await page.getByTestId('fs-back').innerText()).trim() === 'Settings');
    await page.goto(`${APP}/festivals`);
    check('Festivals opened directly: "← All customers"', (await page.getByTestId('fs-back').innerText()).trim() === 'All customers');

    console.log('\nLoading and errors');
    let release;
    const held = new Promise(r => { release = r; });
    await page.route('**/api/v1/messages/overview', async (route) => { await held; await route.continue(); });
    await page.goto(`${APP}/messages`);
    await page.getByTestId('facts-loading').waitFor({ timeout: 8000 });
    const early = await page.locator('main').innerText();
    check('Messages while loading: no "not linked" and no "0 customers agreed"', !/not linked|0 customers agreed/.test(early), early.slice(0, 200));
    release();
    await page.getByTestId('fact-whatsapp').waitFor({ timeout: 8000 });
    check('...then the facts', await page.getByTestId('fact-agreed').isVisible());
    await page.unroute('**/api/v1/messages/overview');

    await page.route('**/api/v1/customers/*/followups', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"success":false,"message":"boom"}' }));
    await page.route('**/api/v1/customers/*/notes', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"success":false,"message":"boom"}' }));
    await page.goto(`${APP}/customers/${customer}`);
    await page.getByTestId('fu-error').waitFor({ timeout: 15000 }).catch(() => undefined);
    check('follow-ups that fail to load say so, with Try again', await page.getByTestId('fu-error').isVisible().catch(() => false));
    check('...never "Nothing to do for them"', !(await page.getByText('Nothing to do for them').isVisible().catch(() => false)));
    check('notes that fail to load say so too', await page.getByTestId('notes-error').isVisible().catch(() => false));
    await page.unroute('**/api/v1/customers/*/followups');
    await page.unroute('**/api/v1/customers/*/notes');

    await page.goto(`${APP}/segments/00000000-0000-0000-0000-000000000000/edit`);
    await page.getByTestId('segment-missing').waitFor({ timeout: 15000 }).catch(() => undefined);
    check('a saved list that is gone: says so, never loads for ever', await page.getByTestId('segment-missing').isVisible().catch(() => false));

    await page.route('**/api/v1/today/list*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { items: [], done: [], counts: {} } }) }));
    await page.goto(`${APP}/today`);
    const first = await page.getByTestId('first-steps').innerText({ timeout: 8000 }).catch(() => '');
    check('Today\'s first steps do not promise birthdays', !!first && !/birthday/i.test(first), first.slice(0, 160) || 'no first steps shown');
    await ctx.close();

    console.log('\nPhone');
    const phone = await as(browser, 'owner', { width: 375, height: 812 });
    await phone.page.goto(`${APP}/customers/${customer}`);
    await phone.page.waitForLoadState('networkidle').catch(() => undefined);
    const loose = await phone.page.evaluate(() => [...document.querySelectorAll('.cp-visits .vt-gap')].filter(g => !g.closest('.vt-step')).length);
    check('a gap between visits always travels with its visit', loose === 0, loose);
    await phone.page.screenshot({ path: path.join(shots, 'fixes-phone-visits.png'), fullPage: false });
    await phone.page.goto(`${APP}/sales`);
    const hint = await phone.page.getByTestId('sd-find').evaluate(el => ({ fits: el.scrollWidth <= el.clientWidth + 1, text: el.placeholder })).catch(() => null);
    check('Shop floor search hint is short enough for a phone', !!hint && hint.text.length <= 26, hint);
    await phone.ctx.close();
  } finally {
    await browser.close();
    sql(`delete from crm.message_campaigns where id = '${draftId}'`);
    sql(`delete from crm.segments where name = 'Fixes list ${STAMP}'`);
  }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exitCode = failures ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
