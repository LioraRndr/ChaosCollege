import { launch } from './lib.mjs';
import fs from 'fs';
const { page, logs, close } = await launch();
await page.click('[data-quick="1"]');
await page.waitForFunction(() => CC.App.state.doc);
const sheets = await page.evaluate(async () => {
  const App = CC.App, M = CC.model;
  const doc = App.state.doc;
  const c = document.createElement('canvas'); c.width = 480; c.height = 360;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 480, 360); gr.addColorStop(0, '#ff7a18'); gr.addColorStop(0.5, '#3265ff'); gr.addColorStop(1, '#20e3d1');
  g.fillStyle = gr; g.fillRect(0, 0, 480, 360);
  for (let i = 0; i < 26; i++) { g.fillStyle = `hsl(${i * 37},80%,${30 + (i % 5) * 12}%)`; g.beginPath(); g.arc((i * 97) % 480, (i * 53) % 360, 16 + (i % 7) * 7, 0, 7); g.fill(); }
  g.fillStyle = '#fff'; g.font = '900 76px Arial'; g.fillText('GLITCH', 90, 205);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await App.addImageFiles([new File([blob], 'photo.png', { type: 'image/png' })], { x: 540, y: 540 });
  const img = App.primaryLayer();
  img.w = 480; img.h = 360;
  const text = M.createText(doc, 'FX', { fontSize: 150 }); App.syncTextBox(text); text.id = 'TXT';
  const R = App.renderer;
  function sheet(items, cols, cw, ch, draw) {
    const rows = Math.ceil(items.length / cols);
    const cv = document.createElement('canvas'); cv.width = cols * cw; cv.height = rows * (ch + 22);
    const cx = cv.getContext('2d'); cx.fillStyle = '#1a1a1f'; cx.fillRect(0, 0, cv.width, cv.height);
    items.forEach((item, i) => {
      const x = (i % cols) * cw, y = Math.floor(i / cols) * (ch + 22);
      cx.save(); cx.beginPath(); cx.rect(x + 4, y + 4, cw - 8, ch - 8); cx.clip();
      cx.fillStyle = '#e9e6dc'; cx.fillRect(x + 4, y + 4, cw - 8, ch - 8);
      draw(cx, item, x + cw / 2, y + ch / 2, cw - 16, ch - 16);
      cx.restore();
      cx.fillStyle = '#ddd'; cx.font = '12px sans-serif'; cx.fillText(item.label, x + 8, y + ch + 14);
    });
    return cv.toDataURL('image/png');
  }
  const fxItems = CC.effects.list().map(def => ({ label: `${def.type} ${def.name}`, def }));
  const fxSheet = sheet(fxItems, 6, 260, 200, (cx, item, x, y, w, h) => {
    img.effects = [CC.effects.create(item.def.type)];
    if (item.def.type === 'chrome' || item.def.type === 'holo') { /* also show on text */ }
    R.clear();
    const r = R.getRaster(img, doc, 1, {});
    const s = Math.min(w / r.w, h / r.h);
    cx.drawImage(r.canvas, x + r.x * s, y + r.y * s, r.w * s, r.h * s);
  });
  const txtSheet = sheet(fxItems, 6, 260, 170, (cx, item, x, y, w, h) => {
    text.effects = [CC.effects.create(item.def.type)];
    text.fill = '#ff4ca7';
    R.clear();
    const r = R.getRaster(text, doc, 1, {});
    const s = Math.min(w / r.w, h / r.h);
    cx.drawImage(r.canvas, x + r.x * s, y + r.y * s, r.w * s, r.h * s);
  });
  const genItems = CC.generators.list().map(def => ({ label: `${def.type} ${def.name}`, def }));
  const genSheet = sheet(genItems, 6, 260, 220, (cx, item, x, y, w, h) => {
    const layer = M.createGenerator(doc, item.def.type);
    R.clear();
    const r = R.getRaster(layer, doc, 1, {});
    const s = Math.min(w / r.w, h / r.h);
    cx.drawImage(r.canvas, x + r.x * s, y + r.y * s, r.w * s, r.h * s);
  });
  const vecItems = CC.vectorAssets.ASSETS.map(a => ({ label: `${a.id}`, a }));
  const vecSheet = sheet(vecItems, 10, 150, 130, (cx, item, x, y, w, h) => {
    const layer = M.createVector(doc, item.a.id, { fill: '#ff4ca7', color2: '#20e3d1' });
    const s = Math.min(w / layer.w, h / layer.h);
    cx.translate(x, y); cx.scale(s, s);
    R.drawContent(cx, layer, doc, { q: s });
  });
  return { fxSheet, txtSheet, genSheet, vecSheet };
});
for (const [k, v] of Object.entries(sheets)) fs.writeFileSync(`/tmp/cc-tools/out/${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
console.log(logs.join('\n') || 'no errors');
await close();
