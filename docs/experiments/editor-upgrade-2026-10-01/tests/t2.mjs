import { launch } from './lib.mjs';
const { page, logs, close } = await launch();
await page.click('[data-quick="1"]'); // 1080x1080
await page.waitForFunction(() => CC.App.state.doc);
const vp = await page.locator('#viewport').boundingBox();
const toScreen = async (x, y) => page.evaluate(([x, y]) => { const p = CC.App.docToScreen(x, y); return p; }, [x, y]);
const S = async (x, y) => { const p = await toScreen(x, y); return [vp.x + p.x, vp.y + p.y]; };
const st = () => page.evaluate(() => ({ sel: CC.App.state.selection.length, layers: CC.App.state.doc.layers.map(l => ({ t: l.type, x: Math.round(l.x), y: Math.round(l.y), w: Math.round(l.w), h: Math.round(l.h), r: Math.round(l.rotation), warp: !!l.warp, stretch: l.stretchX ? [+l.stretchX.toFixed(2), +l.stretchY.toFixed(2)] : null })), hist: CC.App.state.history.map(h => h.label) }));

// shape tool: draw rect by drag
await page.keyboard.press('u');
let [ax, ay] = await S(200, 200); let [bx, by] = await S(500, 400);
await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move((ax+bx)/2, (ay+by)/2, { steps: 4 }); await page.mouse.move(bx, by, { steps: 4 }); await page.mouse.up();
console.log('after shape', JSON.stringify(await st()));
// select tool: move it
await page.keyboard.press('v');
[ax, ay] = await S(350, 300); [bx, by] = await S(450, 420);
await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 6 }); await page.mouse.up();
console.log('after move', JSON.stringify((await st()).layers[0]));
// resize right edge handle: layer now center (450,420) w300 h200 → right edge at x=600
[ax, ay] = await S(600, 420); [bx, by] = await S(800, 420);
await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 6 }); await page.mouse.up();
console.log('after right-edge stretch', JSON.stringify((await st()).layers[0]));
// rotate: rotation handle 26px above top center (screen)
const rot = await page.evaluate(() => { const l = CC.App.primaryLayer(); const top = CC.App.docToScreen(l.x, l.y - l.h/2); return { x: top.x, y: top.y - 26, cx: CC.App.docToScreen(l.x, l.y) }; });
await page.mouse.move(vp.x + rot.x, vp.y + rot.y); await page.mouse.down();
await page.mouse.move(vp.x + rot.cx.x + 120, vp.y + rot.cx.y - 120, { steps: 8 }); await page.mouse.up();
console.log('after rotate', JSON.stringify((await st()).layers[0]));
// text tool click empty area
await page.keyboard.press('t');
[ax, ay] = await S(540, 800);
await page.mouse.click(ax, ay);
await page.waitForTimeout(200);
await page.keyboard.type('HELLO\nY3K');
await page.keyboard.press('Control+Enter');
await page.waitForTimeout(200);
console.log('after text', JSON.stringify((await st()).layers.slice(-1)), (await st()).hist.slice(-2));
// stretch text with corner (shift free): select tool
await page.keyboard.press('v');
const tl = await page.evaluate(() => { const l = CC.App.primaryLayer(); return { l: { x: l.x, y: l.y, w: l.w, h: l.h } }; });
[ax, ay] = await S(tl.l.x + tl.l.w/2, tl.l.y + tl.l.h/2); [bx, by] = await S(tl.l.x + tl.l.w/2 + 200, tl.l.y + tl.l.h/2 + 30);
await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 5 }); await page.mouse.up();
console.log('after text stretch', JSON.stringify((await st()).layers.slice(-1)));
// brush
await page.keyboard.press('b');
[ax, ay] = await S(150, 900);
await page.mouse.move(ax, ay); await page.mouse.down();
for (let i = 0; i < 20; i++) { const [x, y] = await S(150 + i * 20, 900 + Math.sin(i / 2) * 60); await page.mouse.move(x, y); }
await page.mouse.up();
console.log('after brush', JSON.stringify((await st()).layers.slice(-1)));
// transform tool on first layer: distort a corner
await page.keyboard.press('w');
await page.evaluate(() => CC.App.select(CC.App.state.doc.layers[0].id));
const corner = await page.evaluate(() => { const l = CC.App.primaryLayer(); const p = CC.App.localToDoc(l, l.w/2, -l.h/2); return CC.App.docToScreen(p.x, p.y); });
await page.mouse.move(vp.x + corner.x, vp.y + corner.y); await page.mouse.down(); await page.mouse.move(vp.x + corner.x + 60, vp.y + corner.y - 50, { steps: 5 }); await page.mouse.up();
console.log('after distort', JSON.stringify(await page.evaluate(() => CC.App.primaryLayer().warp)));
// marquee select all
await page.keyboard.press('v');
await page.mouse.move(vp.x + 5, vp.y + 5); await page.mouse.down(); await page.mouse.move(vp.x + vp.width - 5, vp.y + vp.height - 5, { steps: 5 }); await page.mouse.up();
console.log('marquee sel', (await st()).sel);
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/cc-tools/out/05-interact.png' });
// undo all the way
const n = (await st()).hist.length;
for (let i = 0; i < n; i++) await page.keyboard.press('Control+z');
console.log('after undo all layers:', (await st()).layers.length);
for (let i = 0; i < n; i++) await page.keyboard.press('Control+Shift+z');
console.log('after redo all layers:', (await st()).layers.length, (await st()).hist);
console.log(logs.join('\n') || 'no errors');
await close();
