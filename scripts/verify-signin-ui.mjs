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
    await page.getByRole('heading', { name: 'Sign in to Inventory first' }).waitFor({ timeout: 20000 });
    check('a cookie signed with the wrong secret: treated as signed out, no customers shown', (await page.getByTestId('customer-row').count()) === 0);
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
    check('...it does not tell a signed-in person to sign in', !/Sign in to Inventory first/.test(text));
    check('...no customer is shown, and nothing technical (503, ECONNREFUSED, an address)', (await page.getByTestId('customer-row').count()) === 0 && !/503|ECONN|127\.0\.0\.1|fetch failed/.test(text), text.slice(0, 200));
    check('...and offers to try again', await page.getByRole('button', { name: 'Try again' }).isVisible());
    await page.screenshot({ path: path.join(here, 'screenshots', 'signin-unavailable.png') });
    await ctx.close();
  } finally {
    stop(crm, 4098);
    stop(app, 5177);
  }

  await browser.close();
  console.log(failures === 0 ? '\nAll sign-in UI checks passed.' : `\n${failures} sign-in UI check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
