/**
 * The customer's "How was your visit?" page (A1, the mockup approved 29 Oct), in a real browser at a
 * phone's size. LOCAL database only. The page is CRM's own, served from the customer's link:
 * /l/<code> on the CRM service (4008).
 *
 *   1. It asks, with the shop's name and five answers, and nothing of the customer's
 *   2. A 5: thanks, and on to Google (noted on their timeline); opened again: "you have answered"
 *   3. A 2, with JavaScript off: sorry, the owner will call; a follow-up for the owner
 *   4. A week later the link has ended; it fits a phone
 *
 *   node scripts/verify-rating-ui.mjs      (CRM on 4008)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.CRM_URL || 'http://localhost:4008';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const SHOP = 'verify-suites-tenant';
const REVIEW = 'https://example.com/google-review';
const STAMP = String(Date.now() % 100000).padStart(5, '0');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
};
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function main() {
  const before = sql(`select coalesce(review_url, '') from crm.message_settings where client_id = '${SHOP}'`);
  const hadRow = sql(`select count(*) from crm.message_settings where client_id = '${SHOP}'`) !== '0';
  if (hadRow) sql(`update crm.message_settings set review_url = '${REVIEW}' where client_id = '${SHOP}'`);
  else sql(`insert into crm.message_settings (client_id, review_url, updated_at) values ('${SHOP}', '${REVIEW}', now())`);
  const people = sql(`select id from crm.customers where client_id = '${SHOP}' and merged_into_id is null and removed_at is null and customer_type <> 'WALK_IN' order by created_at limit 3`).split('\n');
  const shopName = sql(`select coalesce(business_name, 'our shop') from client_settings where client_id = '${SHOP}'`) || 'our shop';
  const nameOf = (id) => sql(`select name from crm.customers where id = '${id}'`);
  const fresh = randomUUID(), old = randomUUID();
  const code = (n) => `R${STAMP}${n}`;
  const snap = `'{"text":"x","media":null,"link":{"type":"RATING","target":"","days":7},"shopName":"${shopName.replace(/'/g, "''")}"}'::jsonb`;
  sql(`insert into crm.message_campaigns (id, client_id, kind, name, text, audience, audience_text, status, snapshot, started_at, created_at, updated_at, for_day)
       values ('${fresh}', '${SHOP}', 'feedback', 'Rating UI ${STAMP}', 'x', '{}', 'x', 'done', ${snap}, now(), now(), now(), 'rt-${STAMP}-a'),
              ('${old}', '${SHOP}', 'feedback', 'Rating UI old ${STAMP}', 'x', '{}', 'x', 'done', ${snap}, now() - interval '8 days', now(), now(), 'rt-${STAMP}-b')`);
  const rid = [randomUUID(), randomUUID(), randomUUID()];
  sql(`insert into crm.message_recipients (id, campaign_id, client_id, customer_id, state, link_code, handed_at, created_at) values
       ('${rid[0]}', '${fresh}', '${SHOP}', '${people[0]}', 'handed', '${code(1)}', now(), now()),
       ('${rid[1]}', '${fresh}', '${SHOP}', '${people[1]}', 'handed', '${code(2)}', now(), now()),
       ('${rid[2]}', '${old}', '${SHOP}', '${people[2]}', 'handed', '${code(3)}', now() - interval '8 days', now())`);

  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    // Google is not opened for real: the address it goes to is enough.
    let wentTo = null;
    await page.route('https://example.com/**', r => { if (r.request().isNavigationRequest()) wentTo = r.request().url(); return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google</p>' }); });

    console.log('\n1. It asks');
    await page.goto(`${API}/l/${code(1)}`);
    check('"How was your visit?", with the shop\'s name and five answers', (await page.locator('h1').innerText()) === 'How was your visit?' && (await page.locator('.shop').innerText()) === shopName && (await page.getByRole('button', { name: /of 5$/ }).count()) === 5);
    const first = nameOf(people[0]).split(/\s+/)[0];
    check('nothing of the customer\'s on the page', !(await page.content()).includes(first) || first.length < 3, first);
    check('it fits a phone', await noOverflow(page));
    await page.screenshot({ path: path.join(shots, 'rating-ask.png'), fullPage: true });

    console.log('\n2. A 5');
    await page.getByRole('button', { name: '5 of 5' }).click();
    await page.locator('h1').filter({ hasText: 'Thank you!' }).waitFor({ timeout: 10000 });
    check('thanks, and "Write a Google review"', await page.getByRole('link', { name: 'Write a Google review' }).isVisible() && /You gave 5 of 5/.test(await page.locator('.foot').innerText()));
    check('...saved in CRM', sql(`select rating from crm.feedback where recipient_id = '${rid[0]}'`) === '5');
    await page.screenshot({ path: path.join(shots, 'rating-thanks.png'), fullPage: true });
    await page.getByRole('link', { name: 'Write a Google review' }).click();
    await page.waitForURL(REVIEW, { timeout: 10000 });
    check('on to Google, and noted on their timeline', page.url() === REVIEW && sql(`select detail from crm.timeline_events where source = 'crm' and ref = 'feedback:${rid[0]}'`) === 'went to Google', wentTo);
    await page.goto(`${API}/l/${code(1)}`);
    check('opened again: "you have answered", with the review button', (await page.locator('h1').innerText()) === 'Thank you, you have answered.' && /You gave 5 of 5/.test(await page.locator('main').innerText()));
    await ctx.close();

    console.log('\n3. A 2, with JavaScript off');
    const plain = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
    const p2 = await plain.newPage();
    await p2.goto(`${API}/l/${code(2)}`);
    await p2.getByRole('button', { name: '2 of 5' }).click();
    await p2.locator('h1').filter({ hasText: 'Sorry it was not right.' }).waitFor({ timeout: 10000 });
    check('sorry: the owner will call; never posted', /will call you to put it right/.test(await p2.locator('main').innerText()) && /not posted anywhere/.test(await p2.locator('main').innerText()) && (await p2.getByRole('link', { name: /Google/ }).count()) === 0);
    check('...a follow-up for the owner, due today', /Rated their visit 2 of 5/.test(sql(`select body from crm.follow_ups f join crm.feedback b on b.follow_up_id = f.id where b.recipient_id = '${rid[1]}'`)));
    await p2.screenshot({ path: path.join(shots, 'rating-sorry.png'), fullPage: true });
    await plain.close();

    console.log('\n4. A week later');
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p3 = await c3.newPage();
    const r = await p3.goto(`${API}/l/${code(3)}`);
    check('the link has ended', r?.status() === 404 && /This link has ended/.test(await p3.locator('body').innerText()));
    await c3.close();
  } finally {
    await browser.close();
    const fu = sql(`select coalesce(string_agg('''' || follow_up_id || '''', ','), '') from crm.feedback where recipient_id in ('${rid.join("','")}') and follow_up_id is not null`);
    sql(`delete from crm.feedback where recipient_id in ('${rid.join("','")}')`);
    if (fu) sql(`delete from crm.follow_ups where id in (${fu})`);
    sql(`delete from crm.timeline_events where source = 'crm' and ref in ('feedback:${rid.join("','feedback:")}')`);
    sql(`delete from crm.message_campaigns where id in ('${fresh}', '${old}')`);
    if (hadRow) sql(`update crm.message_settings set review_url = ${before ? `'${before}'` : 'null'} where client_id = '${SHOP}'`);
    else sql(`delete from crm.message_settings where client_id = '${SHOP}'`);
  }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
