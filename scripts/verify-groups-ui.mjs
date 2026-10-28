/**
 * Groups, in a real browser (installed Edge), signed in for real, local database and local Inventory.
 *
 *   owner   the groups with their counts; make a group; add Anitha by searching; set a rule;
 *           Inventory's refusal while a live offer is only for the group, shown where you pressed;
 *           rename; delete (asks first)
 *   sales   no "New group", may still add people
 *   phone   the list and a group, no sideways scroll
 *
 *   node scripts/verify-groups-ui.mjs      (CRM on 4008, the app on 5176, Inventory on 4016)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const API = process.env.CRM_URL || 'http://localhost:4008';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const backend = path.resolve(here, '..', '..', 'backend');
const NAME = `CHECK-GRPUI-${Date.now() % 100000}`;
const OFFER = randomUUID();

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
};
const tokens = {};
const tokenFor = (who) => (tokens[who] ??= execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim());
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const api = async (method, p, body) => (await fetch(`${API}/api/v1${p}`, { method, headers: { Authorization: `Bearer ${tokenFor('owner')}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function as(browser, who, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name: 'token', value: tokenFor(who), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}

async function main() {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { ctx, page } = await as(browser, 'owner');
    await page.goto(`${APP}/groups`);
    await page.getByTestId('group').first().waitFor({ timeout: 20000 });
    const vipCount = (await api('GET', '/groups')).data.find(g => g.key === 'vip')?.count;
    check(`the groups with their counts (VIP: ${vipCount})`, new RegExp(`VIP[\\s\\S]*${vipCount}\\s+customers`).test(await page.getByTestId('group').filter({ hasText: 'VIP' }).innerText()));
    await page.screenshot({ path: path.join(shots, 'groups-list.png') });

    await page.getByLabel('New group').fill(NAME);
    await page.getByRole('button', { name: 'Make group' }).click();
    await page.waitForURL(/\/groups\/check-grpui-/);
    await page.getByTestId('no-members').waitFor({ timeout: 15000 });
    check('make a group: its page, nobody in it yet', (await page.getByTestId('group-name').innerText()).trim() === NAME);

    await page.getByLabel('Find a customer to add').fill('Anitha');
    await page.getByTestId('add-results').getByRole('button', { name: 'Add' }).first().click();
    await page.getByTestId('member').filter({ hasText: 'Anitha Reddy' }).waitFor({ timeout: 15000 });
    check('add Anitha by searching her name: she is in it, linked to her CRM page', (await page.getByTestId('member').filter({ hasText: 'Anitha Reddy' }).getByRole('link').getAttribute('href'))?.startsWith('/customers/'));

    await page.getByLabel('No birthday or anniversary wishes').check();
    await page.getByRole('button', { name: 'Save rules' }).click();
    await page.locator('.gr-badge', { hasText: 'No wishes' }).waitFor({ timeout: 15000 });
    check('a rule saved shows on the group ("No wishes")', true);

    // A live offer only for this group: Inventory refuses the delete, in its words, where you pressed.
    sql(`insert into offers (id, client_id, offer_code, name, value_type, value, starts_at, status, customer_tags, updated_at) values ('${OFFER}', 'verify-suites-tenant', 'UI${Date.now() % 100000}', 'Check UI offer', 'PERCENTAGE', 10, now(), 'ACTIVE', array['${NAME}'], now())`);
    await page.reload();
    await page.getByRole('button', { name: `Delete ${NAME}` }).click();
    await page.locator('.sg-confirm').getByRole('button', { name: 'Delete' }).click();
    await page.getByTestId('delete-problem').waitFor({ timeout: 15000 });
    check('delete while a live offer is only for it: refused, naming the offer', /Check UI offer/.test(await page.getByTestId('delete-problem').innerText()));
    await page.screenshot({ path: path.join(shots, 'groups-view.png'), fullPage: true });
    sql(`delete from offers where id = '${OFFER}'`);

    await page.getByLabel('New name').fill(`${NAME} X`);
    await page.getByRole('button', { name: 'Rename' }).click();
    await page.waitForFunction((n) => document.querySelector('[data-testid="group-name"]')?.textContent.trim() === n, `${NAME} X`, { timeout: 15000 });
    check('rename: the page follows the new name', true);

    await page.getByRole('button', { name: `Delete ${NAME} X` }).click();
    check('delete asks first, saying nobody\'s record is lost', /nobody's record is lost/.test(await page.locator('.sg-confirm').innerText()));
    await page.locator('.sg-confirm').getByRole('button', { name: 'Delete' }).click();
    await page.waitForURL(/\/groups$/);
    await page.getByTestId('group').first().waitFor();
    check('deleted: back on the list, and it is gone', (await page.getByTestId('group').filter({ hasText: NAME }).count()) === 0);
    await ctx.close();

    {
      const { ctx: c2, page: p2 } = await as(browser, 'sales');
      await p2.goto(`${APP}/groups`);
      await p2.getByTestId('group').first().waitFor({ timeout: 20000 });
      check('sales: no "New group"', (await p2.getByLabel('New group').count()) === 0);
      await p2.getByTestId('group').filter({ hasText: 'VIP' }).click();
      await p2.getByTestId('member').first().waitFor({ timeout: 15000 });
      check('...but can add people, and has no rename, merge or delete', (await p2.getByLabel('Find a customer to add').count()) === 1 && (await p2.getByRole('button', { name: 'Rename' }).count()) === 0 && (await p2.getByRole('button', { name: /^Delete/ }).count()) === 0);
      await c2.close();
    }
    {
      const { ctx: c3, page: p3 } = await as(browser, 'owner', { width: 390, height: 844 });
      await p3.goto(`${APP}/groups`);
      await p3.getByTestId('group').first().waitFor({ timeout: 20000 });
      check('phone: the groups, no sideways scroll', await noOverflow(p3));
      await p3.goto(`${APP}/groups/vip`);
      await p3.getByTestId('member').first().waitFor({ timeout: 15000 });
      check('phone: a group, no sideways scroll', await noOverflow(p3));
      await p3.screenshot({ path: path.join(shots, 'groups-phone.png'), fullPage: true });
      await c3.close();
    }
  } finally {
    await browser.close();
    sql(`delete from offers where id = '${OFFER}'`);
    for (const g of (await api('GET', '/groups')).data.filter(g => g.name.startsWith('CHECK-GRPUI-'))) await api('DELETE', `/groups/${encodeURIComponent(g.key)}`);
  }
  console.log(failures ? `\n${failures} groups UI check(s) FAILED.` : '\nAll groups UI checks passed.');
  process.exitCode = failures ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
