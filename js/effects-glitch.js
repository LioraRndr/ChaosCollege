/* CHAOS.COLLAGE — glitch & distortion effects (registered into CC.effects).
   Block glitch and Datamosh Frame are ports of the approved 2026-09-30
   algorithms; seeds keep the same salts so identical inputs give identical pixels. */
(() => {
  'use strict';

  const CC = window.CC;
  const U = CC.util;
  const { clamp, lerp, makeCanvas, mulberry32, hashString } = U;
  const { register } = CC.effects;
  const { pixels, commit, lum, remap } = CC.effects.helpers;

  /* ---------------- Block glitch (legacy applyDatamosh) ---------------- */

  register({
    type: 'blockGlitch',
    name: '区块故障',
    cat: 'glitch',
    desc: '行错位与 RGB 损伤，经典静态故障',
    params: [
      { key: 'intensity', label: '故障强度', type: 'range', min: 0, max: 100, step: 1, def: 42, unit: '%' },
      { key: 'block', label: '块尺寸', type: 'range', min: 4, max: 64, step: 1, def: 16, unit: 'px' },
      { key: 'drift', label: '横向漂移', type: 'range', min: 0, max: 180, step: 1, def: 72, unit: 'px' },
    ],
    apply(canvas, context, p, env) {
      const width = canvas.width;
      const height = canvas.height;
      const intensity = clamp((Number(p.intensity) || 0) / 100, 0, 1);
      if (intensity <= 0) return;
      const qualityScale = env.q;
      const baseBlock = clamp(Math.round(Number(p.block) || 16), 4, 64);
      const block = clamp(Math.round(baseBlock * qualityScale), 4, Math.max(4, Math.min(width, height)));
      const maxDrift = clamp(Math.round((Number(p.drift) || 0) * qualityScale), 0, Math.max(0, width - 1));
      const imageData = context.getImageData(0, 0, width, height);
      const data = imageData.data;
      const source = new Uint8ClampedArray(data);
      const random = mulberry32((env.seed ^ hashString(env.layerId) ^ 0x6d6f7368) >>> 0);
      const rowChance = intensity * 0.86;
      const blockChance = 0.32 + intensity * 0.64;
      let motionX = 0;

      for (let blockY = 0; blockY < height; blockY += block) {
        if (random() > rowChance) {
          motionX = Math.round(motionX * 0.52);
          continue;
        }
        const rowHeight = Math.min(block, height - blockY);
        motionX = clamp(Math.round(motionX * 0.58 + (random() * 2 - 1) * maxDrift * (0.35 + intensity * 0.65)), -maxDrift, maxDrift);
        if (maxDrift > 0 && Math.abs(motionX) < Math.max(2, Math.round(block / 3))) {
          motionX = (random() < 0.5 ? -1 : 1) * Math.min(maxDrift, Math.max(2, Math.round(block / 2)));
        }
        const maxHoldBlocks = Math.max(1, Math.round(1 + intensity * 5));
        const holdY = random() < intensity * 0.72 ? block * (1 + Math.floor(random() * maxHoldBlocks)) : 0;

        for (let blockX = 0; blockX < width;) {
          const spanBlocks = 1 + Math.floor(random() * (2 + intensity * 6));
          const spanWidth = Math.min(width - blockX, block * spanBlocks);
          if (random() <= blockChance) {
            const localDrift = clamp(Math.round(motionX + (random() * 2 - 1) * maxDrift * 0.22), -maxDrift, maxDrift);
            const chromaDrift = clamp(Math.round(localDrift * (0.08 + intensity * 0.16)), -block * 2, block * 2);
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
                data[targetIndex] = source[(sourceY * width + redX) * 4];
                data[targetIndex + 1] = source[sourceIndex + 1];
                data[targetIndex + 2] = source[(sourceY * width + blueX) * 4 + 2];
                data[targetIndex + 3] = source[sourceIndex + 3];
              }
            }
          }
          blockX += spanWidth;
        }
      }
      context.putImageData(imageData, 0, 0);
    },
  });

  /* ---------------- Datamosh Frame (legacy applyDatamoshFrame) ---------------- */

  const FRAME_MOSH_BUFFER_BYTES = 16 * 1024 * 1024;
  const frameMoshBuffers = [];

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

  register({
    type: 'frameMosh',
    name: '帧感染 Datamosh',
    cat: 'glitch',
    desc: '局部卡帧、纹理黏连与累积拖坏（静态单帧）',
    params: [
      { key: 'infection', label: '感染率', type: 'range', min: 0, max: 100, step: 1, def: 72, unit: '%' },
      { key: 'source', label: '前一帧', type: 'layer', def: '', emptyLabel: '自身 / 卡帧反馈' },
      { key: 'block', label: '矢量块', type: 'range', min: 4, max: 48, step: 1, def: 14, unit: 'px' },
      { key: 'motion', label: '拖拽距离', type: 'range', min: 0, max: 260, step: 1, def: 120, unit: 'px' },
      { key: 'angle', label: '流向角', type: 'range', min: -180, max: 180, step: 1, def: 0, unit: '°' },
      { key: 'persistence', label: '卡帧累积', type: 'range', min: 0, max: 100, step: 1, def: 78, unit: '%' },
      { key: 'trails', label: '透明处拖尾叠加', type: 'bool', def: true },
    ],
    presets: [{ label: '套用卡帧拖坏', values: { infection: 72, source: '', block: 14, motion: 120, angle: 0, persistence: 78 } }],
    deps: (p) => (p.source ? [p.source] : []),
    apply(canvas, context, p, env) {
      const width = canvas.width;
      const height = canvas.height;
      const qualityScale = env.q;
      const strength = clamp((Number(p.infection) || 0) / 100, 0, 1);
      if (strength <= 0) return;
      const block = clamp(Math.round((Number(p.block) || 14) * qualityScale), 4, Math.max(4, Math.min(width, height)));
      const travel = clamp(Math.round((Number(p.motion) || 0) * qualityScale), 0, Math.max(width, height));
      const persistence = clamp((Number(p.persistence) || 0) / 100, 0, 1);
      const angle = ((Number(p.angle) || 0) * Math.PI) / 180;
      const donor = p.source && env.getDonor ? env.getDonor(p.source) : null;
      const donorImage = donor?.image || null;
      if (travel === 0 && !donorImage) return;

      /* The output stays untouched until the last pass, so it is already the
         immutable original frame. Only the two feedback buffers need copies. */
      const current = canvas;
      const buffers = getFrameMoshBuffers(width, height);
      const donorCtx = buffers[0].context;
      donorCtx.globalAlpha = 1;
      donorCtx.globalCompositeOperation = 'source-over';
      donorCtx.imageSmoothingEnabled = true;
      donorCtx.clearRect(0, 0, width, height);
      if (donorImage) {
        const fit = env.fitRect(donorImage.naturalWidth || donorImage.width, donorImage.naturalHeight || donorImage.height, width, height, donor.fit || 'cover');
        donorCtx.drawImage(donorImage, fit.x, fit.y, fit.width, fit.height);
      } else {
        donorCtx.drawImage(current, 0, 0);
      }

      const currentPixels = context.getImageData(0, 0, width, height).data;
      /* fully opaque self-feedback stays opaque in every pass, so drawing each
         tile replaces it completely without a separate clear operation */
      let opaqueFeedback = !donorImage;
      for (let i = 3; opaqueFeedback && i < currentPixels.length; i += 4) {
        if (currentPixels[i] !== 255) opaqueFeedback = false;
      }
      const fieldSeed = (env.seed ^ hashString(env.layerId) ^ 0x6672616d) >>> 0;
      const smooth = (value) => {
        const t = clamp(value, 0, 1);
        return t * t * (3 - 2 * t);
      };
      /* coherent patches keep neighbouring blocks moving together; hashing
         lattice coordinates (not consuming random numbers) lets 1× and 2× share a field */
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
      const luminanceAt = (pixelsData, x, y) => {
        const px = clamp(Math.round(x), 0, width - 1);
        const py = clamp(Math.round(y), 0, height - 1);
        const index = (py * width + px) * 4;
        return pixelsData[index] * 0.299 + pixelsData[index + 1] * 0.587 + pixelsData[index + 2] * 0.114;
      };

      const steps = 2 + Math.round(persistence * 12);
      const stepTravel = (travel * (0.25 + persistence * 1.75)) / steps;
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
      /* each pass reads the last damaged frame, never the frame being written;
         narrow source strips stretch trapped texture into opaque, glued ribbons */
      /* transparent layers (text, stickers) keep their shape and gain trails
         unless trails are off; opaque images never clear, so they are unaffected */
      const clearTiles = !opaqueFeedback && (p.trails === false || donorImage);
      for (let step = 0; step < steps; step += 1) {
        const nextCtx = next.context;
        nextCtx.globalAlpha = 1;
        nextCtx.imageSmoothingEnabled = false;
        nextCtx.globalCompositeOperation = 'copy';
        nextCtx.drawImage(current, 0, 0);
        nextCtx.globalCompositeOperation = 'source-over';
        for (const tile of tiles) {
          if (clearTiles) nextCtx.clearRect(tile.x, tile.y, tile.w, tile.h);
          nextCtx.drawImage(feedback.canvas, tile.sourceX, tile.sourceY, tile.sourceW, tile.sourceH, tile.x, tile.y, tile.w, tile.h);
        }
        [feedback, next] = [next, feedback];
      }
      context.save();
      context.globalCompositeOperation = 'copy';
      context.drawImage(feedback.canvas, 0, 0);
      context.restore();
      if (releaseBuffers) releaseFrameMoshBuffers();
    },
  });

  /* ---------------- RGB split ---------------- */

  register({
    type: 'rgbSplit',
    name: 'RGB 分离',
    cat: 'glitch',
    params: [
      { key: 'distance', label: '距离', type: 'range', min: 0, max: 80, step: 0.5, def: 6, unit: 'px' },
      { key: 'angle', label: '方向', type: 'range', min: -180, max: 180, step: 1, def: 0, unit: '°', when: (p) => p.mode === 'linear' },
      { key: 'mode', label: '方式', type: 'select', options: [['linear', '线性'], ['radial', '径向（镜头色差）']], def: 'linear' },
    ],
    pad: (p, q) => p.distance * q,
    apply(canvas, ctx, p, env) {
      const px = pixels(canvas);
      const { data, w, h } = px;
      const src = new Uint8ClampedArray(data);
      const d = p.distance * env.q;
      if (d <= 0) return;
      const angle = (p.angle * Math.PI) / 180;
      const dx = Math.cos(angle) * d;
      const dy = Math.sin(angle) * d;
      const cx = w / 2;
      const cy = h / 2;
      const k = d / Math.max(1, Math.max(w, h) / 2);
      const sample = (x, y, c) => {
        const sx = Math.round(x);
        const sy = Math.round(y);
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) return [0, 0];
        const i = (sy * w + sx) * 4;
        return [src[i + c], src[i + 3]];
      };
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          let red;
          let blue;
          if (p.mode === 'radial') {
            red = sample(cx + (x - cx) * (1 - k), cy + (y - cy) * (1 - k), 0);
            blue = sample(cx + (x - cx) * (1 + k), cy + (y - cy) * (1 + k), 2);
          } else {
            red = sample(x - dx, y - dy, 0);
            blue = sample(x + dx, y + dy, 2);
          }
          const green = src[i + 1];
          const ga = src[i + 3];
          const alpha = Math.max(red[1], ga, blue[1]);
          if (alpha === 0) {
            data[i + 3] = 0;
            continue;
          }
          /* un-premultiply each channel by its own coverage */
          data[i] = (red[0] * red[1]) / alpha;
          data[i + 1] = (green * ga) / alpha;
          data[i + 2] = (blue[0] * blue[1]) / alpha;
          data[i + 3] = alpha;
        }
      }
      commit(px);
    },
  });

  /* ---------------- Pixel sort ---------------- */

  register({
    type: 'pixelSort',
    name: '像素排序',
    cat: 'glitch',
    desc: '按亮度区间把像素排序成流淌条带',
    params: [
      { key: 'direction', label: '方向', type: 'select', options: [['vertical', '纵向'], ['horizontal', '横向']], def: 'vertical' },
      { key: 'low', label: '下限', type: 'range', min: 0, max: 255, step: 1, def: 70 },
      { key: 'high', label: '上限', type: 'range', min: 0, max: 255, step: 1, def: 220 },
      { key: 'key', label: '排序依据', type: 'select', options: [['brightness', '亮度'], ['hue', '色相'], ['saturation', '饱和度']], def: 'brightness' },
      { key: 'reverse', label: '倒序', type: 'bool', def: false },
      { key: 'maxRun', label: '最长段', type: 'range', min: 0, max: 1000, step: 1, def: 0, unit: 'px' },
    ],
    apply(canvas, ctx, p, env) {
      const px = pixels(canvas);
      const { data, w, h } = px;
      const vertical = p.direction === 'vertical';
      const lines = vertical ? w : h;
      const length = vertical ? h : w;
      const lo = Math.min(p.low, p.high);
      const hi = Math.max(p.low, p.high);
      const maxRun = p.maxRun > 0 ? Math.max(2, Math.round(p.maxRun * env.q)) : Infinity;
      const keyOf = (i) => {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (p.key === 'hue') return U.rgbToHsl(r, g, b).h / 360 * 255;
        if (p.key === 'saturation') return U.rgbToHsl(r, g, b).s * 255;
        return lum(r, g, b);
      };
      const run = [];
      const flush = (lineIndex) => {
        if (run.length < 2) {
          run.length = 0;
          return;
        }
        const items = run.map((pos) => {
          const i = vertical ? (pos * w + lineIndex) * 4 : (lineIndex * w + pos) * 4;
          return { key: keyOf(i), r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
        });
        items.sort((a, b) => (p.reverse ? b.key - a.key : a.key - b.key));
        run.forEach((pos, k) => {
          const i = vertical ? (pos * w + lineIndex) * 4 : (lineIndex * w + pos) * 4;
          data[i] = items[k].r;
          data[i + 1] = items[k].g;
          data[i + 2] = items[k].b;
          data[i + 3] = items[k].a;
        });
        run.length = 0;
      };
      for (let line = 0; line < lines; line += 1) {
        for (let pos = 0; pos < length; pos += 1) {
          const i = vertical ? (pos * w + line) * 4 : (line * w + pos) * 4;
          const l = lum(data[i], data[i + 1], data[i + 2]);
          if (data[i + 3] > 0 && l >= lo && l <= hi) {
            run.push(pos);
            if (run.length >= maxRun) flush(line);
          } else flush(line);
        }
        flush(line);
      }
      commit(px);
    },
  });

  /* ---------------- Slice shift ---------------- */

  register({
    type: 'sliceShift',
    name: '切片位移',
    cat: 'glitch',
    desc: '随机切条错位，可带色彩错开',
    params: [
      { key: 'count', label: '切片数', type: 'range', min: 2, max: 200, step: 1, def: 36 },
      { key: 'shift', label: '最大位移', type: 'range', min: 0, max: 500, step: 1, def: 60, unit: 'px' },
      { key: 'chance', label: '错位概率', type: 'range', min: 0, max: 100, step: 1, def: 45, unit: '%' },
      { key: 'direction', label: '方向', type: 'select', options: [['horizontal', '横向切条'], ['vertical', '纵向切条']], def: 'horizontal' },
      { key: 'chroma', label: '色彩错开', type: 'range', min: 0, max: 40, step: 1, def: 6, unit: 'px' },
      { key: 'wrap', label: '循环回绕', type: 'bool', def: true },
    ],
    apply(canvas, ctx, p, env) {
      const px = pixels(canvas);
      const { data, w, h } = px;
      const src = new Uint8ClampedArray(data);
      const random = env.rng('slices');
      const horizontal = p.direction === 'horizontal';
      const span = horizontal ? h : w;
      const across = horizontal ? w : h;
      const average = span / Math.max(2, p.count);
      let start = 0;
      while (start < span) {
        const size = Math.max(1, Math.round(average * (0.25 + random() * 1.5)));
        const end = Math.min(span, start + size);
        if (random() < p.chance / 100) {
          const offset = Math.round((random() * 2 - 1) * p.shift * env.q);
          const chroma = Math.round(p.chroma * env.q * (random() < 0.5 ? -1 : 1));
          for (let s = start; s < end; s += 1) {
            for (let a = 0; a < across; a += 1) {
              const read = (delta) => {
                let pos = a - offset - delta;
                if (p.wrap) pos = ((pos % across) + across) % across;
                else if (pos < 0 || pos >= across) return -1;
                return horizontal ? (s * w + pos) * 4 : (pos * w + s) * 4;
              };
              const i = horizontal ? (s * w + a) * 4 : (a * w + s) * 4;
              const ig = read(0);
              const ir = read(chroma);
              const ib = read(-chroma);
              data[i] = ir >= 0 ? src[ir] : 0;
              data[i + 1] = ig >= 0 ? src[ig + 1] : 0;
              data[i + 2] = ib >= 0 ? src[ib + 2] : 0;
              data[i + 3] = ig >= 0 ? Math.max(src[ig + 3], ir >= 0 ? src[ir + 3] : 0, ib >= 0 ? src[ib + 3] : 0) : 0;
            }
          }
        }
        start = end;
      }
      commit(px);
    },
  });

  /* ---------------- VHS ---------------- */

  register({
    type: 'vhs',
    name: 'VHS 录像带',
    cat: 'glitch',
    params: [
      { key: 'tracking', label: '跟踪错误', type: 'range', min: 0, max: 100, step: 1, def: 35, unit: '%' },
      { key: 'bleed', label: '色度溢出', type: 'range', min: 0, max: 100, step: 1, def: 45, unit: '%' },
      { key: 'shift', label: '色度偏移', type: 'range', min: 0, max: 30, step: 0.5, def: 4, unit: 'px' },
      { key: 'jitter', label: '行抖动', type: 'range', min: 0, max: 100, step: 1, def: 25, unit: '%' },
      { key: 'noise', label: '雪花噪点', type: 'range', min: 0, max: 100, step: 1, def: 25, unit: '%' },
    ],
    apply(canvas, ctx, p, env) {
      const px = pixels(canvas);
      const { data, w, h } = px;
      const random = env.rng('vhs');
      const Y = new Float32Array(w * h);
      const I = new Float32Array(w * h);
      const Q = new Float32Array(w * h);
      for (let i = 0, j = 0; j < Y.length; i += 4, j += 1) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        Y[j] = 0.299 * r + 0.587 * g + 0.114 * b;
        I[j] = 0.596 * r - 0.274 * g - 0.322 * b;
        Q[j] = 0.211 * r - 0.523 * g + 0.312 * b;
      }
      const radius = Math.round((p.bleed / 100) * 10 * env.q);
      if (radius > 0) {
        const blurRow = (plane) => {
          const row = new Float32Array(w);
          for (let y = 0; y < h; y += 1) {
            let sum = 0;
            const base = y * w;
            for (let x = -radius; x <= radius; x += 1) sum += plane[base + clamp(x, 0, w - 1)];
            for (let x = 0; x < w; x += 1) {
              row[x] = sum / (radius * 2 + 1);
              sum += plane[base + Math.min(w - 1, x + radius + 1)] - plane[base + Math.max(0, x - radius)];
            }
            plane.set(row, base);
          }
        };
        blurRow(I);
        blurRow(Q);
      }
      const bands = [];
      const bandCount = Math.round((p.tracking / 100) * 4);
      for (let b = 0; b < bandCount; b += 1) {
        const center = random() * h;
        bands.push({ center, size: (8 + random() * 40) * env.q, offset: (random() * 2 - 1) * 30 * env.q });
      }
      const shift = Math.round(p.shift * env.q);
      const jitterAmp = (p.jitter / 100) * 4 * env.q;
      const noiseAmp = (p.noise / 100) * 90;
      const out = new Uint8ClampedArray(data);
      for (let y = 0; y < h; y += 1) {
        let lineOffset = (random() * 2 - 1) * jitterAmp;
        let bandNoise = 0;
        for (const band of bands) {
          const d = Math.abs(y - band.center);
          if (d < band.size) {
            const t = 1 - d / band.size;
            lineOffset += band.offset * t * t;
            bandNoise = Math.max(bandNoise, t);
          }
        }
        const offset = Math.round(lineOffset);
        for (let x = 0; x < w; x += 1) {
          const sx = clamp(x - offset, 0, w - 1);
          const cxs = clamp(sx - shift, 0, w - 1);
          const j = y * w + sx;
          const jc = y * w + cxs;
          let yy = Y[j] + (random() - 0.5) * noiseAmp;
          if (bandNoise > 0 && random() < bandNoise * 0.35) yy += random() * 160 * bandNoise;
          const ii = I[jc];
          const qq = Q[jc];
          const i = (y * w + x) * 4;
          out[i] = yy + 0.956 * ii + 0.621 * qq;
          out[i + 1] = yy - 0.272 * ii - 0.647 * qq;
          out[i + 2] = yy - 1.106 * ii + 1.703 * qq;
          out[i + 3] = data[(y * w + sx) * 4 + 3];
        }
      }
      data.set(out);
      commit(px);
    },
  });

  /* ---------------- Smear / pixel stretch ---------------- */

  register({
    type: 'smear',
    name: '像素拉伸',
    cat: 'glitch',
    desc: '取一行 / 一列像素拉满到边缘',
    params: [
      { key: 'position', label: '位置', type: 'range', min: 0, max: 100, step: 0.5, def: 55, unit: '%' },
      { key: 'direction', label: '拉向', type: 'select', options: [['right', '向右'], ['left', '向左'], ['down', '向下'], ['up', '向上']], def: 'right' },
      { key: 'amount', label: '覆盖', type: 'range', min: 0, max: 100, step: 1, def: 100, unit: '%' },
    ],
    apply(canvas, ctx, p) {
      const w = canvas.width;
      const h = canvas.height;
      const source = U.cloneCanvas(canvas);
      ctx.globalAlpha = p.amount / 100;
      ctx.imageSmoothingEnabled = false;
      if (p.direction === 'right' || p.direction === 'left') {
        const x = clamp(Math.round((p.position / 100) * (w - 1)), 0, w - 1);
        if (p.direction === 'right') ctx.drawImage(source, x, 0, 1, h, x, 0, w - x, h);
        else ctx.drawImage(source, x, 0, 1, h, 0, 0, x + 1, h);
      } else {
        const y = clamp(Math.round((p.position / 100) * (h - 1)), 0, h - 1);
        if (p.direction === 'down') ctx.drawImage(source, 0, y, w, 1, 0, y, w, h - y);
        else ctx.drawImage(source, 0, y, w, 1, 0, 0, w, y + 1);
      }
    },
  });

  /* ---------------- Melt / drip ---------------- */

  register({
    type: 'melt',
    name: '熔化滴落',
    cat: 'glitch',
    params: [
      { key: 'length', label: '滴落长度', type: 'range', min: 0, max: 800, step: 1, def: 140, unit: 'px' },
      { key: 'threshold', label: '亮度阈值', type: 'range', min: 0, max: 255, step: 1, def: 150 },
      { key: 'source', label: '滴落部分', type: 'select', options: [['bright', '亮部'], ['dark', '暗部']], def: 'bright' },
      { key: 'chance', label: '密度', type: 'range', min: 0, max: 100, step: 1, def: 35, unit: '%' },
      { key: 'direction', label: '方向', type: 'select', options: [['down', '向下'], ['up', '向上']], def: 'down' },
    ],
    apply(canvas, ctx, p, env) {
      const px = pixels(canvas);
      const { data, w, h } = px;
      const src = new Uint8ClampedArray(data);
      const random = env.rng('melt');
      const maxLength = p.length * env.q;
      const down = p.direction === 'down';
      for (let x = 0; x < w; x += 1) {
        const columnChance = (p.chance / 100) * (0.4 + random() * 0.6);
        let remaining = 0;
        let held = null;
        for (let k = 0; k < h; k += 1) {
          const y = down ? k : h - 1 - k;
          const i = (y * w + x) * 4;
          const l = lum(src[i], src[i + 1], src[i + 2]);
          const qualifies = src[i + 3] > 0 && (p.source === 'bright' ? l >= p.threshold : l <= p.threshold);
          if (remaining > 0 && held) {
            const fade = remaining / held.length;
            data[i] = lerp(src[i], held.r, Math.min(1, fade * 1.4));
            data[i + 1] = lerp(src[i + 1], held.g, Math.min(1, fade * 1.4));
            data[i + 2] = lerp(src[i + 2], held.b, Math.min(1, fade * 1.4));
            data[i + 3] = Math.max(src[i + 3], held.a * Math.min(1, fade * 1.4));
            remaining -= 1;
          }
          if (qualifies && remaining <= 0 && random() < columnChance * 0.08) {
            const length = Math.round(maxLength * (0.2 + random() * 0.8));
            held = { r: src[i], g: src[i + 1], b: src[i + 2], a: src[i + 3], length };
            remaining = length;
          }
        }
      }
      commit(px);
    },
  });

  /* ---------------- distortions ---------------- */

  register({
    type: 'wave',
    name: '波浪 / 涟漪',
    cat: 'distort',
    params: [
      { key: 'mode', label: '方式', type: 'select', options: [['horizontal', '横向波'], ['vertical', '纵向波'], ['both', '双向'], ['ripple', '同心涟漪']], def: 'horizontal' },
      { key: 'shape', label: '波形', type: 'select', options: [['sine', '正弦'], ['triangle', '三角'], ['square', '方波'], ['noise', '噪声']], def: 'sine' },
      { key: 'amplitude', label: '振幅', type: 'range', min: 0, max: 200, step: 0.5, def: 16, unit: 'px' },
      { key: 'wavelength', label: '波长', type: 'range', min: 4, max: 1200, step: 1, def: 120, unit: 'px' },
      { key: 'phase', label: '相位', type: 'range', min: 0, max: 360, step: 1, def: 0, unit: '°' },
    ],
    apply(canvas, ctx, p, env) {
      const amp = p.amplitude * env.q;
      const length = Math.max(2, p.wavelength * env.q);
      const phase = (p.phase * Math.PI) / 180;
      const noise = U.makeNoise2D((env.seed ^ 0x3a7e) >>> 0);
      const wave = (t, salt = 0) => {
        const x = (t / length) * Math.PI * 2 + phase;
        switch (p.shape) {
          case 'triangle':
            return (2 / Math.PI) * Math.asin(Math.sin(x));
          case 'square':
            return Math.sin(x) >= 0 ? 1 : -1;
          case 'noise':
            return (noise(t / length * 2, salt) - 0.5) * 2;
          default:
            return Math.sin(x);
        }
      };
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      remap(canvas, (x, y, out) => {
        out[0] = x;
        out[1] = y;
        if (p.mode === 'horizontal' || p.mode === 'both') out[0] = x + wave(y, 0.5) * amp;
        if (p.mode === 'vertical' || p.mode === 'both') out[1] = y + wave(x, 7.5) * amp;
        if (p.mode === 'ripple') {
          const dx = x - cx;
          const dy = y - cy;
          const d = Math.hypot(dx, dy) || 1;
          const offset = wave(d) * amp;
          out[0] = x + (dx / d) * offset;
          out[1] = y + (dy / d) * offset;
        }
      }, { edge: 'clamp' });
    },
  });

  register({
    type: 'twirl',
    name: '旋涡 / 膨胀',
    cat: 'distort',
    params: [
      { key: 'angle', label: '旋转', type: 'range', min: -1080, max: 1080, step: 1, def: 180, unit: '°' },
      { key: 'bulge', label: '膨胀 / 收缩', type: 'range', min: -100, max: 100, step: 1, def: 0, unit: '%' },
      { key: 'radius', label: '半径', type: 'range', min: 5, max: 150, step: 1, def: 80, unit: '%' },
      { key: 'cx', label: '中心 X', type: 'range', min: 0, max: 100, step: 0.5, def: 50, unit: '%' },
      { key: 'cy', label: '中心 Y', type: 'range', min: 0, max: 100, step: 0.5, def: 50, unit: '%' },
    ],
    apply(canvas, ctx, p) {
      const w = canvas.width;
      const h = canvas.height;
      const cx = (p.cx / 100) * w;
      const cy = (p.cy / 100) * h;
      const R = (Math.min(w, h) / 2) * (p.radius / 100);
      const twist = (p.angle * Math.PI) / 180;
      const bulge = p.bulge / 100;
      remap(canvas, (x, y, out) => {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy);
        if (d >= R || R <= 0) {
          out[0] = x;
          out[1] = y;
          return;
        }
        const t = 1 - d / R;
        const a = twist * t * t;
        /* bulge magnifies the center (sample nearer to it); pinch samples farther out */
        const sd = bulge >= 0 ? Math.pow(d / R, bulge * 0.9) : 1 + -bulge * t * t * 0.9;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const rx = (dx * cos - dy * sin) * sd;
        const ry = (dx * sin + dy * cos) * sd;
        out[0] = cx + rx;
        out[1] = cy + ry;
      }, { edge: 'clamp' });
    },
  });

  register({
    type: 'displace',
    name: '液化置换',
    cat: 'distort',
    desc: '噪声场把像素推挤成流体',
    params: [
      { key: 'amount', label: '强度', type: 'range', min: 0, max: 300, step: 1, def: 40, unit: 'px' },
      { key: 'scale', label: '尺度', type: 'range', min: 5, max: 1200, step: 1, def: 220, unit: 'px' },
      { key: 'octaves', label: '细节层数', type: 'range', min: 1, max: 6, step: 1, def: 3 },
      { key: 'mode', label: '方式', type: 'select', options: [['smooth', '流体'], ['turbulent', '湍流'], ['stripes', '条纹拉扯']], def: 'smooth' },
    ],
    apply(canvas, ctx, p, env) {
      const amount = p.amount * env.q;
      const scale = 1 / Math.max(2, p.scale * env.q);
      const nx = U.makeNoise2D((env.seed ^ U.hashString(env.layerId) ^ 0xd15) >>> 0);
      const ny = U.makeNoise2D((env.seed ^ U.hashString(env.layerId) ^ 0xd16) >>> 0);
      const octaves = clamp(Math.round(p.octaves), 1, 6);
      remap(canvas, (x, y, out) => {
        let vx = U.fbm(nx, x * scale, y * scale, octaves) - 0.5;
        let vy = U.fbm(ny, x * scale, y * scale, octaves) - 0.5;
        if (p.mode === 'turbulent') {
          vx = Math.abs(vx) * 2 - 0.25;
          vy = Math.abs(vy) * 2 - 0.25;
        }
        if (p.mode === 'stripes') {
          vy = 0;
          vx = U.fbm(nx, 0.5, y * scale * 3, octaves) - 0.5;
        }
        out[0] = x + vx * amount * 2;
        out[1] = y + vy * amount * 2;
      }, { edge: 'clamp' });
    },
  });

  register({
    type: 'mirror',
    name: '镜像 / 万花筒',
    cat: 'distort',
    params: [
      { key: 'mode', label: '方式', type: 'select', options: [['lr', '左 → 右'], ['rl', '右 → 左'], ['tb', '上 → 下'], ['bt', '下 → 上'], ['quad', '四象限'], ['kaleido', '万花筒']], def: 'lr' },
      { key: 'segments', label: '分瓣', type: 'range', min: 2, max: 24, step: 1, def: 6, when: (p) => p.mode === 'kaleido' },
      { key: 'rotate', label: '旋转', type: 'range', min: 0, max: 360, step: 1, def: 0, unit: '°', when: (p) => p.mode === 'kaleido' },
    ],
    apply(canvas, ctx, p) {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const segment = (Math.PI * 2) / Math.max(2, p.segments);
      const rotate = (p.rotate * Math.PI) / 180;
      remap(canvas, (x, y, out) => {
        out[0] = x;
        out[1] = y;
        switch (p.mode) {
          case 'lr':
            if (x > cx) out[0] = w - x;
            break;
          case 'rl':
            if (x < cx) out[0] = w - x;
            break;
          case 'tb':
            if (y > cy) out[1] = h - y;
            break;
          case 'bt':
            if (y < cy) out[1] = h - y;
            break;
          case 'quad':
            if (x > cx) out[0] = w - x;
            if (y > cy) out[1] = h - y;
            break;
          case 'kaleido': {
            const dx = x - cx;
            const dy = y - cy;
            const r = Math.hypot(dx, dy);
            let a = Math.atan2(dy, dx) - rotate;
            a = ((a % segment) + segment) % segment;
            if (a > segment / 2) a = segment - a;
            a += rotate;
            out[0] = cx + Math.cos(a) * r;
            out[1] = cy + Math.sin(a) * r;
            break;
          }
          default:
            break;
        }
      }, { edge: 'clamp' });
    },
  });

  register({
    type: 'tile',
    name: '平铺重复',
    cat: 'distort',
    params: [
      { key: 'cols', label: '列数', type: 'range', min: 1, max: 16, step: 1, def: 3 },
      { key: 'rows', label: '行数', type: 'range', min: 1, max: 16, step: 1, def: 3 },
      { key: 'gap', label: '间隙', type: 'range', min: 0, max: 60, step: 1, def: 0, unit: 'px' },
      { key: 'brick', label: '错位', type: 'range', min: 0, max: 100, step: 1, def: 0, unit: '%' },
      { key: 'mirror', label: '交替镜像', type: 'bool', def: false },
    ],
    apply(canvas, ctx, p, env) {
      const w = canvas.width;
      const h = canvas.height;
      const source = U.cloneCanvas(canvas);
      const cols = Math.max(1, Math.round(p.cols));
      const rows = Math.max(1, Math.round(p.rows));
      const gap = p.gap * env.q;
      const cw = (w - gap * (cols - 1)) / cols;
      const ch = (h - gap * (rows - 1)) / rows;
      if (cw <= 1 || ch <= 1) return;
      ctx.clearRect(0, 0, w, h);
      for (let row = 0; row < rows; row += 1) {
        const shift = row % 2 ? (p.brick / 100) * (cw + gap) : 0;
        for (let col = -1; col <= cols; col += 1) {
          const x = col * (cw + gap) + shift;
          const y = row * (ch + gap);
          if (x > w || x + cw < 0) continue;
          ctx.save();
          ctx.translate(x + cw / 2, y + ch / 2);
          if (p.mirror) ctx.scale(col % 2 ? -1 : 1, row % 2 ? -1 : 1);
          ctx.drawImage(source, -cw / 2, -ch / 2, cw, ch);
          ctx.restore();
        }
      }
    },
  });
})();
