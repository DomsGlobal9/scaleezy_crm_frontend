/**
 * Pictures and templates in Messages, in a real browser (installed Edge), signed in for real, LOCAL only (18 Nov).
 *   the picture: three ways in (Upload, From your products, Used before); a product's photos show; a wrong file
 *   is refused in plain words; save as a template, start from it (words filled, name and people still yours),
 *   delete it with a question first; Copy on a message makes a new draft; a phone shows it all without scrolling sideways
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const APP = 'http://localhost:5176';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'screenshots');
const backend = path.resolve(here, '..', '..', 'backend');
const STAMP = `Check UI ${Date.now() % 100000}`;
let failures = 0;
const check = (name, ok, detail) => { if (ok) console.log(`PASS  ${name}`); else { failures += 1; console.log(`FAIL  ${name}${detail === undefined ? '' : `  -- ${JSON.stringify(detail)?.slice(0, 300)}`}`); } };
const tokenFor = (who) => execFileSync('npm', ['run', '--silent', 'login:test', '--', who], { cwd: backend, encoding: 'utf8', shell: true }).trim();
const sql = (q) => execFileSync('docker', ['exec', 'inventory-local-db', 'psql', '-U', 'postgres', '-d', 'inventory', '-tAc', q], { encoding: 'utf8' }).trim();
// A real w x w PNG in the shop's green, made here so the check needs no file.
function greenPng(w) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(w, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [22, 75, 30]).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: w }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function as(browser, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => { try { localStorage.setItem('scale_easy_theme', 'light'); } catch {} });
  await ctx.addCookies([{ name: 'token', value: tokenFor('owner'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('      page error:', e.message); failures += 1; });
  return { ctx, page };
}

async function main() {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const { ctx, page } = await as(browser);
    await page.goto(`${APP}/campaigns/new`);
    await page.getByTestId('message-editor').waitFor({ timeout: 30000 });

    // The picture: three ways in.
    await page.getByRole('button', { name: 'Add a picture' }).click();
    const picker = page.getByTestId('picture-picker');
    await picker.waitFor();
    check('"Add a picture" opens with Upload first, then From your products and Used before',
      (await picker.getByRole('tab').allInnerTexts()).join('|') === 'Upload|From your products|Used before' && (await picker.getByTestId('pp-tab-upload').getAttribute('aria-selected')) === 'true');
    check('...and no more "add it in Inventory first"', !/in Inventory first/.test(await picker.innerText()));
    await page.screenshot({ path: path.join(shots, 'messages-picture-upload.png') });
    // A file that is not a picture.
    const notPic = path.join(shots, 'not-a-picture.txt'); fs.writeFileSync(notPic, 'hello');
    await picker.getByTestId('pp-file').setInputFiles(notPic);
    check('a file that is not a picture: refused in plain words', /not a picture/.test(await picker.getByTestId('pp-error').innerText()));
    await picker.getByTestId('pp-tab-products').click();
    await picker.getByTestId('pp-photo').first().waitFor({ timeout: 20000 });
    check('"From your products" shows the shop\'s product photos with their names', (await picker.getByTestId('pp-photo').count()) > 0 && (await picker.getByTestId('pp-use').isDisabled()));
    await picker.getByTestId('pp-photo').first().click();
    check('choosing one marks it and lets you use it', (await picker.getByTestId('pp-photo').first().getAttribute('aria-pressed')) === 'true' && !(await picker.getByTestId('pp-use').isDisabled()));
    const loaded = await page.waitForFunction(() => { const imgs = [...document.querySelectorAll('[data-testid="pp-photo"] img')]; return imgs.length > 0 && imgs.every(i => i.complete && i.naturalWidth > 0); }, null, { timeout: 20000 }).then(() => true, () => false);
    check('...and the photos themselves load', loaded);
    await page.screenshot({ path: path.join(shots, 'messages-picture-products.png') });
    await picker.getByTestId('pp-search').fill('Banarasi');
    await page.waitForTimeout(900);
    check('the search narrows them', (await picker.getByTestId('pp-photo').allInnerTexts()).every(t => /banarasi/i.test(t)));
    await picker.getByTestId('pp-tab-used').click();
    await page.waitForTimeout(700);
    check('"Used before" is still there', (await picker.getByTestId('pp-used').count()) > 0 || (await picker.getByTestId('pp-used-none').count()) === 1);
    await page.keyboard.press('Escape');
    check('Escape closes it', (await page.getByTestId('picture-picker').count()) === 0);

    // Save as a template, then start from it.
    await page.getByTestId('message-editor').getByPlaceholder('Diwali silk week').first().fill(STAMP);
    await page.getByLabel('Message').fill('Hi {name}, our new pattu sarees are in. Come and see them this week. {shop}');
    await page.getByTestId('save-as-template').click();
    const save = page.getByTestId('save-template');
    check('"Save as a template" asks only for a name, starting from the message\'s', (await save.getByTestId('template-name').inputValue()) === STAMP);
    await save.getByTestId('template-save').click();
    await save.waitFor({ state: 'detached', timeout: 10000 });
    await page.goto(`${APP}/campaigns/new`);
    await page.getByTestId('start-from-template').click();
    const tpl = page.getByTestId('templates');
    await tpl.getByTestId('template').first().waitFor({ timeout: 10000 });
    const mine = tpl.getByTestId('template').filter({ hasText: STAMP });
    check('the template is listed, with its words', (await mine.count()) === 1 && /new pattu sarees/.test(await mine.innerText()));
    await page.screenshot({ path: path.join(shots, 'messages-templates.png') });
    await mine.getByTestId('template-use').click();
    check('"Use" fills the words; who gets it is still to choose', /new pattu sarees/.test(await page.getByLabel('Message').inputValue()) && (await page.getByTestId('templates').count()) === 0);
    await page.getByTestId('start-from-template').click();
    const again = page.getByTestId('templates').getByTestId('template').filter({ hasText: STAMP });
    await again.getByRole('button', { name: `Delete ${STAMP}` }).click();
    check('"Delete" asks first', /Delete "/.test(await again.innerText()));
    await again.getByTestId('template-delete-yes').click();
    await page.waitForTimeout(900);
    check('...then it is gone', (await page.getByTestId('templates').getByTestId('template').filter({ hasText: STAMP }).count()) === 0);
    await page.keyboard.press('Escape');

    // Copy on a message in the list (one made for the check, removed after).
    const owner = tokenFor('owner');
    const made = await (await fetch('http://localhost:4008/api/v1/messages', { method: 'POST', headers: { Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `${STAMP} message`, text: 'Hi {name}, our Diwali silk week starts Friday. {shop}', audience: { everyone: true } }) })).json();
    await page.goto(`${APP}/campaigns`);
    const row = page.getByTestId('message').filter({ hasText: `${STAMP} message` }).first();
    await row.waitFor({ timeout: 20000 }).catch(() => {});
    if (await row.count()) {
      await row.getByTestId('message-copy').click();
      await page.waitForURL(/\/campaigns\/[0-9a-f-]{36}$/, { timeout: 15000 });
      check('Copy makes a new draft "Copy of ..." and opens it', /Copy of /.test(await page.getByTestId('message-detail').innerText()));
      const copied = page.url().split('/').pop();
      sql(`delete from crm.message_campaigns where id = '${copied}'`);
    } else check('(a message in the list to copy)', false, 'none');

    // ---- The worst cases (18 Nov) ----
    let alerted = false;
    page.on('dialog', d => { alerted = true; d.dismiss().catch(() => {}); });
    const api = (method, p, body) => fetch(`http://localhost:4008/api/v1${p}`, { method, headers: { Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json());
    const have = (await api('GET', '/messages/templates')).data ?? [];
    await page.goto(`${APP}/campaigns/new`);
    await page.getByTestId('message-editor').waitFor({ timeout: 30000 });
    if (have.length === 0) {
      await page.getByTestId('start-from-template').click();
      await page.getByTestId('templates-none').waitFor({ timeout: 10000 }).catch(() => {});
      check('no templates yet: says how to make one', /Save as a template/.test(await page.getByTestId('templates').innerText()));
      await page.keyboard.press('Escape');
    }
    check('"Save as a template" waits for words first', await page.getByTestId('save-as-template').isDisabled());

    // A picture too big, and a drop that is not a picture: refused here, before anything is sent.
    await page.getByRole('button', { name: 'Add a picture' }).click();
    const pk = page.getByTestId('picture-picker');
    await pk.getByTestId('pp-file').setInputFiles({ name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(15 * 1024 * 1024 + 1, 1) });
    check('a picture over 15 MB: refused on the spot, saying so', /larger than 15 MB/.test(await pk.getByTestId('pp-error').innerText()));
    await pk.getByTestId('pp-drop').evaluate(el => {
      const dt = new DataTransfer(); dt.items.add(new File(['%PDF-1.4'], 'bill.pdf', { type: 'application/pdf' }));
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    check('a PDF dropped on it: "not a picture"', /not a picture/.test(await pk.getByTestId('pp-error').innerText()));
    // A real picture: CRM makes it ready and keeps it, so the picker closes and the message shows it.
    await pk.getByTestId('pp-file').setInputFiles({ name: 'green.png', mimeType: 'image/png', buffer: greenPng(160) });
    const added = await page.getByTestId('picture-picker').waitFor({ state: 'detached', timeout: 30000 }).then(() => true, () => false);
    const shown = added && await page.waitForFunction(() => [...document.querySelectorAll('img')].some(i => i.complete && i.naturalWidth > 0 && /\/api\/v1\/pictures\/|message-pictures/.test(i.src)), null, { timeout: 15000 }).then(() => true, () => false);
    check('a real picture: CRM makes it ready and keeps it, and the message shows it', added && shown && (await page.getByRole('button', { name: 'Remove the picture' }).count()) === 1, await pk.getByTestId('pp-error').innerText().catch(() => 'no message'));
    if (!added) await page.keyboard.press('Escape');

    // A name that already exists, and one full of HTML: said plainly, shown as text, never run.
    const nasty = `${STAMP} <img src=x onerror=alert(1)> ${'very long name '.repeat(3)}`.slice(0, 80);
    await api('POST', '/messages/templates', { name: nasty, text: `<script>alert(1)</script> ${'Our new Kanchipuram pattu sarees are here. '.repeat(12)}Hi {name}` });
    await page.getByLabel('Message').fill('Hi {name}, our new pattu sarees are in. {shop}');
    await page.getByTestId('save-as-template').click();
    await page.getByTestId('template-name').fill(nasty.toUpperCase());
    await page.getByTestId('template-save').click();
    const dup = await page.getByTestId('template-error').innerText({ timeout: 10000 }).catch(() => '');
    check('saving a name the shop already has (in other capitals): said plainly, the dialog stays', /already a template called/.test(dup) && (await page.getByTestId('save-template').count()) === 1, dup);
    await page.getByTestId('template-name').fill('   ');
    await page.getByTestId('template-save').click();
    const empty = await page.getByTestId('template-error').innerText({ timeout: 10000 }).catch(() => '');
    check('a name of spaces only: asks for a name', empty.length > 5 && !/undefined|Error:/.test(empty), empty);
    await page.keyboard.press('Escape');
    await page.getByTestId('start-from-template').click();
    const odd = page.getByTestId('templates').getByTestId('template').filter({ hasText: STAMP });
    await odd.first().waitFor({ timeout: 10000 }).catch(async e => { await page.screenshot({ path: path.join(shots, 'debug-templates.png') }); console.log('DEBUG', (await page.locator('body').innerText()).slice(0, 1500)); throw e; });
    check('HTML in a template\'s name and words shows as text, nothing runs', (await odd.first().innerText()).includes('<img src=x') && (await odd.first().locator('img[src="x"]').count()) === 0 && !alerted);
    check('a long name and long words are cut with "...", the row stays on screen', await odd.first().evaluate(li => { const s = li.querySelector('small'); const r = li.getBoundingClientRect(); return s.scrollWidth > s.clientWidth && r.right <= window.innerWidth; }));
    await page.screenshot({ path: path.join(shots, 'messages-templates-edge.png') });
    await page.keyboard.press('Escape');
    check('Escape closes the templates', (await page.getByTestId('templates').count()) === 0);
    await ctx.close();

    const phone = await as(browser, { width: 390, height: 844 });
    await phone.page.goto(`${APP}/campaigns/new`);
    await phone.page.getByTestId('message-editor').waitFor({ timeout: 30000 });
    await phone.page.getByRole('button', { name: 'Add a picture' }).click();
    await phone.page.getByTestId('pp-tab-products').click();
    await phone.page.getByTestId('pp-photo').first().waitFor({ timeout: 20000 });
    check('phone: the picture choice fits, nothing scrolls sideways', await noOverflow(phone.page));
    // A shop with many photos (SPHL has 53): the tiles keep their shape and the grid scrolls (live 18 Nov
    // they were squeezed into 15 px strips). The shop's own answer, repeated to 60 photos.
    await phone.page.route('**/api/v1/messages/product-photos*', async (route) => {
      const real = await (await route.fetch()).json();
      const first = real.data[0];
      const many = Array.from({ length: 12 }, (_, i) => ({ id: `${first.id}-${i}`, title: `${first.title} ${i + 1}`, images: Array.from({ length: 5 }, (_, k) => ({ id: `${first.images[0].id.slice(0, 30)}${String(i * 5 + k).padStart(6, '0')}`, url: first.images[0].url })) }));
      await route.fulfill({ json: { ...real, data: many } });
    });
    await phone.page.getByTestId('pp-search').fill('a');
    await phone.page.waitForTimeout(1200);
    const shapes = await phone.page.$$eval('[data-testid="pp-photo"]', ts => ts.map(t => { const b = t.getBoundingClientRect(); return [b.width, b.height]; }));
    check('60 product photos: every tile keeps its shape (taller than wide), the grid scrolls instead', shapes.length === 60 && shapes.every(([w, h]) => h > w), shapes.slice(0, 3));
    await phone.page.unroute('**/api/v1/messages/product-photos*');
    await phone.page.keyboard.press('Escape');
    await phone.page.screenshot({ path: path.join(shots, 'messages-picture-phone.png') });
    await phone.page.keyboard.press('Escape');
    await fetch('http://localhost:4008/api/v1/messages/templates', { method: 'POST', headers: { Authorization: `Bearer ${tokenFor('owner')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `${STAMP} phone ${'long name '.repeat(6)}`.slice(0, 80), text: 'Hi {name}, '.repeat(40) }) });
    await phone.page.getByTestId('start-from-template').click();
    await phone.page.getByTestId('templates').getByTestId('template').first().waitFor({ timeout: 10000 });
    check('phone: the templates fit, with Use and Delete on screen', await noOverflow(phone.page) && await phone.page.getByTestId('templates').getByTestId('template-use').first().evaluate(b => b.getBoundingClientRect().right <= window.innerWidth));
    await phone.page.screenshot({ path: path.join(shots, 'messages-templates-phone.png') });
    await phone.ctx.close();
  } finally {
    await browser.close();
    sql(`delete from crm.message_templates where name like '${STAMP}%'`);
    sql(`delete from crm.message_campaigns where name like '${STAMP}%' or name like 'Copy of ${STAMP}%'`);
  }
  console.log(failures ? `\n${failures} message picture UI check(s) FAILED.` : '\nAll message picture UI checks passed.');
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
