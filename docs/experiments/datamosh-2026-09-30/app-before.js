(() => {
  'use strict';

  const SAMPLE_IMAGES = Array.isArray(window.SAMPLE_IMAGES) ? window.SAMPLE_IMAGES : [];
  const canvas = document.getElementById('artboard');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const dom = {
    workspace: document.getElementById('workspace'),
    stageViewport: document.getElementById('stageViewport'),
    stageFrame: document.getElementById('stageFrame'),
    dropOverlay: document.getElementById('dropOverlay'),
    layersList: document.getElementById('layersList'),
    inspector: document.getElementById('inspector'),
    selectedTypeBadge: document.getElementById('selectedTypeBadge'),
    sampleAssets: document.getElementById('sampleAssets'),
    fileInput: document.getElementById('fileInput'),
    canvasSizeLabel: document.getElementById('canvasSizeLabel'),
    projectName: document.getElementById('projectName'),
    statusText: document.getElementById('statusText'),
    seedButton: document.getElementById('seedButton'),
    toast: document.getElementById('toast'),
    exportScaleSelect: document.getElementById('exportScaleSelect'),
  };

  const FORMATS = {
    portrait: { width: 900, height: 1125 },
    square: { width: 1000, height: 1000 },
    landscape: { width: 1280, height: 720 },
  };

  const PALETTE = ['#d7ff2f', '#20e3d1', '#ff4ca7', '#ff7a18', '#3265ff', '#111111', '#f4f1e7'];
  const imageCache = new Map();
  const processedCache = new Map();
  const shatterCache = new Map();
  const shatterGeomCache = new Map();
  const state = {
    project: {
      name: 'UNTITLED_001',
      width: 900,
      height: 1125,
      bg: '#f1eddf',
      format: 'portrait',
    },
    layers: [],
    selectedId: null,
    seed: 481516,
    history: [],
    future: [],
    pointer: null,
    controlSnapshot: null,
    viewScale: 1,
    renderQueued: false,
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function uid(prefix = 'L') {
    return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36).slice(-5)}`;
  }

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

  function seededRandom(...parts) {
    return mulberry32(parts.reduce((acc, part) => (acc ^ hashString(part)) >>> 0, state.seed >>> 0));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function deepCopy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getByPath(target, path) {
    return path.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), target);
  }

  function setByPath(target, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    let cursor = target;
    for (const key of keys) {
      if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
      cursor = cursor[key];
    }
    cursor[last] = value;
  }

  function serializeState() {
    return JSON.stringify({
      project: state.project,
      layers: state.layers,
      selectedId: state.selectedId,
      seed: state.seed,
    });
  }

  function restoreState(snapshot) {
    const next = JSON.parse(snapshot);
    state.project = next.project;
    state.layers = next.layers.map(normalizeLayer);
    state.selectedId = next.selectedId;
    state.seed = next.seed;
    processedCache.clear();
    resizeCanvasToProject();
    renderAll();
  }

  function pushHistory(snapshot) {
    if (!snapshot || snapshot === serializeState()) return;
    state.history.push(snapshot);
    if (state.history.length > 50) state.history.shift();
    state.future.length = 0;
    updateUndoButtons();
  }

  function undo() {
    if (!state.history.length) return;
    const current = serializeState();
    const previous = state.history.pop();
    state.future.push(current);
    restoreState(previous);
    updateUndoButtons();
    showToast('已撤销');
  }

  function redo() {
    if (!state.future.length) return;
    const current = serializeState();
    const next = state.future.pop();
    state.history.push(current);
    restoreState(next);
    updateUndoButtons();
    showToast('已重做');
  }

  function updateUndoButtons() {
    const undoButton = document.getElementById('undoButton');
    const redoButton = document.getElementById('redoButton');
    undoButton.disabled = !state.history.length;
    redoButton.disabled = !state.future.length;
    undoButton.style.opacity = state.history.length ? '1' : '0.4';
    redoButton.style.opacity = state.future.length ? '1' : '0.4';
  }

  function defaultRepeater() {
    return {
      count: 1,
      dx: 14,
      dy: 14,
      scaleStep: 1,
      rotationStep: 0,
      opacityStep: 1,
      jitterX: 0,
      jitterY: 0,
      jitterRotation: 0,
    };
  }

  function defaultImageFx() {
    return {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      blur: 0,
      posterize: 0,
      threshold: 0,
      dither: 0,
      halftone: 0,
      pixelate: 1,
      datamosh: 0,
      moshBlock: 16,
      moshDrift: 72,
      frameMosh: 0,
      frameMoshSourceId: '',
      frameMoshBlock: 14,
      frameMoshMotion: 96,
      frameMoshAngle: 0,
      frameMoshPersistence: 68,
      rgbSplit: 0,
      noise: 0,
      invert: false,
    };
  }

  function defaultShatter() {
    return {
      mode: 'burst',
      density: 3,
      explode: 100,
      tumble: 45,
      twist: 30,
      scatter: 40,
      gloss: 70,
      accentRatio: 16,
      spikes: 45,
      jagged: 55,
      spikeCount: 35,
      spikeLen: 60,
      bands: 4,
      body: '#0d0d10',
      highlight: '#f4f1e7',
      accent: '#e62e1b',
      wireframe: true,
      wireColor: '#f4f1e7',
    };
  }

  function baseLayer(type, name) {
    return {
      id: uid(type.slice(0, 2).toUpperCase()),
      type,
      name,
      visible: true,
      x: state.project.width / 2,
      y: state.project.height / 2,
      w: 300,
      h: 200,
      rotation: 0,
      opacity: 1,
      blend: 'source-over',
      repeater: defaultRepeater(),
      cacheVersion: 1,
    };
  }

  function normalizeLayer(layer) {
    const normalized = {
      ...baseLayer(layer.type || 'shape', layer.name || '图层'),
      ...layer,
    };
    normalized.repeater = { ...defaultRepeater(), ...(layer.repeater || {}) };
    if (normalized.type === 'image') normalized.fx = { ...defaultImageFx(), ...(layer.fx || {}) };
    if (normalized.type === 'shatter') normalized.shatter = { ...defaultShatter(), ...(layer.shatter || {}) };
    normalized.cacheVersion = Number.isFinite(layer.cacheVersion) ? layer.cacheVersion : 1;
    return normalized;
  }

  function createImageLayer(src, name = '图像') {
    const layer = baseLayer('image', name.toUpperCase());
    layer.imageSrc = src;
    layer.fit = 'cover';
    layer.w = Math.round(state.project.width * 0.72);
    layer.h = Math.round(state.project.height * 0.62);
    layer.fx = defaultImageFx();
    return layer;
  }

  function createTextLayer(text = 'CHAOS', name = '文字') {
    const layer = baseLayer('text', name.toUpperCase());
    layer.text = text;
    layer.w = Math.round(state.project.width * 0.72);
    layer.h = 180;
    layer.fontSize = 96;
    layer.fontFamily = 'Arial Black';
    layer.fontWeight = 900;
    layer.lineHeight = 0.9;
    layer.tracking = -2;
    layer.align = 'center';
    layer.fill = '#111111';
    layer.stroke = '#f4f1e7';
    layer.strokeWidth = 0;
    return layer;
  }

  function createWindowLayer(title = 'WARNING', body = 'Something has gone wrong.') {
    const layer = baseLayer('window', '错误窗口');
    layer.w = 300;
    layer.h = 180;
    layer.title = title;
    layer.body = body;
    layer.accent = '#173fbe';
    layer.windowStyle = 'classic';
    return layer;
  }

  function createShapeLayer(shapeType = 'rect', name = '形状') {
    const layer = baseLayer('shape', name.toUpperCase());
    layer.shapeType = shapeType;
    layer.w = 260;
    layer.h = 90;
    layer.fill = '#d7ff2f';
    layer.stroke = '#111111';
    layer.strokeWidth = 0;
    layer.sides = 12;
    return layer;
  }

  function createShatterLayer(name = '爆裂碎片', mode = 'burst') {
    const layer = baseLayer('shatter', name);
    layer.w = Math.round(Math.min(state.project.width, state.project.height) * 0.8);
    layer.h = layer.w;
    layer.shatter = defaultShatter();
    layer.shatter.mode = mode;
    if (mode === 'spike') {
      layer.shatter.gloss = 75;
      layer.shatter.accentRatio = 14;
      layer.shatter.spikes = 40;
    }
    return layer;
  }

  function selectedLayer() {
    return state.layers.find((layer) => layer.id === state.selectedId) || null;
  }

  function selectLayer(id) {
    state.selectedId = id;
    renderAll();
  }

  function ensureImage(src) {
    if (!src) return Promise.reject(new Error('Missing image source'));
    const existing = imageCache.get(src);
    if (existing) return existing.promise;

    const img = new Image();
    const entry = {};
    entry.img = img;
    entry.promise = new Promise((resolve, reject) => {
      img.onload = () => {
        entry.loaded = true;
        resolve(img);
        requestRender();
      };
      img.onerror = () => {
        entry.error = true;
        reject(new Error('Could not load image'));
      };
    });
    imageCache.set(src, entry);
    img.decoding = 'async';
    img.src = src;
    return entry.promise;
  }

  function getLoadedImage(src) {
    const entry = imageCache.get(src);
    return entry && entry.loaded ? entry.img : null;
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
      if ([...affectedIds].some((id) => key.startsWith(`${id}|`))) processedCache.delete(key);
    }
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

  function applyDatamosh(context, fx, width, height, qualityScale, layerId) {
    const intensity = clamp((Number(fx.datamosh) || 0) / 100, 0, 1);
    if (intensity <= 0) return;

    const baseBlock = clamp(Math.round(Number(fx.moshBlock) || 16), 4, 64);
    const block = clamp(Math.round(baseBlock * qualityScale), 4, Math.max(4, Math.min(width, height)));
    const maxDrift = clamp(
      Math.round((Number(fx.moshDrift) || 0) * qualityScale),
      0,
      Math.max(0, width - 1),
    );
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    const source = new Uint8ClampedArray(data);
    const random = mulberry32((state.seed ^ hashString(layerId) ^ 0x6d6f7368) >>> 0);
    const rowChance = intensity * 0.86;
    const blockChance = 0.32 + intensity * 0.64;
    let motionX = 0;

    for (let blockY = 0; blockY < height; blockY += block) {
      if (random() > rowChance) {
        motionX = Math.round(motionX * 0.52);
        continue;
      }

      const rowHeight = Math.min(block, height - blockY);
      motionX = clamp(
        Math.round(motionX * 0.58 + (random() * 2 - 1) * maxDrift * (0.35 + intensity * 0.65)),
        -maxDrift,
        maxDrift,
      );
      if (maxDrift > 0 && Math.abs(motionX) < Math.max(2, Math.round(block / 3))) {
        motionX = (random() < 0.5 ? -1 : 1) * Math.min(maxDrift, Math.max(2, Math.round(block / 2)));
      }

      const maxHoldBlocks = Math.max(1, Math.round(1 + intensity * 5));
      const holdY = random() < intensity * 0.72
        ? block * (1 + Math.floor(random() * maxHoldBlocks))
        : 0;

      for (let blockX = 0; blockX < width;) {
        const spanBlocks = 1 + Math.floor(random() * (2 + intensity * 6));
        const spanWidth = Math.min(width - blockX, block * spanBlocks);
        if (random() <= blockChance) {
          const localDrift = clamp(
            Math.round(motionX + (random() * 2 - 1) * maxDrift * 0.22),
            -maxDrift,
            maxDrift,
          );
          const chromaDrift = clamp(
            Math.round(localDrift * (0.08 + intensity * 0.16)),
            -block * 2,
            block * 2,
          );

          for (let offsetY = 0; offsetY < rowHeight; offsetY += 1) {
            const pixelY = blockY + offsetY;
            const sourceY = clamp(pixelY - holdY, 0, height - 1);
            for (let offsetX = 0; offsetX < spanWidth; offsetX += 1) {
              const pixelX = blockX + offsetX;
              const sourceX = clamp(pixelX - localDrift, 0, width - 1);
              const redX = clamp(sourceX - chromaDrift, 0, width - 1);
              const blueX = clamp(sourceX + chromaDrift, 0, width - 1);
              const targetIndex = (pixelY * width + pixelX) * 4;
              const sourceIndex = (sourceY * width + sourceX) * 4;
              const redIndex = (sourceY * width + redX) * 4;
              const blueIndex = (sourceY * width + blueX) * 4;
              data[targetIndex] = source[redIndex];
              data[targetIndex + 1] = source[sourceIndex + 1];
              data[targetIndex + 2] = source[blueIndex + 2];
              data[targetIndex + 3] = source[sourceIndex + 3];
            }
          }
        }
        blockX += spanWidth;
      }
    }

    context.putImageData(imageData, 0, 0);
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
    const baseVectorX = Math.cos(angle) * travel;
    const baseVectorY = Math.sin(angle) * travel;

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

    const previous = document.createElement('canvas');
    previous.width = width;
    previous.height = height;
    const previousCtx = previous.getContext('2d', { willReadFrequently: true });
    const preRoll = donorLayer ? 0.12 : 0.32;
    const echoScale = 1 + strength * (donorLayer ? 0.008 : 0.022);
    previousCtx.save();
    previousCtx.translate(
      width / 2 - baseVectorX * preRoll,
      height / 2 - baseVectorY * preRoll,
    );
    previousCtx.scale(echoScale, echoScale);
    previousCtx.drawImage(donor, -width / 2, -height / 2, width, height);
    previousCtx.restore();

    const currentPixels = currentCtx.getImageData(0, 0, width, height).data;
    const previousPixels = previousCtx.getImageData(0, 0, width, height).data;
    const random = mulberry32((state.seed ^ hashString(layer.id) ^ 0x6672616d) >>> 0);
    const luminanceAt = (pixels, x, y) => {
      const px = clamp(Math.round(x), 0, width - 1);
      const py = clamp(Math.round(y), 0, height - 1);
      const index = (py * width + px) * 4;
      return pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    };

    context.save();
    context.imageSmoothingEnabled = false;
    const trailSteps = 2 + Math.round(persistence * 7);
    let laneMomentum = 0;

    for (let y = 0; y < height; y += block) {
      const laneWave = Math.sin((y / Math.max(block, 1)) * 0.73 + random() * Math.PI) * (0.08 + strength * 0.18);
      laneMomentum = laneMomentum * 0.62 + (random() * 2 - 1) * (0.12 + (1 - persistence) * 0.18);

      for (let x = 0; x < width;) {
        const spanBlocks = 1 + Math.floor(random() * (1 + strength * 4));
        const spanWidth = Math.min(width - x, block * spanBlocks);
        const spanHeight = Math.min(height - y, block * (random() < persistence * 0.2 ? 2 : 1));
        const sampleX = x + spanWidth * 0.5;
        const sampleY = y + spanHeight * 0.5;
        const currentLuma = luminanceAt(currentPixels, sampleX, sampleY);
        const previousLuma = luminanceAt(previousPixels, sampleX, sampleY);
        const gradient = (
          Math.abs(previousLuma - luminanceAt(previousPixels, sampleX + block, sampleY))
          + Math.abs(previousLuma - luminanceAt(previousPixels, sampleX - block, sampleY))
          + Math.abs(previousLuma - luminanceAt(previousPixels, sampleX, sampleY + block))
          + Math.abs(previousLuma - luminanceAt(previousPixels, sampleX, sampleY - block))
        ) / 510;
        const residual = Math.abs(previousLuma - currentLuma) / 255;
        const contourSignal = clamp(gradient * 1.55 + residual * (donorLayer ? 1.15 : 0.72), 0, 1);
        const activation = clamp(strength * (0.14 + contourSignal * 1.16), 0, 0.96);

        if (random() < activation) {
          const localAngle = angle + laneWave + laneMomentum + (random() * 2 - 1) * 0.12;
          const localTravel = travel * (0.34 + random() * 0.66) * (0.62 + contourSignal * 0.74);
          const vectorX = Math.cos(localAngle) * localTravel;
          const vectorY = Math.sin(localAngle) * localTravel;
          const holdRows = random() < persistence * 0.48
            ? block * (1 + Math.floor(random() * (2 + persistence * 5)))
            : 0;
          const sourceY = clamp(y - holdRows, 0, Math.max(0, height - spanHeight));

          for (let step = trailSteps; step >= 1; step -= 1) {
            const progress = step / trailSteps;
            const trailAlpha = strength
              * (0.045 + persistence * 0.13)
              * (0.55 + contourSignal * 0.7)
              * (1 - progress * 0.38);
            context.globalAlpha = clamp(trailAlpha, 0, 0.42);
            context.drawImage(
              previous,
              x,
              sourceY,
              spanWidth,
              spanHeight,
              Math.round(x + vectorX * progress),
              Math.round(y + vectorY * progress),
              spanWidth,
              spanHeight,
            );
          }

          context.globalAlpha = clamp(
            strength * (0.28 + persistence * 0.5) * (0.52 + contourSignal * 0.68),
            0,
            0.94,
          );
          context.drawImage(
            previous,
            x,
            sourceY,
            spanWidth,
            spanHeight,
            Math.round(x + vectorX),
            Math.round(y + vectorY),
            spanWidth,
            spanHeight,
          );
        }

        x += spanWidth;
      }
    }

    context.restore();
  }

  function getProcessedImage(layer, qualityScale = 1) {
    const img = getLoadedImage(layer.imageSrc);
    if (!img) {
      ensureImage(layer.imageSrc).catch(() => {});
      return null;
    }

    const width = clamp(Math.round(Math.abs(layer.w) * qualityScale), 2, 3600);
    const height = clamp(Math.round(Math.abs(layer.h) * qualityScale), 2, 3600);
    const cacheKey = `${layer.id}|${layer.cacheVersion}|${state.seed}|${width}x${height}`;
    if (processedCache.has(cacheKey)) return processedCache.get(cacheKey);

    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const outputCtx = output.getContext('2d', { willReadFrequently: true });
    const fx = { ...defaultImageFx(), ...(layer.fx || {}) };
    const fitted = fitRect(img.naturalWidth || img.width, img.naturalHeight || img.height, width, height, layer.fit || 'cover');

    outputCtx.save();
    outputCtx.filter = `brightness(${fx.brightness}%) contrast(${fx.contrast}%) saturate(${fx.saturation}%) blur(${Math.max(0, fx.blur * qualityScale)}px)`;
    outputCtx.drawImage(img, fitted.x, fitted.y, fitted.width, fitted.height);
    outputCtx.restore();

    if (fx.pixelate > 1) {
      const factor = clamp(Math.round(fx.pixelate), 2, 40);
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.round(width / factor));
      small.height = Math.max(1, Math.round(height / factor));
      const smallCtx = small.getContext('2d');
      smallCtx.imageSmoothingEnabled = true;
      smallCtx.drawImage(output, 0, 0, small.width, small.height);
      outputCtx.clearRect(0, 0, width, height);
      outputCtx.imageSmoothingEnabled = false;
      outputCtx.drawImage(small, 0, 0, width, height);
      outputCtx.imageSmoothingEnabled = true;
    }

    const needsPixels = fx.posterize >= 2 || fx.threshold > 0 || fx.dither > 0 || fx.rgbSplit > 0 || fx.noise > 0 || fx.invert;
    if (needsPixels) {
      const imageData = outputCtx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const bayer = [
        0, 8, 2, 10,
        12, 4, 14, 6,
        3, 11, 1, 9,
        15, 7, 13, 5,
      ];
      let noiseState = (state.seed ^ hashString(layer.id)) >>> 0;
      const posterLevels = clamp(Math.round(fx.posterize), 2, 16);
      const posterStep = fx.posterize >= 2 ? 255 / (posterLevels - 1) : 0;
      const ditherStrength = clamp(fx.dither / 100, 0, 1);
      const noiseStrength = clamp(fx.noise / 100, 0, 1) * 110;

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = (y * width + x) * 4;
          let r = data[index];
          let g = data[index + 1];
          let b = data[index + 2];

          if (fx.posterize >= 2) {
            r = Math.round(r / posterStep) * posterStep;
            g = Math.round(g / posterStep) * posterStep;
            b = Math.round(b / posterStep) * posterStep;
          }

          if (fx.threshold > 0 || fx.dither > 0) {
            const luminance = r * 0.299 + g * 0.587 + b * 0.114;
            let threshold = fx.threshold > 0 ? fx.threshold : 128;
            if (fx.dither > 0) {
              const matrix = bayer[(x & 3) + ((y & 3) << 2)];
              threshold += (matrix - 7.5) * 10 * ditherStrength;
            }
            const mono = luminance >= threshold ? 255 : 0;
            r = mono;
            g = mono;
            b = mono;
          }

          if (fx.invert) {
            r = 255 - r;
            g = 255 - g;
            b = 255 - b;
          }

          if (fx.noise > 0) {
            noiseState = (Math.imul(noiseState, 1664525) + 1013904223) >>> 0;
            const noise = ((noiseState >>> 24) / 255 - 0.5) * noiseStrength;
            r += noise;
            g += noise;
            b += noise;
          }

          data[index] = clamp(r, 0, 255);
          data[index + 1] = clamp(g, 0, 255);
          data[index + 2] = clamp(b, 0, 255);
        }
      }

      if (fx.rgbSplit > 0) {
        const source = new Uint8ClampedArray(data);
        const shift = clamp(Math.round(fx.rgbSplit * qualityScale), 1, Math.round(width / 4));
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const index = (y * width + x) * 4;
            const redX = clamp(x - shift, 0, width - 1);
            const blueX = clamp(x + shift, 0, width - 1);
            data[index] = source[(y * width + redX) * 4];
            data[index + 2] = source[(y * width + blueX) * 4 + 2];
          }
        }
      }

      outputCtx.putImageData(imageData, 0, 0);
    }

    applyDatamosh(outputCtx, fx, width, height, qualityScale, layer.id);
    applyDatamoshFrame(outputCtx, fx, width, height, qualityScale, layer);

    if (fx.halftone > 0) {
      const sourceData = outputCtx.getImageData(0, 0, width, height).data;
      const cell = Math.max(3, Math.round(fx.halftone * qualityScale));
      outputCtx.clearRect(0, 0, width, height);
      outputCtx.fillStyle = '#f5f3ea';
      outputCtx.fillRect(0, 0, width, height);
      outputCtx.fillStyle = '#111111';
      for (let y = 0; y < height; y += cell) {
        for (let x = 0; x < width; x += cell) {
          const sampleX = clamp(x + Math.floor(cell / 2), 0, width - 1);
          const sampleY = clamp(y + Math.floor(cell / 2), 0, height - 1);
          const index = (sampleY * width + sampleX) * 4;
          const luminance = sourceData[index] * 0.299 + sourceData[index + 1] * 0.587 + sourceData[index + 2] * 0.114;
          const radius = (1 - luminance / 255) * cell * 0.58;
          if (radius > 0.25) {
            outputCtx.beginPath();
            outputCtx.arc(x + cell / 2, y + cell / 2, radius, 0, Math.PI * 2);
            outputCtx.fill();
          }
        }
      }
    }

    processedCache.set(cacheKey, output);
    if (processedCache.size > 80) {
      const firstKey = processedCache.keys().next().value;
      processedCache.delete(firstKey);
    }
    return output;
  }

  function drawSpacedText(context, text, x, y, tracking, align, fill, stroke, strokeWidth) {
    const chars = Array.from(text);
    const widths = chars.map((char) => context.measureText(char).width);
    const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, chars.length - 1) * tracking;
    let cursor = x;
    if (align === 'center') cursor -= total / 2;
    if (align === 'right') cursor -= total;

    chars.forEach((char, index) => {
      const width = widths[index];
      if (strokeWidth > 0) {
        context.lineWidth = strokeWidth;
        context.strokeStyle = stroke;
        context.strokeText(char, cursor, y);
      }
      context.fillStyle = fill;
      context.fillText(char, cursor, y);
      cursor += width + tracking;
    });
  }

  function drawTextLocal(context, layer) {
    const lines = String(layer.text || '').split('\n');
    const fontSize = Math.max(4, layer.fontSize || 64);
    const lineHeight = fontSize * (layer.lineHeight || 1);
    const totalHeight = lineHeight * lines.length;
    context.save();
    context.font = `${layer.fontWeight || 900} ${fontSize}px "${layer.fontFamily || 'Arial Black'}", Arial, sans-serif`;
    context.textBaseline = 'middle';
    context.textAlign = 'left';
    context.lineJoin = 'round';
    context.miterLimit = 2;
    lines.forEach((line, index) => {
      const y = -totalHeight / 2 + lineHeight * (index + 0.5);
      const align = layer.align || 'center';
      const x = align === 'left' ? -layer.w / 2 : align === 'right' ? layer.w / 2 : 0;
      drawSpacedText(
        context,
        line,
        x,
        y,
        layer.tracking || 0,
        align,
        layer.fill || '#111111',
        layer.stroke || '#ffffff',
        layer.strokeWidth || 0,
      );
    });
    context.restore();
  }

  function drawWindowLocal(context, layer) {
    const x = -layer.w / 2;
    const y = -layer.h / 2;
    const w = layer.w;
    const h = layer.h;
    const titleHeight = clamp(h * 0.18, 24, 34);
    const accent = layer.accent || '#173fbe';

    context.save();
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.fillRect(x + 8, y + 8, w, h);

    context.fillStyle = '#c7c7c7';
    context.fillRect(x, y, w, h);
    context.strokeStyle = '#111111';
    context.lineWidth = 2;
    context.strokeRect(x, y, w, h);

    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x + 2, y + h - 2);
    context.lineTo(x + 2, y + 2);
    context.lineTo(x + w - 2, y + 2);
    context.stroke();

    context.fillStyle = layer.windowStyle === 'acid' ? '#d7ff2f' : accent;
    context.fillRect(x + 5, y + 5, w - 10, titleHeight);

    context.fillStyle = layer.windowStyle === 'acid' ? '#111111' : '#ffffff';
    context.font = `700 ${Math.max(11, titleHeight * 0.42)}px Arial, sans-serif`;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(String(layer.title || 'WARNING').slice(0, 30), x + 12, y + 5 + titleHeight / 2);

    const buttonSize = titleHeight - 8;
    context.fillStyle = '#d4d4d4';
    context.fillRect(x + w - buttonSize - 8, y + 9, buttonSize, buttonSize);
    context.strokeStyle = '#111111';
    context.lineWidth = 1.5;
    context.strokeRect(x + w - buttonSize - 8, y + 9, buttonSize, buttonSize);
    context.beginPath();
    context.moveTo(x + w - buttonSize - 4, y + 13);
    context.lineTo(x + w - 12, y + 9 + buttonSize - 4);
    context.moveTo(x + w - 12, y + 13);
    context.lineTo(x + w - buttonSize - 4, y + 9 + buttonSize - 4);
    context.stroke();

    const bodyTop = y + 12 + titleHeight;
    context.fillStyle = '#111111';
    context.font = `${Math.max(10, h * 0.07)}px "Courier New", monospace`;
    context.textBaseline = 'top';
    const bodyLines = String(layer.body || '').split('\n').slice(0, 4);
    bodyLines.forEach((line, index) => {
      context.fillText(line.slice(0, 38), x + 14, bodyTop + index * Math.max(15, h * 0.085));
    });

    const okW = clamp(w * 0.23, 56, 86);
    const okH = clamp(h * 0.15, 22, 30);
    context.fillStyle = '#d4d4d4';
    context.fillRect(x + w - okW - 16, y + h - okH - 12, okW, okH);
    context.strokeStyle = '#111111';
    context.strokeRect(x + w - okW - 16, y + h - okH - 12, okW, okH);
    context.font = `700 ${Math.max(9, okH * 0.42)}px Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('OK', x + w - okW / 2 - 16, y + h - okH / 2 - 12);
    context.restore();
  }

  function roundRectPath(context, x, y, width, height, radius) {
    const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function drawShapeLocal(context, layer, instanceIndex = 0) {
    const w = layer.w;
    const h = layer.h;
    const x = -w / 2;
    const y = -h / 2;
    const fill = layer.fill || '#d7ff2f';
    const stroke = layer.stroke || '#111111';
    const strokeWidth = layer.strokeWidth || 0;
    context.save();
    context.fillStyle = fill;
    context.strokeStyle = stroke;
    context.lineWidth = strokeWidth;
    context.lineJoin = 'round';

    switch (layer.shapeType) {
      case 'circle':
        context.beginPath();
        context.ellipse(0, 0, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
        context.fill();
        if (strokeWidth > 0) context.stroke();
        break;
      case 'triangle':
        context.beginPath();
        context.moveTo(0, -h / 2);
        context.lineTo(w / 2, h / 2);
        context.lineTo(-w / 2, h / 2);
        context.closePath();
        context.fill();
        if (strokeWidth > 0) context.stroke();
        break;
      case 'arrow': {
        const shaftH = h * 0.34;
        const headW = w * 0.28;
        context.beginPath();
        context.moveTo(-w / 2, -shaftH / 2);
        context.lineTo(w / 2 - headW, -shaftH / 2);
        context.lineTo(w / 2 - headW, -h / 2);
        context.lineTo(w / 2, 0);
        context.lineTo(w / 2 - headW, h / 2);
        context.lineTo(w / 2 - headW, shaftH / 2);
        context.lineTo(-w / 2, shaftH / 2);
        context.closePath();
        context.fill();
        if (strokeWidth > 0) context.stroke();
        break;
      }
      case 'burst': {
        const points = clamp(Math.round(layer.sides || 12), 6, 30);
        const outer = Math.min(Math.abs(w), Math.abs(h)) / 2;
        const inner = outer * 0.45;
        context.beginPath();
        for (let i = 0; i < points * 2; i += 1) {
          const radius = i % 2 === 0 ? outer : inner;
          const angle = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
          const px = Math.cos(angle) * radius;
          const py = Math.sin(angle) * radius;
          if (i === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.closePath();
        context.fill();
        if (strokeWidth > 0) context.stroke();
        break;
      }
      case 'barcode': {
        context.fillStyle = fill;
        context.fillRect(x, y, w, h);
        const random = seededRandom(layer.id, instanceIndex, 'barcode');
        let cursor = x + w * 0.06;
        const end = x + w * 0.94;
        context.fillStyle = stroke;
        while (cursor < end) {
          const bar = lerp(1.5, Math.max(3, w * 0.05), random());
          const gap = lerp(1, Math.max(2, w * 0.018), random());
          context.fillRect(cursor, y + h * 0.1, bar, h * 0.72);
          cursor += bar + gap;
        }
        context.font = `700 ${Math.max(7, h * 0.08)}px "Courier New", monospace`;
        context.textAlign = 'center';
        context.textBaseline = 'bottom';
        context.fillText(String((hashString(layer.id) + instanceIndex) % 99999999).padStart(8, '0'), 0, y + h * 0.96);
        break;
      }
      case 'tape': {
        context.globalAlpha *= 0.78;
        roundRectPath(context, x, y, w, h, Math.max(2, h * 0.08));
        context.fill();
        context.save();
        context.globalAlpha *= 0.22;
        context.strokeStyle = stroke;
        context.lineWidth = Math.max(1, h * 0.03);
        for (let px = x - h; px < x + w + h; px += h * 0.35) {
          context.beginPath();
          context.moveTo(px, y + h);
          context.lineTo(px + h, y);
          context.stroke();
        }
        context.restore();
        break;
      }
      case 'line':
        context.strokeStyle = fill;
        context.lineWidth = Math.max(2, h);
        context.beginPath();
        context.moveTo(-w / 2, 0);
        context.lineTo(w / 2, 0);
        context.stroke();
        break;
      case 'rect':
      default:
        context.fillRect(x, y, w, h);
        if (strokeWidth > 0) context.strokeRect(x, y, w, h);
        break;
    }
    context.restore();
  }

  /* ---- 3D 爆裂碎片（shatter）：icosphere 爆炸 + 透视投影的纯 Canvas 软渲染 ---- */

  function hexToRgb(hex) {
    const raw = String(hex || '').trim().replace(/^#/, '');
    const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
    const num = parseInt(full.slice(0, 6), 16);
    if (Number.isNaN(num)) return { r: 17, g: 17, b: 17 };
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function mixRgb(a, b, t) {
    return `rgb(${Math.round(lerp(a.r, b.r, t))},${Math.round(lerp(a.g, b.g, t))},${Math.round(lerp(a.b, b.b, t))})`;
  }

  function normalize3(v) {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  function cross3(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function rotateAroundAxis(rel, axis, angle) {
    if (!angle) return rel;
    const [x, y, z] = rel;
    const [ax, ay, az] = axis;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dot = x * ax + y * ay + z * az;
    return [
      x * cos + (ay * z - az * y) * sin + ax * dot * (1 - cos),
      y * cos + (az * x - ax * z) * sin + ay * dot * (1 - cos),
      z * cos + (ax * y - ay * x) * sin + az * dot * (1 - cos),
    ];
  }

  function rotateTilt(p, tiltX, tiltY) {
    const cx = Math.cos(tiltX);
    const sx = Math.sin(tiltX);
    const cy = Math.cos(tiltY);
    const sy = Math.sin(tiltY);
    const y1 = p[1] * cx - p[2] * sx;
    const z1 = p[1] * sx + p[2] * cx;
    return [p[0] * cy + z1 * sy, y1, -p[0] * sy + z1 * cy];
  }

  function buildIcosphere(subdivisions) {
    const t = (1 + Math.sqrt(5)) / 2;
    const vertices = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map((v) => normalize3(v));
    let faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    for (let s = 0; s < subdivisions; s += 1) {
      const midCache = new Map();
      const midpoint = (a, b) => {
        const key = a < b ? a * 4096 + b : b * 4096 + a;
        let index = midCache.get(key);
        if (index !== undefined) return index;
        vertices.push(normalize3([
          (vertices[a][0] + vertices[b][0]) / 2,
          (vertices[a][1] + vertices[b][1]) / 2,
          (vertices[a][2] + vertices[b][2]) / 2,
        ]));
        index = vertices.length - 1;
        midCache.set(key, index);
        return index;
      };
      const next = [];
      faces.forEach(([a, b, c]) => {
        const ab = midpoint(a, b);
        const bc = midpoint(b, c);
        const ca = midpoint(c, a);
        next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      });
      faces = next;
    }
    return { vertices, faces };
  }

  function buildShatterGeometry(layer, params) {
    const key = [
      layer.id, state.seed, params.mode, params.density, params.explode,
      params.tumble, params.twist, params.scatter, params.spikes,
      params.jagged, params.spikeCount, params.spikeLen,
    ].join('|');
    const cached = shatterGeomCache.get(key);
    if (cached) return cached;

    const subdivisions = clamp(Math.round(params.density), 1, 4) - 1;
    const { vertices, faces } = buildIcosphere(subdivisions);
    const random = mulberry32((state.seed ^ hashString(layer.id) ^ 0x53485452) >>> 0);
    const explode = clamp(params.explode / 100, 0, 2);
    const tiltX = lerp(-0.3, 0.42, random());
    const tiltY = lerp(-0.55, 0.55, random());

    const items = [];
    let maxR = 1;

    const faceNormal = (pts) => normalize3(cross3(
      [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]],
      [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]],
    ));
    const pushFace = (pts, roll, refDir = null) => {
      const tilted = pts.map((p) => rotateTilt(p, tiltX, tiltY));
      tilted.forEach(([x, y, z]) => { maxR = Math.max(maxR, Math.hypot(x, y, z)); });
      let normal = faceNormal(tilted);
      if (refDir && normal[0] * refDir[0] + normal[1] * refDir[1] + normal[2] * refDir[2] < 0) {
        normal = [-normal[0], -normal[1], -normal[2]];
      }
      items.push({
        kind: 'face',
        pts: tilted,
        normal,
        z: (tilted[0][2] + tilted[1][2] + tilted[2][2]) / 3,
        roll,
      });
    };

    if (params.mode === 'spike') {
      /* 尖刺实体：共享顶点位移保持网格连体，随机面沿法线挤出成长尖刺 */
      const jag = clamp(params.jagged / 100, 0, 1) * 0.85;
      const displaced = vertices.map((v) => {
        const r = 1 + (random() * 2 - 1) * jag;
        return [v[0] * r, v[1] * r, v[2] * r];
      });
      const spikeProb = clamp(params.spikeCount / 100, 0, 1) * 0.55;
      const spikeLenMax = lerp(0.3, 1.6, clamp(params.spikeLen / 100, 0, 1));

      faces.forEach((face) => {
        const tri = face.map((index) => displaced[index]);
        const roll = random();
        if (random() < spikeProb) {
          const centroid = [
            (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
            (tri[0][1] + tri[1][1] + tri[2][1]) / 3,
            (tri[0][2] + tri[1][2] + tri[2][2]) / 3,
          ];
          const n = faceNormal(tri);
          const len = spikeLenMax * (0.35 + random() * 0.9);
          const apex = [
            centroid[0] + n[0] * len,
            centroid[1] + n[1] * len,
            centroid[2] + n[2] * len,
          ];
          pushFace([tri[0], tri[1], apex], roll, centroid);
          pushFace([tri[1], tri[2], apex], roll, centroid);
          pushFace([tri[2], tri[0], apex], roll, centroid);
        } else {
          pushFace(tri, roll, [
            (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
            (tri[0][1] + tri[1][1] + tri[2][1]) / 3,
            (tri[0][2] + tri[1][2] + tri[2][2]) / 3,
          ]);
        }
      });
    } else {
      const tumble = clamp(params.tumble / 100, 0, 1);
      const twist = clamp(params.twist / 100, 0, 1);
      const scatter = clamp(params.scatter / 100, 0, 1);

      faces.forEach((face) => {
        const tri = face.map((index) => vertices[index]);
        const centroid = [
          (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
          (tri[0][1] + tri[1][1] + tri[2][1]) / 3,
          (tri[0][2] + tri[1][2] + tri[2][2]) / 3,
        ];
        let normal = faceNormal(tri);
        if (normal[0] * centroid[0] + normal[1] * centroid[1] + normal[2] * centroid[2] < 0) {
          normal = [-normal[0], -normal[1], -normal[2]];
        }

        const push = explode * (0.12 + Math.pow(random(), 1.7) * 1.2);
        const drift = scatter * 0.42;
        const offset = [
          normal[0] * push + (random() * 2 - 1) * drift,
          normal[1] * push + (random() * 2 - 1) * drift,
          normal[2] * push + (random() * 2 - 1) * drift,
        ];
        const spin = (random() * 2 - 1) * tumble * Math.PI;
        const flipAxis = normalize3([random() * 2 - 1, random() * 2 - 1, random() * 2 - 1]);
        const flip = (random() * 2 - 1) * tumble * 1.25;
        const faceScale = lerp(0.55, 1.2, Math.pow(random(), 0.8));

        let pts = tri.map((v) => {
          let rel = [v[0] - centroid[0], v[1] - centroid[1], v[2] - centroid[2]];
          rel = rotateAroundAxis(rel, normal, spin);
          rel = rotateAroundAxis(rel, flipAxis, flip);
          return [
            centroid[0] + offset[0] + rel[0] * faceScale,
            centroid[1] + offset[1] + rel[1] * faceScale,
            centroid[2] + offset[2] + rel[2] * faceScale,
          ];
        });

        if (twist > 0) {
          const spiral = twist * push * 1.5;
          const cos = Math.cos(spiral);
          const sin = Math.sin(spiral);
          pts = pts.map(([x, y, z]) => [x * cos + z * sin, y, -x * sin + z * cos]);
        }

        pushFace(pts, random());
      });
    }

    const radialDrive = params.mode === 'spike' ? 0.55 : explode;
    const spikeCount = Math.round(clamp(params.spikes, 0, 100) * 0.9);
    for (let i = 0; i < spikeCount; i += 1) {
      const angle = random() * Math.PI * 2;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const r0 = 0.05 + random() * (0.16 + radialDrive * 0.12);
      const length = lerp(0.22, 1.05, Math.pow(random(), 0.62)) * (1 + radialDrive * 0.3);
      const halfWidth = length * lerp(0.006, 0.03, random());
      const zPlane = (random() * 2 - 1) * (0.5 + radialDrive * 0.35);
      const perpX = -dirY;
      const perpY = dirX;
      let pts = [
        [dirX * r0 + perpX * halfWidth, dirY * r0 + perpY * halfWidth, zPlane],
        [dirX * r0 - perpX * halfWidth, dirY * r0 - perpY * halfWidth, zPlane],
        [dirX * (r0 + length), dirY * (r0 + length), zPlane + (random() * 2 - 1) * 0.25],
      ];
      pts = pts.map((p) => rotateTilt(p, tiltX, tiltY));
      items.push({
        kind: 'spike',
        pts,
        z: (pts[0][2] + pts[1][2] + pts[2][2]) / 3,
        roll: random(),
        tint: random(),
      });
    }

    const geometry = { items, maxR };
    shatterGeomCache.set(key, geometry);
    if (shatterGeomCache.size > 24) shatterGeomCache.delete(shatterGeomCache.keys().next().value);
    return geometry;
  }

  function renderShatterToCanvas(output, layer, params, qualityScale) {
    const width = output.width;
    const height = output.height;
    const octx = output.getContext('2d');
    const geometry = buildShatterGeometry(layer, params);
    const items = geometry.items;
    const explode = clamp(params.explode / 100, 0, 2);
    const spikeMode = params.mode === 'spike';
    const camDist = spikeMode ? 3.4 : 2.7 + explode * 1.1;
    const scale = spikeMode
      ? (Math.min(width, height) / 2) * (0.92 / Math.max(geometry.maxR, 0.5))
      : (Math.min(width, height) / 2) * (0.8 / (1 + explode * 1.25));
    const cx = width / 2;
    const cy = height / 2;
    const light = normalize3([-0.42, -0.62, 0.85]);
    const gloss = clamp(params.gloss / 100, 0, 1);
    const shadePow = lerp(0.9, 3.4, gloss);
    const accentChance = clamp(params.accentRatio / 100, 0, 1);
    const body = hexToRgb(params.body);
    const highlight = hexToRgb(params.highlight);
    const accent = hexToRgb(params.accent);
    const lineWidth = Math.max(0.5, 0.7 * qualityScale);

    const project = ([x, y, z]) => {
      const persp = camDist / Math.max(camDist - z, 0.55);
      return [cx + x * scale * persp, cy - y * scale * persp];
    };

    const sorted = [...items].sort((a, b) => a.z - b.z);
    sorted.forEach((item) => {
      const a = project(item.pts[0]);
      const b = project(item.pts[1]);
      const c = project(item.pts[2]);
      octx.beginPath();
      octx.moveTo(a[0], a[1]);
      octx.lineTo(b[0], b[1]);
      octx.lineTo(c[0], c[1]);
      octx.closePath();

      let fill;
      if (item.roll < accentChance) {
        const dim = item.kind === 'face'
          ? 0.7 + clamp(
            (item.normal[0] * light[0] + item.normal[1] * light[1] + item.normal[2] * light[2]) * 0.5 + 0.5,
            0,
            1,
          ) * 0.42
          : 0.92;
        fill = `rgb(${Math.round(accent.r * dim)},${Math.round(accent.g * dim)},${Math.round(accent.b * dim)})`;
      } else if (item.kind === 'spike') {
        fill = item.tint < 0.62 ? mixRgb(body, highlight, 0.85) : mixRgb(body, highlight, 0.4);
      } else {
        const ndl = item.normal[0] * light[0] + item.normal[1] * light[1] + item.normal[2] * light[2];
        const bands = spikeMode ? Math.round(clamp(params.bands, 0, 8)) : 0;
        if (bands >= 2) {
          /* Y2K 硬边分阶光照 + 阈值化高光 */
          const banded = Math.floor(clamp(ndl, 0, 1) * bands + 0.0001) / bands;
          const reflectZ = 2 * ndl * item.normal[2] - light[2];
          const specRaw = Math.pow(clamp(reflectZ, 0, 1), lerp(6, 34, gloss));
          const t = specRaw > 0.3 ? 1 : Math.pow(banded, 1.35) * 0.95;
          fill = mixRgb(body, highlight, clamp(t, 0, 1));
        } else {
          const diffuse = clamp(ndl, 0, 1);
          const reflectZ = 2 * ndl * item.normal[2] - light[2];
          const spec = Math.pow(clamp(reflectZ, 0, 1), lerp(4, 30, gloss)) * 1.6;
          fill = mixRgb(body, highlight, clamp(Math.pow(diffuse, shadePow) * 0.9 + spec, 0, 1));
        }
      }
      octx.fillStyle = fill;
      octx.fill();
      if (params.wireframe) {
        octx.strokeStyle = params.wireColor;
        octx.globalAlpha = item.kind === 'spike' ? 0.16 : 0.3;
        octx.lineWidth = lineWidth;
        octx.stroke();
        octx.globalAlpha = 1;
      }
    });
  }

  function drawShatterLocal(context, layer, qualityScale = 1) {
    const params = { ...defaultShatter(), ...(layer.shatter || {}) };
    const width = clamp(Math.round(Math.abs(layer.w) * qualityScale), 2, 1800);
    const height = clamp(Math.round(Math.abs(layer.h) * qualityScale), 2, 1800);
    const cacheKey = [
      layer.id, layer.cacheVersion, state.seed, `${width}x${height}`,
      params.mode, params.density, params.explode, params.tumble, params.twist, params.scatter,
      params.jagged, params.spikeCount, params.spikeLen, params.bands,
      params.gloss, params.accentRatio, params.spikes,
      params.body, params.highlight, params.accent, params.wireframe, params.wireColor,
    ].join('|');
    let output = shatterCache.get(cacheKey);
    if (!output) {
      output = document.createElement('canvas');
      output.width = width;
      output.height = height;
      renderShatterToCanvas(output, layer, params, qualityScale);
      shatterCache.set(cacheKey, output);
      if (shatterCache.size > 10) shatterCache.delete(shatterCache.keys().next().value);
    }
    context.drawImage(output, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
  }

  function drawLayerLocal(context, layer, qualityScale, instanceIndex) {
    if (layer.type === 'image') {
      const processed = getProcessedImage(layer, qualityScale);
      if (processed) context.drawImage(processed, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
      else {
        context.fillStyle = '#2b2b31';
        context.fillRect(-layer.w / 2, -layer.h / 2, layer.w, layer.h);
        context.fillStyle = '#8f8f9b';
        context.font = '700 14px monospace';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('图片载入中', 0, 0);
      }
      return;
    }
    if (layer.type === 'text') {
      drawTextLocal(context, layer);
      return;
    }
    if (layer.type === 'window') {
      drawWindowLocal(context, layer);
      return;
    }
    if (layer.type === 'shatter') {
      drawShatterLocal(context, layer, qualityScale);
      return;
    }
    drawShapeLocal(context, layer, instanceIndex);
  }

  function drawRepeatedLayer(context, layer, qualityScale = 1) {
    if (!layer.visible) return;
    const repeat = { ...defaultRepeater(), ...(layer.repeater || {}) };
    const count = clamp(Math.round(repeat.count || 1), 1, 80);
    const layerSeed = hashString(layer.id) ^ state.seed;

    for (let index = count - 1; index >= 0; index -= 1) {
      const random = mulberry32((layerSeed + index * 2654435761) >>> 0);
      const jitterX = index === 0 ? 0 : (random() * 2 - 1) * (repeat.jitterX || 0);
      const jitterY = index === 0 ? 0 : (random() * 2 - 1) * (repeat.jitterY || 0);
      const jitterRotation = index === 0 ? 0 : (random() * 2 - 1) * (repeat.jitterRotation || 0);
      const scale = clamp(Math.pow(repeat.scaleStep || 1, index), 0.04, 12);
      const alpha = clamp((layer.opacity ?? 1) * Math.pow(repeat.opacityStep ?? 1, index), 0, 1);

      context.save();
      context.globalAlpha = alpha;
      context.globalCompositeOperation = layer.blend || 'source-over';
      context.translate(
        layer.x + index * (repeat.dx || 0) + jitterX,
        layer.y + index * (repeat.dy || 0) + jitterY,
      );
      context.rotate(((layer.rotation || 0) + index * (repeat.rotationStep || 0) + jitterRotation) * Math.PI / 180);
      context.scale(scale, scale);
      drawLayerLocal(context, layer, qualityScale, index);
      context.restore();
    }
  }

  function transformPoint(layer, localX, localY) {
    const angle = (layer.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: layer.x + localX * cos - localY * sin,
      y: layer.y + localX * sin + localY * cos,
    };
  }

  function inversePoint(layer, point) {
    const angle = -(layer.rotation || 0) * Math.PI / 180;
    const dx = point.x - layer.x;
    const dy = point.y - layer.y;
    return {
      x: dx * Math.cos(angle) - dy * Math.sin(angle),
      y: dx * Math.sin(angle) + dy * Math.cos(angle),
    };
  }

  function selectionHandles(layer) {
    const distance = 34 / Math.max(state.viewScale, 0.01);
    return {
      tl: transformPoint(layer, -layer.w / 2, -layer.h / 2),
      tr: transformPoint(layer, layer.w / 2, -layer.h / 2),
      br: transformPoint(layer, layer.w / 2, layer.h / 2),
      bl: transformPoint(layer, -layer.w / 2, layer.h / 2),
      rotate: transformPoint(layer, 0, -layer.h / 2 - distance),
      top: transformPoint(layer, 0, -layer.h / 2),
    };
  }

  function drawSelection(context, layer) {
    if (!layer || !layer.visible) return;
    const handles = selectionHandles(layer);
    const handleSize = 9 / Math.max(state.viewScale, 0.01);
    const lineWidth = 1.6 / Math.max(state.viewScale, 0.01);
    const corners = [handles.tl, handles.tr, handles.br, handles.bl];

    context.save();
    context.strokeStyle = '#d7ff2f';
    context.fillStyle = '#09090b';
    context.lineWidth = lineWidth;
    context.setLineDash([7 / state.viewScale, 4 / state.viewScale]);
    context.beginPath();
    context.moveTo(corners[0].x, corners[0].y);
    corners.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    context.stroke();
    context.setLineDash([]);

    context.beginPath();
    context.moveTo(handles.top.x, handles.top.y);
    context.lineTo(handles.rotate.x, handles.rotate.y);
    context.stroke();

    [...corners, handles.rotate].forEach((point, index) => {
      context.beginPath();
      if (index === 4) {
        context.arc(point.x, point.y, handleSize * 0.65, 0, Math.PI * 2);
      } else {
        context.rect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize);
      }
      context.fill();
      context.stroke();
    });

    const labelX = handles.tl.x;
    const labelY = handles.tl.y - 8 / state.viewScale;
    context.font = `700 ${10 / state.viewScale}px monospace`;
    const label = layer.name.slice(0, 24);
    const textW = context.measureText(label).width;
    context.fillStyle = '#d7ff2f';
    context.fillRect(labelX, labelY - 13 / state.viewScale, textW + 8 / state.viewScale, 15 / state.viewScale);
    context.fillStyle = '#111111';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(label, labelX + 4 / state.viewScale, labelY - 5.5 / state.viewScale);
    context.restore();
  }

  function renderScene(targetCtx = ctx, options = {}) {
    const qualityScale = options.qualityScale || 1;
    const includeSelection = options.includeSelection !== false;
    targetCtx.save();
    targetCtx.clearRect(0, 0, state.project.width, state.project.height);
    targetCtx.fillStyle = state.project.bg || '#f1eddf';
    targetCtx.fillRect(0, 0, state.project.width, state.project.height);
    state.layers.forEach((layer) => drawRepeatedLayer(targetCtx, layer, qualityScale));
    if (includeSelection && targetCtx === ctx) drawSelection(targetCtx, selectedLayer());
    targetCtx.restore();
  }

  function requestRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => {
      state.renderQueued = false;
      renderScene();
    });
  }

  const ICONS = {
    image: '<rect x="2" y="3" width="12" height="10" rx="1.6"/><circle cx="5.6" cy="6.4" r="1.1"/><path d="M2.6 11.8 5.8 9l2.3 2 2.2-2.4 3.1 3.2"/>',
    text: '<path d="M3.2 4.6V3.2h9.6v1.4M8 3.2v9.6M6 12.8h4"/>',
    window: '<rect x="2" y="3.4" width="12" height="9.4" rx="1.6"/><path d="M2 6h12"/><path d="M3.8 4.7h.01M5.6 4.7h.01"/>',
    shape: '<circle cx="5.6" cy="5.6" r="3.1"/><rect x="8.6" y="8.6" width="5" height="5" rx="1.1"/>',
    shatter: '<path d="M8 1.9l1.3 3.9 4.1-2.3-2.4 4 4 1.9-4.3 1 1.4 3.5L9 11.9 8 14.2 7 11.9l-3.1 2 1.4-3.5-4.3-1 4-1.9-2.4-4 4.1 2.3Z"/>',
    undo: '<path d="M2.8 6.8h6.4a3.9 3.9 0 0 1 0 7.8H6.4"/><path d="M5.6 3.8 2.6 6.8l3 3"/>',
    redo: '<path d="M13.2 6.8H6.8a3.9 3.9 0 0 0 0 7.8h2.8"/><path d="M10.4 3.8l3 3-3 3"/>',
    remix: '<path d="M2.2 4.6h2.6l6.4 6.8h2.6"/><path d="M2.2 11.4h2.6l1.7-1.8M13.8 4.6h-2.6l-1.7 1.8"/><path d="M11.9 2.7l1.9 1.9-1.9 1.9M11.9 9.5l1.9 1.9-1.9 1.9"/>',
    export: '<path d="M8 2.4v7.4"/><path d="M4.9 6.6 8 9.7l3.1-3.1"/><path d="M2.8 11v1.6a1.2 1.2 0 0 0 1.2 1.2h8a1.2 1.2 0 0 0 1.2-1.2V11"/>',
    eye: '<path d="M1.8 8S3.9 4.3 8 4.3 14.2 8 14.2 8 12.1 11.7 8 11.7 1.8 8 1.8 8Z"/><circle cx="8" cy="8" r="1.9"/>',
    eyeOff: '<path d="M3.1 3.1l9.8 9.8"/><path d="M6.2 4.8C6.8 4.5 7.4 4.3 8 4.3c4.1 0 6.2 3.7 6.2 3.7a12.6 12.6 0 0 1-1.7 2M3.6 5.7A12.9 12.9 0 0 0 1.8 8s2.1 3.7 6.2 3.7c.7 0 1.4-.1 2-.4"/>',
    duplicate: '<rect x="5.3" y="5.3" width="9.3" height="9.3" rx="1.4"/><path d="M2.7 10.7c-.7 0-1.4-.6-1.4-1.4V2.7c0-.8.7-1.4 1.4-1.4h6.6c.8 0 1.4.6 1.4 1.4"/>',
    trash: '<path d="M2.6 4.2h10.8"/><path d="M6.4 4.2V3.1a1 1 0 0 1 1-1h1.2a1 1 0 0 1 1 1v1.1"/><path d="M4.2 4.2l.5 8.2a1.1 1.1 0 0 0 1.1 1h4.4a1.1 1.1 0 0 0 1.1-1l.5-8.2"/><path d="M6.7 7v3.6M9.3 7v3.6"/>',
    front: '<path d="M8 13.2V6.2"/><path d="M5.2 9 8 6.2 10.8 9"/><path d="M3 2.8h10"/>',
    back: '<path d="M8 2.8v7"/><path d="M5.2 7 8 9.8l2.8-2.8"/><path d="M3 13.2h10"/>',
    grip: '<circle cx="6" cy="4.2" r="1.05"/><circle cx="10" cy="4.2" r="1.05"/><circle cx="6" cy="8" r="1.05"/><circle cx="10" cy="8" r="1.05"/><circle cx="6" cy="11.8" r="1.05"/><circle cx="10" cy="11.8" r="1.05"/>',
    chevron: '<path d="M4.4 6.2 8 9.8l3.6-3.6"/>',
    plus: '<path d="M8 3.2v9.6M3.2 8h9.6"/>',
  };

  function icon(name) {
    const body = ICONS[name] || '';
    const filled = name === 'grip';
    return `<svg class="icon" viewBox="0 0 16 16" ${filled ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${body}</svg>`;
  }

  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      el.innerHTML = icon(el.dataset.icon);
    });
  }

  /* custom dropdown: native <select> stays as the data source, a styled
     button + floating menu replaces its rendering */
  let openCsel = null;

  function closeCsel() {
    if (!openCsel) return;
    openCsel.menu.remove();
    openCsel.btn.classList.remove('open');
    openCsel.btn.setAttribute('aria-expanded', 'false');
    openCsel = null;
  }

  function enhanceSelects(root) {
    root.querySelectorAll('select.select-input').forEach((select) => {
      if (select.dataset.cselReady) return;
      select.dataset.cselReady = '1';
      const wrap = document.createElement('div');
      wrap.className = 'csel';
      select.parentNode.insertBefore(wrap, select);
      wrap.appendChild(select);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'csel-btn';
      btn.setAttribute('aria-haspopup', 'listbox');
      btn.setAttribute('aria-expanded', 'false');
      const label = document.createElement('span');
      label.textContent = select.options[select.selectedIndex]?.textContent || '';
      btn.append(label);
      btn.insertAdjacentHTML('beforeend', icon('chevron'));
      wrap.appendChild(btn);

      const openMenu = () => {
        closeCsel();
        const menu = document.createElement('div');
        menu.className = 'csel-menu';
        menu.setAttribute('role', 'listbox');
        [...select.options].forEach((option) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = `csel-option${option.selected ? ' selected' : ''}`;
          item.setAttribute('role', 'option');
          item.textContent = option.textContent;
          item.addEventListener('click', () => {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            label.textContent = option.textContent;
            closeCsel();
            btn.focus();
          });
          menu.appendChild(item);
        });
        document.body.appendChild(menu);
        const rect = btn.getBoundingClientRect();
        menu.style.minWidth = `${rect.width}px`;
        const menuHeight = Math.min(menu.offsetHeight, 238);
        menu.style.maxHeight = '238px';
        menu.style.left = `${Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8)}px`;
        const below = window.innerHeight - rect.bottom - 10;
        menu.style.top = below >= menuHeight || below >= rect.top - 10
          ? `${rect.bottom + 4}px`
          : `${rect.top - menuHeight - 4}px`;
        btn.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        openCsel = { btn, menu };
        menu.querySelector('.csel-option.selected')?.focus();

        menu.addEventListener('keydown', (event) => {
          const items = [...menu.querySelectorAll('.csel-option')];
          const index = items.indexOf(document.activeElement);
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            items[Math.min(index + 1, items.length - 1)]?.focus();
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            items[Math.max(index - 1, 0)]?.focus();
          }
          if (event.key === 'Escape') {
            closeCsel();
            btn.focus();
          }
        });
      };

      btn.addEventListener('click', () => {
        if (openCsel?.btn === btn) closeCsel();
        else openMenu();
      });
      btn.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          openMenu();
        }
      });
    });
  }

  function renderLayers() {
    if (!state.layers.length) {
      dom.layersList.innerHTML = '<div class="empty-inspector"><strong>空场景</strong><p>添加图片、文字、窗口或形状。</p></div>';
      return;
    }

    const iconMap = { image: 'image', text: 'text', window: 'window', shape: 'shape', shatter: 'shatter' };
    const typeMap = { image: '图像', text: '文字', window: '窗口', shape: '形状', shatter: '爆裂' };
    dom.layersList.innerHTML = [...state.layers].reverse().map((layer) => {
      const active = layer.id === state.selectedId ? ' active' : '';
      const hidden = layer.visible ? '' : ' hidden-layer';
      const repeat = Math.round(layer.repeater?.count || 1);
      return `
        <div class="layer-row${active}${hidden}" data-layer-id="${layer.id}" draggable="true">
          <span class="drag-grip" aria-hidden="true">${icon('grip')}</span>
          <button class="visibility-toggle" data-visibility-id="${layer.id}" title="${layer.visible ? '隐藏' : '显示'}">${icon(layer.visible ? 'eye' : 'eyeOff')}</button>
          <span class="layer-icon">${icon(iconMap[layer.type] || 'shape')}</span>
          <span class="layer-copy">
            <strong>${escapeHtml(layer.name)}</strong>
            <small>${typeMap[layer.type] || '图层'} · ${Math.round(layer.w)} × ${Math.round(layer.h)}</small>
          </span>
          ${repeat > 1 ? `<span class="repeat-badge">×${repeat}</span>` : ''}
        </div>`;
    }).join('');
  }

  function rangeControl(label, path, value, min, max, step = 1, unit = '', options = {}) {
    const scope = options.scope || 'layer';
    const invalidate = options.invalidate ? '1' : '0';
    return `
      <div class="control-row">
        <label>${escapeHtml(label)}</label>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${Number(value)}" data-path="${path}" data-scope="${scope}" data-kind="number" data-invalidate="${invalidate}">
        <input class="value-input" type="number" min="${min}" max="${max}" step="${step}" value="${Number(value)}" data-path="${path}" data-scope="${scope}" data-kind="number" data-invalidate="${invalidate}" title="${escapeHtml(unit)}">
      </div>`;
  }

  function textControl(label, path, value, options = {}) {
    const scope = options.scope || 'layer';
    const multiline = options.multiline;
    if (multiline) {
      return `
        <div class="control-group">
          <span class="control-label">${escapeHtml(label)}</span>
          <textarea class="textarea-input" data-path="${path}" data-scope="${scope}" data-kind="string">${escapeHtml(value ?? '')}</textarea>
        </div>`;
    }
    return `
      <div class="control-row compact">
        <label>${escapeHtml(label)}</label>
        <input class="text-input" type="text" value="${escapeHtml(value ?? '')}" data-path="${path}" data-scope="${scope}" data-kind="string">
      </div>`;
  }

  function colorControl(label, path, value, options = {}) {
    const scope = options.scope || 'layer';
    return `
      <div class="control-row compact">
        <label>${escapeHtml(label)}</label>
        <div class="color-pair">
          <input type="color" value="${escapeHtml(value || '#111111')}" data-path="${path}" data-scope="${scope}" data-kind="string">
          <input class="text-input" type="text" value="${escapeHtml(value || '#111111')}" data-path="${path}" data-scope="${scope}" data-kind="string">
        </div>
      </div>`;
  }

  function selectControl(label, path, value, choices, options = {}) {
    const scope = options.scope || 'layer';
    return `
      <div class="control-row compact">
        <label>${escapeHtml(label)}</label>
        <select class="select-input" data-path="${path}" data-scope="${scope}" data-kind="string" data-invalidate="${options.invalidate ? '1' : '0'}">
          ${choices.map(([choiceValue, choiceLabel]) => `<option value="${escapeHtml(choiceValue)}" ${choiceValue === value ? 'selected' : ''}>${escapeHtml(choiceLabel)}</option>`).join('')}
        </select>
      </div>`;
  }

  function checkboxControl(label, path, value, options = {}) {
    const scope = options.scope || 'layer';
    return `
      <label class="checkbox-row">
        <span>${escapeHtml(label)}</span>
        <input type="checkbox" ${value ? 'checked' : ''} data-path="${path}" data-scope="${scope}" data-kind="boolean" data-invalidate="${options.invalidate ? '1' : '0'}">
      </label>`;
  }

  const inspectorSectionState = {};

  function section(title, content, open = false) {
    const isOpen = inspectorSectionState[title] ?? open;
    return `<details ${isOpen ? 'open' : ''}><summary>${escapeHtml(title)}</summary><div class="control-group">${content}</div></details>`;
  }

  function effectGroup(title, note, tone = '') {
    return `<div class="fx-group-label ${escapeHtml(tone)}"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(note)}</span></div>`;
  }

  function syncRangeFill(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const pct = max > min ? ((Number(input.value) - min) / (max - min)) * 100 : 0;
    input.style.setProperty('--pct', `${pct}%`);
  }

  function renderInspector() {
    dom.inspector.querySelectorAll('details').forEach((details) => {
      const title = details.querySelector('summary')?.textContent;
      if (title) inspectorSectionState[title] = details.open;
    });
    const layer = selectedLayer();
    const typeNames = { image: '图像', text: '文字', window: '窗口', shape: '形状', shatter: '爆裂' };
    dom.selectedTypeBadge.textContent = layer ? (typeNames[layer.type] || layer.type.toUpperCase()) : '画布';

    if (!layer) {
      dom.inspector.innerHTML = `
        ${section('画布', `
          ${textControl('项目名', 'name', state.project.name, { scope: 'project' })}
          ${colorControl('背景色', 'bg', state.project.bg, { scope: 'project' })}
          <div class="control-row compact"><label>尺寸</label><input class="text-input" value="${state.project.width} × ${state.project.height}" disabled></div>
        `, true)}
        <div class="empty-inspector"><strong>未选中图层</strong><p>点击画布中的对象，或在左侧图层堆栈中选择。</p></div>`;
      return;
    }

    const general = [
      textControl('名称', 'name', layer.name),
      checkboxControl('可见', 'visible', layer.visible),
    ].join('');

    const transform = [
      rangeControl('X', 'x', Math.round(layer.x), -state.project.width, state.project.width * 2, 1),
      rangeControl('Y', 'y', Math.round(layer.y), -state.project.height, state.project.height * 2, 1),
      rangeControl('宽度', 'w', Math.round(layer.w), 10, state.project.width * 2, 1, 'px', { invalidate: layer.type === 'image' }),
      rangeControl('高度', 'h', Math.round(layer.h), 10, state.project.height * 2, 1, 'px', { invalidate: layer.type === 'image' }),
      rangeControl('旋转', 'rotation', Number(layer.rotation.toFixed(1)), -180, 180, 0.5, 'deg'),
    ].join('');

    const repeat = [
      rangeControl('数量', 'repeater.count', layer.repeater.count, 1, 60, 1),
      rangeControl('X 步进', 'repeater.dx', layer.repeater.dx, -160, 160, 1),
      rangeControl('Y 步进', 'repeater.dy', layer.repeater.dy, -160, 160, 1),
      rangeControl('缩放步进', 'repeater.scaleStep', layer.repeater.scaleStep, 0.72, 1.25, 0.01),
      rangeControl('旋转步进', 'repeater.rotationStep', layer.repeater.rotationStep, -45, 45, 0.5),
      rangeControl('渐隐步进', 'repeater.opacityStep', layer.repeater.opacityStep, 0.5, 1, 0.01),
      rangeControl('抖动 X', 'repeater.jitterX', layer.repeater.jitterX, 0, state.project.width * 0.6, 1),
      rangeControl('抖动 Y', 'repeater.jitterY', layer.repeater.jitterY, 0, state.project.height * 0.6, 1),
      rangeControl('抖动旋转', 'repeater.jitterRotation', layer.repeater.jitterRotation, 0, 180, 1),
    ].join('');

    const appearance = [
      rangeControl('不透明度', 'opacity', layer.opacity, 0, 1, 0.01),
      selectControl('混合模式', 'blend', layer.blend, [
        ['source-over', '正常'],
        ['multiply', '正片叠底'],
        ['screen', '滤色'],
        ['overlay', '叠加'],
        ['difference', '差值'],
        ['exclusion', '排除'],
        ['lighter', '线性减淡'],
        ['darken', '变暗'],
      ]),
    ].join('');

    let content = '';
    if (layer.type === 'text') {
      content = [
        textControl('内容', 'text', layer.text, { multiline: true }),
        rangeControl('字号', 'fontSize', layer.fontSize, 8, 360, 1),
        selectControl('字体', 'fontFamily', layer.fontFamily, [
          ['Arial Black', 'Arial Black'],
          ['Courier New', 'Courier New'],
          ['Times New Roman', 'Times New Roman'],
          ['Trebuchet MS', 'Trebuchet'],
          ['Georgia', 'Georgia'],
        ]),
        selectControl('对齐', 'align', layer.align, [['left', '左对齐'], ['center', '居中'], ['right', '右对齐']]),
        rangeControl('字距', 'tracking', layer.tracking, -12, 40, 0.5),
        rangeControl('行高', 'lineHeight', layer.lineHeight, 0.55, 2, 0.05),
        colorControl('填充色', 'fill', layer.fill),
        colorControl('描边色', 'stroke', layer.stroke),
        rangeControl('描边宽度', 'strokeWidth', layer.strokeWidth, 0, 24, 0.5),
      ].join('');
    }

    if (layer.type === 'window') {
      content = [
        textControl('标题', 'title', layer.title),
        textControl('内容', 'body', layer.body, { multiline: true }),
        colorControl('标题栏色', 'accent', layer.accent),
        selectControl('样式', 'windowStyle', layer.windowStyle, [['classic', '经典蓝'], ['acid', '酸性警报']]),
      ].join('');
    }

    if (layer.type === 'shape') {
      content = [
        selectControl('形状', 'shapeType', layer.shapeType, [
          ['rect', '矩形'],
          ['circle', '圆形'],
          ['triangle', '三角形'],
          ['arrow', '箭头'],
          ['burst', '爆裂形'],
          ['barcode', '条形码'],
          ['tape', '胶带'],
          ['line', '直线'],
        ]),
        colorControl('填充色', 'fill', layer.fill),
        colorControl('描边色', 'stroke', layer.stroke),
        rangeControl('描边宽度', 'strokeWidth', layer.strokeWidth, 0, 24, 0.5),
        layer.shapeType === 'burst' ? rangeControl('爆裂角数', 'sides', layer.sides || 12, 6, 30, 1) : '',
      ].join('');
    }

    if (layer.type === 'image') {
      content = [
        selectControl('填充方式', 'fit', layer.fit, [['cover', '铺满'], ['contain', '完整']], { invalidate: true }),
      ].join('');
    }

    if (layer.type === 'shatter') {
      const sh = { ...defaultShatter(), ...(layer.shatter || {}) };
      const modeControls = sh.mode === 'spike' ? [
        rangeControl('粗糙度', 'shatter.jagged', sh.jagged, 0, 100, 1, '%'),
        rangeControl('尖刺数量', 'shatter.spikeCount', sh.spikeCount, 0, 100, 1, '%'),
        rangeControl('尖刺长度', 'shatter.spikeLen', sh.spikeLen, 0, 100, 1, '%'),
        rangeControl('色阶分档', 'shatter.bands', sh.bands, 0, 8, 1),
      ] : [
        rangeControl('爆炸强度', 'shatter.explode', sh.explode, 0, 200, 1, '%'),
        rangeControl('翻滚', 'shatter.tumble', sh.tumble, 0, 100, 1, '%'),
        rangeControl('旋涡', 'shatter.twist', sh.twist, 0, 100, 1, '%'),
        rangeControl('随机漂移', 'shatter.scatter', sh.scatter, 0, 100, 1, '%'),
      ];
      content = [
        effectGroup('3D 爆裂 · SHATTER', '爆炸碎片或尖刺实体的透视定格，种子驱动', 'infected'),
        selectControl('形态', 'shatter.mode', sh.mode, [['burst', '爆裂碎片'], ['spike', '尖刺实体']]),
        rangeControl('细分密度', 'shatter.density', sh.density, 1, 4, 1),
        ...modeControls,
        rangeControl('高光锐度', 'shatter.gloss', sh.gloss, 0, 100, 1, '%'),
        rangeControl('点缀比例', 'shatter.accentRatio', sh.accentRatio, 0, 100, 1, '%'),
        rangeControl('飞刺数量', 'shatter.spikes', sh.spikes, 0, 100, 1),
        colorControl('主体色', 'shatter.body', sh.body),
        colorControl('高光色', 'shatter.highlight', sh.highlight),
        colorControl('点缀色', 'shatter.accent', sh.accent),
        checkboxControl('线框', 'shatter.wireframe', sh.wireframe),
        colorControl('线框色', 'shatter.wireColor', sh.wireColor),
      ].join('');
    }

    let fx = '';
    if (layer.type === 'image') {
      const frameSourceChoices = [
        ['', '自身 / 合成前帧'],
        ...state.layers
          .filter((candidate) => candidate.type === 'image' && candidate.id !== layer.id)
          .map((candidate) => [candidate.id, `图层：${candidate.name}`]),
      ];
      fx = [
        rangeControl('亮度', 'fx.brightness', layer.fx.brightness, 0, 220, 1, '%', { invalidate: true }),
        rangeControl('对比度', 'fx.contrast', layer.fx.contrast, 0, 260, 1, '%', { invalidate: true }),
        rangeControl('饱和度', 'fx.saturation', layer.fx.saturation, 0, 260, 1, '%', { invalidate: true }),
        rangeControl('模糊', 'fx.blur', layer.fx.blur, 0, 12, 0.25, 'px', { invalidate: true }),
        rangeControl('色调分离', 'fx.posterize', layer.fx.posterize, 0, 12, 1, '', { invalidate: true }),
        rangeControl('阈值', 'fx.threshold', layer.fx.threshold, 0, 255, 1, '', { invalidate: true }),
        rangeControl('抖动', 'fx.dither', layer.fx.dither, 0, 100, 1, '', { invalidate: true }),
        rangeControl('半调网点', 'fx.halftone', layer.fx.halftone, 0, 28, 1, '', { invalidate: true }),
        rangeControl('像素化', 'fx.pixelate', layer.fx.pixelate, 1, 40, 1, '', { invalidate: true }),
        effectGroup('区块故障 · BLOCK GLITCH', '行错位与 RGB 损伤，经典静态故障'),
        rangeControl('故障强度', 'fx.datamosh', layer.fx.datamosh, 0, 100, 1, '%', { invalidate: true }),
        rangeControl('块尺寸', 'fx.moshBlock', layer.fx.moshBlock, 4, 64, 1, 'px', { invalidate: true }),
        rangeControl('横向漂移', 'fx.moshDrift', layer.fx.moshDrift, 0, 180, 1, 'px', { invalidate: true }),
        effectGroup('DATAMOSH FRAME · 帧感染', '由宏块运动场搬运的前一帧幽灵', 'infected'),
        rangeControl('感染率', 'fx.frameMosh', layer.fx.frameMosh, 0, 100, 1, '%', { invalidate: true }),
        selectControl('前一帧', 'fx.frameMoshSourceId', layer.fx.frameMoshSourceId, frameSourceChoices, { invalidate: true }),
        rangeControl('矢量块', 'fx.frameMoshBlock', layer.fx.frameMoshBlock, 4, 48, 1, 'px', { invalidate: true }),
        rangeControl('运动携带', 'fx.frameMoshMotion', layer.fx.frameMoshMotion, 0, 260, 1, 'px', { invalidate: true }),
        rangeControl('流向角', 'fx.frameMoshAngle', layer.fx.frameMoshAngle, -180, 180, 1, 'deg', { invalidate: true }),
        rangeControl('保持度', 'fx.frameMoshPersistence', layer.fx.frameMoshPersistence, 0, 100, 1, '%', { invalidate: true }),
        rangeControl('RGB 分离', 'fx.rgbSplit', layer.fx.rgbSplit, 0, 40, 1, 'px', { invalidate: true }),
        rangeControl('噪点', 'fx.noise', layer.fx.noise, 0, 100, 1, '', { invalidate: true }),
        checkboxControl('反相', 'fx.invert', layer.fx.invert, { invalidate: true }),
      ].join('');
    }

    dom.inspector.innerHTML = [
      section('图层', general, true),
      section('变换', transform, true),
      section('散乱重复', repeat, true),
      section('外观', appearance, true),
      content ? section('内容', content, true) : '',
      fx ? section('图像效果', fx, true) : '',
      `<div class="inspector-actions">
        <button class="mini-button icon-action" data-inspector-action="duplicate" title="复制图层" aria-label="复制图层">${icon('duplicate')}</button>
        <button class="mini-button icon-action" data-inspector-action="remix-layer" title="随机此层" aria-label="随机此层">${icon('remix')}</button>
        <button class="mini-button icon-action" data-inspector-action="front" title="置顶" aria-label="置顶">${icon('front')}</button>
        <button class="mini-button icon-action" data-inspector-action="back" title="置底" aria-label="置底">${icon('back')}</button>
        <button class="mini-button icon-action danger" data-inspector-action="delete" title="删除图层" aria-label="删除图层">${icon('trash')}</button>
      </div>`,
    ].join('');
    dom.inspector.querySelectorAll('input[type="range"]').forEach(syncRangeFill);
    enhanceSelects(dom.inspector);
  }

  function updateInspectorControl(element) {
    const scope = element.dataset.scope === 'project' ? state.project : selectedLayer();
    if (!scope || !element.dataset.path) return;
    const path = element.dataset.path;
    let value;
    if (element.dataset.kind === 'boolean') value = element.checked;
    else if (element.dataset.kind === 'number') value = Number(element.value);
    else value = element.value;

    setByPath(scope, path, value);
    if (element.dataset.invalidate === '1' && selectedLayer()?.type === 'image') invalidateLayer(selectedLayer());

    dom.inspector.querySelectorAll('[data-path]').forEach((peer) => {
      if (peer === element || peer.dataset.path !== path || peer.dataset.scope !== element.dataset.scope) return;
      if (peer.dataset.kind === 'boolean') peer.checked = Boolean(value);
      else peer.value = value;
      if (peer.matches('input[type="range"]')) syncRangeFill(peer);
    });

    if (path === 'name' || path === 'visible' || path === 'repeater.count') renderLayers();
    if (element.dataset.scope === 'project' && path === 'name') dom.projectName.textContent = String(value).toUpperCase();
    requestRender();
  }

  function renderProjectMeta() {
    dom.projectName.textContent = state.project.name;
    dom.canvasSizeLabel.textContent = `${state.project.width} × ${state.project.height}`;
    dom.seedButton.textContent = String(state.seed);
    document.querySelectorAll('[data-format]').forEach((button) => {
      button.classList.toggle('active', button.dataset.format === state.project.format);
    });
  }

  function renderAll() {
    renderProjectMeta();
    renderLayers();
    renderInspector();
    requestRender();
    updateUndoButtons();
  }

  function resizeCanvasToProject() {
    canvas.width = state.project.width;
    canvas.height = state.project.height;
    fitCanvas();
  }

  function fitCanvas() {
    const rect = dom.stageViewport.getBoundingClientRect();
    const maxWidth = Math.max(120, rect.width - 48);
    const maxHeight = Math.max(120, rect.height - 48);
    const scale = Math.min(maxWidth / state.project.width, maxHeight / state.project.height);
    state.viewScale = scale;
    canvas.style.width = `${Math.round(state.project.width * scale)}px`;
    canvas.style.height = `${Math.round(state.project.height * scale)}px`;
    requestRender();
  }

  function addLayer(layer, options = {}) {
    const snapshot = options.remember === false ? null : serializeState();
    state.layers.push(normalizeLayer(layer));
    state.selectedId = layer.id;
    if (layer.type === 'image' && layer.imageSrc) ensureImage(layer.imageSrc).catch(() => {});
    if (snapshot) pushHistory(snapshot);
    renderAll();
  }

  async function addImage(src, name = '导入图片', options = {}) {
    try {
      const image = await ensureImage(src);
      const layer = createImageLayer(src, name);
      const maxW = state.project.width * 0.76;
      const maxH = state.project.height * 0.7;
      const scale = Math.min(maxW / image.naturalWidth, maxH / image.naturalHeight, 1.4);
      layer.w = Math.max(80, image.naturalWidth * scale);
      layer.h = Math.max(80, image.naturalHeight * scale);
      addLayer(layer, options);
      showToast('已添加图片');
    } catch (error) {
      showToast('图片加载失败');
    }
  }

  function addText() {
    const layer = createTextLayer('TYPE\nSOMETHING', '新文字');
    layer.x = state.project.width / 2;
    layer.y = state.project.height * 0.72;
    addLayer(layer);
  }

  function addWindow() {
    const layer = createWindowLayer('WARNING', 'Visual memory overflow.\nContinue rendering?');
    layer.x = state.project.width * 0.62;
    layer.y = state.project.height * 0.34;
    addLayer(layer);
  }

  function addShape(shapeType = 'rect') {
    const layer = createShapeLayer(shapeType, shapeType === 'barcode' ? '条形码' : shapeType === 'arrow' ? '箭头' : '新形状');
    layer.x = state.project.width / 2;
    layer.y = state.project.height / 2;
    if (shapeType === 'circle') layer.h = layer.w;
    if (shapeType === 'barcode') {
      layer.w = 230;
      layer.h = 100;
      layer.fill = '#f4f1e7';
      layer.stroke = '#111111';
    }
    if (shapeType === 'burst') {
      layer.w = 180;
      layer.h = 180;
      layer.fill = '#ff4ca7';
      layer.strokeWidth = 4;
    }
    if (shapeType === 'tape') {
      layer.fill = '#d7ff2f';
      layer.stroke = '#111111';
      layer.w = 360;
      layer.h = 70;
      layer.rotation = -8;
    }
    addLayer(layer);
  }

  function addConfetti() {
    const layer = createShapeLayer('triangle', '纸屑云');
    layer.w = 20;
    layer.h = 42;
    layer.fill = '#ff7a18';
    layer.strokeWidth = 0;
    layer.repeater = {
      ...defaultRepeater(),
      count: 34,
      dx: 0,
      dy: 0,
      scaleStep: 0.995,
      rotationStep: 7,
      opacityStep: 0.985,
      jitterX: state.project.width * 0.43,
      jitterY: state.project.height * 0.42,
      jitterRotation: 180,
    };
    addLayer(layer);
  }

  function addShatter(mode = 'burst') {
    const layer = createShatterLayer(mode === 'spike' ? '尖刺实体' : '爆裂碎片', mode);
    layer.x = state.project.width / 2;
    layer.y = state.project.height / 2;
    addLayer(layer);
  }

  function duplicateSelected() {
    const layer = selectedLayer();
    if (!layer) return;
    const snapshot = serializeState();
    const copy = deepCopy(layer);
    copy.id = uid(layer.type.slice(0, 2).toUpperCase());
    copy.name = `${layer.name} COPY`;
    copy.x += 24;
    copy.y += 24;
    copy.cacheVersion = 1;
    state.layers.push(copy);
    state.selectedId = copy.id;
    pushHistory(snapshot);
    renderAll();
  }

  function deleteSelected() {
    const layer = selectedLayer();
    if (!layer) return;
    const snapshot = serializeState();
    const index = state.layers.findIndex((item) => item.id === layer.id);
    state.layers.splice(index, 1);
    state.selectedId = state.layers[Math.min(index, state.layers.length - 1)]?.id || null;
    processedCache.clear();
    pushHistory(snapshot);
    renderAll();
  }

  function reorderLayer(draggedId, targetId, insertBefore) {
    if (draggedId === targetId) return;
    const visual = [...state.layers].reverse();
    const fromIndex = visual.findIndex((item) => item.id === draggedId);
    if (fromIndex === -1) return;
    const snapshot = serializeState();
    const [moved] = visual.splice(fromIndex, 1);
    let insertIndex = targetId ? visual.findIndex((item) => item.id === targetId) + (insertBefore ? 0 : 1) : visual.length;
    if (insertIndex < 0) insertIndex = visual.length;
    visual.splice(insertIndex, 0, moved);
    state.layers = visual.reverse();
    pushHistory(snapshot);
    renderAll();
  }

  /* per-format layout memory: switching formats is non-destructive —
     each format remembers its own last layout and restores it exactly */
  let formatLayouts = {};

  function setFormat(format) {
    const target = FORMATS[format];
    if (!target || (state.project.width === target.width && state.project.height === target.height)) return;
    const snapshot = serializeState();
    formatLayouts[state.project.format] = deepCopy(state.layers);
    const memorized = formatLayouts[format];
    if (memorized) {
      state.layers = memorized.map((layer) => normalizeLayer(deepCopy(layer)));
      if (!state.layers.some((layer) => layer.id === state.selectedId)) {
        state.selectedId = state.layers.at(-1)?.id || null;
      }
    } else {
      const sx = target.width / state.project.width;
      const sy = target.height / state.project.height;
      const uniform = Math.min(sx, sy);
      state.layers.forEach((layer) => {
        layer.x *= sx;
        layer.y *= sy;
        layer.w *= uniform;
        layer.h *= uniform;
        if (layer.type === 'image') invalidateLayer(layer);
      });
    }
    state.project.width = target.width;
    state.project.height = target.height;
    state.project.format = format;
    pushHistory(snapshot);
    resizeCanvasToProject();
    renderAll();
  }

  function clearProject(format = 'portrait') {
    const target = FORMATS[format] || FORMATS.portrait;
    formatLayouts = {};
    state.project = {
      name: 'UNTITLED_001',
      width: target.width,
      height: target.height,
      bg: '#f1eddf',
      format,
    };
    state.layers = [];
    state.selectedId = null;
    processedCache.clear();
    resizeCanvasToProject();
  }

  function addRecipeLayer(layer) {
    state.layers.push(normalizeLayer(layer));
    if (layer.type === 'image' && layer.imageSrc) ensureImage(layer.imageSrc).catch(() => {});
  }

  function applyRecipe(recipe, options = {}) {
    const snapshot = options.remember === false ? null : serializeState();
    processedCache.clear();

    if (recipe === 'blank') {
      clearProject('portrait');
      state.project.name = 'BLANK_POSTER';
      state.selectedId = null;
    }

    if (recipe === 'digital-garden') {
      clearProject('portrait');
      state.project.name = 'DIGITAL_GARDEN';
      state.project.bg = '#efeada';
      state.seed = 481516;

      if (SAMPLE_IMAGES[1]) {
        const background = createImageLayer(SAMPLE_IMAGES[1].src, 'GARDEN BACKGROUND');
        Object.assign(background, { x: 450, y: 505, w: 990, h: 930 });
        Object.assign(background.fx, { saturation: 132, contrast: 110, posterize: 7, noise: 4 });
        addRecipeLayer(background);
      }

      const acidBlock = createShapeLayer('rect', 'ACID BLOCK');
      Object.assign(acidBlock, { x: 164, y: 812, w: 320, h: 410, rotation: -7, fill: '#d7ff2f', blend: 'multiply', opacity: 0.82 });
      addRecipeLayer(acidBlock);

      if (SAMPLE_IMAGES[0]) {
        const inset = createImageLayer(SAMPLE_IMAGES[0].src, 'UI RUINS CUTOUT');
        Object.assign(inset, { x: 220, y: 735, w: 370, h: 450, rotation: -8, blend: 'screen' });
        Object.assign(inset.fx, { contrast: 128, saturation: 130, posterize: 5, rgbSplit: 4 });
        addRecipeLayer(inset);
      }

      const tape = createShapeLayer('line', 'BLACK SLASH');
      Object.assign(tape, { x: 640, y: 580, w: 640, h: 50, rotation: -23, fill: '#111111' });
      addRecipeLayer(tape);

      const windows = createWindowLayer('WARNING', 'Image data is leaking.\nContinue anyway?');
      Object.assign(windows, { x: 690, y: 220, w: 280, h: 170, rotation: 2, accent: '#163fbd' });
      windows.repeater = { ...defaultRepeater(), count: 7, dx: -19, dy: 22, scaleStep: 0.985, rotationStep: -0.7, opacityStep: 0.94 };
      addRecipeLayer(windows);

      const title = createTextLayer('SPRING\nERROR', 'SPRING ERROR');
      Object.assign(title, { x: 316, y: 940, w: 700, h: 230, rotation: -8, fontSize: 110, fill: '#111111', stroke: '#d7ff2f', strokeWidth: 5, tracking: -5, lineHeight: 0.76 });
      title.repeater = { ...defaultRepeater(), count: 3, dx: 8, dy: -7, scaleStep: 1, rotationStep: 0, opacityStep: 0.58 };
      addRecipeLayer(title);

      const arrow = createShapeLayer('arrow', 'CYAN ARROW');
      Object.assign(arrow, { x: 330, y: 625, w: 330, h: 90, rotation: -17, fill: '#20e3d1' });
      addRecipeLayer(arrow);

      const confetti = createShapeLayer('triangle', 'CONFETTI CLOUD');
      Object.assign(confetti, { x: 450, y: 530, w: 18, h: 43, fill: '#ff7a18', strokeWidth: 0 });
      confetti.repeater = { ...defaultRepeater(), count: 38, dx: 0, dy: 0, scaleStep: 0.996, rotationStep: 9, opacityStep: 0.988, jitterX: 425, jitterY: 520, jitterRotation: 180 };
      addRecipeLayer(confetti);

      const barcode = createShapeLayer('barcode', 'SIGNAL BARS');
      Object.assign(barcode, { x: 725, y: 835, w: 205, h: 96, rotation: 10, fill: '#f4f1e7', stroke: '#111111' });
      barcode.repeater = { ...defaultRepeater(), count: 3, dx: -35, dy: 24, scaleStep: 0.94, rotationStep: 4, opacityStep: 0.88 };
      addRecipeLayer(barcode);

      const footerBar = createShapeLayer('rect', 'FOOTER BAR');
      Object.assign(footerBar, { x: 667, y: 1042, w: 420, h: 68, rotation: 2, fill: '#111111' });
      addRecipeLayer(footerBar);

      const footer = createTextLayer('NO SIGNAL / STILL BLOOMING', 'FOOTER COPY');
      Object.assign(footer, { x: 667, y: 1042, w: 390, h: 60, rotation: 2, fontSize: 20, fontFamily: 'Courier New', fontWeight: 700, tracking: 2, fill: '#f4f1e7' });
      addRecipeLayer(footer);

      state.selectedId = title.id;
    }

    if (recipe === 'windows-hell') {
      clearProject('portrait');
      state.project.name = 'WINDOWS_HELL';
      state.project.bg = '#111111';
      state.seed = 950117;

      if (SAMPLE_IMAGES[0]) {
        const background = createImageLayer(SAMPLE_IMAGES[0].src, 'UI COLLAGE');
        Object.assign(background, { x: 450, y: 562.5, w: 830, h: 1110 });
        Object.assign(background.fx, { contrast: 132, saturation: 146, posterize: 6, noise: 6, rgbSplit: 3 });
        addRecipeLayer(background);
      }

      const slash = createShapeLayer('line', 'HARD SLASH');
      Object.assign(slash, { x: 480, y: 610, w: 1000, h: 72, rotation: -31, fill: '#111111' });
      addRecipeLayer(slash);

      const warning = createWindowLayer('WARNING', 'Unhandled visual exception.\nRetry / Abort / Ignore');
      Object.assign(warning, { x: 675, y: 215, w: 300, h: 175, accent: '#112fc4' });
      warning.repeater = { ...defaultRepeater(), count: 10, dx: -24, dy: 21, scaleStep: 0.99, rotationStep: 0.35, opacityStep: 0.95 };
      addRecipeLayer(warning);

      const type = createTextLayer('VOID', 'VOID TYPE');
      Object.assign(type, { x: 245, y: 880, w: 500, h: 320, rotation: -7, fontSize: 190, tracking: -12, fill: '#111111', stroke: '#d7ff2f', strokeWidth: 5, lineHeight: 0.8 });
      type.repeater = { ...defaultRepeater(), count: 3, dx: 11, dy: 0, opacityStep: 0.7 };
      addRecipeLayer(type);

      const energy = createTextLayer('START OVER / ENERGY', 'ENERGY LABEL');
      Object.assign(energy, { x: 495, y: 800, w: 620, h: 70, rotation: -5, fontSize: 29, fill: '#f4f1e7', stroke: '#111111', strokeWidth: 6, fontFamily: 'Arial Black' });
      energy.repeater = { ...defaultRepeater(), count: 4, dx: 20, dy: 14, rotationStep: -2, opacityStep: 0.9 };
      addRecipeLayer(energy);

      const barcode = createShapeLayer('barcode', 'PRODUCT DISPLAY');
      Object.assign(barcode, { x: 685, y: 960, w: 260, h: 116, rotation: -2, fill: '#f4f1e7', stroke: '#111111' });
      addRecipeLayer(barcode);

      const burst = createShapeLayer('burst', 'ALERT BURST');
      Object.assign(burst, { x: 150, y: 170, w: 170, h: 170, rotation: 10, fill: '#ff4ca7', stroke: '#111111', strokeWidth: 7, sides: 14 });
      addRecipeLayer(burst);

      state.selectedId = warning.id;
    }

    if (recipe === 'browser-crash') {
      clearProject('landscape');
      state.project.name = 'BROWSER_CRASH';
      state.project.bg = '#f3f3ed';
      state.seed = 202404;

      if (SAMPLE_IMAGES[2]) {
        const background = createImageLayer(SAMPLE_IMAGES[2].src, 'BROWSER FIELD');
        Object.assign(background, { x: 640, y: 360, w: 1280, h: 720 });
        Object.assign(background.fx, {
          contrast: 112,
          saturation: 118,
          posterize: 7,
          datamosh: 42,
          moshBlock: 14,
          moshDrift: 96,
          frameMosh: 56,
          frameMoshBlock: 12,
          frameMoshMotion: 84,
          frameMoshAngle: -7,
          frameMoshPersistence: 74,
          rgbSplit: 5,
          noise: 3,
        });
        addRecipeLayer(background);
      }

      const whiteBlock = createShapeLayer('rect', 'WHITE VOID');
      Object.assign(whiteBlock, { x: 230, y: 380, w: 400, h: 600, rotation: -7, fill: '#f4f1e7', opacity: 0.9 });
      addRecipeLayer(whiteBlock);

      const alert = createWindowLayer('DO YOU WANT TO CLOSE?', 'The page is still mutating.\nUnsaved pixels may be lost.');
      Object.assign(alert, { x: 355, y: 160, w: 300, h: 160, rotation: -3, accent: '#f2b600' });
      alert.repeater = { ...defaultRepeater(), count: 8, dx: 28, dy: 13, scaleStep: 1.01, rotationStep: 0.6, opacityStep: 0.93 };
      addRecipeLayer(alert);

      const word = createTextLayer('RENDER / ERROR', 'RENDER ERROR');
      Object.assign(word, { x: 625, y: 560, w: 940, h: 190, rotation: -9, fontSize: 116, tracking: -8, fill: '#ff7a18', stroke: '#111111', strokeWidth: 2 });
      word.repeater = { ...defaultRepeater(), count: 5, dx: 29, dy: -9, scaleStep: 0.98, rotationStep: 1.2, opacityStep: 0.78 };
      addRecipeLayer(word);

      const orbit = createShapeLayer('circle', 'ORANGE ORBIT');
      Object.assign(orbit, { x: 1080, y: 430, w: 120, h: 120, fill: '#ff7a18', stroke: '#f4f1e7', strokeWidth: 26, blend: 'multiply' });
      orbit.repeater = { ...defaultRepeater(), count: 4, dx: -210, dy: 70, scaleStep: 0.72, rotationStep: 0, opacityStep: 0.85 };
      addRecipeLayer(orbit);

      const stairs = createShapeLayer('barcode', 'BROWSER STAIRS');
      Object.assign(stairs, { x: 1040, y: 130, w: 260, h: 70, rotation: 0, fill: '#f4f1e7', stroke: '#111111' });
      stairs.repeater = { ...defaultRepeater(), count: 10, dx: 8, dy: -7, scaleStep: 0.96, rotationStep: 0, opacityStep: 0.93 };
      addRecipeLayer(stairs);

      const cyan = createShapeLayer('arrow', 'CYAN VECTOR');
      Object.assign(cyan, { x: 860, y: 290, w: 420, h: 84, rotation: 13, fill: '#20e3d1', blend: 'screen' });
      addRecipeLayer(cyan);

      state.selectedId = word.id;
    }

    if (recipe === 'xerox-punk') {
      clearProject('portrait');
      state.project.name = 'XEROX_PUNK';
      state.project.bg = '#f4f1e7';
      state.seed = 771903;

      if (SAMPLE_IMAGES[0]) {
        const background = createImageLayer(SAMPLE_IMAGES[0].src, 'XEROX SOURCE');
        Object.assign(background, { x: 450, y: 565, w: 850, h: 1090 });
        Object.assign(background.fx, { contrast: 175, saturation: 0, threshold: 150, noise: 24 });
        addRecipeLayer(background);
      }

      const acid = createShapeLayer('rect', 'ACID PLATE');
      Object.assign(acid, { x: 670, y: 785, w: 410, h: 280, rotation: -4, fill: '#d7ff2f', blend: 'multiply', opacity: 0.9 });
      addRecipeLayer(acid);

      const title = createTextLayer('START\nOVER', 'START OVER');
      Object.assign(title, { x: 340, y: 785, w: 700, h: 390, rotation: -10, fontSize: 188, tracking: -12, lineHeight: 0.66, fill: '#111111', stroke: '#f4f1e7', strokeWidth: 2 });
      title.repeater = { ...defaultRepeater(), count: 5, dx: 9, dy: 8, scaleStep: 0.99, rotationStep: 0.4, opacityStep: 0.72 };
      addRecipeLayer(title);

      const windows = createWindowLayer('ERROR', 'No clean copy exists.\nMake another bad decision.');
      Object.assign(windows, { x: 675, y: 220, w: 260, h: 150, rotation: 5, accent: '#111111', windowStyle: 'acid' });
      windows.repeater = { ...defaultRepeater(), count: 6, dx: -24, dy: 25, scaleStep: 0.98, rotationStep: -1.4, opacityStep: 0.9 };
      addRecipeLayer(windows);

      const barcode = createShapeLayer('barcode', 'DATA STRIP');
      Object.assign(barcode, { x: 280, y: 250, w: 300, h: 90, rotation: -7, fill: '#f4f1e7', stroke: '#111111' });
      barcode.repeater = { ...defaultRepeater(), count: 4, dx: 26, dy: 21, rotationStep: 2, opacityStep: 0.85 };
      addRecipeLayer(barcode);

      const arrow = createShapeLayer('arrow', 'EXIT ARROW');
      Object.assign(arrow, { x: 655, y: 980, w: 380, h: 100, rotation: -17, fill: '#ff4ca7', stroke: '#111111', strokeWidth: 5 });
      addRecipeLayer(arrow);

      state.selectedId = title.id;
    }

    if (snapshot) pushHistory(snapshot);
    resizeCanvasToProject();
    renderAll();
    showToast(`已载入 ${recipe.replaceAll('-', ' ').toUpperCase()}`);
  }

  function remixLayer(layer) {
    const random = seededRandom(layer.id, state.seed, 'layer-remix');
    layer.rotation = clamp(layer.rotation + lerp(-24, 24, random()), -180, 180);
    layer.x = clamp(layer.x + lerp(-state.project.width * 0.09, state.project.width * 0.09, random()), -layer.w, state.project.width + layer.w);
    layer.y = clamp(layer.y + lerp(-state.project.height * 0.09, state.project.height * 0.09, random()), -layer.h, state.project.height + layer.h);
    layer.repeater.dx = Math.round(lerp(-55, 55, random()));
    layer.repeater.dy = Math.round(lerp(-55, 55, random()));
    layer.repeater.rotationStep = Number(lerp(-8, 8, random()).toFixed(1));
    layer.repeater.jitterRotation = Math.round(lerp(0, 30, random()));
    if (layer.type === 'shape') layer.fill = PALETTE[Math.floor(random() * PALETTE.length)];
    if (layer.type === 'text') {
      layer.fill = PALETTE[Math.floor(random() * PALETTE.length)];
      layer.tracking = Number(lerp(-8, 12, random()).toFixed(1));
    }
    if (layer.type === 'window') layer.accent = PALETTE[Math.floor(random() * 5)];
    if (layer.type === 'shatter') {
      layer.shatter = { ...defaultShatter(), ...(layer.shatter || {}) };
      layer.shatter.explode = Math.round(lerp(30, 170, random()));
      layer.shatter.tumble = Math.round(lerp(10, 90, random()));
      layer.shatter.twist = Math.round(lerp(0, 80, random()));
      layer.shatter.scatter = Math.round(lerp(10, 70, random()));
      layer.shatter.spikes = Math.round(lerp(10, 90, random()));
      layer.shatter.accentRatio = Math.round(lerp(5, 45, random()));
      layer.shatter.jagged = Math.round(lerp(25, 85, random()));
      layer.shatter.spikeCount = Math.round(lerp(15, 75, random()));
      layer.shatter.spikeLen = Math.round(lerp(30, 90, random()));
      layer.shatter.bands = Math.round(lerp(2, 6, random()));
    }
    if (layer.type === 'image') {
      layer.fx.posterize = random() > 0.45 ? Math.round(lerp(3, 8, random())) : 0;
      layer.fx.datamosh = random() > 0.58 ? Math.round(lerp(18, 68, random())) : 0;
      layer.fx.moshBlock = Math.round(lerp(8, 28, random()));
      layer.fx.moshDrift = Math.round(lerp(24, 120, random()));
      layer.fx.frameMosh = random() > 0.64 ? Math.round(lerp(24, 68, random())) : 0;
      layer.fx.frameMoshBlock = Math.round(lerp(8, 24, random()));
      layer.fx.frameMoshMotion = Math.round(lerp(36, 150, random()));
      layer.fx.frameMoshAngle = Math.round(lerp(-28, 28, random()));
      layer.fx.frameMoshPersistence = Math.round(lerp(42, 84, random()));
      layer.fx.rgbSplit = Math.round(lerp(0, 12, random()));
      layer.fx.noise = Math.round(lerp(0, 18, random()));
      invalidateLayer(layer);
    }
  }

  function remixAll() {
    if (!state.layers.length) return;
    const snapshot = serializeState();
    state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
    state.layers.forEach((layer, index) => {
      if (index === 0 && layer.type === 'image' && layer.w >= state.project.width * 0.8) return;
      remixLayer(layer);
    });
    pushHistory(snapshot);
    renderAll();
    showToast(`随机种子 ${state.seed}`);
  }

  function reseed() {
    const snapshot = serializeState();
    state.seed = Math.floor(Math.random() * 999999999);
    processedCache.clear();
    pushHistory(snapshot);
    renderAll();
    showToast(`新种子 ${state.seed}`);
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function pointInLayer(layer, point) {
    const local = inversePoint(layer, point);
    return Math.abs(local.x) <= Math.abs(layer.w) / 2 && Math.abs(local.y) <= Math.abs(layer.h) / 2;
  }

  function hitLayer(point) {
    for (let index = state.layers.length - 1; index >= 0; index -= 1) {
      const layer = state.layers[index];
      if (layer.visible && pointInLayer(layer, point)) return layer;
    }
    return null;
  }

  function detectHandle(layer, point) {
    if (!layer) return null;
    const handles = selectionHandles(layer);
    const threshold = 14 / Math.max(state.viewScale, 0.01);
    for (const key of ['tl', 'tr', 'br', 'bl', 'rotate']) {
      const handle = handles[key];
      if (Math.hypot(point.x - handle.x, point.y - handle.y) <= threshold) return key;
    }
    return null;
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    const point = canvasPoint(event);
    const current = selectedLayer();
    const handle = detectHandle(current, point);
    let layer = current;
    let mode = handle === 'rotate' ? 'rotate' : handle ? 'resize' : 'move';

    if (!handle) {
      layer = hitLayer(point);
      if (!layer) {
        state.selectedId = null;
        renderAll();
        return;
      }
      state.selectedId = layer.id;
    }

    state.pointer = {
      id: event.pointerId,
      mode,
      handle,
      startPoint: point,
      startLayer: deepCopy(layer),
      snapshot: serializeState(),
      changed: false,
    };
    canvas.setPointerCapture(event.pointerId);
    renderAll();
    event.preventDefault();
  }

  function onPointerMove(event) {
    const point = canvasPoint(event);
    const pointer = state.pointer;
    const layer = selectedLayer();

    if (!pointer || pointer.id !== event.pointerId || !layer) {
      const handle = detectHandle(layer, point);
      if (handle === 'rotate') canvas.style.cursor = 'grab';
      else if (handle) canvas.style.cursor = 'nwse-resize';
      else canvas.style.cursor = hitLayer(point) ? 'move' : 'default';
      return;
    }

    pointer.changed = true;
    if (pointer.mode === 'move') {
      layer.x = pointer.startLayer.x + (point.x - pointer.startPoint.x);
      layer.y = pointer.startLayer.y + (point.y - pointer.startPoint.y);
    }

    if (pointer.mode === 'resize') {
      const local = inversePoint(pointer.startLayer, point);
      let width = Math.max(20, Math.abs(local.x) * 2);
      let height = Math.max(20, Math.abs(local.y) * 2);
      if (event.shiftKey) {
        const ratio = pointer.startLayer.w / pointer.startLayer.h;
        if (width / height > ratio) height = width / ratio;
        else width = height * ratio;
      }
      layer.w = width;
      layer.h = height;
      if (layer.type === 'image') invalidateLayer(layer);
    }

    if (pointer.mode === 'rotate') {
      const angle = Math.atan2(point.y - layer.y, point.x - layer.x) * 180 / Math.PI + 90;
      layer.rotation = event.shiftKey ? Math.round(angle / 15) * 15 : angle;
    }

    requestRender();
    event.preventDefault();
  }

  function onPointerUp(event) {
    const pointer = state.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (pointer.changed) pushHistory(pointer.snapshot);
    state.pointer = null;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Pointer may already be released.
    }
    renderAll();
  }

  function renderSampleAssets() {
    dom.sampleAssets.innerHTML = SAMPLE_IMAGES.map((sample, index) => `
      <button class="sample-card" data-sample-index="${index}" title="添加 ${escapeHtml(sample.name)}">
        <img src="${sample.src}" alt="${escapeHtml(sample.name)}">
        <span>+ ${escapeHtml(sample.name)}</span>
      </button>`).join('');
  }

  function readImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('请拖入图片文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => addImage(reader.result, file.name.replace(/\.[^.]+$/, '')).catch(() => {});
    reader.onerror = () => showToast('文件读取失败');
    reader.readAsDataURL(file);
  }

  async function exportPng() {
    dom.statusText.textContent = '正在导出';
    const scale = Number(dom.exportScaleSelect.value) || 1;
    await Promise.all(state.layers.filter((layer) => layer.type === 'image').map((layer) => ensureImage(layer.imageSrc).catch(() => null)));

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = state.project.width * scale;
    exportCanvas.height = state.project.height * scale;
    const exportCtx = exportCanvas.getContext('2d', { willReadFrequently: true });
    exportCtx.scale(scale, scale);
    renderScene(exportCtx, { includeSelection: false, qualityScale: scale });

    exportCanvas.toBlob((blob) => {
      if (!blob) {
        showToast('导出失败');
        dom.statusText.textContent = '就绪';
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${state.project.name.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-+|-+$/g, '') || 'chaos-collage'}-${scale}x.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      dom.statusText.textContent = '就绪';
      showToast(`已导出 PNG · ${scale}×`);
    }, 'image/png');
  }

  let toastTimer = null;
  function showToast(message) {
    clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add('visible');
    toastTimer = setTimeout(() => dom.toast.classList.remove('visible'), 1800);
  }

  function handleInspectorAction(action) {
    if (action === 'duplicate') duplicateSelected();
    if (action === 'delete') deleteSelected();
    if (action === 'front') {
      const layer = selectedLayer();
      if (!layer) return;
      const snapshot = serializeState();
      state.layers = state.layers.filter((item) => item.id !== layer.id);
      state.layers.push(layer);
      pushHistory(snapshot);
      renderAll();
    }
    if (action === 'back') {
      const layer = selectedLayer();
      if (!layer) return;
      const snapshot = serializeState();
      state.layers = state.layers.filter((item) => item.id !== layer.id);
      state.layers.unshift(layer);
      pushHistory(snapshot);
      renderAll();
    }
    if (action === 'remix-layer') {
      const layer = selectedLayer();
      if (!layer) return;
      const snapshot = serializeState();
      state.seed = (state.seed + 1) >>> 0;
      remixLayer(layer);
      pushHistory(snapshot);
      renderAll();
      showToast('已随机此层');
    }
  }

  function setupEvents() {
    document.querySelectorAll('.tab-button').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab-button').forEach((item) => item.classList.toggle('active', item === button));
        document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === button.dataset.tab));
      });
    });

    document.getElementById('importButton').addEventListener('click', () => dom.fileInput.click());
    document.getElementById('dropImportButton').addEventListener('click', () => dom.fileInput.click());
    document.getElementById('addTextButton').addEventListener('click', addText);
    document.getElementById('addWindowButton').addEventListener('click', addWindow);
    document.getElementById('addShapeButton').addEventListener('click', () => addShape('rect'));
    document.getElementById('duplicateButton').addEventListener('click', duplicateSelected);
    document.getElementById('undoButton').addEventListener('click', undo);
    document.getElementById('redoButton').addEventListener('click', redo);
    document.getElementById('remixButton').addEventListener('click', remixAll);
    document.getElementById('exportButton').addEventListener('click', exportPng);
    document.getElementById('fitButton').addEventListener('click', fitCanvas);
    dom.seedButton.addEventListener('click', reseed);

    dom.fileInput.addEventListener('change', () => {
      const [file] = dom.fileInput.files;
      readImageFile(file);
      dom.fileInput.value = '';
    });

    dom.layersList.addEventListener('click', (event) => {
      const visibility = event.target.closest('[data-visibility-id]');
      if (visibility) {
        event.stopPropagation();
        const layer = state.layers.find((item) => item.id === visibility.dataset.visibilityId);
        if (!layer) return;
        const snapshot = serializeState();
        layer.visible = !layer.visible;
        pushHistory(snapshot);
        renderAll();
        return;
      }
      const row = event.target.closest('[data-layer-id]');
      if (row) selectLayer(row.dataset.layerId);
    });

    let draggedLayerId = null;
    const clearDropIndicators = () => {
      dom.layersList.querySelectorAll('.drop-before, .drop-after, .dragging').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'dragging'));
    };

    dom.layersList.addEventListener('dragstart', (event) => {
      const row = event.target.closest('[data-layer-id]');
      if (!row) {
        event.preventDefault();
        return;
      }
      draggedLayerId = row.dataset.layerId;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggedLayerId);
      requestAnimationFrame(() => row.classList.add('dragging'));
    });

    dom.layersList.addEventListener('dragover', (event) => {
      if (!draggedLayerId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const row = event.target.closest('[data-layer-id]');
      clearDropIndicators();
      if (!row || row.dataset.layerId === draggedLayerId) return;
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      row.classList.add(before ? 'drop-before' : 'drop-after');
    });

    dom.layersList.addEventListener('dragleave', (event) => {
      if (!dom.layersList.contains(event.relatedTarget)) clearDropIndicators();
    });

    dom.layersList.addEventListener('drop', (event) => {
      if (!draggedLayerId) return;
      event.preventDefault();
      const row = event.target.closest('[data-layer-id]');
      const targetId = row && row.dataset.layerId !== draggedLayerId ? row.dataset.layerId : null;
      const insertBefore = row ? row.classList.contains('drop-before') : false;
      clearDropIndicators();
      reorderLayer(draggedLayerId, targetId, insertBefore);
      draggedLayerId = null;
    });

    dom.layersList.addEventListener('dragend', () => {
      draggedLayerId = null;
      clearDropIndicators();
    });

    dom.sampleAssets.addEventListener('click', (event) => {
      const card = event.target.closest('[data-sample-index]');
      if (!card) return;
      const sample = SAMPLE_IMAGES[Number(card.dataset.sampleIndex)];
      if (sample) addImage(sample.src, sample.name).catch(() => {});
    });

    document.getElementById('recipeGrid').addEventListener('click', (event) => {
      const card = event.target.closest('[data-recipe]');
      if (card) applyRecipe(card.dataset.recipe);
    });

    document.querySelector('.generator-grid').addEventListener('click', (event) => {
      const button = event.target.closest('[data-generator]');
      if (!button) return;
      const generator = button.dataset.generator;
      if (generator === 'window') addWindow();
      if (generator === 'barcode') addShape('barcode');
      if (generator === 'arrow') addShape('arrow');
      if (generator === 'burst') addShape('burst');
      if (generator === 'tape') addShape('tape');
      if (generator === 'confetti') addConfetti();
      if (generator === 'shatter') addShatter();
      if (generator === 'spike') addShatter('spike');
    });

    document.querySelectorAll('[data-format]').forEach((button) => {
      button.addEventListener('click', () => setFormat(button.dataset.format));
    });

    dom.inspector.addEventListener('pointerdown', (event) => {
      if (event.target.matches('input, select, textarea') && !state.controlSnapshot) state.controlSnapshot = serializeState();
    });
    dom.inspector.addEventListener('focusin', (event) => {
      if (event.target.matches('input, select, textarea') && !state.controlSnapshot) state.controlSnapshot = serializeState();
    });
    dom.inspector.addEventListener('input', (event) => {
      if (event.target.matches('[data-path]')) updateInspectorControl(event.target);
      if (event.target.matches('input[type="range"]')) syncRangeFill(event.target);
    });
    dom.inspector.addEventListener('change', (event) => {
      if (event.target.matches('[data-path]')) updateInspectorControl(event.target);
      if (state.controlSnapshot) {
        pushHistory(state.controlSnapshot);
        state.controlSnapshot = null;
      }
      renderInspector();
    });
    dom.inspector.addEventListener('click', (event) => {
      const button = event.target.closest('[data-inspector-action]');
      if (button) handleInspectorAction(button.dataset.inspectorAction);
    });

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    dom.stageViewport.addEventListener('dragenter', (event) => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      dom.dropOverlay.classList.add('visible');
    });
    dom.stageViewport.addEventListener('dragover', (event) => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    dom.stageViewport.addEventListener('dragleave', (event) => {
      if (!dom.stageViewport.contains(event.relatedTarget)) dom.dropOverlay.classList.remove('visible');
    });
    dom.stageViewport.addEventListener('drop', (event) => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      dom.dropOverlay.classList.remove('visible');
      const [file] = event.dataTransfer.files;
      readImageFile(file);
    });

    window.addEventListener('resize', fitCanvas);
    window.addEventListener('resize', closeCsel);
    document.addEventListener('mousedown', (event) => {
      if (openCsel && !openCsel.menu.contains(event.target) && !openCsel.btn.contains(event.target)) closeCsel();
    });
    window.addEventListener('scroll', (event) => {
      if (openCsel && !openCsel.menu.contains(event.target)) closeCsel();
    }, true);
    window.addEventListener('keydown', (event) => {
      const tag = document.activeElement?.tagName;
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable;
      const command = event.ctrlKey || event.metaKey;

      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (command && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (command && event.key.toLowerCase() === 'd' && !editing) {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if (editing) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelected();
      }
      if (event.key === 'Escape') selectLayer(null);
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        const layer = selectedLayer();
        if (!layer) return;
        event.preventDefault();
        const snapshot = serializeState();
        const amount = event.shiftKey ? 10 : 1;
        if (event.key === 'ArrowLeft') layer.x -= amount;
        if (event.key === 'ArrowRight') layer.x += amount;
        if (event.key === 'ArrowUp') layer.y -= amount;
        if (event.key === 'ArrowDown') layer.y += amount;
        pushHistory(snapshot);
        renderAll();
      }
    });
  }

  async function init() {
    dom.statusText.textContent = '正在载入示例';
    hydrateIcons();
    enhanceSelects(document);
    renderSampleAssets();
    setupEvents();
    await Promise.all(SAMPLE_IMAGES.map((sample) => ensureImage(sample.src).catch(() => null)));
    applyRecipe('digital-garden', { remember: false });
    state.history.length = 0;
    state.future.length = 0;
    updateUndoButtons();
    dom.statusText.textContent = '就绪';
    fitCanvas();
  }

  init().catch((error) => {
    console.error(error);
    dom.statusText.textContent = '初始化出错';
    clearProject('portrait');
    renderAll();
  });
})();
