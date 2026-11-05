/**
 * Reviews in a real browser (installed Edge), signed in for real, local database and local Inventory
 * only: the one simple list, the customer page's tab with Reply and Hide, the warning, the timeline,
 * the ready-made group and This week.
 *
 *   node scripts/verify-reviews-ui.mjs      (CRM on 4008, the app on 5176, local Inventory on 4016)
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
const STAMP = String(Date.now() % 100000).padStart(5, '0');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  if (!ok) failures += 1;
};
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const seedScript = (mode) => JSON.parse(execFileSync('npx', ['ts-node', '--transpile-only', 'src/scripts/support/reviews-seed.ts', mode, STAMP], { cwd: backend, encoding: 'utf8', shell: true, maxBuffer: 1 << 24 }).trim().split('\n').pop());
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function signedIn(browser, who, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: 'token', value: tokenFor(who), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  if (process.env.SHOW_CALLS) page.on('response', r => { if (/\/reviews\/.*(hide|reply|unhide|handled)/.test(r.url())) console.log('      ', r.request().method(), r.url().replace(/.*api\/v1/, ''), r.status()); });
  return { ctx, page };
}

async function main() {
  // Messages sent from CRM, for the warning's Message button; as the shop had it again at the end.
  const movedBefore = sql(`select moved::text from module_subscriptions where client_id = '${SHOP}' and module = 'crm'`);
  sql(`update module_subscriptions set moved = coalesce(moved, '{}'::jsonb) || '{"campaigns": true}'::jsonb where client_id = '${SHOP}' and module = 'crm'`);
  await new Promise(r => setTimeout(r, 31_000)); // CRM remembers the hand-over for 30 seconds.
  const s = seedScript('seed');
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { ctx, page } = await signedIn(browser, 'owner');

    // ── The one simple list ──
    await page.goto(`${APP}/reviews`);
    await page.getByTestId('review-facts').waitFor({ timeout: 20000 });
    const nav = page.locator('.crm-nav a', { hasText: 'Reviews' });
    check('Reviews is in the sidebar, with how many are waiting', (await nav.count()) === 1 && /\d/.test(await nav.innerText()), await nav.innerText());
    check('no tabs on the list', (await page.getByRole('tab').count()) === 0);
    const lines = page.getByTestId('review-line');
    const line = (t) => lines.filter({ hasText: t });
    check('a low review with no reply is on the list', (await line(`Review Asha ${STAMP}`).filter({ hasText: 'Green, Free size' }).count()) === 1);
    check('open private feedback is on the list, with its order number', (await line(`private feedback on SO-RU${STAMP}`).count()) === 1);
    check('five stars with no reply is not on the list', (await line('Gold').count()) === 0);
    const words = line('Green, Free size').getByTestId('review-words');
    check('the customer\'s words show as plain text, script and all', (await words.innerText()).startsWith('<script>window.__hacked = 1</script>'), (await words.innerText()).slice(0, 60));
    check('nothing in them ran', (await page.evaluate(() => window.__hacked)) === undefined);
    check('nothing in them became a real element', (await line('Green, Free size').locator('script, img[src="x"]').count()) === 0);
    check('one 1,000-letter word does not push the page sideways', await noOverflow(page));
    await page.screenshot({ path: path.join(shots, 'reviews-list.png'), fullPage: true });

    const orphan = line(`Maroon ${STAMP}`);
    check('nobody has the number: "Customer", the number, and the buttons on the line', /Customer:/.test(await orphan.innerText()) && (await orphan.getAttribute('data-has-page')) === 'no' && (await orphan.getByTestId('reply-open').count()) === 1 && /no customer has this number yet/.test(await orphan.innerText()), await orphan.innerText());
    check('stars only says so', /Stars only: no words/.test(await orphan.innerText()));
    await orphan.getByTestId('reply-open').click();
    await orphan.getByTestId('reply-box').fill('Thank you for shopping with us.');
    await orphan.getByTestId('reply-save').click();
    await line(`Maroon ${STAMP}`).waitFor({ state: 'detached', timeout: 15000 });
    check('a reply from the line reaches Inventory and leaves the list', sql(`select reply from shop_reviews where id = '${s.ids.orphan}'`) === 'Thank you for shopping with us.');

    await line('Green, Free size').getByRole('link', { name: /Open customer/ }).click();
    await page.waitForURL(`**/customers/${s.anjali}?tab=reviews`);
    await page.getByTestId('reviews-tab').waitFor({ timeout: 15000 });
    check('a line opens that customer, on Reviews and feedback', true);

    // ── The customer page ──
    const tabs = await page.locator('.cp-tab:visible').allInnerTexts();
    check('the tab sits beside What they wear, Festivals and Timeline', ['What they wear', 'Festivals', 'Timeline'].every((t, i) => tabs[i] === t) && /^Reviews and feedback/.test(tabs[3]), tabs);
    check('the tab counts what is waiting', (await page.getByTestId('reviews-tab-count').innerText()) === '2');
    const warn = page.getByTestId('unhappy');
    check('the warning: unhappy 2 days ago, no follow-up yet', /Unhappy 2 days ago\. No follow-up yet\./.test(await warn.innerText()) && new RegExp(`Rated ${s.title}.* 2 of 5`).test(await warn.innerText()), await warn.innerText());
    check('Message shows for a customer who agreed', (await page.getByTestId('unhappy-message').count()) === 1);
    await page.getByTestId('unhappy-message').click();
    await page.getByRole('dialog').waitFor({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 10000 });
    check('and opens the note to one customer', true);
    check('every review and the feedback are here', (await page.getByTestId('review-card').count()) === 2 && (await page.getByTestId('feedback-card').count()) === 1);
    const card = page.locator(`[data-review="${s.copies.low}"]`);
    check('item, colour and size, and no order number', /Green, Free size/.test(await card.innerText()) && !/SO-|Order/.test(await card.innerText()), await card.innerText());
    check('a photo that no longer works just goes', await card.locator('.rv-pics a').first().evaluate(async (a) => {
      for (let i = 0; i < 40 && a.style.display !== 'none'; i += 1) await new Promise(r => setTimeout(r, 250));
      return a.style.display === 'none';
    }));
    const stars = page.locator(`[data-review="${s.copies.high}"]`);
    check('stars only: no words, and no reply needed', /Stars only: no words/.test(await stars.innerText()) && (await stars.getByTestId('review-state').count()) === 0);
    check('the private feedback names its order and says only the shop sees it', /Private feedback on SO-RU/.test(await page.getByTestId('feedback-card').innerText()) && /only the shop sees this/.test(await page.getByTestId('feedback-card').innerText()));
    check('no way to change their words: no box holds them', (await card.locator('textarea, input').count()) === 0);
    await page.screenshot({ path: path.join(shots, 'reviews-customer.png'), fullPage: true });

    // Reply
    await card.getByTestId('reply-open').click();
    check('reply: the box starts empty and Save stays off', (await card.getByTestId('reply-box').inputValue()) === '' && await card.getByTestId('reply-save').isDisabled());
    await card.getByTestId('reply-box').fill('Sorry about this. Please call us.');
    check('reply: letters counted, and it says it shows on the shop', /33 of 500 letters\. It shows on the shop\./.test(await card.innerText()), await card.innerText());
    await page.screenshot({ path: path.join(shots, 'reviews-reply.png') });
    await card.getByTestId('reply-save').click();
    await card.getByTestId('review-reply').waitFor({ timeout: 15000 });
    check('reply saved, with who wrote it', /Your reply, by /.test(await card.getByTestId('review-reply').innerText()) && (await card.getByTestId('review-state').innerText()) === 'Replied');
    check('in Inventory itself', sql(`select reply from shop_reviews where id = '${s.ids.low}'`) === 'Sorry about this. Please call us.');
    check('and the count on the tab drops', (await page.getByTestId('reviews-tab-count').innerText()) === '1');
    await card.getByTestId('reply-open').click();
    check('Change reply starts from what is there', (await card.getByTestId('reply-box').inputValue()) === 'Sorry about this. Please call us.');
    await card.getByRole('button', { name: 'Cancel' }).click();
    await card.getByTestId('reply-off').click();
    check('taking a reply off asks first', (await card.getByTestId('reply-off-confirm').count()) === 1 && sql(`select reply is not null from shop_reviews where id = '${s.ids.low}'`) === 't');
    await card.getByTestId('reply-off-yes').click();
    await card.getByTestId('review-reply').waitFor({ state: 'detached', timeout: 15000 });
    check('reply taken off, and it needs one again', (await card.getByTestId('review-state').innerText()) === 'Needs a reply' && sql(`select reply is null from shop_reviews where id = '${s.ids.low}'`) === 't');

    // Hide
    await card.getByTestId('hide-open').click();
    const dlg = page.getByTestId('hide-dialog');
    await dlg.getByRole('radio').first().waitFor({ timeout: 15000 });
    const reasons = await dlg.locator('.rv-opt').allInnerTexts();
    check('hide offers Inventory\'s four reasons', reasons.join('|') === 'Abusive or offensive|Not about the item|Shows personal details|Spam or advertising', reasons);
    check('nothing is chosen, and Hide stays off', (await dlg.getByRole('radio', { checked: true }).count()) === 0 && await dlg.getByTestId('hide-go').isDisabled());
    check('a low rating is not a reason, and it says so', /A low rating is not a reason\. Reply to it instead\./.test(await dlg.innerText()));
    await page.screenshot({ path: path.join(shots, 'reviews-hide.png') });
    await page.keyboard.press('Escape');
    await dlg.waitFor({ state: 'detached' });
    check('Escape closes it and nothing is hidden', sql(`select status from shop_reviews where id = '${s.ids.low}'`) === 'PUBLISHED');
    await card.getByTestId('hide-open').click();
    await dlg.getByLabel('Spam or advertising').check();
    await dlg.getByTestId('hide-go').click();
    await dlg.waitFor({ state: 'detached', timeout: 15000 }).catch(async (e) => { console.log('      the dialog said:', await dlg.innerText()); throw e; });
    await page.waitForFunction((id) => /Hidden: Spam or advertising/.test(document.querySelector(`[data-review="${id}"]`)?.innerText ?? ''), s.copies.low, { timeout: 15000 });
    check('hidden, with the reason in words', sql(`select status || '|' || hidden_reason from shop_reviews where id = '${s.ids.low}'`) === 'HIDDEN|SPAM');
    check('a hidden review only offers Show again', (await card.getByTestId('review-unhide').count()) === 1 && (await card.getByTestId('reply-open').count()) === 0);
    await card.getByTestId('review-unhide').click();
    await page.waitForFunction((id) => /Needs a reply/.test(document.querySelector(`[data-review="${id}"]`)?.innerText ?? ''), s.copies.low, { timeout: 15000 });
    check('shown again', sql(`select status from shop_reviews where id = '${s.ids.low}'`) === 'PUBLISHED');

    // Private feedback
    const fb = page.getByTestId('feedback-card');
    await fb.getByTestId('feedback-handled').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="feedback-state"]')?.innerText === 'Handled', null, { timeout: 15000 });
    check('feedback marked handled, in Inventory', sql(`select handled_at is not null from shop_order_feedback where id = '${s.ids.feedback}'`) === 't');
    await fb.getByTestId('feedback-handled').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="feedback-state"]')?.innerText === 'Open', null, { timeout: 15000 });
    check('and opened again', sql(`select handled_at is null from shop_order_feedback where id = '${s.ids.feedback}'`) === 't');

    // Inventory's own refusal, when the review has just gone
    await card.getByTestId('reply-open').click();
    await card.getByTestId('reply-box').fill('Too late');
    sql(`delete from shop_reviews where id = '${s.ids.high}'`);
    const gone = page.locator(`[data-review="${s.copies.high}"]`);
    await gone.getByTestId('reply-open').click();
    await gone.getByTestId('reply-box').fill('Thanks!');
    await gone.getByTestId('reply-save').click();
    await gone.waitFor({ state: 'detached', timeout: 15000 });
    check('a review taken down meanwhile leaves the page; no raw error anywhere', !/Error:|undefined|\bstack\b/i.test(await page.locator('main').innerText()));
    await card.getByRole('button', { name: 'Cancel' }).click();

    // Timeline
    await page.getByRole('tab', { name: 'Timeline' }).click();
    await page.getByTestId('event').first().waitFor({ timeout: 15000 });
    const events = await page.getByTestId('event').allInnerTexts();
    check('the timeline has the review: item, stars, no reply yet', events.some(e => new RegExp(`Reviewed ${s.title}: 2 of 5`).test(e) && /no reply yet/.test(e)), events);
    check('and the private feedback, open', events.some(e => /Private feedback on SO-RU/.test(e) && /open/.test(e)), events);

    // The warning goes with a follow-up
    await page.getByTestId('unhappy-followup').click();
    const fuBox = page.getByTestId('work-card');
    await fuBox.locator('textarea, input[type="text"]').first().waitFor({ timeout: 10000 });
    check('Add follow-up opens the box, staying on the tab', /tab=timeline/.test(page.url()));
    await fuBox.locator('textarea, input[type="text"]').first().fill('Call about the review');
    await fuBox.getByRole('button', { name: /save|add/i }).last().click();
    await page.getByTestId('unhappy').waitFor({ state: 'detached', timeout: 15000 });
    check('with a follow-up, the warning goes', true);

    // The other customer: no consent, no Message
    await page.goto(`${APP}/customers/${s.bhavya}?tab=wear`);
    await page.getByTestId('unhappy').waitFor({ timeout: 15000 });
    check('the warning shows whichever tab is open', true);
    check('no Message for a customer who has not agreed', (await page.getByTestId('unhappy-message').count()) === 0);

    // The group and the week
    await page.goto(`${APP}/groups`);
    const groupCard = page.getByTestId('rated-low-card');
    await groupCard.waitFor({ timeout: 15000 });
    check('Customer groups has the ready-made Rated 1 or 2', /Rated 1 or 2/i.test(await groupCard.innerText()) && /Ready-made/.test(await groupCard.innerText()));
    await page.screenshot({ path: path.join(shots, 'reviews-groups.png') });
    await groupCard.click();
    await page.getByTestId('rated-low-list').waitFor({ timeout: 15000 });
    const who = await page.getByTestId('rated-low-list').innerText();
    check('it lists them, and has nothing to add, remove or send', who.includes(`Review Asha ${STAMP}`) && who.includes(`Review Bina ${STAMP}`) && (await page.getByRole('button', { name: /add|remove|send|message/i }).count()) === 0, who.slice(0, 200));
    await page.screenshot({ path: path.join(shots, 'reviews-rated-low.png'), fullPage: true });

    await page.goto(`${APP}/week`);
    const wk = page.getByTestId('reviews');
    await wk.waitFor({ timeout: 20000 });
    check('This week: the average, the new ones and how many need a reply', /out of 5 from \d+ reviews?\. \d+ new this week\. \d+ needs? a reply, \d+ private feedback (is|are) open\./.test(await wk.innerText()), await wk.innerText());
    await wk.getByRole('link', { name: /Open Reviews/ }).click();
    await page.waitForURL('**/reviews');
    check('and links to the list', true);

    // Dark theme and a phone
    await page.goto(`${APP}/customers/${s.anjali}?tab=reviews`);
    await page.getByTestId('reviews-tab').waitFor({ timeout: 15000 });
    await page.screenshot({ path: path.join(shots, 'reviews-dark.png'), fullPage: true });
    await page.locator('[data-testid="theme"]:visible').click();
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light');
    await page.screenshot({ path: path.join(shots, 'reviews-light.png'), fullPage: true });
    await page.locator('[data-testid="theme"]:visible').click();
    await ctx.close();

    const phone = await signedIn(browser, 'owner', { width: 390, height: 844 });
    await phone.page.goto(`${APP}/reviews`);
    await phone.page.getByTestId('review-facts').waitFor({ timeout: 20000 });
    check('phone: the list fits', await noOverflow(phone.page));
    await phone.page.screenshot({ path: path.join(shots, 'reviews-list-phone.png'), fullPage: true });
    await phone.page.goto(`${APP}/customers/${s.bhavya}?tab=reviews`);
    await phone.page.getByTestId('reviews-tab').waitFor({ timeout: 15000 });
    check('phone: the customer\'s tab fits', await noOverflow(phone.page));
    check('phone: the open tab is in view', await phone.page.locator('.cp-tab.on').evaluate(t => { const r = t.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }));
    await phone.page.getByTestId('unhappy-followup').click();
    await phone.page.getByTestId('work-card').locator('textarea, input[type="text"]').first().waitFor({ timeout: 10000 });
    check('phone: Add follow-up goes to Follow-ups, box open', /tab=work/.test(phone.page.url()));
    await phone.page.screenshot({ path: path.join(shots, 'reviews-customer-phone.png'), fullPage: true });
    await phone.ctx.close();

    // Someone who may only look: no buttons.
    const look = await signedIn(browser, 'warehouse');
    await look.page.goto(`${APP}/reviews`);
    await look.page.waitForLoadState('networkidle');
    const seesList = await look.page.getByTestId('review-facts').count();
    check('someone who may not change customers gets no Reply, Hide or Mark handled', (await look.page.getByTestId('reply-open').count()) === 0 && (await look.page.getByTestId('hide-open').count()) === 0 && (await look.page.getByTestId('feedback-handled').count()) === 0, { seesList });
    await look.ctx.close();
  } finally {
    await browser.close();
    seedScript('clean');
    sql(`update module_subscriptions set moved = '${movedBefore || '{}'}'::jsonb where client_id = '${SHOP}' and module = 'crm'`);
  }
}

main()
  .catch(e => { console.error(e); failures += 1; })
  .finally(() => { console.log(failures ? `\n${failures} failed` : '\nAll passed'); process.exitCode = failures ? 1 : 0; });
