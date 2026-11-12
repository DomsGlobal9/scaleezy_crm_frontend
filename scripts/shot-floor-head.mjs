// Screenshots of Shop floor's header (store picker + Door QR), light theme, laptop and phone. Local only.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const token = execFileSync('npm', ['run', '--silent', 'login:test', '--', 'owner'], { cwd: path.resolve(here, '..', '..', 'backend'), encoding: 'utf8', shell: true }).trim();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let bad = 0;
for (const [name, viewport] of [['laptop', { width: 1366, height: 800 }], ['phone', { width: 375, height: 812 }]]) {
  const ctx = await browser.newContext({ viewport, colorScheme: 'light' });
  await ctx.addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'light'); } catch {} });
  const page = await ctx.newPage();
  await page.goto(`${APP}/sales`);
  const pick = page.getByRole('combobox', { name: 'Your store' });
  await pick.waitFor({ timeout: 20000 });
  if ((await pick.innerText()).includes('Choose')) { await pick.click(); await page.getByRole('option', { name: 'Main Store', exact: true }).click(); }
  const btn = page.getByTestId('sd-door-qr');
  await btn.waitFor({ timeout: 10000 });
  const box = await btn.boundingBox();
  const oneLine = box.height < 48;
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${oneLine && wide <= 1 ? 'PASS' : 'FAIL'}  ${name}: Door QR is one line (${Math.round(box.height)}px tall), no sideways scroll (${wide})`);
  if (!(oneLine && wide <= 1)) bad += 1;
  await page.locator('.crm-head').screenshot({ path: path.join(shots, `floor-head-${name}.png`) });
  await ctx.close();
}
await browser.close();
process.exitCode = bad ? 1 : 0;
