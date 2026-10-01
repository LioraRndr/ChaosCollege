import { launch } from './lib.mjs';
const { page, logs, close } = await launch();
await page.click('[data-quick="0"]');
await page.waitForFunction(() => CC.App.state.doc);
// add many layer kinds via API
const report = await page.evaluate(async () => {
  const App = CC.App, M = CC.model, s = App.state;
  const doc = s.doc;
  App.addLayer(M.createShape(doc, 'rect', { fill: '#ff4ca7' }), { at: { x: 300, y: 300 } });
  App.addLayer(M.createShape(doc, 'star', { fill: '#d7ff2f', strokeWidth: 6 }), { at: { x: 760, y: 300 } });
  App.addLayer(M.createText(doc, 'CHAOS\nCOLLAGE', { fontFamily: 'Arial Black' }), { at: { x: 540, y: 700 } });
  App.addLayer(M.createWindow(doc), { at: { x: 540, y: 1050 } });
  App.addLayer(M.createVector(doc, 'heart', { fill: '#ff4ca7' }), { at: { x: 200, y: 1150 } });
  App.addLayer(M.createGenerator(doc, 'orb'), { at: { x: 880, y: 1100 } });
  App.addLayer(M.createGenerator(doc, 'wireSphere'), { at: { x: 880, y: 650 } });
  // image from generated canvas
  const c = document.createElement('canvas'); c.width = 400; c.height = 300;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0,0,400,300); gr.addColorStop(0,'#20e3d1'); gr.addColorStop(1,'#3265ff'); g.fillStyle = gr; g.fillRect(0,0,400,300);
  g.fillStyle = '#fff'; g.font = '700 60px Arial'; g.fillText('IMAGE', 90, 170);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'test-image.png', { type: 'image/png' });
  await App.addImageFiles([file], { x: 300, y: 520 });
  await new Promise(r => setTimeout(r, 300));
  return { layers: s.doc.layers.map(l => `${l.type}:${l.name}:${Math.round(l.w)}x${Math.round(l.h)}`), history: s.history.length, assets: s.assets.size };
});
console.log(JSON.stringify(report, null, 1));
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/cc-tools/out/03-layers.png' });
// select the text layer and screenshot inspector
await page.evaluate(() => { const t = CC.App.state.doc.layers.find(l => l.type === 'text'); CC.App.select(t.id); });
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/cc-tools/out/04-text-selected.png' });
console.log(logs.join('\n') || 'no errors');
await close();
