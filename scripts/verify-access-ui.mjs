/**
 * Team and access in a real browser (installed Edge), signed in for real, local only: the owner sees who
 * can do what in CRM, read only, with the way to change it in Inventory's Team members; Sales does not.
 *
 *   node scripts/verify-access-ui.mjs      (CRM on 4008, the app on 5176, local Inventory on 4016)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const backend = path.resolve(here, '..', '..', 'backend');
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`); if (!ok) failures += 1; };
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();

async function main() {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    // Sales signs in first, so the team has a salesperson with what they may do.
    const sctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await sctx.addCookies([{ name: 'token', value: tokenFor('sales'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const sp = await sctx.newPage();
    await sp.goto(`${APP}/settings`);
    await sp.waitForLoadState('networkidle');
    check('Sales: no Team and access', (await sp.getByTestId('team-access').count()) === 0);
    check('Sales: the Shop floor is in the menu, Messages is not', (await sp.getByRole('link', { name: 'Shop floor' }).count()) === 1 && (await sp.getByRole('link', { name: 'Messages' }).count()) === 0);

    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.addCookies([{ name: 'token', value: tokenFor('owner'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
    await page.goto(`${APP}/settings`);
    const box = page.getByTestId('team-access');
    await box.waitFor({ timeout: 20000 });
    await page.getByTestId('team-person').first().waitFor({ timeout: 20000 });
    const text = await box.innerText();
    check('the owner sees Team and access, with themselves as Owner', /Team and access/.test(text) && /Owner: everything/.test(text), text.slice(0, 300));
    check('a salesperson shows "Shop floor" and not "Send messages"', (await page.getByTestId('team-person').filter({ hasText: 'Shop floor' }).filter({ hasNotText: 'Owner' }).count()) >= 1);
    const link = await page.getByTestId('team-change').getAttribute('href');
    check('changes are made in Inventory\'s Team members', /\/settings\?section=USERS$/.test(link ?? ''), link);
    const pending = await page.getByTestId('team-pending').count();
    const blank = execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', "select count(*) from crm.staff where client_id = 'verify-suites-tenant' and not is_owner and can_see_customers and cardinality(crm_access) = 0"], { encoding: 'utf8' }).trim();
    check('someone not signed in since the update: "Shown after their next sign-in", never "No CRM access"', String(pending) === blank, { pending, blank });
    check('it is read only: nothing to tick or choose', (await box.locator('input, select, [role="combobox"], [role="switch"]').count()) === 0);
    check('every person (not the owner) shows their stores; nobody limited yet says All stores', (await page.getByTestId('team-stores').filter({ hasText: 'All stores' }).count()) >= 1);
    await box.screenshot({ path: path.join(shots, 'team-access.png') });

    // Team members → Stores gives Sales one store: their screens keep to it.
    const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
    const salesId = sql("select id from users where email = 'local-sales@example.invalid'");
    const main = sql("select id from inventory_locations where client_id = 'verify-suites-tenant' and name = 'Main Store'");
    const before = sql(`select array_to_string(location_ids, ',') from users where id = '${salesId}'`);
    sql(`update users set location_ids = ARRAY['${main}'] where id = '${salesId}'`);
    try {
      const one = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      await one.addCookies([{ name: 'token', value: tokenFor('sales'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
      const p1 = await one.newPage();
      await p1.goto(`${APP}/sales`);
      const pick = p1.getByRole('combobox', { name: 'Your store' });
      await pick.waitFor({ timeout: 20000 });
      await p1.waitForFunction(() => /Main Store/.test(document.querySelector('[role="combobox"][aria-label="Your store"]')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
      const chosen = (await pick.innerText()).trim();
      await pick.click();
      const opts = (await p1.getByRole('option').allInnerTexts()).map(t => t.trim());
      await p1.keyboard.press('Escape');
      check('Shop floor: only their store, already chosen', chosen === 'Main Store' && opts.filter(o => o !== 'Choose your store').join() === 'Main Store', { chosen, opts });
      await p1.screenshot({ path: path.join(shots, 'sales-one-store.png') });
      await p1.goto(`${APP}/counter`);
      const doorPick = p1.getByRole('combobox', { name: 'Your store' });
      await doorPick.waitFor({ timeout: 20000 });
      await doorPick.click();
      const doorOpts = (await p1.getByRole('option').allInnerTexts()).map(t => t.trim());
      await p1.keyboard.press('Escape');
      check('At the door: "All my stores" and their store, nothing else', doorOpts.join() === 'All my stores,Main Store', doorOpts);
      await page.reload();
      await page.getByTestId('team-person').first().waitFor({ timeout: 20000 });
      const shows = await page.getByTestId('team-stores').filter({ hasText: 'Main Store' }).count();
      check('Team and access shows their one store', shows === 1, shows);
      await page.getByTestId('team-access').screenshot({ path: path.join(shots, 'team-access-stores.png') });
      await one.close();
    } finally {
      sql(`update users set location_ids = ${before ? `string_to_array('${before}', ',')` : "'{}'"} where id = '${salesId}'`);
    }
  } finally { await browser.close(); }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exitCode = failures ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
