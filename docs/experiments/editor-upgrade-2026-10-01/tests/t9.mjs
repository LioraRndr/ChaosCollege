import { launch } from './lib.mjs';
import fs from 'fs';
const { page, logs, close } = await launch();
await page.click('[data-quick="0"]');
await page.waitForFunction(() => CC.App.state.doc && !CC.ui.dialogsOpen());
const info = await page.evaluate(async () => {
  const App = CC.App, M = CC.model, E = CC.effects, doc = App.state.doc;
  doc.bg = '#0b0b12';
  const add = (layer, at) => { App.addLayer(layer, { at }); return layer; };
  // looks stress
  const c = document.createElement('canvas'); c.width = 600; c.height = 450;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 600, 450); gr.addColorStop(0, '#ff7a18'); gr.addColorStop(0.5, '#3265ff'); gr.addColorStop(1, '#20e3d1');
  g.fillStyle = gr; g.fillRect(0, 0, 600, 450);
  for (let i = 0; i < 30; i++) { g.fillStyle = `hsl(${i * 37},80%,${30 + (i % 5) * 12}%)`; g.beginPath(); g.arc((i * 97) % 600, (i * 53) % 450, 20 + (i % 7) * 8, 0, 7); g.fill(); }
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await App.addImageFiles([new File([blob], 'photo.png', { type: 'image/png' })], { x: 540, y: 1000 });
  const photo = App.primaryLayer();
  const probeText = M.createText(doc, 'Y3K', { fontSize: 200 });
  const errs = [];
  const times = {};
  for (const look of E.LOOKS) {
    for (const layer of [photo, probeText]) {
      layer.effects = E.lookEffects(look);
      App.renderer.clear();
      const t0 = performance.now();
      try { App.renderer.getRaster(layer, doc, 1, {}); } catch (e) { errs.push(look.id + ':' + e.message); }
      times[look.id + '/' + layer.type] = Math.round(performance.now() - t0);
    }
  }
  photo.effects = [];
  // build Y3K poster
  const mesh = add(M.createGenerator(doc, 'gradientMesh', { w: 1080, h: 1350, p: { ...CC.generators.defaults('gradientMesh'), c1: '#7b5cff', c2: '#20e3d1', c3: '#ff8ad8', c4: '#0b0b12', blobs: 7, softness: 70, grain: 30 } }), { x: 540, y: 675 });
  const blobL = add(M.createGenerator(doc, 'metaBlob', { w: 760, h: 760 }), { x: 560, y: 560 });
  photo.effects = [E.create('glass', { mode: 'ribbed', refraction: 30, scale: 36 })];
  const L = doc.layers; L.splice(L.indexOf(photo), 1); L.push(photo);
  photo.x = 540; photo.y = 1060; photo.w = 820; photo.h = 380; photo.opacity = 0.9;
  const card = (await (async () => { const cat = App.generatorCatalog().flatMap(c => c.items); return cat.find(i => i.id === 'y3k-glass-card').make(doc); })());
  add(card, { x: 560, y: 690 });
  card.w = 780; card.h = 300;
  const title = add(M.createText(doc, 'Y3K', { fontSize: 300, fontFamily: 'Arial Black', fill: '#ffffff', stretchX: 1.3 }), { x: 540, y: 300 });
  title.effects = E.lookEffects(E.LOOKS.find(l => l.id === 'y3k-chrome'));
  App.syncTextBox(title);
  const sub = add(M.createText(doc, 'POST-HUMAN COLLAGE / 3000', { fontSize: 34, fontFamily: 'Courier New', fontWeight: 700, fill: '#e9e6ff', tracking: 6 }), { x: 560, y: 690 });
  const hud = add(M.createGenerator(doc, 'hud', { w: 260, h: 260 }), { x: 880, y: 470 });
  const tele = add(M.createGenerator(doc, 'hud', { w: 300, h: 200, p: { ...CC.generators.defaults('hud'), style: 'telemetry', color: '#e9e6ff' } }), { x: 230, y: 1260 });
  const sig = (App.generatorCatalog().flatMap(c => c.items)).find(i => i.id === 'y3k-chrome-sigil').make(doc);
  add(sig, { x: 160, y: 520 });
  const star = (App.generatorCatalog().flatMap(c => c.items)).find(i => i.id === 'y3k-chrome-star').make(doc);
  add(star, { x: 900, y: 1200 });
  App.renderAll();
  await new Promise(r => setTimeout(r, 300));
  App.renderer.clear();
  const cv = document.createElement('canvas'); cv.width = doc.width; cv.height = doc.height;
  const cx = cv.getContext('2d');
  const t0 = performance.now();
  App.renderer.renderDoc(cx, doc, { q: 1, deviceScale: 1 });
  const total = Math.round(performance.now() - t0);
  return { errs, times, total, poster: cv.toDataURL('image/png') };
});
fs.writeFileSync('/tmp/cc-tools/out/y3k-poster.png', Buffer.from(info.poster.split(',')[1], 'base64'));
console.log('errors', info.errs, 'render', info.total);
console.log(Object.entries(info.times).map(([k, v]) => `${k}:${v}`).join(' '));
await page.screenshot({ path: '/tmp/cc-tools/out/26-y3k-editor.png' });
console.log(logs.join('\n') || 'no errors');
await close();
