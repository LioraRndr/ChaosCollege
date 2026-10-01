import { launch } from './lib.mjs';
import fs from 'fs';
const { page, logs, close } = await launch();
await page.click('[data-quick="0"]');
await page.waitForFunction(() => CC.App.state.doc && !CC.ui.dialogsOpen());
const info = await page.evaluate(async () => {
  const App = CC.App, M = CC.model, E = CC.effects, W = CC.warp, doc = App.state.doc;
  doc.bg = '#efeada';
  const add = (layer, at) => { App.addLayer(layer, { at }); return layer; };
  const terrain = add(M.createGenerator(doc, 'terrain', { w: 1080, h: 760 }), { x: 540, y: 980 });
  const c = document.createElement('canvas'); c.width = 800; c.height = 600;
  const g = c.getContext('2d');
  for (let i = 0; i < 60; i++) { g.fillStyle = `hsl(${(i * 47) % 360},85%,${35 + (i % 4) * 12}%)`; g.fillRect((i * 131) % 800, (i * 71) % 600, 120 + (i % 5) * 40, 80 + (i % 3) * 50); }
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await App.addImageFiles([new File([blob], 'blocks.png', { type: 'image/png' })], { x: 540, y: 330 });
  const image = App.primaryLayer();
  const title = add(M.createText(doc, 'CHAOS', { fontFamily: 'Arial Black', fontWeight: 900, fontSize: 260, fill: '#111' }), { x: 540, y: 330 });
  // put text below image, image clipped to text
  const L = doc.layers; L.splice(L.indexOf(title), 1); L.splice(L.indexOf(image), 0, title);
  image.clip = true; image.w = 1000; image.h = 420; image.x = 540; image.y = 330;
  image.effects = [E.create('blockGlitch', { intensity: 55 }), E.create('rgbSplit', { distance: 8 })];
  title.style.shadow = { on: true, color: '#000000', opacity: 0.55, blur: 0, distance: 14, angle: 120 };
  const chrome = add(M.createText(doc, 'COLLAGE', { fontSize: 150, fillMode: 'chrome', fill: '#ffffff', fill2: '#1d2130', strokeWidth: 3, stroke: '#111', italic: true }), { x: 540, y: 560 });
  chrome.warp = { quad: W.identityQuad(), mesh: W.presetMesh('arc', 0.45) };
  chrome.effects = [E.create('glow', { threshold: 180, radius: 24, strength: 80 })];
  const win = add(M.createWindow(doc, { windowStyle: 'xp', title: 'chaos.exe', body: 'This poster has\nunexpectedly bloomed.', icon: 'error', buttons: 'OK|Cancel', w: 420, h: 220 }), { x: 760, y: 790 });
  win.warp = { quad: W.presetQuad('perspective-right', 0.18), mesh: W.identityMesh() };
  const heart = add(M.createVector(doc, 'heart', { fill: '#ff4ca7', w: 230, h: 210 }), { x: 230, y: 760 });
  heart.style.outline = { on: true, color: '#ffffff', width: 12 };
  heart.style.shadow = { on: true, color: '#000000', opacity: 0.4, blur: 18, distance: 12, angle: 135 };
  heart.rotation = -12;
  const star = add(M.createVector(doc, 'sparkle8', { fill: '#ffffff', fillMode: 'chrome', fill2: '#3a3f4b', w: 200, h: 200 }), { x: 900, y: 150 });
  star.style.glow = { on: true, color: '#d7ff2f', opacity: 0.9, blur: 30, strength: 2 };
  const badge = add(M.createGenerator(doc, 'badge', { w: 220, h: 220 }), { x: 170, y: 160 });
  badge.rotation = -15;
  const ticker = add(M.createGenerator(doc, 'ticker', { w: 1200, h: 64 }), { x: 540, y: 1290 });
  ticker.rotation = -4;
  const barcode = add(M.createShape(doc, 'barcode', { w: 220, h: 90 }), { x: 920, y: 1180 });
  barcode.effects = [E.create('xerox')];
  App.renderAll();
  await new Promise(r => setTimeout(r, 400));
  // timings of rendering whole doc at export scale 1 and 2
  const R = App.renderer;
  const times = {};
  for (const scale of [1, 2]) {
    R.clear();
    const cv = document.createElement('canvas'); cv.width = doc.width * scale; cv.height = doc.height * scale;
    const cx = cv.getContext('2d'); cx.scale(scale, scale);
    const t0 = performance.now();
    R.renderDoc(cx, doc, { q: scale, deviceScale: scale });
    times[scale] = Math.round(performance.now() - t0);
    if (scale === 1) window.__poster = cv.toDataURL('image/png');
  }
  // cached frame time (viewport)
  const t1 = performance.now(); for (let i = 0; i < 10; i++) { App.requestRender(); await new Promise(r => requestAnimationFrame(() => r())); } const frame = (performance.now() - t1) / 10;
  return { times, frame: Math.round(frame), layers: doc.layers.length };
});
console.log(JSON.stringify(info));
const data = await page.evaluate(() => window.__poster);
fs.writeFileSync('/tmp/cc-tools/out/poster.png', Buffer.from(data.split(',')[1], 'base64'));
await page.screenshot({ path: '/tmp/cc-tools/out/21-poster-editor.png' });
// mesh mode overlay
await page.evaluate(() => { const l = CC.App.state.doc.layers.find(l => l.type === 'text' && l.text === 'COLLAGE'); CC.App.select(l.id); CC.App.state.opts.warpMode = 'mesh'; CC.App.setTool('transform'); });
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/cc-tools/out/22-mesh-mode.png' });
console.log(logs.join('\n') || 'no errors');
await close();
