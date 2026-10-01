import { launch } from './lib.mjs';
import fs from 'fs';
const { page, logs, close } = await launch();
await page.addScriptTag({ content: fs.readFileSync('/tmp/cc-tools/legacy-fx.js', 'utf8') });
const res = await page.evaluate(async () => {
  const L = window.LEGACY;
  function source(w, h, alpha = false) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ff7a18'); gr.addColorStop(0.5, '#3265ff'); gr.addColorStop(1, '#20e3d1');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${i * 37},80%,${30 + (i % 5) * 12}%)`; g.beginPath(); g.arc((i * 97) % w, (i * 53) % h, 10 + (i % 7) * 9, 0, 7); g.fill(); }
    if (alpha) { g.clearRect(w * 0.6, 0, w * 0.4, h * 0.3); }
    return c;
  }
  const hashOf = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 2166136261; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
  const cases = [];
  const configs = [
    { w: 900, h: 675, q: 1, p: { infection: 72, block: 14, motion: 120, angle: 0, persistence: 78 } },
    { w: 480, h: 360, q: 1, p: { infection: 100, block: 4, motion: 260, angle: 35, persistence: 100 } },
    { w: 640, h: 480, q: 2, p: { infection: 56, block: 12, motion: 84, angle: -7, persistence: 74 } },
    { w: 300, h: 200, q: 1, p: { infection: 0, block: 14, motion: 120, angle: 0, persistence: 78 } },
    { w: 300, h: 200, q: 1, p: { infection: 72, block: 14, motion: 0, angle: 0, persistence: 78 } },
  ];
  for (const [index, cfg] of configs.entries()) {
    for (const seed of [481516, 7]) {
      const a = source(cfg.w, cfg.h); const b = source(cfg.w, cfg.h);
      L.state.seed = seed;
      const layer = { id: 'IM_test' + index };
      L.applyDatamoshFrame(a.getContext('2d', { willReadFrequently: true }), { frameMosh: cfg.p.infection, frameMoshSourceId: '', frameMoshBlock: cfg.p.block, frameMoshMotion: cfg.p.motion, frameMoshAngle: cfg.p.angle, frameMoshPersistence: cfg.p.persistence }, cfg.w, cfg.h, cfg.q, layer);
      CC.effects.get('frameMosh').apply(b, b.getContext('2d', { willReadFrequently: true }), { ...CC.effects.defaults('frameMosh'), ...cfg.p, source: '' }, { q: cfg.q, seed, layerId: layer.id, fitRect: CC.fitRect, getDonor: () => null });
      cases.push({ fx: 'frameMosh', index, seed, same: hashOf(a) === hashOf(b) });
      const c = source(cfg.w, cfg.h); const d = source(cfg.w, cfg.h);
      L.applyDatamosh(c.getContext('2d', { willReadFrequently: true }), { datamosh: cfg.p.infection, moshBlock: cfg.p.block + 2, moshDrift: cfg.p.motion }, cfg.w, cfg.h, cfg.q, layer.id);
      CC.effects.get('blockGlitch').apply(d, d.getContext('2d', { willReadFrequently: true }), { intensity: cfg.p.infection, block: cfg.p.block + 2, drift: cfg.p.motion }, { q: cfg.q, seed, layerId: layer.id });
      cases.push({ fx: 'blockGlitch', index, seed, same: hashOf(c) === hashOf(d) });
    }
  }
  // transparent with trails=false must equal legacy
  const a = source(500, 400, true); const b = source(500, 400, true);
  L.state.seed = 99;
  L.applyDatamoshFrame(a.getContext('2d', { willReadFrequently: true }), { frameMosh: 72, frameMoshSourceId: '', frameMoshBlock: 14, frameMoshMotion: 120, frameMoshAngle: 0, frameMoshPersistence: 78 }, 500, 400, 1, { id: 'T' });
  CC.effects.get('frameMosh').apply(b, b.getContext('2d', { willReadFrequently: true }), { ...CC.effects.defaults('frameMosh'), trails: false }, { q: 1, seed: 99, layerId: 'T', fitRect: CC.fitRect, getDonor: () => null });
  cases.push({ fx: 'frameMosh-transparent-trailsOff', same: hashOf(a) === hashOf(b) });
  return cases;
});
console.log(res.map(r => `${r.fx}#${r.index ?? ''}@${r.seed ?? ''}:${r.same ? 'SAME' : 'DIFF'}`).join('\n'));
console.log(logs.join('\n') || 'no errors');
await close();
