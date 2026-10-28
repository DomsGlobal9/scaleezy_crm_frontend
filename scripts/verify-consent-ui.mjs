/**
 * The consent record, in a real browser (installed Edge), signed in for real, local database only.
 * A Boutique customer agrees at the counter, replies STOP, and agrees again -- sent signed through
 * CRM's inbox like any module -- and the customer page must tell that story.
 *
 *   the chip says where it stands; it opens the record; the record reads newest first with how, who,
 *   from where; Escape closes it and puts you back on the chip; the timeline carries every record;
 *   on a phone the record fits
 *
 *   node scripts/verify-consent-ui.mjs      (CRM on 4008, the app on 5176)
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.CRM_APP_URL || 'http://localhost:5176';
const API = process.env.CRM_URL || 'http://localhost:4008';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const backend = path.resolve(here, '..', '..', 'backend');
const SHOP = 'verify-suites-tenant';
const STAMP = Date.now();
const EXT = `consentui-${STAMP}`;
const NAME = `Consent UI ${STAMP % 100000}`;

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -- ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
};
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();

// The Boutique secret from CRM's local settings (local only).
const secrets = JSON.parse(readFileSync(path.join(backend, '.env'), 'utf8').match(/^CRM_SOURCE_SECRETS=(.*)$/m)[1]);
const daysAgo = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
let n = 0;
const ev = (kind, payload, at) => ({ source: 'boutique', clientId: SHOP, kind, version: 1, occurredAt: at, idempotencyKey: `${EXT}-${++n}`, payload });

async function send(events) {
  const body = JSON.stringify({ events });
  const ts = Math.floor(Date.now() / 1000);
  const sig = `sha256=${createHmac('sha256', secrets.boutique).update(`${ts}.${body}`).digest('hex')}`;
  const res = await fetch(`${API}/api/v1/inbox/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CRM-Source': 'boutique', 'X-CRM-Timestamp': String(ts), 'X-CRM-Signature': sig }, body });
  if (res.status !== 202) throw new Error(`inbox ${res.status}`);
  for (let i = 0; i < 80; i += 1) {
    if (sql(`select count(*) from crm.inbound_events where idempotency_key like '${EXT}-%' and status in ('pending','working','waiting')`) === '0') return;
    await new Promise(r => setTimeout(r, 250));
  }
}
function cleanup() {
  sql(`with c as (select customer_id from crm.identities where external_id = '${EXT}')
       , d1 as (delete from crm.consents where customer_id in (select customer_id from c))
       , d2 as (delete from crm.timeline_events where customer_id in (select customer_id from c))
       , d3 as (delete from crm.merge_suggestions where customer_a_id in (select customer_id from c) or customer_b_id in (select customer_id from c))
       select 1`);
  sql(`with c as (select customer_id from crm.identities where external_id = '${EXT}'), d as (delete from crm.identities where external_id = '${EXT}') delete from crm.customers where id in (select customer_id from c)`);
  sql(`delete from crm.inbound_events where idempotency_key like '${EXT}-%'`);
}

async function main() {
  await send([
    ev('customer.upserted', { customerId: EXT, name: NAME, phone: `+91 8${String(STAMP).slice(-9)}`, tags: [], customerType: 'REGISTERED', addresses: [], createdAt: daysAgo(10) }, daysAgo(10)),
    ev('consent.changed', { customerId: EXT, ref: `${EXT}:1`, channel: 'whatsapp', purpose: 'offers', granted: true, byName: 'Sada', how: 'counter', at: daysAgo(5) }, daysAgo(5)),
    ev('consent.changed', { customerId: EXT, ref: `${EXT}:2`, channel: 'whatsapp', purpose: 'offers', granted: false, byName: null, how: 'stop_reply', at: daysAgo(3) }, daysAgo(3)),
    ev('consent.changed', { customerId: EXT, ref: `${EXT}:3`, channel: 'whatsapp', purpose: 'offers', granted: true, byName: 'Ravi', how: 'counter', at: daysAgo(1) }, daysAgo(1))
  ]);
  const id = sql(`select customer_id from crm.identities where external_id = '${EXT}'`);

  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    for (const [label, viewport] of [['desktop', { width: 1366, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
      const ctx = await browser.newContext({ viewport });
      await ctx.addCookies([{ name: 'token', value: tokenFor('owner'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
      const page = await ctx.newPage();
      page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
      await page.goto(`${APP}/customers/${id}`);
      const chip = page.getByTestId('consent');
      await chip.waitFor({ timeout: 20000 });

      if (label === 'desktop') {
        check('the chip says where it stands: yes, taken by Ravi (the newest record)', /WhatsApp offers: yes · taken by Ravi/.test(await chip.innerText()), await chip.innerText());
        const consentEvents = page.locator('[data-testid="event"][data-kind="consent"]');
        await consentEvents.first().waitFor({ timeout: 15000 });
        check('the timeline carries all three records', (await consentEvents.count()) === 3);
        check('...the STOP among them, marked as a withdrawal', (await page.locator('[data-testid="event"][data-kind="consent"].withdrawn').count()) === 1 && /Replied STOP/.test(await page.locator('[data-testid="event"][data-kind="consent"].withdrawn').innerText()));
      }

      await chip.click();
      const dialog = page.getByRole('dialog', { name: /consent record/ });
      await dialog.getByTestId('consent-entry').first().waitFor({ timeout: 15000 });
      check(`${label}: the record opens, as a dialog named for what it is`, await dialog.isVisible());
      const entries = await dialog.getByTestId('consent-entry').allInnerTexts();
      check(`${label}: three entries, newest first: agreed (Ravi), STOP, agreed (Sada)`,
        entries.length === 3 && /Agreed[\s\S]*Ravi/.test(entries[0]) && /Replied STOP/.test(entries[1]) && /Agreed[\s\S]*Sada/.test(entries[2]), entries);
      check(`${label}: each says how and from where ("at the counter", "from Boutique")`, /at the counter/.test(entries[0]) && /from Boutique/.test(entries[0]) && /replied STOP on WhatsApp/.test(entries[1]));
      check(`${label}: where it stands, in one sentence`, /They agreed on .*at the counter, recorded by Ravi\. Offers may go to them on WhatsApp\./.test(await dialog.getByTestId('consent-now').innerText()), await dialog.getByTestId('consent-now').innerText());
      check(`${label}: says where consent is changed (not here)`, /do it where messages are sent/.test(await dialog.innerText()));
      if (label === 'desktop') await page.screenshot({ path: path.join(shots, 'consent-record.png') });
      else {
        check('phone: the record fits, no sideways scroll', await noOverflow(page));
        await page.screenshot({ path: path.join(shots, 'consent-record-phone.png') });
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      check(`${label}: Escape closes it, back on the chip`, !(await dialog.isVisible()) && await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'consent'));
      await ctx.close();
    }
  } finally {
    await browser.close();
    cleanup();
  }
  console.log(failures ? `\n${failures} consent UI check(s) FAILED.` : '\nAll consent UI checks passed.');
  process.exitCode = failures ? 1 : 0;
}

main().catch(e => { console.error(e); try { cleanup(); } catch {} process.exitCode = 1; });
