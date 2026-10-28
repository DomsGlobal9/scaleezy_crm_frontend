/**
 * Signing in, in a real browser, now that CRM asks Inventory who you are (security review, 28 Oct):
 *
 *   - a real Inventory sign-in (made through the LOCAL Inventory server) opens CRM
 *   - a cookie signed with the wrong secret is treated as signed out
 *   - when Inventory cannot be reached, the screen says so plainly -- not "sign in", and no data
 *
 * For the last case it starts a second CRM service (port 4098) pointed at an Inventory that is not
 * there, and a second copy of this app (port 5177) that talks to it. Nothing is stubbed.
 *
 *   npm run verify:signin-ui     (CRM on 4008, app on 5176, local Inventory on 4016)
 */
import { chromium } from 'playwright';
import { execFileSync, spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..', '..', 'backend');
const frontend = path.resolve(here, '..');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();

/** A token shaped like Inventory's but signed with a secret nobody has. */
function forgedToken() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub: 'f8c3abbd-90b0-43a6-b1b9-07c54c96a5a5', clientId: 'verify-suites-tenant', sv: 0, iss: 'scal_easy_auth', aud: 'scal_easy_inventory', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 });
  const sig = createHmac('sha256', randomBytes(32)).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

function start(cmd, args, cwd, env) {
  return spawn(cmd, args, { cwd, shell: true, stdio: 'ignore', env: { ...process.env, ...env } });
}
function stop(child, port) {
  if (child?.pid) execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true });
  // The shell can exit before its child; whatever still listens on the port goes too.
  if (port) {
    try {
      execFileSync('powershell', ['-NoProfile', '-Command', `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`], { stdio: 'ignore' });
    } catch { /* nothing left */ }
  }
}
async function waitFor(url) {
  for (let i = 0; i < 90; i += 1) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* starting */ }
    await sleep(500);
  }
  throw new Error(`${url} did not start`);
}

async function context(browser, token) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (token) await ctx.addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}

async function main() {
  const owner = tokenFor('owner');
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });

  {
    const { ctx, page } = await context(browser, owner);
    await page.goto(`${APP}/customers`);
    await page.getByTestId('customer-row').first().waitFor({ timeout: 20000 });
    check('a real Inventory sign-in opens CRM: the customers are listed', (await page.getByTestId('customer-row').count()) > 0);
    await ctx.close();
  }
  {
    const { ctx, page } = await context(browser, forgedToken());
    await page.goto(`${APP}/customers`);
    await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor({ timeout: 20000 });
    check('a cookie signed with the wrong secret: treated as signed out, no customers shown', (await page.getByTestId('customer-row').count()) === 0);
    await ctx.close();
  }

  const OWNER = 'verify-suites@example.com';
  const TWO = 'crm-two-shops@example.invalid';
  const PASSWORD = process.env.CRM_TEST_PASSWORD || 'Local-Crm-2026';
  const shots = path.join(here, 'screenshots');

  // The sign-in page itself.
  {
    const { ctx, page } = await context(browser, null);
    await page.goto(`${APP}/customers`);
    await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor({ timeout: 20000 });
    check('signed out: the sign-in page, saying to use the Inventory email and password', /same email and password as Scaleezy Inventory/.test(await page.locator('body').innerText()));
    await page.screenshot({ path: path.join(shots, 'signin-desktop.png') });

    // The page itself (the owner approved the mockup, 28 Oct).
    check('the Scaleezy CRM logo is on the sign-in page', await page.getByRole('img', { name: 'Scaleezy CRM' }).first().isVisible());
    await page.getByLabel('Password').fill('secret-123');
    await page.getByRole('button', { name: 'Show' }).click();
    check('"Show" shows the password, "Hide" hides it again', (await page.getByLabel('Password').getAttribute('type')) === 'text' && await page.getByRole('button', { name: 'Hide' }).isVisible());
    await page.getByRole('button', { name: 'Hide' }).click();
    check('...hidden', (await page.getByLabel('Password').getAttribute('type')) === 'password');
    await page.getByLabel('Password').fill('');
    await page.getByText('Forgot your password?').click();
    check('"Forgot your password?" says who can set a new one', await page.getByText(/Ask your shop owner or manager/).isVisible());
    await page.screenshot({ path: path.join(shots, 'signin-desktop.png'), fullPage: true });

    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('alert').waitFor({ timeout: 5000 });
    check('empty form: "Enter your email and password."', (await page.getByRole('alert').innerText()).includes('Enter your email and password.'));

    await page.getByLabel('Email').fill(OWNER);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('alert').filter({ hasText: 'do not match' }).waitFor({ timeout: 20000 });
    const wrong = await page.getByRole('alert').innerText();
    check('wrong password: one plain sentence, nothing technical', /That email and password do not match an active account\./.test(wrong) && !/401|Invalid credentials|Unauthorized/.test(wrong), wrong);
    check('...and still no customers', (await page.getByTestId('customer-row').count()) === 0);

    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByTestId('customer-row').first().waitFor({ timeout: 30000 });
    check('right password: the customers open, at the page asked for', page.url().endsWith('/customers') && (await page.getByTestId('customer-row').count()) > 0, page.url());
    const token = (await ctx.cookies('http://localhost:4008')).find(k => k.name === 'token');
    check('the sign-in is CRM\'s own cookie, httpOnly', !!token && token.httpOnly === true);
    check('...which the page itself cannot read', !(await page.evaluate(() => document.cookie)).includes('token='));

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor({ timeout: 20000 });
    check('Sign out: back to the sign-in page, no customers left on screen', (await page.getByTestId('customer-row').count()) === 0);
    check('...and the cookie is gone', !(await ctx.cookies('http://localhost:4008')).some(k => k.name === 'token'));
    await page.reload();
    await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor({ timeout: 20000 });
    check('...and stays signed out after a reload', (await page.getByTestId('customer-row').count()) === 0);
    await ctx.close();
  }

  // One email in two shops.
  {
    const { ctx, page } = await context(browser, null);
    await page.goto(`${APP}/customers`);
    await page.getByLabel('Email').fill(TWO);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('heading', { name: 'Which shop?' }).waitFor({ timeout: 20000 });
    const choices = await page.locator('.si-shop').allInnerTexts();
    check('one email in two shops: asked which, both listed', choices.length === 2 && choices.some(t => t.includes('verify-suites-tenant')) && choices.some(t => t.includes('welcome-test-silks-716252')), choices);
    await page.screenshot({ path: path.join(shots, 'signin-which-shop.png') });
    await page.getByRole('button', { name: 'verify-suites-tenant' }).click();
    await page.getByTestId('customer-row').first().waitFor({ timeout: 30000 });
    check('choosing the test shop opens its customers', (await page.getByTestId('customer-row').count()) > 0);
    await ctx.close();
  }

  // On a phone.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('scale_easy_theme', 'light'); } catch {} });
    const page = await ctx.newPage();
    await page.goto(`${APP}/customers`);
    await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor({ timeout: 20000 });
    const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    check('phone: the sign-in page has no sideways scroll', w.scroll <= w.inner, w);
    check('phone: the logo above the form', await page.getByRole('img', { name: 'Scaleezy CRM' }).first().isVisible());
    await page.screenshot({ path: path.join(shots, 'signin-phone.png') });
    await ctx.close();
  }

  // Inventory not there.
  const crm = start('npx', ['ts-node', '--transpile-only', 'src/server.ts'], backend, { PORT: '4098', INVENTORY_API_URL: 'http://127.0.0.1:9' });
  const app = start('npx', ['vite', '--port', '5177', '--strictPort'], frontend, { VITE_API_URL: 'http://localhost:4098/api/v1' });
  try {
    await waitFor('http://localhost:4098/health');
    await waitFor('http://localhost:5177/');
    const { ctx, page } = await context(browser, owner);
    await page.goto('http://localhost:5177/customers');
    await page.getByRole('heading', { name: 'We could not check your sign-in' }).waitFor({ timeout: 30000 });
    const text = await page.locator('body').innerText();
    check('Inventory unreachable: the screen says the sign-in could not be checked', /could not be checked just now/.test(text));
    check('...it does not tell a signed-in person to sign in', !/^Sign in$/m.test(text));
    check('...no customer is shown, and nothing technical (503, ECONNREFUSED, an address)', (await page.getByTestId('customer-row').count()) === 0 && !/503|ECONN|127\.0\.0\.1|fetch failed/.test(text), text.slice(0, 200));
    check('...and offers to try again', await page.getByRole('button', { name: 'Try again' }).isVisible());
    await page.screenshot({ path: path.join(here, 'screenshots', 'signin-unavailable.png') });
    await ctx.close();

    const fresh = await context(browser, null);
    await fresh.page.goto('http://localhost:5177/customers');
    await fresh.page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor({ timeout: 30000 });
    await fresh.page.getByLabel('Email').fill(OWNER);
    await fresh.page.getByLabel('Password').fill(PASSWORD);
    await fresh.page.getByRole('button', { name: 'Sign in' }).click();
    await fresh.page.getByRole('alert').waitFor({ timeout: 30000 });
    const said = await fresh.page.getByRole('alert').innerText();
    check('signing in while Inventory is unreachable: one plain sentence', /Signing in is not possible just now/.test(said) && !/503|ECONN|fetch|127\.0\.0\.1/.test(said), said);
    await fresh.ctx.close();
  } finally {
    stop(crm, 4098);
    stop(app, 5177);
  }

  await browser.close();
  console.log(failures === 0 ? '\nAll sign-in UI checks passed.' : `\n${failures} sign-in UI check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
