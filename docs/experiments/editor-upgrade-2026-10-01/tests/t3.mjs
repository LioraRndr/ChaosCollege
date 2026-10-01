import { launch } from './lib.mjs';
const { page, logs, close } = await launch();
await page.click('[data-quick="1"]');
await page.waitForFunction(() => CC.App.state.doc);
const result = await page.evaluate(async () => {
  const App = CC.App, M = CC.model, U = CC.util;
  const doc = App.state.doc;
  // test image: photo-like gradient with shapes
  const c = document.createElement('canvas'); c.width = 600; c.height = 450;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 600, 450); gr.addColorStop(0, '#ff7a18'); gr.addColorStop(0.5, '#3265ff'); gr.addColorStop(1, '#20e3d1');
  g.fillStyle = gr; g.fillRect(0, 0, 600, 450);
  for (let i = 0; i < 30; i++) { g.fillStyle = `hsl(${i * 37},80%,${30 + (i % 5) * 12}%)`; g.beginPath(); g.arc((i * 97) % 600, (i * 53) % 450, 20 + (i % 7) * 8, 0, 7); g.fill(); }
  g.fillStyle = '#fff'; g.font = '900 90px Arial'; g.fillText('GLITCH', 120, 260);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  await App.addImageFiles([new File([blob], 'photo.png', { type: 'image/png' })], { x: 540, y: 540 });
  const img = App.primaryLayer();
  const text = App.addLayer(M.createText(doc, 'FX', { fontSize: 200 }), { at: { x: 540, y: 300 } });
  const results = [];
  const renderer = App.renderer;
  for (const def of CC.effects.list()) {
    for (const layer of [img, text]) {
      layer.effects = [CC.effects.create(def.type)];
      renderer.clear();
      const t0 = performance.now();
      let err = null;
      try { renderer.getRaster(layer, doc, 1, {}); } catch (e) { err = e.message; }
      results.push({ fx: def.type, layer: layer.type, ms: Math.round(performance.now() - t0), err });
    }
  }
  img.effects = []; text.effects = [];
  // generators & vectors
  const gens = [];
  for (const def of CC.generators.list()) {
    const layer = M.createGenerator(doc, def.type);
    const t0 = performance.now(); let err = null;
    try { renderer.getRaster(layer, doc, 1, {}); } catch (e) { err = e.message; }
    gens.push({ gen: def.type, ms: Math.round(performance.now() - t0), err });
  }
  const vecs = [];
  for (const asset of CC.vectorAssets.ASSETS) {
    const layer = M.createVector(doc, asset.id);
    const cv = document.createElement('canvas'); cv.width = 200; cv.height = 200;
    const cx = cv.getContext('2d'); cx.translate(100, 100);
    let err = null;
    try { renderer.drawContent(cx, layer, doc, { q: 1 }); } catch (e) { err = e.message; }
    // count non-transparent pixels
    const d = cx.getImageData(0, 0, 200, 200).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    vecs.push({ id: asset.id, err, filled: n });
  }
  return { results, gens, vecs };
});
const slow = result.results.filter(r => r.ms > 150 || r.err);
console.log('effects total', result.results.length, 'slow/err:', JSON.stringify(slow));
console.log('effects timings', result.results.map(r => `${r.fx}/${r.layer}:${r.ms}`).join(' '));
console.log('gens', JSON.stringify(result.gens.filter(g => g.err || g.ms > 150)), result.gens.map(g => `${g.gen}:${g.ms}`).join(' '));
console.log('vecs errors/empty', JSON.stringify(result.vecs.filter(v => v.err || v.filled < 200)));
console.log(logs.join('\n') || 'no errors');
await close();
