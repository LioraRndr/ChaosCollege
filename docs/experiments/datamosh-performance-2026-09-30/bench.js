'use strict';
const realDocument = document;
const SOURCE_HASHES = {"before":"3758f3a8c40ee3dec7c6d0f95d235e1aae40eae366d2fae4f5912867f1952e7d","after":"d01b56d439f84b744798cd78b7f06f6885723aed20532ccf4051b729f8f2d931"};
function beforeEngine(layers = [], seed = 481516) {
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
      function hashString(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fitRect(sourceW, sourceH, targetW, targetH, mode = 'cover') {
    const scale = mode === 'contain'
      ? Math.min(targetW / sourceW, targetH / sourceH)
      : Math.max(targetW / sourceW, targetH / sourceH);
    const width = sourceW * scale;
    const height = sourceH * scale;
    return {
      x: (targetW - width) / 2,
      y: (targetH - height) / 2,
      width,
      height,
    };
  }


    const invalidateLayer = () => {};
      function applyDatamoshFrame(context, fx, width, height, qualityScale, layer) {
    const strength = clamp((Number(fx.frameMosh) || 0) / 100, 0, 1);
    if (strength <= 0) return;

    const block = clamp(
      Math.round((Number(fx.frameMoshBlock) || 14) * qualityScale),
      4,
      Math.max(4, Math.min(width, height)),
    );
    const travel = clamp(
      Math.round((Number(fx.frameMoshMotion) || 0) * qualityScale),
      0,
      Math.max(width, height),
    );
    const persistence = clamp((Number(fx.frameMoshPersistence) || 0) / 100, 0, 1);
    const angle = (Number(fx.frameMoshAngle) || 0) * Math.PI / 180;
    const current = document.createElement('canvas');
    current.width = width;
    current.height = height;
    const currentCtx = current.getContext('2d', { willReadFrequently: true });
    currentCtx.drawImage(context.canvas, 0, 0, width, height);

    const donor = document.createElement('canvas');
    donor.width = width;
    donor.height = height;
    const donorCtx = donor.getContext('2d');
    const donorLayer = state.layers.find((candidate) => (
      candidate.id === fx.frameMoshSourceId
      && candidate.id !== layer.id
      && candidate.type === 'image'
    ));
    const donorImage = donorLayer ? getLoadedImage(donorLayer.imageSrc) : null;

    if (donorImage) {
      const donorFit = fitRect(
        donorImage.naturalWidth || donorImage.width,
        donorImage.naturalHeight || donorImage.height,
        width,
        height,
        donorLayer.fit || 'cover',
      );
      donorCtx.drawImage(donorImage, donorFit.x, donorFit.y, donorFit.width, donorFit.height);
    } else {
      donorCtx.drawImage(current, 0, 0);
      if (donorLayer?.imageSrc) {
        ensureImage(donorLayer.imageSrc).then(() => {
          invalidateLayer(layer);
          requestRender();
        }).catch(() => {});
      }
    }

    const currentPixels = currentCtx.getImageData(0, 0, width, height).data;
    const fieldSeed = (state.seed ^ hashString(layer.id) ^ 0x6672616d) >>> 0;
    const smooth = (value) => {
      const t = clamp(value, 0, 1);
      return t * t * (3 - 2 * t);
    };
    // Coherent patches keep neighbouring blocks moving together. Hash lattice
    // coordinates rather than consuming random numbers: 1x and 2x share a field.
    const lattice = (x, y, channel) => {
      let value = fieldSeed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(channel, 1274126177);
      value = Math.imul(value ^ (value >>> 13), 1274126177);
      return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
    };
    const field = (x, y, channel) => {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const tx = smooth(x - ix);
      const ty = smooth(y - iy);
      return lerp(
        lerp(lattice(ix, iy, channel), lattice(ix + 1, iy, channel), tx),
        lerp(lattice(ix, iy + 1, channel), lattice(ix + 1, iy + 1, channel), tx),
        ty,
      );
    };
    const luminanceAt = (pixels, x, y) => {
      const px = clamp(Math.round(x), 0, width - 1);
      const py = clamp(Math.round(y), 0, height - 1);
      const index = (py * width + px) * 4;
      return pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    };

    const steps = 2 + Math.round(persistence * 12);
    const stepTravel = travel * (0.25 + persistence * 1.75) / steps;
    const tiles = [];
    const columns = Math.ceil(width / block);
    const rows = Math.ceil(height / block);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column * block;
        const y = row * block;
        const w = Math.min(block, width - x);
        const h = Math.min(block, height - y);
        const nx = (column + 0.5) / columns;
        const ny = (row + 0.5) / rows;
        const px = x + w * 0.5;
        const py = y + h * 0.5;
        const gx = luminanceAt(currentPixels, px + block, py) - luminanceAt(currentPixels, px - block, py);
        const gy = luminanceAt(currentPixels, px, py + block) - luminanceAt(currentPixels, px, py - block);
        const edge = clamp(Math.hypot(gx, gy) / 220, 0, 1);
        const patch = field(nx * 4.5, ny * 4.5, 1) * 0.8 + field(nx * 14, ny * 14, 2) * 0.2;
        const damage = smooth((patch + strength * 0.72 + edge * 0.12 - 0.83) / 0.24);
        if (damage <= 0.02) continue;

        const bend = (field(nx * 5, ny * 5, 3) - 0.5) * 1.6;
        const localAngle = angle + bend;
        const speed = damage * (0.3 + field(nx * 7, ny * 7, 4) * 1.35);
        const tear = lattice(column, row, 5) > 0.91 ? 1.65 : 1;
        const dx = Math.cos(localAngle) * stepTravel * speed * tear;
        const dy = Math.sin(localAngle) * stepTravel * speed * tear;
        const sticky = smooth((field(nx * 8, ny * 8, 6) - 0.45) / 0.28) * persistence * damage;
        tiles.push({ x, y, w, h, dx, dy, sticky });
      }
    }

    let feedback = donor;
    let next = document.createElement('canvas');
    next.width = width;
    next.height = height;
    // Each pass reads the last damaged frame, never the frame being written.
    // Narrow source strips stretch trapped texture into opaque, glued ribbons.
    for (let step = 0; step < steps; step += 1) {
      const nextCtx = next.getContext('2d');
      nextCtx.imageSmoothingEnabled = false;
      nextCtx.globalCompositeOperation = 'copy';
      nextCtx.drawImage(current, 0, 0);
      nextCtx.globalCompositeOperation = 'source-over';
      for (const tile of tiles) {
        const horizontal = Math.abs(tile.dx) >= Math.abs(tile.dy);
        const squeeze = travel > 0 ? 1 - tile.sticky * 0.82 : 1;
        const sourceW = horizontal ? Math.max(1, tile.w * squeeze) : tile.w;
        const sourceH = horizontal ? tile.h : Math.max(1, tile.h * squeeze);
        const sourceX = clamp(Math.round(tile.x - tile.dx + (tile.w - sourceW) * 0.5), 0, width - sourceW);
        const sourceY = clamp(Math.round(tile.y - tile.dy + (tile.h - sourceH) * 0.5), 0, height - sourceH);
        nextCtx.clearRect(tile.x, tile.y, tile.w, tile.h);
        nextCtx.drawImage(feedback, sourceX, sourceY, sourceW, sourceH, tile.x, tile.y, tile.w, tile.h);
      }
      [feedback, next] = [next, feedback];
    }

    context.save();
    context.globalCompositeOperation = 'copy';
    context.drawImage(feedback, 0, 0);
    context.restore();
  }


    return {
      apply: applyDatamoshFrame,
      stats: () => ({ createdCanvases, retainedBufferBytes: frameMoshBuffers.reduce((sum, b) => sum + b.canvas.width * b.canvas.height * 4, 0), cacheBytes: processedCacheBytes, cacheSize: processedCache.size, cacheKeys: [...processedCache.keys()] }),
      
    };
  }
function afterEngine(layers = [], seed = 481516) {
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
      function hashString(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fitRect(sourceW, sourceH, targetW, targetH, mode = 'cover') {
    const scale = mode === 'contain'
      ? Math.min(targetW / sourceW, targetH / sourceH)
      : Math.max(targetW / sourceW, targetH / sourceH);
    const width = sourceW * scale;
    const height = sourceH * scale;
    return {
      x: (targetW - width) / 2,
      y: (targetH - height) / 2,
      width,
      height,
    };
  }


      function releaseFrameMoshBuffers() {
    frameMoshBuffers.forEach(({ canvas: buffer }) => {
      buffer.width = 0;
      buffer.height = 0;
    });
  }

  function getFrameMoshBuffers(width, height) {
    while (frameMoshBuffers.length < 2) {
      const buffer = document.createElement('canvas');
      frameMoshBuffers.push({ canvas: buffer, context: buffer.getContext('2d') });
    }
    frameMoshBuffers.forEach(({ canvas: buffer }) => {
      if (buffer.width !== width) buffer.width = width;
      if (buffer.height !== height) buffer.height = height;
    });
    return frameMoshBuffers;
  }

  function discardProcessedImage(key) {
    const cached = processedCache.get(key);
    if (!cached) return;
    processedCacheBytes -= cached.width * cached.height * 4;
    processedCache.delete(key);
    cached.width = 0;
    cached.height = 0;
  }

  function clearProcessedImages() {
    for (const key of processedCache.keys()) discardProcessedImage(key);
    processedCacheBytes = 0;
    releaseFrameMoshBuffers();
  }

  function cacheProcessedImage(key, output) {
    const bytes = output.width * output.height * 4;
    if (bytes > PROCESSED_CACHE_BYTES) return;
    discardProcessedImage(key);
    while (processedCache.size >= 80 || processedCacheBytes + bytes > PROCESSED_CACHE_BYTES) {
      discardProcessedImage(processedCache.keys().next().value);
    }
    processedCache.set(key, output);
    processedCacheBytes += bytes;
  }

  function invalidateLayer(layer) {
    if (!layer) return;
    layer.cacheVersion = (layer.cacheVersion || 0) + 1;
    const affectedIds = new Set([layer.id]);
    state.layers.forEach((candidate) => {
      if (candidate.type === 'image' && candidate.fx?.frameMoshSourceId === layer.id) {
        candidate.cacheVersion = (candidate.cacheVersion || 0) + 1;
        affectedIds.add(candidate.id);
      }
    });
    for (const key of processedCache.keys()) {
      if (affectedIds.has(key.slice(0, key.indexOf('|')))) discardProcessedImage(key);
    }
  }


      function applyDatamoshFrame(context, fx, width, height, qualityScale, layer) {
    const strength = clamp((Number(fx.frameMosh) || 0) / 100, 0, 1);
    if (strength <= 0) return;

    const block = clamp(
      Math.round((Number(fx.frameMoshBlock) || 14) * qualityScale),
      4,
      Math.max(4, Math.min(width, height)),
    );
    const travel = clamp(
      Math.round((Number(fx.frameMoshMotion) || 0) * qualityScale),
      0,
      Math.max(width, height),
    );
    const persistence = clamp((Number(fx.frameMoshPersistence) || 0) / 100, 0, 1);
    const angle = (Number(fx.frameMoshAngle) || 0) * Math.PI / 180;
    const donorLayer = state.layers.find((candidate) => (
      candidate.id === fx.frameMoshSourceId
      && candidate.id !== layer.id
      && candidate.type === 'image'
    ));
    const donorImage = donorLayer ? getLoadedImage(donorLayer.imageSrc) : null;
    if (!donorImage && donorLayer?.imageSrc) {
      ensureImage(donorLayer.imageSrc).then(() => {
        invalidateLayer(layer);
        requestRender();
      }).catch(() => {});
    }
    if (travel === 0 && !donorImage) return;

    // The output stays untouched until the last pass, so it is already the
    // immutable original frame. Only the two feedback buffers need copies.
    const current = context.canvas;
    const buffers = getFrameMoshBuffers(width, height);
    const donor = buffers[0].canvas;
    const donorCtx = buffers[0].context;
    donorCtx.globalAlpha = 1;
    donorCtx.globalCompositeOperation = 'source-over';
    donorCtx.imageSmoothingEnabled = true;
    donorCtx.clearRect(0, 0, width, height);

    if (donorImage) {
      const donorFit = fitRect(
        donorImage.naturalWidth || donorImage.width,
        donorImage.naturalHeight || donorImage.height,
        width,
        height,
        donorLayer.fit || 'cover',
      );
      donorCtx.drawImage(donorImage, donorFit.x, donorFit.y, donorFit.width, donorFit.height);
    } else {
      donorCtx.drawImage(current, 0, 0);
    }

    const currentPixels = context.getImageData(0, 0, width, height).data;
    // Fully opaque self-feedback stays opaque in every pass, so drawing each
    // tile replaces it completely without a separate clear operation.
    let opaqueFeedback = !donorImage;
    for (let i = 3; opaqueFeedback && i < currentPixels.length; i += 4) {
      if (currentPixels[i] !== 255) opaqueFeedback = false;
    }
    const fieldSeed = (state.seed ^ hashString(layer.id) ^ 0x6672616d) >>> 0;
    const smooth = (value) => {
      const t = clamp(value, 0, 1);
      return t * t * (3 - 2 * t);
    };
    // Coherent patches keep neighbouring blocks moving together. Hash lattice
    // coordinates rather than consuming random numbers: 1x and 2x share a field.
    const lattice = (x, y, channel) => {
      let value = fieldSeed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(channel, 1274126177);
      value = Math.imul(value ^ (value >>> 13), 1274126177);
      return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
    };
    const field = (x, y, channel) => {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const tx = smooth(x - ix);
      const ty = smooth(y - iy);
      return lerp(
        lerp(lattice(ix, iy, channel), lattice(ix + 1, iy, channel), tx),
        lerp(lattice(ix, iy + 1, channel), lattice(ix + 1, iy + 1, channel), tx),
        ty,
      );
    };
    const luminanceAt = (pixels, x, y) => {
      const px = clamp(Math.round(x), 0, width - 1);
      const py = clamp(Math.round(y), 0, height - 1);
      const index = (py * width + px) * 4;
      return pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    };

    const steps = 2 + Math.round(persistence * 12);
    const stepTravel = travel * (0.25 + persistence * 1.75) / steps;
    const tiles = [];
    const columns = Math.ceil(width / block);
    const rows = Math.ceil(height / block);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column * block;
        const y = row * block;
        const w = Math.min(block, width - x);
        const h = Math.min(block, height - y);
        const nx = (column + 0.5) / columns;
        const ny = (row + 0.5) / rows;
        const px = x + w * 0.5;
        const py = y + h * 0.5;
        const gx = luminanceAt(currentPixels, px + block, py) - luminanceAt(currentPixels, px - block, py);
        const gy = luminanceAt(currentPixels, px, py + block) - luminanceAt(currentPixels, px, py - block);
        const edge = clamp(Math.hypot(gx, gy) / 220, 0, 1);
        const patch = field(nx * 4.5, ny * 4.5, 1) * 0.8 + field(nx * 14, ny * 14, 2) * 0.2;
        const damage = smooth((patch + strength * 0.72 + edge * 0.12 - 0.83) / 0.24);
        if (damage <= 0.02) continue;

        const bend = (field(nx * 5, ny * 5, 3) - 0.5) * 1.6;
        const localAngle = angle + bend;
        const speed = damage * (0.3 + field(nx * 7, ny * 7, 4) * 1.35);
        const tear = lattice(column, row, 5) > 0.91 ? 1.65 : 1;
        const dx = Math.cos(localAngle) * stepTravel * speed * tear;
        const dy = Math.sin(localAngle) * stepTravel * speed * tear;
        const sticky = smooth((field(nx * 8, ny * 8, 6) - 0.45) / 0.28) * persistence * damage;
        const horizontal = Math.abs(dx) >= Math.abs(dy);
        const squeeze = travel > 0 ? 1 - sticky * 0.82 : 1;
        const sourceW = horizontal ? Math.max(1, w * squeeze) : w;
        const sourceH = horizontal ? h : Math.max(1, h * squeeze);
        const sourceX = clamp(Math.round(x - dx + (w - sourceW) * 0.5), 0, width - sourceW);
        const sourceY = clamp(Math.round(y - dy + (h - sourceH) * 0.5), 0, height - sourceH);
        tiles.push({ x, y, w, h, sourceX, sourceY, sourceW, sourceH });
      }
    }

    const releaseBuffers = width * height * 8 > FRAME_MOSH_BUFFER_BYTES;
    if (!tiles.length) {
      if (releaseBuffers) releaseFrameMoshBuffers();
      return;
    }
    let feedback = buffers[0];
    let next = buffers[1];
    // Each pass reads the last damaged frame, never the frame being written.
    // Narrow source strips stretch trapped texture into opaque, glued ribbons.
    for (let step = 0; step < steps; step += 1) {
      const nextCtx = next.context;
      nextCtx.globalAlpha = 1;
      nextCtx.imageSmoothingEnabled = false;
      nextCtx.globalCompositeOperation = 'copy';
      nextCtx.drawImage(current, 0, 0);
      nextCtx.globalCompositeOperation = 'source-over';
      for (const tile of tiles) {
        if (!opaqueFeedback) nextCtx.clearRect(tile.x, tile.y, tile.w, tile.h);
        nextCtx.drawImage(feedback.canvas, tile.sourceX, tile.sourceY, tile.sourceW, tile.sourceH, tile.x, tile.y, tile.w, tile.h);
      }
      [feedback, next] = [next, feedback];
    }

    context.save();
    context.globalCompositeOperation = 'copy';
    context.drawImage(feedback.canvas, 0, 0);
    context.restore();
    if (releaseBuffers) releaseFrameMoshBuffers();
  }


    return {
      apply: applyDatamoshFrame,
      stats: () => ({ createdCanvases, retainedBufferBytes: frameMoshBuffers.reduce((sum, b) => sum + b.canvas.width * b.canvas.height * 4, 0), cacheBytes: processedCacheBytes, cacheSize: processedCache.size, cacheKeys: [...processedCache.keys()] }),
      cache: cacheProcessedImage, clear: clearProcessedImages, invalidate: invalidateLayer,
    };
  }

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
