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
    check('Sales: the Sales dashboard is in the menu, Messages is not', (await sp.getByRole('link', { name: 'Sales dashboard' }).count()) === 1 && (await sp.getByRole('link', { name: 'Messages' }).count()) === 0);

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
    check('a salesperson shows "Sales dashboard" and not "Send messages"', (await page.getByTestId('team-person').filter({ hasText: 'Sales dashboard' }).filter({ hasNotText: 'Owner' }).count()) >= 1);
    const link = await page.getByTestId('team-change').getAttribute('href');
    check('changes are made in Inventory\'s Team members', /\/settings\?section=USERS$/.test(link ?? ''), link);
    check('it is read only: nothing to tick or choose', (await box.locator('input, select, [role="combobox"], [role="switch"]').count()) === 0);
    await box.screenshot({ path: path.join(shots, 'team-access.png') });
  } finally { await browser.close(); }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exitCode = failures ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
