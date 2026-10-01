const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const read = (file) => new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(file));
const before = read(path.join(__dirname, 'app-before-optimization.js'));
const after = read(path.join(root, 'app.js'));
const section = (code, start, end) => code.slice(code.indexOf(`  function ${start}(`), code.indexOf(`  function ${end}(`));
const helpers = section(after, 'hashString', 'seededRandom') + section(after, 'fitRect', 'applyDatamosh');
function engine(name, code, optimized) {
  return `function ${name}(layers = [], seed = 481516) {
    let createdCanvases = 0;
    const document = { createElement: (tag) => { if (tag === 'canvas') createdCanvases++; return realDocument.createElement(tag); } };
    const state = { layers, seed };
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const lerp = (a, b, t) => a + (b - a) * t;
    const getLoadedImage = (src) => layers.find(layer => layer.imageSrc === src)?.image || null;
    const ensureImage = () => Promise.resolve();
    const requestRender = () => {};
    const processedCache = new Map();
    const PROCESSED_CACHE_BYTES = 64 * 1024 * 1024;
    const FRAME_MOSH_BUFFER_BYTES = 16 * 1024 * 1024;
    let processedCacheBytes = 0;
    const frameMoshBuffers = [];
    ${helpers}
    ${optimized ? section(code, 'releaseFrameMoshBuffers', 'fitRect') : 'const invalidateLayer = () => {};'}
    ${section(code, 'applyDatamoshFrame', 'getProcessedImage')}
    return {
      apply: applyDatamoshFrame,
      stats: () => ({ createdCanvases, retainedBufferBytes: frameMoshBuffers.reduce((sum, b) => sum + b.canvas.width * b.canvas.height * 4, 0), cacheBytes: processedCacheBytes, cacheSize: processedCache.size, cacheKeys: [...processedCache.keys()] }),
      ${optimized ? 'cache: cacheProcessedImage, clear: clearProcessedImages, invalidate: invalidateLayer,' : ''}
    };
  }`;
}
const testCode = String.raw`
const status = document.getElementById('status');
const resultEl = document.getElementById('result');
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const waitFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
const load = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
const assert = (value, label) => { if (!value) throw new Error(label); };
const fixture = (image, w, h, transparent = false) => {
  const c = canvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
  if (transparent) { ctx.globalAlpha = 0.38; ctx.drawImage(image, w * 0.2, h * 0.1, w * 0.6, h * 0.8); }
  else ctx.drawImage(image, 0, 0, w, h);
  return c;
};
const preset = { frameMosh: 72, frameMoshBlock: 14, frameMoshMotion: 120, frameMoshAngle: 0, frameMoshPersistence: 78 };
function render(source, engine, fx, scale = 1, keep = false) {
  const output = canvas(source.width * scale, source.height * scale);
  const ctx = output.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, output.width, output.height);
  const start = performance.now();
  engine.apply(ctx, fx, output.width, output.height, scale, { id: 'MOSH_PERF_FIXED' });
  // Force all deferred Canvas drawing to complete before timing stops.
  const rgba = pixels(output);
  const ms = performance.now() - start;
  if (!keep) { output.width = 0; output.height = 0; }
  return { rgba, ms, output };
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
document.getElementById('run').onclick = async () => {
  const results = { appSha256: SOURCE_HASHES, pixelCases: [], cacheChecks: [], benchmarks: [] };
  try {
    document.getElementById('run').disabled = true;
    const [image, donorImage] = await Promise.all([load('../../../assets/ref-garden.jpg'), load('../../../assets/ref-ui.jpg')]);
    const donor = fit => ({ id: 'DONOR', type: 'image', imageSrc: 'donor', image: donorImage, fit, visible: false });
    const cases = [
      { name: 'preset-1x', w: 900, h: 1125, keep: true },
      { name: 'preset-2x-and-large-buffer-release', w: 900, h: 1125, scale: 2 },
      { name: 'tiny-2x2', w: 2, h: 2, fx: { frameMosh: 100, frameMoshBlock: 48 } },
      { name: 'partial-edge-blocks', w: 31, h: 19, fx: { frameMosh: 100, frameMoshBlock: 48, frameMoshAngle: -135 } },
      { name: 'small-block-max-feedback', w: 191, h: 137, fx: { frameMosh: 100, frameMoshBlock: 4, frameMoshPersistence: 100, frameMoshAngle: 90 } },
      { name: 'zero-feedback', w: 319, h: 241, fx: { frameMoshPersistence: 0, frameMoshAngle: -45 } },
      { name: 'zero-distance', w: 319, h: 241, fx: { frameMoshMotion: 0 } },
      { name: 'zero-infection', w: 319, h: 241, fx: { frameMosh: 0 } },
      { name: 'hidden-donor-cover', w: 319, h: 241, layers: [donor('cover')], fx: { frameMoshSourceId: 'DONOR' } },
      { name: 'hidden-donor-contain', w: 319, h: 241, layers: [donor('contain')], fx: { frameMoshSourceId: 'DONOR' } },
      { name: 'donor-zero-distance', w: 319, h: 241, layers: [donor('contain')], fx: { frameMoshSourceId: 'DONOR', frameMoshMotion: 0 } },
      { name: 'deleted-donor-fallback', w: 319, h: 241, fx: { frameMoshSourceId: 'MISSING' } },
      { name: 'transparent-pixels', w: 319, h: 241, transparent: true, fx: { frameMosh: 100, frameMoshAngle: -60 } },
      { name: 'weak-infection', w: 191, h: 137, fx: { frameMosh: 1 } },
    ];
    for (const item of cases) {
      status.textContent = 'Pixel comparison: ' + item.name;
      await waitFrame();
      const source = fixture(image, item.w, item.h, item.transparent);
      const oldEngine = beforeEngine(item.layers), newEngine = afterEngine(item.layers);
      const fx = { ...preset, ...item.fx };
      const a = render(source, oldEngine, fx, item.scale || 1, item.keep);
      const b = render(source, newEngine, fx, item.scale || 1, item.keep);
      let differentBytes = 0;
      for (let i = 0; i < a.rgba.length; i++) if (a.rgba[i] !== b.rgba[i]) differentBytes++;
      const row = { name: item.name, pixels: a.rgba.length / 4, differentBytes, status: differentBytes === 0 ? 'PASS' : 'FAIL', buffers: newEngine.stats() };
      results.pixelCases.push(row);
      assert(differentBytes === 0, item.name + ': pixels changed');
      assert(newEngine.stats().retainedBufferBytes <= 16 * 1024 * 1024, 'temporary buffers over retention budget');
      if (item.keep) {
        const gallery = document.getElementById('gallery');
        for (const [label, imageCanvas] of [['Before optimization', a.output], ['After optimization', b.output]]) {
          const figure = document.createElement('figure'); const caption = document.createElement('figcaption'); caption.textContent = label;
          figure.append(caption, imageCanvas); gallery.append(figure);
        }
      }
      source.width = 0; source.height = 0;
      newEngine.clear();
    }
    // Reuse across changing layer dimensions, donor fits, transparency, and export.
    const reuse = afterEngine([donor('contain')]);
    for (const item of [cases[0], cases[9], cases[12], cases[1], cases[0]]) {
      const source = fixture(image, item.w, item.h, item.transparent);
      const fx = { ...preset, ...item.fx };
      const a = render(source, beforeEngine([donor('contain')]), fx, item.scale || 1);
      const b = render(source, reuse, fx, item.scale || 1);
      let mismatches = 0;
      for (let i = 0; i < a.rgba.length; i++) if (a.rgba[i] !== b.rgba[i]) mismatches++;
      assert(mismatches === 0, 'buffer reuse changed pixels: ' + item.name);
      results.pixelCases.push({ name: 'reuse-' + item.name, differentBytes: mismatches, status: 'PASS' });
      source.width = 0;
    }
    results.bufferReuse = reuse.stats(); reuse.clear();
    const cache = afterEngine([{ id: 'TARGET', type: 'image', fx: { frameMoshSourceId: 'SOURCE' } }]);
    for (let i = 0; i < 6; i++) cache.cache('K' + i + '|1|1|2048x2048', { width: 2048, height: 2048 });
    assert(cache.stats().cacheBytes === 64 * 1024 * 1024 && cache.stats().cacheSize === 4, '64 MiB cache budget');
    assert(!cache.stats().cacheKeys.some(key => key.startsWith('K0|')), 'old entries evicted');
    cache.clear();
    for (let i = 0; i < 100; i++) cache.cache('SMALL' + i + '|1|1|2x2', { width: 2, height: 2 });
    assert(cache.stats().cacheSize === 80 && cache.stats().cacheBytes === 1280, 'entry cap and byte accounting');
    cache.clear();
    cache.cache('SOURCE|1|1|10x10', { width: 10, height: 10 });
    cache.cache('TARGET|1|1|10x10', { width: 10, height: 10 });
    cache.cache('OTHER|1|1|10x10', { width: 10, height: 10 });
    cache.invalidate({ id: 'SOURCE' });
    assert(cache.stats().cacheBytes === 400 && cache.stats().cacheSize === 1, 'donor dependents invalidated');
    cache.clear(); assert(cache.stats().cacheBytes === 0 && cache.stats().retainedBufferBytes === 0, 'clear releases buffers');
    results.cacheChecks = ['64 MiB pixel budget', '80-entry cap', 'eviction accounting', 'donor invalidation', 'clear releases backing stores'];
    for (const item of [{ name: '900x1125-default', w: 900, h: 1125, fx: preset }, { name: 'small-block-480x360', w: 480, h: 360, fx: { ...preset, frameMoshBlock: 4, frameMoshPersistence: 100 } }]) {
      status.textContent = 'Benchmark: ' + item.name; await waitFrame();
      const source = fixture(image, item.w, item.h);
      const original = beforeEngine(), optimized = afterEngine();
      for (let i = 0; i < 2; i++) { render(source, original, item.fx); render(source, optimized, item.fx); }
      const oldTimes = [], newTimes = [];
      for (let i = 0; i < 9; i++) {
        await waitFrame();
        if (i % 2) { newTimes.push(render(source, optimized, item.fx).ms); oldTimes.push(render(source, original, item.fx).ms); }
        else { oldTimes.push(render(source, original, item.fx).ms); newTimes.push(render(source, optimized, item.fx).ms); }
      }
      const oldMs = median(oldTimes), newMs = median(newTimes);
      results.benchmarks.push({ name: item.name, samples: 9, beforeMedianMs: oldMs, afterMedianMs: newMs, reductionPercent: (1 - newMs / oldMs) * 100, oldTimes, newTimes, oldAllocations: original.stats().createdCanvases, newAllocations: optimized.stats().createdCanvases });
      optimized.clear(); source.width = 0;
    }
    results.status = 'PASS';
    status.textContent = 'PASS - complete pixels match; timing and cache checks recorded';
  } catch (error) { results.status = 'FAIL'; results.error = error.message; status.textContent = 'FAIL: ' + error.message; }
  resultEl.textContent = JSON.stringify(results, null, 2);
};
`;
const metadata = { before: crypto.createHash('sha256').update(before).digest('hex'), after: crypto.createHash('sha256').update(after).digest('hex') };
const js = `'use strict';
const realDocument = document;
const SOURCE_HASHES = ${JSON.stringify(metadata)};
${engine('beforeEngine', before, false)}
${engine('afterEngine', after, true)}
${testCode}`;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Datamosh optimization verification</title>
<style>body{background:#111116;color:#eee;font:15px system-ui;margin:24px}button{font:inherit;padding:12px;color:#111;background:#d7ff2f;border:0;border-radius:6px}#gallery{display:flex;gap:20px}figure{margin:0;flex:1}canvas{width:100%;height:auto}figcaption{padding:12px 0;color:#d7ff2f}pre{white-space:pre-wrap;font-size:12px}</style>
<h1>Datamosh optimization verification</h1><button id="run">Run pixel checks and benchmark</button><p id="status">Ready</p><div id="gallery"></div><pre id="result"></pre><script src="bench.js"></script></html>`;
for (const [file, content] of [['bench.js', js], ['bench.html', html]]) {
  const target = path.join(__dirname, file);
  if (fs.existsSync(target)) read(target);
  fs.writeFileSync(target, content, 'utf8');
}
console.log(JSON.stringify(metadata));
