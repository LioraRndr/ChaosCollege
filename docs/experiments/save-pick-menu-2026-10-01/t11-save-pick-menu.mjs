import { chromium } from 'playwright-core';
const dir = process.env.CC_PROFILE || '/tmp/cc-tools/profile-t11';
const url = process.env.CC_INDEX || 'file:///home/user/ChaosCollege/index.html';
const executablePath = process.env.CC_CHROME || '/usr/bin/google-chrome';
const results = [];
const check = (name, ok, info = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); };
async function open() {
  const ctx = await chromium.launchPersistentContext(dir, { executablePath, args: ['--no-sandbox'], viewport: { width: 1440, height: 900 } });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.CC?.App?.state && document.querySelector('#home .home-inner'));
  return { ctx, page, errors };
}
let { ctx, page, errors } = await open();
check('home footer shows library location', (await page.textContent('.home-foot')).includes('工程库位置'));
await page.click('[data-quick="1"]');
await page.waitForTimeout(500);
// two overlapping shapes; B on top fully covers A's centre
const ids = await page.evaluate(() => {
  const A = CC.App, d = A.state.doc;
  const a = A.addLayer(CC.model.createShape(d, 'rect', { fill: '#ff0000', w: 400, h: 400 }), { at: { x: 540, y: 540 } });
  const b = A.addLayer(CC.model.createShape(d, 'rect', { fill: '#00ff00', w: 600, h: 600 }), { at: { x: 540, y: 540 } });
  return { a: a.id, b: b.id };
});
await page.click(`[data-layer-id="${ids.a}"]`);
const toScreen = () => page.evaluate(() => {
  const A = CC.App, v = A.state.view, r = A.dom.viewport.getBoundingClientRect();
  const s = A.docToScreen ? A.docToScreen(540, 540) : { x: v.panX + 540 * v.zoom, y: v.panY + 540 * v.zoom };
  return { x: r.left + s.x, y: r.top + s.y };
});
const c = await toScreen();
const before = await page.evaluate((id) => { const l = CC.App.layerById(id); return { x: l.x, y: l.y }; }, ids.a);
await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 30, c.y + 20, { steps: 5 }); await page.mouse.up();
const after = await page.evaluate((id) => { const l = CC.App.layerById(id); return { x: l.x, y: l.y, sel: CC.App.state.selection }; }, ids.a);
check('drag moves panel-selected lower layer', after.x > before.x + 5 && after.sel.length === 1 && after.sel[0] === ids.a, JSON.stringify({ before, after }));
const bPos = await page.evaluate((id) => CC.App.layerById(id).x, ids.b);
check('upper layer untouched', bPos === 540, String(bPos));
// clicking empty canvas area deselects; then click picks topmost again
await page.evaluate(() => { CC.App.state.selection = []; CC.App.renderAll(); });
await page.mouse.click(c.x, c.y);
check('plain click with no selection picks topmost', (await page.evaluate(() => CC.App.state.selection[0])) === ids.b);
// context menu "选择图层"
await page.mouse.click(c.x, c.y, { button: 'right' });
await page.waitForTimeout(150);
const pick = page.locator('.menu .menu-item', { hasText: '选择图层' });
check('context menu has 选择图层', await pick.count() === 1);
await pick.hover(); await page.waitForTimeout(150);
const subs = await page.locator('.menu').nth(1).locator('.menu-item').allTextContents();
check('选择图层 lists both layers', subs.length === 2, JSON.stringify(subs.map(s => s.trim())));
await page.locator('.menu').nth(1).locator('.menu-item').nth(1).click();
check('picking from submenu selects lower', (await page.evaluate(() => CC.App.state.selection[0])) === ids.a);
// menu highlight
await page.click('[data-menu-trigger="image"]').catch(async () => { await page.locator('[data-menu-trigger]', { hasText: '图像' }).click(); });
await page.waitForTimeout(150);
await page.locator('.menu').first().locator('.menu-item', { hasText: '画布预设' }).hover();
await page.waitForTimeout(150);
const sub = page.locator('.menu').nth(1);
const rows = sub.locator('.menu-item');
const n = await rows.count();
for (let i = 0; i < n; i++) { await rows.nth(i).hover(); await page.waitForTimeout(60); }
const openCount = await sub.locator('.menu-item.open').count();
check('only one submenu row highlighted after sweeping', openCount === 1, `rows=${n} open=${openCount}`);
await page.screenshot({ path: process.env.CC_SHOT || 'menu-after.png', clip: { x: 0, y: 0, width: 900, height: 420 } });
await page.keyboard.press('Escape');
// persistence: edit then close immediately; thumbnail survives
await page.waitForTimeout(1500);
const thumb1 = await page.evaluate(async (id) => (await CC.storage.getProject(id)).thumb?.size || 0, await page.evaluate(() => CC.App.state.doc.id));
await page.evaluate(() => CC.App.addLayer(CC.model.createShape(CC.App.state.doc, 'ellipse')));
page.on('dialog', d => d.accept());
await page.close({ runBeforeUnload: true });
await new Promise(r => setTimeout(r, 800));
const errs1 = [...errors];
await ctx.close();
({ ctx, page, errors } = await open());
const rec = await page.evaluate(async () => (await CC.storage.listProjects()).map(p => ({ n: p.layerCount, t: p.thumb?.size || 0 })));
check('last edit saved on immediate close', rec[0]?.n === 3, JSON.stringify(rec));
check('thumbnail kept', thumb1 > 0 && rec[0]?.t > 0, `thumb1=${thumb1}`);
await ctx.close();
check('no console errors', !errs1.length && !errors.length, JSON.stringify([...errs1, ...errors]));
console.log(results.join('\n'));
