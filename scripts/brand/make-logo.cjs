/**
 * The Scaleezy CRM lockup, made from Inventory's (D:\villy\inventory\frontend\public\logo.png).
 *
 * The wordmark is Inventory's own pixels. Only the second line changes: "inventory" becomes "crm",
 * in the same lettering (Montserrat, its size, weight and letter spacing fitted to the original by
 * measuring the ink), with the two rules either side drawn longer to meet it at the same gap.
 *
 *   cd scripts/brand
 *   NODE_PATH=../../node_modules node make-logo.cjs fit     find size, spacing and weight
 *   NODE_PATH=../../node_modules node make-logo.cjs make    write logo.png and logo-dark.png here
 *
 * The app's public/crm-logo.png and crm-logo-dark.png are those two, trimmed to the artwork (12px
 * kept round it) and scaled to 800px wide.
 */
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const W = 2027, H = 776;
const INV = 'D:/villy/inventory/frontend/public/';
const here = __dirname;
// Measured from logo.png: the second line's ink, the rules, the deep green.
const ORIGINAL = { left: 524, top: 456, right: 1520, bottom: 587 };
const RULE = { y: 508, h: 13, outerLeft: 123, outerRight: 1903, gap: 60 };

const page = (text, { size, spacing, weight }, colour) => `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600&display=block" rel="stylesheet">
<style>html,body{margin:0;background:transparent}
#t{position:absolute;left:0;top:0;font-family:Montserrat;font-size:${size}px;font-weight:${weight};letter-spacing:${spacing}px;color:${colour};white-space:nowrap;line-height:1}
</style></head><body><span id="t">${text}</span></body></html>`;

async function ink(browser, text, opts, colour = '#1F3F1B') {
  const p = await browser.newPage({ viewport: { width: W, height: H } });
  await p.setContent(page(text, opts, colour));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  const file = path.join(here, `_probe.png`);
  await p.locator('#t').screenshot({ path: file, omitBackground: true });
  await p.close();
  const out = execFileSync('python', ['-c', `
from PIL import Image
im=Image.open(r'${file}').convert('RGBA'); a=im.split()[3]; print(*a.point(lambda v: 255 if v>60 else 0).getbbox(), *im.size)`], { encoding: 'utf8' }).trim().split(' ').map(Number);
  return { left: out[0], top: out[1], right: out[2], bottom: out[3], file };
}

async function fit(browser) {
  const weights = [400, 500];
  const results = [];
  for (const weight of weights) {
    let size = 140, spacing = 0;
    let m = await ink(browser, 'inventory', { size, spacing, weight });
    size = size * (ORIGINAL.bottom - ORIGINAL.top) / (m.bottom - m.top);
    m = await ink(browser, 'inventory', { size, spacing: 0, weight });
    spacing = ((ORIGINAL.right - ORIGINAL.left) - (m.right - m.left)) / 8;
    m = await ink(browser, 'inventory', { size, spacing, weight });
    // How closely the strokes match: overlap of the ink with the original's.
    const score = execFileSync('python', ['-c', `
from PIL import Image
o=Image.open(r'${INV}logo.png').convert('RGBA').crop((${ORIGINAL.left},${ORIGINAL.top},${ORIGINAL.right + 1},${ORIGINAL.bottom + 1})).split()[3].point(lambda v:1 if v>60 else 0)
n=Image.open(r'${m.file}').convert('RGBA').split()[3].point(lambda v:1 if v>60 else 0)
n=n.crop(n.getbbox()).resize(o.size)
a=list(o.getdata()); b=list(n.getdata())
inter=sum(1 for x,y in zip(a,b) if x and y); uni=sum(1 for x,y in zip(a,b) if x or y)
print(round(inter/uni,3))`], { encoding: 'utf8' }).trim();
    results.push({ weight, size: +size.toFixed(2), spacing: +spacing.toFixed(2), width: m.right - m.left, height: m.bottom - m.top, overlap: Number(score) });
  }
  console.log(JSON.stringify(results, null, 1));
  return results.sort((a, b) => b.overlap - a.overlap)[0];
}

async function make(browser, opts) {
  for (const [src, colour, out] of [['logo.png', '#1F3F1B', 'logo.png'], ['logo-dark.png', null, 'logo-dark.png']]) {
    // The light version's second line is the same light green the dark file uses for "ezy".
    const c = colour ?? execFileSync('python', ['-c', `
from PIL import Image
from collections import Counter
im=Image.open(r'${INV}${src}').convert('RGBA'); px=im.load()
c=Counter(px[x,y][:3] for y in range(470,560) for x in range(520,1500) if px[x,y][3]>200)
r,g,b=c.most_common(1)[0][0]; print('#%02X%02X%02X'%(r,g,b))`], { encoding: 'utf8' }).trim();
    const m = await ink(browser, 'crm', opts, c);
    const py = `
from PIL import Image, ImageDraw
base=Image.open(r'${INV}${src}').convert('RGBA'); px=base.load()
W,H=base.size
# Clear the second line, keeping the tail of "ezy"'s y (it reaches down to y=469 on the right).
for y in range(438,H):
  for x in range(W):
    if y<=471 and x>=1650: continue
    px[x,y]=(0,0,0,0)
t=Image.open(r'${m.file}').convert('RGBA'); t=t.crop(t.getbbox())
cx=(${RULE.outerLeft}+${RULE.outerRight})//2
# The x-height sits where "inventory"'s did: ink bottom at the original's baseline row.
left=cx - t.size[0]//2
# Align by baseline: "crm" has no descender, so its ink bottom is the baseline (552 in the original).
top=552 - t.size[1] + 1
base.alpha_composite(t,(left,top))
# The rules: the original's own, its rounded ends kept and only the straight middle stretched.
orig=Image.open(r'${INV}${src}').convert('RGBA')
rule=orig.crop((${RULE.outerLeft}-2, ${RULE.y}-4, 462+3, ${RULE.y}+${RULE.h}+4))
cap=16
for x0,x1 in ((${RULE.outerLeft}-2, left-${RULE.gap}), (left+t.size[0]+${RULE.gap}, ${RULE.outerRight}+3)):
  w=x1-x0
  piece=Image.new('RGBA',(w,rule.size[1]),(0,0,0,0))
  piece.paste(rule.crop((0,0,cap,rule.size[1])),(0,0))
  piece.paste(rule.crop((cap,0,rule.size[0]-cap,rule.size[1])).resize((w-2*cap,rule.size[1])),(cap,0))
  piece.paste(rule.crop((rule.size[0]-cap,0,rule.size[0],rule.size[1])),(w-cap,0))
  base.alpha_composite(piece,(x0,${RULE.y}-4))
base.save(r'${path.join(here, out)}')
print('${out}', left, top, t.size, '${c}')`;
    console.log(execFileSync('python', ['-c', py], { encoding: 'utf8' }).trim());
  }
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const best = await fit(browser);
    console.log('best', best);
    if (process.argv[2] === 'make') await make(browser, best);
  } finally {
    await browser.close();
    try { fs.unlinkSync(path.join(here, '_probe.png')); } catch {}
  }
})();
