import { launch } from './lib.mjs';
const { page, logs, close } = await launch();
await page.click('[data-quick="5"]'); // A4
await page.waitForFunction(() => CC.App.state.doc && !CC.ui.dialogsOpen());
await page.evaluate(async () => {
  const App = CC.App, E = CC.effects;
  const c = document.createElement('canvas'); c.width = 2400; c.height = 1800;
  const g = c.getContext('2d');
  for (let i = 0; i < 300; i++) { g.fillStyle = `hsl(${(i * 47) % 360},85%,${35 + (i % 4) * 12}%)`; g.beginPath(); g.arc((i * 131) % 2400, (i * 71) % 1800, 40 + (i % 7) * 25, 0, 7); g.fill(); }
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
  await App.addImageFiles([new File([blob], 'big.jpg', { type: 'image/jpeg' })]);
  const img = App.primaryLayer();
  img.effects = [E.create('frameMosh'), E.create('halftone', { mode: 'cmyk', cell: 14 })];
  App.renderAll();
});
await page.waitForTimeout(1500);
const vp = await page.locator('#viewport').boundingBox();
// measure resize drag frame times
const res = await page.evaluate(async () => {
  const App = CC.App, s = App.state, l = App.primaryLayer();
  const times = [];
  let last = performance.now();
  let frames = 0;
  const stop = performance.now() + 1500;
  return await new Promise((resolve) => {
    function tick() {
      const now = performance.now(); times.push(now - last); last = now; frames++;
      if (now < stop) requestAnimationFrame(tick); else resolve({ frames, avg: times.reduce((a, b) => a + b, 0) / times.length, max: Math.max(...times) });
    }
    requestAnimationFrame(tick);
  });
});
console.log('idle frames', JSON.stringify(res));
// real drag on right edge handle
const h = await page.evaluate(() => { const l = CC.App.primaryLayer(); const p = CC.App.localToDoc(l, l.w / 2, 0); return CC.App.docToScreen(p.x, p.y); });
await page.evaluate(() => { window.__frames = []; let last = performance.now(); (function loop() { const n = performance.now(); window.__frames.push(n - last); last = n; window.__raf = requestAnimationFrame(loop); })(); });
await page.mouse.move(vp.x + h.x, vp.y + h.y);
await page.mouse.down();
for (let i = 1; i <= 30; i++) await page.mouse.move(vp.x + h.x + i * 4, vp.y + h.y);
await page.mouse.up();
const drag = await page.evaluate(() => { cancelAnimationFrame(window.__raf); const f = window.__frames.slice(2); return { n: f.length, avg: Math.round(f.reduce((a, b) => a + b, 0) / f.length), max: Math.round(Math.max(...f)) }; });
console.log('resize drag frames', JSON.stringify(drag));
await page.waitForTimeout(2000);
// slider drag on halftone cell
await page.evaluate(() => { document.querySelectorAll('.fx-title')[1]?.click(); });
await page.waitForTimeout(300);
const slider = await page.locator('.fx-card >> nth=1 >> input[type="range"] >> nth=0').boundingBox();
await page.evaluate(() => { window.__frames = []; let last = performance.now(); (function loop() { const n = performance.now(); window.__frames.push(n - last); last = n; window.__raf = requestAnimationFrame(loop); })(); });
await page.mouse.move(slider.x + 10, slider.y + slider.height / 2);
await page.mouse.down();
for (let i = 1; i <= 20; i++) await page.mouse.move(slider.x + 10 + i * 4, slider.y + slider.height / 2);
await page.mouse.up();
const sl = await page.evaluate(() => { cancelAnimationFrame(window.__raf); const f = window.__frames.slice(2); return { n: f.length, avg: Math.round(f.reduce((a, b) => a + b, 0) / f.length), max: Math.round(Math.max(...f)) }; });
console.log('slider drag frames', JSON.stringify(sl));
console.log('history', await page.evaluate(() => CC.App.state.history.map(h => h.label).slice(-3)));
// text editing
await page.keyboard.press('t');
await page.mouse.click(vp.x + vp.width / 2, vp.y + 120);
await page.waitForTimeout(200);
await page.keyboard.type('编辑中 Editing');
await page.screenshot({ path: '/tmp/cc-tools/out/23-text-editing.png' });
await page.keyboard.press('Escape');
await page.click('[data-tab="history"]');
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/cc-tools/out/24-history.png' });
await page.click('[data-tab="resources"]');
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/cc-tools/out/25-resources.png' });
console.log(logs.join('\n') || 'no errors');
await close();
