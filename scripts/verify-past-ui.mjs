/**
 * A shop's earlier customers on the customer card, and the filters on All customers, in a real browser
 * (installed Edge), signed in for real. Local database and local Inventory only, made-up numbers only.
 *
 *   node scripts/verify-past-ui.mjs      (CRM on 4008, the app on 5176, local Inventory on 4016)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const backend = path.resolve(here, '..', '..', 'backend');
const STAMP = String(Date.now() % 100000).padStart(5, '0');
const PATTU = `Pattu${STAMP}`;

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  if (!ok) failures += 1;
};
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const seedScript = (mode) => JSON.parse(execFileSync('npx', ['ts-node', '--transpile-only', 'src/scripts/support/past-seed.ts', mode, STAMP], { cwd: backend, encoding: 'utf8', shell: true, maxBuffer: 1 << 24 }).trim().split('\n').pop());
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function signedIn(browser, who, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: 'token', value: tokenFor(who), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}

async function main() {
  const s = seedScript('seed');
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { ctx, page } = await signedIn(browser, 'owner');

    // ── The customer card ──
    await page.goto(`${APP}/customers/${s.silk}`);
    const past = page.getByTestId('past-purchases');
    await past.waitFor({ timeout: 20000 });
    const said = await page.getByTestId('past-sentence').innerText();
    check('it says it plainly, in the shop\'s own word', new RegExp(`^Mostly buys ${PATTU}, usually .* a piece\\.$`).test(said), said);
    check('and says the date is not known', /date not known/.test(await past.innerText()));
    check('spend, bills and about how many visits', /₹85,000/.test(await page.getByTestId('past-spend').innerText()) && /3 bills, about 2 visits/.test(await page.getByTestId('past-spend').innerText()), await page.getByTestId('past-spend').innerText());
    check('what they buy, with shares', new RegExp(`${PATTU}: 3 pieces, \\d+% of what they kept`).test(await page.getByTestId('past-buys').innerText()), await page.getByTestId('past-buys').innerText());
    check('budget, as a range, with a typical and the dearest piece', /₹20,000 and above/.test(await page.getByTestId('past-budget').innerText()) && /Dearest piece: ₹30,000/.test(await page.getByTestId('past-budget').innerText()), await page.getByTestId('past-budget').innerText());
    check('returns and how they pay', /returned/.test(await page.getByTestId('past-returns').innerText()) && /Usually pays by Card/.test(await page.getByTestId('past-returns').innerText()), await page.getByTestId('past-returns').innerText());
    const nums = page.getByTestId('numbers');
    check('the numbers count the money and bills', /₹85,000/.test(await page.getByTestId('num-spend').innerText()) && /3 bills/.test(await page.getByTestId('num-spend').innerText()), await nums.innerText());
    check('last visit: not known, never the load day', /Not known/.test(await page.getByTestId('num-last').innerText()), await page.getByTestId('num-last').innerText());
    check('"from earlier records", not "customer since" the load day', /from earlier records/.test(await page.getByTestId('profile').innerText()) && !/customer since/.test(await page.getByTestId('profile').innerText()));
    check('no date on any past bill', !/\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(await page.getByTestId('past-bills').innerText()));
    check('the first three bills, newest number first', (await page.getByTestId('past-bill').count()) === 3 && (await page.getByTestId('past-bill').first().innerText()).includes(`Bill ${STAMP}900`));
    await page.getByTestId('past-all').click();
    check('then all of them', (await page.getByTestId('past-bill').count()) === 5);
    const bills = await page.getByTestId('past-bills').innerText();
    check('a return is a return, and a bill sold and taken back says so', /Returned:/.test(bills) && /−₹25,000/.test(bills) && /Not counted as a bill or a visit/.test(bills), bills);
    await page.screenshot({ path: path.join(shots, 'past-card.png'), fullPage: true });
    await page.getByRole('tab', { name: 'Timeline' }).click();
    await page.getByTestId('past-on-timeline').waitFor({ timeout: 10000 });
    check('the timeline keeps them together at the foot, with no dates', /5 past purchases/.test(await page.getByTestId('past-on-timeline').innerText()) && (await page.getByTestId('event').count()) === 0);
    const onTl = await page.getByTestId('past-on-timeline').innerText();
    check('the timeline lists the past bills, and does not say "Nothing here yet"', onTl.includes(`Bill ${STAMP}900`) && (await page.getByTestId('timeline-empty').count()) === 0, onTl.slice(0, 200));
    await page.getByRole('button', { name: 'Returns', exact: true }).click();
    await page.getByTestId('timeline-empty').waitFor({ timeout: 10000 });
    check('other filters leave past bills out', (await page.getByTestId('past-on-timeline').count()) === 0);
    await page.getByRole('button', { name: 'Bills', exact: true }).click();
    await page.getByTestId('past-on-timeline').waitFor({ timeout: 10000 });
    check('and Bills shows them', true);
    await page.screenshot({ path: path.join(shots, 'past-timeline.png'), fullPage: true });

    await page.goto(`${APP}/customers/${s.exchange}`);
    await page.getByTestId('past-purchases').waitFor({ timeout: 15000 });
    const ex = await page.getByTestId('past-spend').innerText();
    check('below zero shows the minus, and does not read as "never bought"', /−₹186/.test(ex) && /pieces? kept/.test(ex), ex);
    await page.goto(`${APP}/customers/${s.nophone}`);
    await page.getByTestId('past-purchases').waitFor({ timeout: 15000 });
    check('a customer with no phone: the card works', /₹14,500/.test(await page.getByTestId('past-spend').innerText()) && (await page.getByTestId('message-one').count()) === 0);
    await page.goto(`${APP}/customers?search=none`);

    // ── The filters ──
    await page.goto(`${APP}/customers`);
    const overview = page.getByTestId('customer-overview');
    await overview.waitFor({ timeout: 20000 });
    check('a small overview: by budget and by what they buy', /By budget/.test(await overview.innerText()) && /By what they buy/.test(await overview.innerText()));
    await page.screenshot({ path: path.join(shots, 'filters-list.png') });
    const rows = () => page.getByTestId('customer-row');
    const applied = async () => page.getByTestId('filters-on').waitFor({ timeout: 10000 });

    await page.getByTestId('filters-open').click();
    const panel = page.getByTestId('filters-panel');
    await panel.waitFor();
    await panel.getByRole('button', { name: PATTU, exact: true }).waitFor({ timeout: 15000 });
    check('the kinds are the shop\'s own words', (await panel.getByRole('button', { name: PATTU, exact: true }).count()) === 1);
    check('no fixed list of any one shop\'s words', (await panel.getByRole('button', { name: 'Both', exact: true }).count()) === 0);
    await panel.getByRole('button', { name: PATTU, exact: true }).click();
    await page.waitForFunction(() => /Show 2 customers/.test(document.querySelector('[data-testid="filters-show"]')?.innerText ?? ''), null, { timeout: 15000 });
    check('the button says how many before you leave', true);
    await page.screenshot({ path: path.join(shots, 'filters-panel.png') });
    check('nothing changed behind it yet', !/rules=/.test(page.url()));
    await page.getByTestId('filters-show').click();
    await applied();
    await page.waitForFunction((n) => /^2 customers match/.test(document.querySelector('.cf-result')?.innerText ?? ''), null, { timeout: 15000 });
    check('it filters: both Pattu customers', (await rows().count()) === 2 && /Pastsilk/.test(await page.locator('main').innerText()) && /Pastnophone/.test(await page.locator('main').innerText()), { rows: await rows().count(), text: (await page.locator('main').innerText()).slice(0, 500) });
    check('chosen filters stay in view', new RegExp(`Buys.*${PATTU}`, 's').test(await page.getByTestId('filter-chip').first().innerText()));
    check('the list shows what they buy, and last visit not known', new RegExp(PATTU).test(await page.getByTestId('customer-table').innerText()) && /Not known/.test(await page.getByTestId('customer-table').innerText()));
    check('the address holds them', /rules=/.test(page.url()));
    await page.reload();
    await applied();
    check('so a reload keeps them', (await page.getByTestId('filter-chip').count()) === 1);
    await page.screenshot({ path: path.join(shots, 'filters-on.png'), fullPage: true });

    // Budget narrows further; a chip comes off by itself.
    await page.getByTestId('filters-open').click();
    await panel.waitFor();
    await panel.getByRole('button', { name: '₹20,000 and above' }).click();
    await page.waitForFunction(() => /Show 1 customer$/.test(document.querySelector('[data-testid="filters-show"]')?.innerText ?? ''), null, { timeout: 15000 });
    await page.getByTestId('filters-show').click();
    await page.waitForFunction(() => /^1 customer matches/.test(document.querySelector('.cf-result')?.innerText ?? ''), null, { timeout: 15000 });
    check('a second filter narrows it', (await rows().count()) === 1 && /Pastsilk/.test(await rows().first().innerText()));
    await page.getByTestId('filter-chip').filter({ hasText: 'Budget' }).getByRole('button').click();
    await page.waitForFunction(() => /^2 customers match/.test(document.querySelector('.cf-result')?.innerText ?? ''), null, { timeout: 15000 });
    check('one tap takes one off', (await page.getByTestId('filter-chip').count()) === 1);

    // Save as a list: the same rules.
    await page.getByTestId('filters-save').click();
    await page.waitForURL(/segments\/new/);
    await page.getByLabel('Name').waitFor({ timeout: 15000 });
    await page.waitForFunction((k) => document.body.innerText.includes(k), PATTU, { timeout: 15000 });
    check('"Save as a list" arrives with the filters', new RegExp(`bought\\s+.*${PATTU}`, 's').test(await page.locator('main').innerText()));
    await page.getByLabel('Name').fill(`Past ${STAMP} Pattu`);
    await page.getByRole('button', { name: /Save/ }).first().click();
    await page.waitForURL(/segments\/[0-9a-f-]{36}$/, { timeout: 15000 });
    await page.getByText(`Past ${STAMP} Pattu`).first().waitFor({ timeout: 15000 });
    check('and saves, as an ordinary Saved list', true);

    // A filter nobody meets says why.
    await page.goto(`${APP}/customers?rules=${encodeURIComponent(JSON.stringify({ crafts: ['Nothingcraft'] }))}`);
    await page.getByTestId('filters-none').waitFor({ timeout: 15000 });
    check('nobody matches: it says why, and what to do', /do not always have a craft/.test(await page.getByTestId('filters-none').innerText()));
    await page.getByTestId('filters-none').getByRole('button', { name: 'Clear all' }).click();
    await overview.waitFor({ timeout: 15000 });
    check('clear all brings everyone back', !/rules=/.test(page.url()));

    // Rubbish in the address is no filters, not a crash.
    await page.goto(`${APP}/customers?rules=%7Bnot-json`);
    await rows().first().waitFor({ timeout: 15000 });
    check('rubbish in the address: just no filters', (await page.getByTestId('filter-chip').count()) === 0);

    // Sort, and an overview bar opens its filter.
    await page.goto(`${APP}/customers?sort=spend`);
    await rows().first().waitFor({ timeout: 15000 });
    check('sort by highest spend', /sort=spend/.test(page.url()));
    await page.goto(`${APP}/customers`);
    await overview.waitFor({ timeout: 15000 });
    await page.getByTestId('overview-20000-').click();
    await applied();
    check('a bar in the overview opens that filter', /Budget/.test(await page.getByTestId('filter-chip').first().innerText()));

    // Whose bill is this? The top bar and All customers.
    await page.goto(`${APP}/customers`);
    const top = page.locator('[data-testid="top-search"]:visible');
    await top.fill(`${STAMP}400`);
    const results = page.locator('[data-testid="top-search-results"]:visible');
    await results.getByText(`Past bill ${STAMP}400`).waitFor({ timeout: 15000 });
    check('the top bar finds the customer by an old bill\'s number, and says so', new RegExp(`Pastnophone ${STAMP}`).test(await results.innerText()), await results.innerText());
    await page.screenshot({ path: path.join(shots, 'search-bill-top.png') });
    await page.keyboard.press('Escape');
    await page.getByLabel('Search customers').fill(`${STAMP}400`);
    await page.getByTestId('customer-table').getByText(`Past bill ${STAMP}400`).waitFor({ timeout: 15000 });
    check('and All customers too', (await rows().count()) >= 1 && new RegExp(`Pastnophone ${STAMP}`).test(await rows().first().innerText()));
    await page.screenshot({ path: path.join(shots, 'search-bill-list.png') });
    await page.getByLabel('Search customers').fill('');

    // Each shop sets its own price ranges.
    await page.goto(`${APP}/settings`);
    const bands = page.getByTestId('price-bands');
    await bands.waitFor({ timeout: 20000 });
    check('Shop settings has the price ranges, starting from sensible amounts', /Under ₹3,000 · ₹3,000 to ₹8,000 · ₹8,000 to ₹20,000 · ₹20,000 and above/.test(await page.getByTestId('band-words').innerText()), await page.getByTestId('band-words').innerText());
    await bands.getByRole('spinbutton', { name: 'Price 1' }).fill('1000');
    await bands.getByRole('spinbutton', { name: 'Price 2' }).fill('500');
    check('out of order: Save stays off', await page.getByTestId('band-save').isDisabled());
    await bands.getByRole('spinbutton', { name: 'Price 2' }).fill('5000');
    await page.getByTestId('band-save').click();
    await page.getByText('The price ranges are saved.').waitFor({ timeout: 15000 });
    await page.screenshot({ path: path.join(shots, 'price-bands.png') });
    await page.goto(`${APP}/customers`);
    await page.getByTestId('filters-open').click();
    await panel.waitFor();
    await panel.getByRole('button', { name: 'Under ₹1,000' }).waitFor({ timeout: 15000 });
    check("and the filter offers the shop's own ranges", (await panel.getByRole('button', { name: '₹1,000 to ₹5,000' }).count()) === 1);
    await page.keyboard.press('Escape');
    await page.goto(`${APP}/settings`);
    await bands.getByRole('spinbutton', { name: 'Price 1' }).fill('3000');
    await bands.getByRole('spinbutton', { name: 'Price 2' }).fill('8000');
    await page.getByTestId('band-save').click();
    await page.getByText('The price ranges are saved.').first().waitFor({ timeout: 15000 });

    await ctx.close();

    // A phone.
    const phone = await signedIn(browser, 'owner', { width: 390, height: 844 });
    await phone.page.goto(`${APP}/customers`);
    await phone.page.getByTestId('filters-open').waitFor({ timeout: 20000 });
    check('phone: the list fits', await noOverflow(phone.page));
    await phone.page.getByTestId('filters-open').click();
    await phone.page.getByTestId('filters-panel').waitFor();
    const box = await phone.page.getByTestId('filters-panel').boundingBox();
    check('phone: filters fill the screen', box.width === 390 && box.x === 0, box);
    check('phone: and fit', await noOverflow(phone.page));
    await phone.page.screenshot({ path: path.join(shots, 'filters-phone.png') });
    await phone.page.keyboard.press('Escape');
    await phone.page.getByTestId('filters-panel').waitFor({ state: 'detached' });
    await phone.page.goto(`${APP}/customers/${s.silk}`);
    await phone.page.getByTestId('past-purchases').waitFor({ timeout: 15000 });
    check('phone: the card fits', await noOverflow(phone.page));
    await phone.page.screenshot({ path: path.join(shots, 'past-card-phone.png'), fullPage: true });
    await phone.ctx.close();
  } finally {
    await browser.close();
    seedScript('clean');
  }
}

main()
  .catch(e => { console.error(e); failures += 1; })
  .finally(() => { console.log(failures ? `\n${failures} failed` : '\nAll passed'); process.exitCode = failures ? 1 : 0; });
