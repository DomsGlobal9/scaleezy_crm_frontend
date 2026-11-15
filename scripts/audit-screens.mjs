/**
 * Screen audit (15 Nov): every CRM screen, as the owner and as Sales, on a laptop (light and dark) and a phone.
 * Records page errors, console errors, failed requests (4xx/5xx), sideways scroll, and words that should never
 * show (undefined, NaN, null, [object, crm: keys, raw ids), with a screenshot of each. Local only, reads only
 * (it opens screens; it does not press buttons that change anything).
 *
 *   node scripts/audit-screens.mjs      (CRM on 4008, the app on 5176, local Inventory on 4016)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'screenshots', 'audit');
fs.mkdirSync(out, { recursive: true });
const backend = path.resolve(here, '..', '..', 'backend');
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const SHOP = 'verify-suites-tenant';

const customer = sql(`select c.id from crm.customers c where c.client_id='${SHOP}' and c.removed_at is null and c.merged_into_id is null and exists (select 1 from crm.timeline_events t where t.customer_id=c.id and t.counts_spend) order by (select count(*) from crm.timeline_events t where t.customer_id=c.id) desc limit 1`);
const segment = sql(`select id from crm.segments where client_id='${SHOP}' limit 1`);
const group = sql(`select t from (select unnest(tags) t from crm.customers where client_id='${SHOP}') x group by t order by count(*) desc limit 1`);
const message = sql(`select id from crm.message_campaigns where client_id='${SHOP}' order by created_at desc limit 1`);
const store = sql(`select id from inventory_locations where client_id='${SHOP}' and name='Main Store'`);

const ROUTES = [
  ['shop-floor', '/sales'], ['today', '/today'], ['week', '/week'], ['door', '/counter'], ['customers', '/customers'],
  ['customer', `/customers/${customer}`], ['duplicates', '/duplicates'], ['reviews', '/reviews'], ['rated-low', '/reviews/rated-low'],
  ['festivals', '/festivals'], ['groups', '/groups'], ...(group ? [['group', `/groups/${encodeURIComponent(group)}`]] : []),
  ['segments', '/segments'], ['segment-new', '/segments/new'], ...(segment ? [['segment', `/segments/${segment}`]] : []),
  ['messages', '/messages'], ['message-new', '/messages/new'], ...(message ? [['message', `/messages/${message}`]] : []),
  ['settings', '/settings'], ['settings-shop', '/settings?section=shop'], ['settings-auto', '/settings?section=automatic'], ['settings-team', '/settings?section=team'],
  ['door-qr', `/door-qr?locationId=${store}`], ['not-found', '/no-such-page']
];
const BAD = [/\bundefined\b/, /\bNaN\b/, /\[object /, /\bnull\b/, /\bcrm:[a-z]/, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/, /Invalid Date/, /\{\w+\}/];

const findings = [];
async function visit(browser, who, view) {
  const vp = view === 'phone' ? { width: 375, height: 812 } : { width: 1366, height: 900 };
  const theme = view === 'dark' ? 'dark' : 'light';
  const ctx = await browser.newContext({ viewport: vp, colorScheme: theme });
  await ctx.addCookies([{ name: 'token', value: tokenFor(who), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.addInitScript((t) => { try { localStorage.setItem('scale_easy_theme', t); } catch { /* fine */ } }, theme);
  const page = await ctx.newPage();
  for (const [name, route] of ROUTES) {
    const issues = [];
    const onErr = e => issues.push(`page error: ${e.message.slice(0, 160)}`);
    const onConsole = m => { if (m.type() === 'error' && !/EventSource|live|favicon|ERR_ABORTED/i.test(m.text())) issues.push(`console: ${m.text().slice(0, 160)}`); };
    const onResp = r => { const u = r.url(); if (u.includes('/api/v1/') && !u.includes('/live') && r.status() >= 400 && !(who === 'sales' && r.status() === 403)) issues.push(`request ${r.status()}: ${u.replace(/^https?:\/\/[^/]+/, '').slice(0, 120)}`); };
    page.on('pageerror', onErr); page.on('console', onConsole); page.on('response', onResp);
    try {
      await page.goto(`${APP}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(600);
      const text = await page.locator('main, body').first().innerText().catch(() => '');
      for (const re of BAD) { const m = text.match(re); if (m) issues.push(`shows "${m[0]}" near: …${text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')}…`); }
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (wide > 1) issues.push(`scrolls sideways by ${wide}px`);
      const stuck = await page.getByText(/Loading|Checking/).count();
      if (stuck) issues.push(`still says Loading/Checking after load (${stuck})`);
      const noName = await page.evaluate(() => [...document.querySelectorAll('button, a')].filter(b => !b.innerText.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title') && b.offsetParent).length);
      if (noName) issues.push(`${noName} icon-only button/link without a name`);
      await page.screenshot({ path: path.join(out, `${who}-${view}-${name}.png`), fullPage: view !== 'phone' });
    } catch (e) { issues.push(`could not open: ${e.message.slice(0, 120)}`); }
    page.off('pageerror', onErr); page.off('console', onConsole); page.off('response', onResp);
    if (issues.length) findings.push({ who, view, name, route, issues: [...new Set(issues)] });
  }
  await ctx.close();
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const [who, view] of [['owner', 'light'], ['owner', 'dark'], ['owner', 'phone'], ['sales', 'light']]) await visit(browser, who, view);
} finally { await browser.close(); }
fs.writeFileSync(path.join(out, 'findings.json'), JSON.stringify(findings, null, 2));
for (const f of findings) { console.log(`\n[${f.who} ${f.view}] ${f.name} (${f.route})`); for (const i of f.issues) console.log(`  - ${i}`); }
console.log(`\n${findings.length} screen(s) with something to look at`);
