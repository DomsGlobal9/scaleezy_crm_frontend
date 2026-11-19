/**
 * Layout audit (19 Nov, the owner: "some buttons collapsed, check each and every page, every device"). Every CRM
 * screen at five widths (small phone 360, phone 390, tablet 768, small laptop 1024, laptop 1366), as the owner.
 * Measures what the eye catches and the other checks miss:
 *   - sideways scroll, or anything sticking out past the screen's edge
 *   - a button / chip / tab whose words wrap onto two lines or are cut off (squashed)
 *   - buttons or links lying on top of each other
 *   - tap targets smaller than 32 px on phone and tablet
 * A screenshot of each screen at each width goes to scripts/screenshots/layout/. Local only, reads only.
 *
 *   node scripts/audit-layout.mjs [route-name ...]      (CRM on 4008, the app on 5176, local Inventory on 4016)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'screenshots', 'layout');
fs.mkdirSync(out, { recursive: true });
const backend = path.resolve(here, '..', '..', 'backend');
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const SHOP = 'verify-suites-tenant';

const customer = sql(`select c.id from crm.customers c where c.client_id='${SHOP}' and c.removed_at is null and c.merged_into_id is null and exists (select 1 from crm.timeline_events t where t.customer_id=c.id and t.counts_spend) order by (select count(*) from crm.timeline_events t where t.customer_id=c.id) desc limit 1`);
const segment = sql(`select id from crm.segments where client_id='${SHOP}' limit 1`);
const group = sql(`select t from (select unnest(tags) t from crm.customers where client_id='${SHOP}') x group by t order by count(*) desc limit 1`);
const message = sql(`select id from crm.message_campaigns where client_id='${SHOP}' and kind='manual' order by created_at desc limit 1`);
const store = sql(`select id from inventory_locations where client_id='${SHOP}' and name='Main Store'`);

const ALL = [
  ['shop-floor', '/sales'], ['today', '/today'], ['week', '/week'], ['door', '/counter'], ['customers', '/customers'],
  ['customer', `/customers/${customer}`], ['customer-festivals', `/customers/${customer}?tab=festivals`],
  ['duplicates', '/duplicates'], ['reviews', '/reviews'], ['rated-low', '/reviews/rated-low'],
  ['festivals', '/festivals'], ['groups', '/groups'], ...(group ? [['group', `/groups/${encodeURIComponent(group)}`]] : []),
  ['segments', '/segments'], ['segment-new', '/segments/new'], ...(segment ? [['segment', `/segments/${segment}`]] : []),
  ['campaigns', '/campaigns'], ['campaigns-auto', '/campaigns?tab=automatic'], ['campaign-new', '/campaigns/new'], ...(message ? [['campaign', `/campaigns/${message}`]] : []),
  ['settings', '/settings'], ['settings-shop', '/settings?section=shop'], ['settings-auto', '/settings?section=automatic'],
  ['settings-team', '/settings?section=team'], ['settings-prices', '/settings?section=prices'],
  ['door-qr', `/door-qr?locationId=${store}`], ['not-found', '/no-such-page']
];
const only = process.argv.slice(2);
const ROUTES = only.length ? ALL.filter(([n]) => only.includes(n)) : ALL;
const WIDTHS = [['phone-s', 360, 740], ['phone', 390, 844], ['tablet', 768, 1024], ['laptop-s', 1024, 768], ['laptop', 1366, 900]];

/** Runs in the page: what looks broken. */
function measure(touch) {
  const vw = document.documentElement.clientWidth;
  const out = [];
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && el.offsetParent !== null; };
  const label = el => (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
  const wide = document.documentElement.scrollWidth - vw;
  if (wide > 1) out.push(`scrolls sideways by ${wide}px`);
  // Anything sticking out past the right edge (inside a scroller that is meant to scroll, it is fine).
  const scrolls = el => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX) && p !== document.body && p !== document.documentElement) return true; } return false; };
  const sticking = [...document.querySelectorAll('main *, header *')].filter(el => visible(el) && el.getBoundingClientRect().right > vw + 1 && !scrolls(el)).slice(0, 3);
  for (const el of sticking) out.push(`sticks out past the screen: "${label(el)}" (${Math.round(el.getBoundingClientRect().right - vw)}px)`);
  const controls = [...document.querySelectorAll('button, a.btn-primary, a.btn-secondary, [role="tab"], [role="radio"], .cp-chip, .btn-primary, .btn-secondary, select, input[type="submit"]')].filter(visible);
  for (const el of controls) {
    const s = getComputedStyle(el);
    const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.25;
    const r = el.getBoundingClientRect();
    const text = (el.innerText || '').trim();
    void lh;
    // A control built as a title and a line under it (Settings' menu) is two lines on purpose.
    if (text && text.length > 1 && !text.includes('\n') && !el.closest('[data-wraps-ok]')) {
      // Words wrapping onto a second line: count the lines the text itself takes.
      const tops = new Set();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(n);
        for (const rr of range.getClientRects()) if (rr.width > 1) tops.add(Math.round(rr.top / 4));
      }
      if (tops.size > 1) out.push(`squashed (${tops.size} lines): "${label(el)}" ${Math.round(r.width)}px wide`);
      // Words cut off.
      // Words wider than their button: cut off, or spilling over the next one.
      if (el.scrollWidth > el.clientWidth + 2) out.push(`${s.overflow === 'visible' ? 'words spill out' : 'cut off'}: "${label(el)}"`);
    }
    if (touch && (r.height < 32 || r.width < 32) && !el.closest('.crm-inline-link')) out.push(`small to tap (${Math.round(r.width)}x${Math.round(r.height)}): "${label(el)}"`);
  }
  // Controls lying on top of each other.
  const boxes = controls.map(el => ({ el, r: el.getBoundingClientRect() }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (x > 4 && y > 4) out.push(`overlap: "${label(a.el)}" and "${label(b.el)}"`);
  }
  return [...new Set(out)];
}

const findings = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const token = tokenFor('owner');
  for (const [view, width, height] of WIDTHS) {
    const touch = width < 1024;
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: width < 768, deviceScaleFactor: 1 });
    await ctx.addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const page = await ctx.newPage();
    for (const [name, route] of ROUTES) {
      let issues = [];
      try {
        await page.goto(`${APP}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
        await page.waitForTimeout(500);
        issues = await page.evaluate(measure, touch);
        await page.screenshot({ path: path.join(out, `${name}-${view}.png`), fullPage: true });
      } catch (e) { issues.push(`could not open: ${e.message.slice(0, 120)}`); }
      if (issues.length) findings.push({ name, route, view, width, issues });
    }
    await ctx.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(out, 'findings.json'), JSON.stringify(findings, null, 2));
for (const f of findings) { console.log(`\n[${f.view} ${f.width}] ${f.name} (${f.route})`); for (const i of f.issues.slice(0, 12)) console.log(`  - ${i}`); if (f.issues.length > 12) console.log(`  … ${f.issues.length - 12} more`); }
console.log(`\n${findings.length} screen/width pair(s) with something to fix, of ${ROUTES.length * WIDTHS.length}`);
