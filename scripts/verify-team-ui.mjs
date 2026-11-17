/**
 * Someone who has left the shop, in a real browser (installed Edge), signed in for real, LOCAL only (17 Nov).
 * CRM's own test salesperson is switched off in the LOCAL Inventory through its Team members API, the way
 * a shop does it, and switched on again at the end.
 *
 *   before   they can be chosen for a follow-up, and are on Team and access
 *   after    not in the "Who" list, not on Team and access; what they had open is the owner's,
 *            saying "was for ..." on the customer page and on Today; nothing scrolls sideways on a phone
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = 'http://localhost:5176';
const API = process.env.CRM_URL || 'http://localhost:4008';
const INVENTORY = (process.env.INVENTORY_API_URL || 'http://localhost:4016').replace(/\/+$/, '').replace(/\/api\/v1$/, '');
if (!['localhost', '127.0.0.1'].includes(new URL(INVENTORY).hostname) || !['localhost', '127.0.0.1'].includes(new URL(API).hostname)) { console.error('Refusing: local only.'); process.exit(2); }
const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..', '..', 'backend');
const STAMP = `CHECK-TEAM-UI-${Date.now() % 100000}`;

let failures = 0;
const check = (name, ok, detail) => {
  if (ok) console.log(`PASS  ${name}`);
  else { failures += 1; console.log(`FAIL  ${name}${detail === undefined ? '' : `  -- ${JSON.stringify(detail)?.slice(0, 300)}`}`); }
};
const run = (...args) => execFileSync('npm', ['run', '--silent', ...args], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const tokenFor = (who) => run('login:test', '--', who);
const idIn = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function as(browser, token, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}

async function main() {
  const owner = tokenFor('owner');
  const person = tokenFor('check');
  const personId = idIn(person);
  const headers = { Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' };
  const api = async (method, p, body) => (await fetch(`${API}/api/v1${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined })).json();
  const setStatus = async (status) => {
    const res = await fetch(`${INVENTORY}/api/v1/team/members/${personId}/status`, { method: 'PATCH', headers, body: JSON.stringify({ status }) });
    if (!res.ok) throw new Error(`Inventory would not set ${status}: ${res.status}`);
  };
  // They open CRM once, so CRM knows them; the owner too, most recently (the shop's owner in CRM).
  await fetch(`${API}/api/v1/staff`, { headers: { Authorization: `Bearer ${person}` } });
  let name = null;
  for (let i = 0; i < 40 && !name; i += 1) { name = (await api('GET', '/staff')).data.find(s => s.id === personId)?.name ?? null; if (!name) await new Promise(r => setTimeout(r, 250)); }
  const customer = (await api('GET', '/customers?search=9848022301')).data.customers[0];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const made = [];

  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    console.log('\n1. Before');
    {
      const { ctx, page } = await as(browser, owner);
      await page.goto(`${APP}/customers/${customer.id}`);
      const card = page.getByTestId('work-card');
      await card.waitFor({ timeout: 20000 });
      await card.getByRole('button', { name: 'New follow-up' }).click();
      await card.getByRole('combobox', { name: 'Who' }).click();
      // The team is asked for when the page opens: wait until they are offered rather than count at once.
      await page.getByRole('option', { name, exact: true }).waitFor({ timeout: 10000 }).catch(() => {});
      check(`"Who" offers ${name}`, !!name && (await page.getByRole('option', { name, exact: true }).count()) === 1, await page.getByRole('option').allInnerTexts());
      await page.keyboard.press('Escape');
      await page.goto(`${APP}/settings?section=team`);
      await page.getByTestId('team-person').first().waitFor({ timeout: 20000 });
      check('Team and access lists them', (await page.getByTestId('team-person').filter({ hasText: name }).count()) === 1);
      await ctx.close();
    }
    const f = await api('POST', `/customers/${customer.id}/followups`, { body: `${STAMP} call about the blouse fitting`, dueOn: today, assigneeId: personId });
    made.push(f.data.id);

    console.log('\n2. After they are switched off in Inventory');
    await setStatus('INACTIVE');
    {
      const { ctx, page } = await as(browser, owner);
      await page.goto(`${APP}/customers/${customer.id}`);
      const card = page.getByTestId('work-card');
      await card.waitFor({ timeout: 20000 });
      const tag = card.getByTestId('followup').filter({ hasText: STAMP });
      await tag.waitFor({ timeout: 15000 });
      check('what they had open is still on the customer\'s page, saying whose it was', (await tag.getByTestId('fu-was-for').innerText()).includes(`was for ${name}`), await tag.innerText());
      await tag.screenshot({ path: path.join(here, 'screenshots', 'team-was-for-card.png') });
      await card.getByRole('button', { name: 'New follow-up' }).click();
      await card.getByRole('combobox', { name: 'Who' }).click();
      await page.getByRole('option').first().waitFor({ timeout: 10000 });
      check('"Who" no longer offers them', (await page.getByRole('option', { name, exact: true }).count()) === 0, await page.getByRole('option').allInnerTexts());
      await page.keyboard.press('Escape');

      await page.goto(`${APP}/today`);
      const row = page.getByTestId('talk-row').filter({ hasText: STAMP });
      await row.waitFor({ timeout: 20000 });
      check('it is on the owner\'s own Today, saying whose it was', (await row.innerText()).includes(`was for ${name}`), await row.innerText());

      await row.screenshot({ path: path.join(here, 'screenshots', 'team-was-for-today.png') });
      await page.goto(`${APP}/settings?section=team`);
      await page.getByTestId('team-person').first().waitFor({ timeout: 20000 });
      check('Team and access no longer lists them', (await page.getByTestId('team-person').filter({ hasText: name }).count()) === 0, await page.getByTestId('team-person').allInnerTexts());
      await ctx.close();
    }
    {
      const { ctx, page } = await as(browser, owner, { width: 390, height: 844 });
      await page.goto(`${APP}/today`);
      await page.getByTestId('talk-row').filter({ hasText: STAMP }).waitFor({ timeout: 20000 });
      check('phone: Today with "was for", nothing scrolls sideways', await noOverflow(page));
      await page.goto(`${APP}/customers/${customer.id}?tab=work`);
      await page.getByTestId('fu-was-for').first().waitFor({ timeout: 20000 });
      check('phone: the customer\'s follow-ups, nothing scrolls sideways', await noOverflow(page));
      await ctx.close();
    }
  } finally {
    await browser.close();
    await setStatus('ACTIVE').catch(e => console.log('      could not switch the test login back on:', e.message));
    for (const id of made) await api('POST', `/followups/${id}/done`).catch(() => {});
    run('shop:test', '--', 'cleanchecks', 'verify-suites-tenant');
  }
  console.log(failures ? `\n${failures} team UI check(s) FAILED.` : '\nAll team UI checks passed.');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
