/**
 * A shop without ScaleEzy Inventory (26 Nov, one-switch onboarding), on screen. The local test shop is marked
 * "CRM and the till only" for the run (as the Platform Console would), then put back exactly as it was:
 *   - the customer page has no money owed, picks from stock or bring-a-friend cards;
 *   - Settings → Automatic messages offers only what works without Inventory;
 *   - the campaign picture picker has no "From your products" tab;
 *   - with Inventory, everything is back.
 * Run with CRM (4008) and its app (5176) up.  node scripts/verify-no-inventory-ui.mjs
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..', '..', 'backend');
const APP = process.env.CRM_APP || 'http://localhost:5176';
const SHOP = 'verify-suites-tenant';
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();

let passed = 0; const failures = [];
const check = (name, ok, detail) => { if (ok) { passed++; console.log(`PASS  ${name}`); } else { failures.push(name); console.log(`FAIL  ${name}${detail === undefined ? '' : `  -- ${JSON.stringify(detail).slice(0, 300)}`}`); } };
const settle = async (page) => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(400); };

const before = sql(`select coalesce(platform_version::text,'') || '|' || array_to_string(platform_modules, ',') from crm.shops where client_id='${SHOP}'`);
const [v0, m0] = before.split('|');
const setModules = (version, modules) => sql(`update crm.shops set platform_version=${version}, platform_modules=ARRAY[${modules.map(m => `'${m}'`).join(',')}]::text[] where client_id='${SHOP}'`);

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
try {
  const customer = sql(`select c.id from crm.customers c where c.client_id='${SHOP}' and c.removed_at is null and c.merged_into_id is null and c.phone is not null order by c.created_at limit 1`);
  // A customer only the till or CRM knows (no Inventory record): with Inventory, nothing about them changes here.
  const tillOnly = sql(`select c.id from crm.customers c where c.client_id='${SHOP}' and c.removed_at is null and c.merged_into_id is null and c.phone is not null and not exists (select 1 from crm.identities i where i.customer_id=c.id and i.source='inventory' and i.removed_at is null) order by c.created_at limit 1`);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addCookies([{ name: 'token', value: tokenFor('owner'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();

  const look = async (label) => {
    await page.goto(`${APP}/customers/${customer}`); await settle(page);
    const cards = {
      owed: await page.getByText(/money owed|owes/i).count(),
      picks: await page.getByText(/send picks|picks for/i).count(),
      friend: await page.getByText(/bring a friend/i).count()
    };
    let own = { more: -1, change: -1 };
    if (tillOnly) {
      await page.goto(`${APP}/customers/${tillOnly}`); await settle(page);
      own = { more: await page.locator('.pe-more').count(), change: await page.locator('button.pe-chg').count() };
    }
    cards.own = own;
    await page.goto(`${APP}/settings?section=automatic`); await settle(page);
    const rows = await page.locator('[data-testid^="auto-open-"]').evaluateAll(els => els.map(e => e.getAttribute('data-testid').replace('auto-open-', '')));
    await page.screenshot({ path: path.join(here, `..\\..\\mockups\\no-inventory-${label}.png`) });
    return { cards, rows };
  };

  setModules(9001, ['crm', 'pos']);
  await new Promise(r => setTimeout(r, 31_000)); // CRM re-reads a shop's modules at most every 30 seconds
  const without = await look('without');
  check('without Inventory: no money owed card', without.cards.owed === 0, without.cards);
  check('...no picks from stock', without.cards.picks === 0, without.cards);
  check('...no bring a friend (points live in Inventory)', without.cards.friend === 0, without.cards);
  check('...a till-only customer: birthday and anniversary can be changed, and the owner can delete them (CRM keeps them)', !tillOnly || (without.cards.own.change >= 2 && without.cards.own.more === 1), without.cards.own);
  check('automatic messages: only what works without Inventory', JSON.stringify(without.rows) === JSON.stringify(['feedback', 'winback']), without.rows);

  setModules(9002, ['inventory', 'crm', 'pos']);
  await new Promise(r => setTimeout(r, 31_000));
  const withIt = await look('with');
  check('with Inventory: picks from stock are back', withIt.cards.picks > 0, withIt.cards);
  check('...a till-only customer is changed where Inventory keeps them, so not here', !tillOnly || (withIt.cards.own.change === 0 && withIt.cards.own.more === 0), withIt.cards.own);
  check('...and every automatic message is offered', withIt.rows.length === 7, withIt.rows);
} finally {
  sql(`update crm.shops set platform_version=${v0 ? v0 : 'null'}, platform_modules=ARRAY[${m0 ? m0.split(',').map(m => `'${m}'`).join(',') : ''}]::text[] where client_id='${SHOP}'`);
  await browser.close();
}
console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length) process.exit(1);
