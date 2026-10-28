/**
 * A brand-new shop's first visit, in a real browser (Edge), against the LOCAL Inventory server:
 *
 *   - signed in, while the first copy from Inventory has not happened: "Bringing your customers over
 *     from Inventory…", never "No customers yet"
 *   - the copy runs: the customers appear by themselves, with no reload, and the message goes
 *   - a paused shop says so plainly; nothing sticks out on a phone
 *
 * It starts its own CRM service (port 4097) with the clock switched off, so the test decides when the
 * copy runs, and its own copy of this app (port 5177) talking to it. Run it with the main local CRM
 * service (4008) stopped, so that service's clock does not copy the shop first.
 *
 *   npm run verify:shops-ui     (load backend/src/scripts/fixtures/local-second-shop.sql first)
 */
import { chromium } from 'playwright';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..', '..', 'backend');
const frontend = path.resolve(here, '..');
const SHOP = 'welcome-test-silks-716252';
const EMAIL = 'crm-two-shops@example.invalid';
const PASSWORD = process.env.CRM_TEST_PASSWORD || 'Local-Crm-2026';
const APP = 'http://localhost:5177';

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const shopTool = (...args) => execFileSync('npm', ['run', '--silent', 'shop:test', '--', ...args], { cwd: backend, encoding: 'utf8', shell: true }).trim();

function start(cmd, args, cwd, env) {
  return spawn(cmd, args, { cwd, shell: true, stdio: 'ignore', env: { ...process.env, ...env } });
}
function stop(child, port) {
  try { if (child?.pid) execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true }); } catch { /* gone */ }
  try { execFileSync('powershell', ['-NoProfile', '-Command', `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`], { stdio: 'ignore' }); } catch { /* none */ }
}
async function waitFor(url) {
  for (let i = 0; i < 120; i += 1) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* starting */ }
    await sleep(500);
  }
  throw new Error(`${url} did not start`);
}

async function main() {
  shopTool('reset', SHOP);
  shopTool('on', SHOP);
  const crm = start('npx', ['ts-node', '--transpile-only', 'src/server.ts'], backend, { PORT: '4097', DISABLE_BACKGROUND_JOBS: 'true' });
  const app = start('npx', ['vite', '--port', '5177', '--strictPort'], frontend, { VITE_API_URL: 'http://localhost:4097/api/v1' });
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    await waitFor('http://localhost:4097/health');
    await waitFor(`${APP}/`);

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
    await page.goto(`${APP}/customers`);
    await page.getByLabel('Email').fill(EMAIL);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: SHOP }).click();

    await page.getByTestId('copying').waitFor({ timeout: 30000 });
    const text = await page.locator('main').innerText();
    check('first visit, copy not done yet: "Bringing your customers over from Inventory…"', /Bringing your customers over from Inventory/.test(text));
    check('...and never "No customers yet"', !/No customers yet/.test(text));
    await page.screenshot({ path: path.join(here, 'screenshots', 'shop-first-copy.png') });

    const out = shopTool('copy', SHOP);
    check('(the copy ran)', /"capped":false/.test(out), out);
    await page.getByTestId('customer-row').first().waitFor({ timeout: 30000 });
    const rows = await page.getByTestId('customer-row').count();
    const counts = JSON.parse(shopTool('count', SHOP));
    check(`the customers appeared by themselves, no reload: ${rows} of ${counts.inventory}`, rows === counts.inventory && counts.crm === counts.inventory, { rows, counts });
    await page.getByTestId('copying').waitFor({ state: 'detached', timeout: 30000 });
    check('...and the "bringing over" message is gone', (await page.getByTestId('copying').count()) === 0 && (await page.getByTestId('copying-banner').count()) === 0);

    shopTool('pause', SHOP);
    await page.getByLabel('Search customers').fill('zzqq-nobody');
    await page.reload();
    await page.getByLabel('Search customers').waitFor();
    // A paused shop with customers still lists them; the plain message is for an empty list.
    shopTool('reset', SHOP);
    shopTool('on', SHOP);
    shopTool('pause', SHOP);
    await page.goto(`${APP}/customers`);
    await page.getByRole('heading', { name: 'Copying is paused for your shop' }).waitFor({ timeout: 30000 });
    check('a paused shop with nothing copied says so plainly', /Your customers stay safe in Inventory/.test(await page.locator('main').innerText()));
    await ctx.close();

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
    shopTool('resume', SHOP);
    const p2 = await phone.newPage();
    await p2.goto(`${APP}/customers`);
    await p2.getByLabel('Email').fill(EMAIL);
    await p2.getByLabel('Password').fill(PASSWORD);
    await p2.getByRole('button', { name: 'Sign in' }).click();
    await p2.getByRole('button', { name: SHOP }).click();
    await p2.getByTestId('copying').waitFor({ timeout: 30000 });
    const w = await p2.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    check('phone: the "bringing over" screen has no sideways scroll', w.scroll <= w.inner, w);
    await p2.screenshot({ path: path.join(here, 'screenshots', 'shop-first-copy-phone.png') });
    await phone.close();
  } finally {
    await browser.close();
    stop(crm, 4097);
    stop(app, 5177);
    // Leave the shop as the clock would: copied.
    shopTool('copy', SHOP);
  }
  console.log(failures === 0 ? '\nAll shop UI checks passed.' : `\n${failures} shop UI check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
