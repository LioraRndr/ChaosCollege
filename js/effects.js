/* CHAOS.COLLAGE — effect stack (CC.effects)
   Every layer can carry an ordered list of effects { id, type, on, p }.
   Effects run on the layer raster (local space, quality scale env.q) in order.
   This file holds the registry, shared pixel helpers and the color / print /
   light / stylize effects. Glitch & distortion effects live in effects-glitch.js. */
(() => {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const U = CC.util;
  const { clamp, lerp, makeCanvas, hexToRgb, buildRamp } = U;

  const registry = new Map();
  const CATEGORIES = [
    ['color', '调色'],
    ['print', '印刷 / 像素'],
    ['glitch', '故障'],
    ['distort', '扭曲'],
    ['light', '光效 / 材质'],
    ['stylize', '风格化'],
  ];

  function register(def) {
    registry.set(def.type, def);
  }

  function get(type) {
    return registry.get(type) || null;
  }

  function list() {
    return [...registry.values()];
  }

  function defaults(type) {
    const def = get(type);
    const values = {};
    (def?.params || []).forEach((param) => {
      values[param.key] = Array.isArray(param.def) ? [...param.def] : param.def;
    });
    return values;
  }

  function create(type, overrides = {}) {
    return { id: U.uid('FX'), type, on: true, p: { ...defaults(type), ...overrides } };
  }

  function normalize(effect) {
    const def = get(effect?.type);
    if (!def) return null;
    return { id: effect.id || U.uid('FX'), type: effect.type, on: effect.on !== false, p: { ...defaults(effect.type), ...(effect.p || {}) } };
  }

  function padFor(effects, q) {
    let pad = 0;
    (effects || []).forEach((effect) => {
      if (!effect.on) return;
      const def = get(effect.type);
      if (def?.pad) pad = Math.max(pad, def.pad(effect.p, q));
    });
    return Math.ceil(pad);
  }

  function applyStack(canvas, effects, env) {
    (effects || []).forEach((effect, index) => {
      if (!effect.on) return;
      const def = get(effect.type);
      if (!def) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.save();
      try {
        def.apply(canvas, ctx, { ...defaults(effect.type), ...effect.p }, { ...env, effectIndex: index, rng: (...salt) => U.rng(env.seed, env.layerId, effect.id, ...salt) });
      } catch (error) {
        console.error(`effect ${effect.type} failed`, error);
      }
      ctx.restore();
    });
  }

  /* ---------- pixel helpers ---------- */

  function pixels(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { ctx, img, data: img.data, w: canvas.width, h: canvas.height };
  }

  function commit(px) {
    px.ctx.putImageData(px.img, 0, 0);
  }

  function lum(r, g, b) {
    return r * 0.299 + g * 0.587 + b * 0.114;
  }

  function filtered(canvas, filter) {
    const out = makeCanvas(canvas.width, canvas.height);
    const ctx = out.getContext('2d');
    ctx.filter = filter;
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
    return out;
  }

  function replaceWith(canvas, source, filter = 'none') {
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'copy';
    ctx.globalAlpha = 1;
    ctx.filter = filter;
    ctx.drawImage(source, 0, 0);
    ctx.restore();
  }

  function hasTransparency(data) {
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
    return false;
  }

  /* bilinear remap: fn(x, y, out) writes the source coordinate for pixel center (x, y) */
  function remap(canvas, fn, { edge = 'transparent' } = {}) {
    const px = pixels(canvas);
    const { data, w, h } = px;
    const src = new Uint8ClampedArray(data);
    const out = [0, 0];
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        fn(x + 0.5, y + 0.5, out);
        let sx = out[0] - 0.5;
        let sy = out[1] - 0.5;
        const index = (y * w + x) * 4;
        if (edge === 'wrap') {
          sx = ((sx % w) + w) % w;
          sy = ((sy % h) + h) % h;
        } else if (edge === 'clamp') {
          sx = clamp(sx, 0, w - 1);
          sy = clamp(sy, 0, h - 1);
        } else if (sx < -1 || sy < -1 || sx > w || sy > h) {
          data[index] = 0;
          data[index + 1] = 0;
          data[index + 2] = 0;
          data[index + 3] = 0;
          continue;
        }
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const fx = sx - x0;
        const fy = sy - y0;
        const xa = clamp(x0, 0, w - 1);
        const xb = edge === 'wrap' ? (x0 + 1) % w : clamp(x0 + 1, 0, w - 1);
        const ya = clamp(y0, 0, h - 1);
        const yb = edge === 'wrap' ? (y0 + 1) % h : clamp(y0 + 1, 0, h - 1);
        const i00 = (ya * w + xa) * 4;
        const i10 = (ya * w + xb) * 4;
        const i01 = (yb * w + xa) * 4;
        const i11 = (yb * w + xb) * 4;
        for (let c = 0; c < 4; c += 1) {
          const top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * fx;
          const bottom = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * fx;
          data[index + c] = top + (bottom - top) * fy;
        }
      }
    }
    commit(px);
  }

  /* ---------- palettes ---------- */

  const RAMPS = {
    chrome: [[0, '#0a0a12'], [0.25, '#4a5160'], [0.45, '#f7f9ff'], [0.55, '#8a93a6'], [0.75, '#e6ebf5'], [1, '#ffffff']],
    acid: [[0, '#0b0b0b'], [0.5, '#3d6b00'], [1, '#d7ff2f']],
    vapor: [[0, '#1a0b3b'], [0.35, '#ff4ca7'], [0.7, '#20e3d1'], [1, '#f6f7ff']],
    infrared: [[0, '#1b0033'], [0.4, '#ff1f6e'], [0.7, '#ffd166'], [1, '#fffbe6']],
    thermal: [[0, '#000010'], [0.2, '#2a00a0'], [0.45, '#d4007a'], [0.7, '#ff8a00'], [0.9, '#ffef3a'], [1, '#ffffff']],
    gameboy: [[0, '#0f380f'], [0.33, '#306230'], [0.66, '#8bac0f'], [1, '#9bbc0f']],
    sepia: [[0, '#1a0f08'], [0.5, '#8a5a2b'], [1, '#f6e7c8']],
    cyber: [[0, '#05010f'], [0.4, '#3265ff'], [0.75, '#20e3d1'], [1, '#eafffb']],
    holo: [[0, '#7b5cff'], [0.2, '#4cc9ff'], [0.4, '#7dffb3'], [0.6, '#fff47d'], [0.8, '#ff8ad8'], [1, '#c7b8ff']],
    riso: [[0, '#1d2c8f'], [0.5, '#ff48b0'], [1, '#fff5e1']],
    blood: [[0, '#070000'], [0.45, '#7a0010'], [0.8, '#ff2a2a'], [1, '#ffe2d6']],
    mint: [[0, '#06201c'], [0.5, '#1fbf9a'], [1, '#e9fff7']],
  };

  const RAMP_CHOICES = [
    ['chrome', '镀铬银'],
    ['acid', '酸性绿'],
    ['vapor', '蒸汽波'],
    ['infrared', '红外'],
    ['thermal', '热成像'],
    ['gameboy', 'GameBoy'],
    ['sepia', '旧照片'],
    ['cyber', '赛博蓝'],
    ['holo', '全息'],
    ['riso', '孔版 Riso'],
    ['blood', '血色'],
    ['mint', '薄荷'],
    ['custom', '自定义三色'],
  ];

  const ENV_MAPS = {
    silver: [[0, '#ffffff'], [0.3, '#9fb4d6'], [0.47, '#f4f8ff'], [0.5, '#1a1c22'], [0.62, '#4b4f58'], [0.82, '#c9ccd4'], [1, '#ffffff']],
    gold: [[0, '#fff6d5'], [0.3, '#d9a441'], [0.47, '#fff3c4'], [0.5, '#3a2405'], [0.65, '#8a5a12'], [0.85, '#f2cd73'], [1, '#fffbe9']],
    ice: [[0, '#f2fbff'], [0.3, '#6fb7ff'], [0.47, '#e8f6ff'], [0.5, '#0b1f4a'], [0.65, '#2f6fc0'], [0.85, '#bfe6ff'], [1, '#ffffff']],
    black: [[0, '#9aa0aa'], [0.3, '#2a2d33'], [0.47, '#d7dbe3'], [0.5, '#050506'], [0.7, '#1c1e22'], [0.9, '#5f646d'], [1, '#e9ecf2']],
    rainbow: [[0, '#ffffff'], [0.2, '#ff9ae8'], [0.4, '#9ae6ff'], [0.5, '#2b1d52'], [0.6, '#b8ff9a'], [0.8, '#fff59a'], [1, '#ffffff']],
    acid: [[0, '#f9ffe0'], [0.3, '#9dff3a'], [0.47, '#f4ffd0'], [0.5, '#0f1a00'], [0.7, '#4f7f00'], [0.9, '#d7ff2f'], [1, '#ffffff']],
    rose: [[0, '#fff3f8'], [0.3, '#ff8fc4'], [0.47, '#fff0f7'], [0.5, '#3b0a24'], [0.68, '#a8326e'], [0.88, '#ffc2df'], [1, '#ffffff']],
  };

  const ENV_CHOICES = [
    ['silver', '银'],
    ['gold', '金'],
    ['ice', '冰蓝'],
    ['black', '黑铬'],
    ['rainbow', '彩虹铬'],
    ['acid', '酸性铬'],
    ['rose', '玫瑰铬'],
  ];

  const lutCache = new Map();
  function rampLut(name, custom) {
    const key = name === 'custom' ? `custom|${custom.join('|')}` : name;
    if (lutCache.has(key)) return lutCache.get(key);
    const stops = name === 'custom'
      ? [[0, custom[0]], [0.5, custom[1]], [1, custom[2]]]
      : (RAMPS[name] || ENV_MAPS[name] || RAMPS.chrome);
    const lut = buildRamp(stops);
    if (lutCache.size > 64) lutCache.clear();
    lutCache.set(key, lut);
    return lut;
  }

  function envLut(name) {
    const key = `env|${name}`;
    if (lutCache.has(key)) return lutCache.get(key);
    const lut = buildRamp(ENV_MAPS[name] || ENV_MAPS.silver);
    lutCache.set(key, lut);
    return lut;
  }

  const DITHER_PALETTES = {
    gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    cga: ['#000000', '#55ffff', '#ff55ff', '#ffffff'],
    rgb8: ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff'],
    pico: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
    y2k: ['#111111', '#f4f1e7', '#d7ff2f', '#20e3d1', '#ff4ca7', '#3265ff'],
    sepia: ['#1a0f08', '#5c3a1e', '#a77a46', '#f6e7c8'],
  };

  function bayerMatrix(size) {
    if (size === 2) return { n: 2, m: [0, 2, 3, 1] };
    if (size === 8) {
      const m = new Array(64);
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          let value = 0;
          let xc = x;
          let yc = y ^ x;
          for (let bit = 0; bit < 3; bit += 1) {
            value = (value << 2) | (((yc >> (2 - bit)) & 1) << 1) | ((xc >> (2 - bit)) & 1);
          }
          m[y * 8 + x] = value;
        }
      }
      return { n: 8, m };
    }
    return { n: 4, m: [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] };
  }

  function nearestPalette(palette, r, g, b) {
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < palette.length; i += 1) {
      const color = palette[i];
      const dr = r - color.r;
      const dg = g - color.g;
      const db = b - color.b;
      const distance = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return palette[best];
  }

  /* run a pixel effect at a coarser grid (chunky pixels) then scale back */
  function atScale(canvas, scale, run) {
    if (scale <= 1) {
      run(canvas);
      return;
    }
    const small = makeCanvas(Math.max(1, Math.round(canvas.width / scale)), Math.max(1, Math.round(canvas.height / scale)));
    const sctx = small.getContext('2d', { willReadFrequently: true });
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(canvas, 0, 0, small.width, small.height);
    run(small);
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  /* ======================= COLOR ======================= */

  register({
    type: 'adjust',
    name: '色彩调整',
    cat: 'color',
    desc: '亮度、对比度、饱和度、色相、模糊',
    params: [
      { key: 'brightness', label: '亮度', type: 'range', min: 0, max: 220, step: 1, def: 100, unit: '%' },
      { key: 'contrast', label: '对比度', type: 'range', min: 0, max: 300, step: 1, def: 100, unit: '%' },
      { key: 'saturation', label: '饱和度', type: 'range', min: 0, max: 300, step: 1, def: 100, unit: '%' },
      { key: 'hue', label: '色相', type: 'range', min: -180, max: 180, step: 1, def: 0, unit: '°' },
      { key: 'sepia', label: '褪色', type: 'range', min: 0, max: 100, step: 1, def: 0, unit: '%' },
      { key: 'blur', label: '模糊', type: 'range', min: 0, max: 40, step: 0.25, def: 0, unit: 'px' },
    ],
    pad: (p, q) => p.blur * q * 2,
    apply(canvas, ctx, p, env) {
      const filter = `brightness(${p.brightness}%) contrast(${p.contrast}%) saturate(${p.saturation}%) hue-rotate(${p.hue}deg) sepia(${p.sepia}%) blur(${Math.max(0, p.blur * env.q)}px)`;
      if (filter === 'brightness(100%) contrast(100%) saturate(100%) hue-rotate(0deg) sepia(0%) blur(0px)') return;
      replaceWith(canvas, U.cloneCanvas(canvas), filter);
    },
  });

  register({
    type: 'levels',
    name: '色阶 / 曝光',
    cat: 'color',
    desc: '黑场、白场、伽马',
    params: [
      { key: 'black', label: '黑场', type: 'range', min: 0, max: 250, step: 1, def: 0 },
      { key: 'white', label: '白场', type: 'range', min: 5, max: 255, step: 1, def: 255 },
      { key: 'gamma', label: '伽马', type: 'range', min: 0.2, max: 3, step: 0.01, def: 1 },
    ],
    apply(canvas, ctx, p) {
      const lut = new Uint8ClampedArray(256);
      const black = Math.min(p.black, p.white - 1);
      for (let i = 0; i < 256; i += 1) {
        const t = clamp((i - black) / (p.white - black), 0, 1);
        lut[i] = Math.pow(t, 1 / p.gamma) * 255;
      }
      const px = pixels(canvas);
      const { data } = px;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = lut[data[i]];
        data[i + 1] = lut[data[i + 1]];
        data[i + 2] = lut[data[i + 2]];
      }
      commit(px);
    },
  });

  register({
    type: 'posterize',
    name: '色调分离',
    cat: 'color',
    params: [{ key: 'levels', label: '色阶数', type: 'range', min: 2, max: 16, step: 1, def: 5 }],
    apply(canvas, ctx, p) {
      const px = pixels(canvas);
      const { data } = px;
      const levels = clamp(Math.round(p.levels), 2, 16);
      const step = 255 / (levels - 1);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.round(data[i] / step) * step;
        data[i + 1] = Math.round(data[i + 1] / step) * step;
        data[i + 2] = Math.round(data[i + 2] / step) * step;
      }
      commit(px);
    },
  });

  register({
    type: 'threshold',
    name: '阈值双色',
    cat: 'color',
    desc: '按亮度切成两色，复印 / 丝网感',
    params: [
      { key: 'level', label: '阈值', type: 'range', min: 0, max: 255, step: 1, def: 128 },
      { key: 'soft', label: '柔化', type: 'range', min: 0, max: 80, step: 1, def: 0 },
      { key: 'dark', label: '暗色', type: 'color', def: '#111111' },
      { key: 'light', label: '亮色', type: 'color', def: '#f4f1e7' },
    ],
    apply(canvas, ctx, p) {
      const px = pixels(canvas);
      const { data } = px;
      const dark = hexToRgb(p.dark);
      const light = hexToRgb(p.light);
      const soft = Math.max(0.5, p.soft);
      for (let i = 0; i < data.length; i += 4) {
        const t = clamp((lum(data[i], data[i + 1], data[i + 2]) - p.level) / soft + 0.5, 0, 1);
        data[i] = lerp(dark.r, light.r, t);
        data[i + 1] = lerp(dark.g, light.g, t);
        data[i + 2] = lerp(dark.b, light.b, t);
      }
      commit(px);
    },
  });

  register({
    type: 'gradientMap',
    name: '渐变映射',
    cat: 'color',
    desc: '把亮度映射到配色：双色调、热成像、全息',
    params: [
      { key: 'ramp', label: '配色', type: 'select', options: RAMP_CHOICES, def: 'vapor' },
      { key: 'c1', label: '暗部', type: 'color', def: '#120024', when: (p) => p.ramp === 'custom' },
      { key: 'c2', label: '中间', type: 'color', def: '#ff4ca7', when: (p) => p.ramp === 'custom' },
      { key: 'c3', label: '亮部', type: 'color', def: '#d7ff2f', when: (p) => p.ramp === 'custom' },
      { key: 'reverse', label: '反转', type: 'bool', def: false },
      { key: 'mix', label: '混合', type: 'range', min: 0, max: 100, step: 1, def: 100, unit: '%' },
    ],
    apply(canvas, ctx, p) {
      const lut = rampLut(p.ramp, [p.c1, p.c2, p.c3]);
      const mix = clamp(p.mix / 100, 0, 1);
      const px = pixels(canvas);
      const { data } = px;
      for (let i = 0; i < data.length; i += 4) {
        let l = Math.round(lum(data[i], data[i + 1], data[i + 2]));
        if (p.reverse) l = 255 - l;
        data[i] = lerp(data[i], lut[l * 3], mix);
        data[i + 1] = lerp(data[i + 1], lut[l * 3 + 1], mix);
        data[i + 2] = lerp(data[i + 2], lut[l * 3 + 2], mix);
      }
      commit(px);
    },
  });

  register({
    type: 'invert',
    name: '反相',
    cat: 'color',
    params: [{ key: 'amount', label: '强度', type: 'range', min: 0, max: 100, step: 1, def: 100, unit: '%' }],
    apply(canvas, ctx, p) {
      const t = clamp(p.amount / 100, 0, 1);
      const px = pixels(canvas);
      const { data } = px;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = lerp(data[i], 255 - data[i], t);
        data[i + 1] = lerp(data[i + 1], 255 - data[i + 1], t);
        data[i + 2] = lerp(data[i + 2], 255 - data[i + 2], t);
      }
      commit(px);
    },
  });

  register({
    type: 'solarize',
    name: '曝光过度',
    cat: 'color',
    desc: '高于阈值的亮部反转，Sabattier 效果',
    params: [{ key: 'level', label: '阈值', type: 'range', min: 0, max: 255, step: 1, def: 128 }],
    apply(canvas, ctx, p) {
      const px = pixels(canvas);
      const { data } = px;
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c += 1) if (data[i + c] > p.level) data[i + c] = 255 - data[i + c];
      }
      commit(px);
    },
  });

  register({
    type: 'colorOverlay',
    name: '颜色叠加',
    cat: 'color',
    desc: '给图层着色，保留透明区域',
    params: [
      { key: 'color', label: '颜色', type: 'color', def: '#ff4ca7' },
      {
        key: 'mode',
        label: '模式',
        type: 'select',
        options: [['source-atop', '正常'], ['multiply', '正片叠底'], ['screen', '滤色'], ['overlay', '叠加'], ['color', '颜色'], ['hue', '色相'], ['difference', '差值'], ['soft-light', '柔光']],
        def: 'color',
      },
      { key: 'amount', label: '强度', type: 'range', min: 0, max: 100, step: 1, def: 70, unit: '%' },
    ],
    apply(canvas, ctx, p) {
      const mask = U.cloneCanvas(canvas);
      ctx.globalAlpha = clamp(p.amount / 100, 0, 1);
      ctx.globalCompositeOperation = p.mode;
      ctx.fillStyle = p.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0);
    },
  });

  /* ======================= PRINT / PIXEL ======================= */

  register({
    type: 'dither',
    name: '抖动 Dither',
    cat: 'print',
    desc: 'Bayer / Floyd–Steinberg / Atkinson，多种复古调色板',
    params: [
      { key: 'mode', label: '算法', type: 'select', options: [['bayer4', 'Bayer 4×4'], ['bayer8', 'Bayer 8×8'], ['bayer2', 'Bayer 2×2'], ['floyd', 'Floyd–Steinberg'], ['atkinson', 'Atkinson'], ['noise', '随机噪点']], def: 'bayer4' },
      { key: 'palette', label: '调色板', type: 'select', options: [['mono', '黑白'], ['duo', '双色'], ['levels', '原色降阶'], ['gameboy', 'GameBoy'], ['cga', 'CGA'], ['rgb8', '8 色 RGB'], ['pico', 'PICO-8'], ['y2k', 'Y2K 酸性'], ['sepia', '复古棕']], def: 'mono' },
      { key: 'dark', label: '暗色', type: 'color', def: '#111111', when: (p) => p.palette === 'duo' },
      { key: 'light', label: '亮色', type: 'color', def: '#f4f1e7', when: (p) => p.palette === 'duo' },
      { key: 'levels', label: '每通道阶数', type: 'range', min: 2, max: 8, step: 1, def: 3, when: (p) => p.palette === 'levels' },
      { key: 'spread', label: '强度', type: 'range', min: 0, max: 100, step: 1, def: 70, unit: '%' },
      { key: 'scale', label: '像素尺寸', type: 'range', min: 1, max: 12, step: 1, def: 2, unit: 'px' },
      { key: 'contrast', label: '对比', type: 'range', min: -100, max: 100, step: 1, def: 0 },
    ],
    apply(canvas, ctx, p, env) {
      const scale = Math.max(1, Math.round(p.scale * env.q));
      atScale(canvas, scale, (target) => ditherCanvas(target, p, env));
    },
  });

  function ditherCanvas(canvas, p, env) {
    const px = pixels(canvas);
    const { data, w, h } = px;
    const spread = clamp(p.spread / 100, 0, 1);
    const contrast = 1 + p.contrast / 100;
    let palette;
    let monoPair = null;
    if (p.palette === 'mono') monoPair = [hexToRgb('#000000'), hexToRgb('#ffffff')];
    else if (p.palette === 'duo') monoPair = [hexToRgb(p.dark), hexToRgb(p.light)];
    else if (p.palette !== 'levels') palette = (DITHER_PALETTES[p.palette] || DITHER_PALETTES.y2k).map(hexToRgb);
    const levels = clamp(Math.round(p.levels), 2, 8);
    const levelStep = 255 / (levels - 1);
    const random = env.rng('dither');

    const adjust = (value) => clamp((value - 128) * contrast + 128, 0, 255);
    const quantize = (r, g, b) => {
      if (monoPair) {
        const l = lum(r, g, b) >= 128 ? 1 : 0;
        return monoPair[l];
      }
      if (palette) return nearestPalette(palette, r, g, b);
      return {
        r: Math.round(r / levelStep) * levelStep,
        g: Math.round(g / levelStep) * levelStep,
        b: Math.round(b / levelStep) * levelStep,
      };
    };

    if (p.mode === 'floyd' || p.mode === 'atkinson') {
      const buffer = new Float32Array(w * h * 3);
      for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
        if (monoPair) {
          const l = adjust(lum(data[i], data[i + 1], data[i + 2]));
          buffer[j] = l;
          buffer[j + 1] = l;
          buffer[j + 2] = l;
        } else {
          buffer[j] = adjust(data[i]);
          buffer[j + 1] = adjust(data[i + 1]);
          buffer[j + 2] = adjust(data[i + 2]);
        }
      }
      const kernel = p.mode === 'floyd'
        ? [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]]
        : [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]];
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const j = (y * w + x) * 3;
          const r = buffer[j];
          const g = buffer[j + 1];
          const b = buffer[j + 2];
          const color = quantize(r, g, b);
          const i = (y * w + x) * 4;
          data[i] = color.r;
          data[i + 1] = color.g;
          data[i + 2] = color.b;
          const er = (r - color.r) * spread;
          const eg = (g - color.g) * spread;
          const eb = (b - color.b) * spread;
          for (const [dx, dy, weight] of kernel) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= w || ny >= h) continue;
            const k = (ny * w + nx) * 3;
            buffer[k] += er * weight;
            buffer[k + 1] += eg * weight;
            buffer[k + 2] += eb * weight;
          }
        }
      }
    } else {
      const size = p.mode === 'bayer8' ? 8 : p.mode === 'bayer2' ? 2 : 4;
      const { n, m } = bayerMatrix(size);
      const amplitude = (monoPair ? 255 : levelStep * (palette ? 1.6 : 1)) * spread;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          const t = p.mode === 'noise' ? random() - 0.5 : (m[(y % n) * n + (x % n)] + 0.5) / (n * n) - 0.5;
          const offset = t * amplitude;
          let r = adjust(data[i]);
          let g = adjust(data[i + 1]);
          let b = adjust(data[i + 2]);
          if (monoPair) {
            const l = lum(r, g, b) + offset;
            r = l;
            g = l;
            b = l;
          } else {
            r += offset;
            g += offset;
            b += offset;
          }
          const color = quantize(r, g, b);
          data[i] = color.r;
          data[i + 1] = color.g;
          data[i + 2] = color.b;
        }
      }
    }
    commit(px);
  }

  register({
    type: 'halftone',
    name: '半调网点',
    cat: 'print',
    desc: '单色或 CMYK 网点，可选点形与角度',
    params: [
      { key: 'cell', label: '网点尺寸', type: 'range', min: 3, max: 64, step: 1, def: 9, unit: 'px' },
      { key: 'angle', label: '网角', type: 'range', min: 0, max: 90, step: 1, def: 45, unit: '°' },
      { key: 'shape', label: '点形', type: 'select', options: [['dot', '圆点'], ['square', '方点'], ['diamond', '菱形'], ['line', '线条'], ['cross', '十字']], def: 'dot' },
      { key: 'mode', label: '模式', type: 'select', options: [['mono', '单色'], ['cmyk', 'CMYK 四色'], ['rgb', 'RGB 三色']], def: 'mono' },
      { key: 'ink', label: '油墨色', type: 'color', def: '#111111', when: (p) => p.mode === 'mono' },
      { key: 'paper', label: '纸色', type: 'color', def: '#f5f3ea' },
      { key: 'paperOn', label: '保留纸底', type: 'bool', def: true },
      { key: 'gain', label: '网点扩大', type: 'range', min: 50, max: 160, step: 1, def: 100, unit: '%' },
    ],
    apply(canvas, ctx, p, env) {
      const w = canvas.width;
      const h = canvas.height;
      const source = pixels(canvas);
      const src = source.data;
      const cell = Math.max(3, p.cell * env.q);
      const gain = p.gain / 100;
      const alphaMask = hasTransparency(src) ? U.cloneCanvas(canvas) : null;
      ctx.clearRect(0, 0, w, h);
      if (p.paperOn) {
        ctx.fillStyle = p.paper;
        ctx.fillRect(0, 0, w, h);
      }
      const channels = p.mode === 'cmyk'
        ? [
          { angle: 15, color: '#00aeef', value: (r, g, b, k) => (k < 1 ? (1 - r / 255 - k) / (1 - k) : 0) },
          { angle: 75, color: '#ec008c', value: (r, g, b, k) => (k < 1 ? (1 - g / 255 - k) / (1 - k) : 0) },
          { angle: 0, color: '#ffe600', value: (r, g, b, k) => (k < 1 ? (1 - b / 255 - k) / (1 - k) : 0) },
          { angle: 45, color: '#111111', value: (r, g, b, k) => k },
        ]
        : p.mode === 'rgb'
          ? [
            { angle: 15, color: '#ff2a2a', value: (r) => r / 255 },
            { angle: 45, color: '#2aff6a', value: (r, g) => g / 255 },
            { angle: 75, color: '#2a6aff', value: (r, g, b) => b / 255 },
          ]
          : [{ angle: 0, color: p.ink, value: (r, g, b) => 1 - lum(r, g, b) / 255 }];
      if (p.mode === 'rgb') {
        ctx.fillStyle = '#000000';
        if (p.paperOn) ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
      } else {
        ctx.globalCompositeOperation = p.mode === 'cmyk' ? 'multiply' : 'source-over';
      }
      const diag = Math.hypot(w, h);
      channels.forEach((channel) => {
        const angle = ((p.angle + channel.angle) * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const path = new Path2D();
        const steps = Math.ceil(diag / cell) + 2;
        for (let j = -steps; j <= steps; j += 1) {
          for (let i = -steps; i <= steps; i += 1) {
            const gx = i * cell;
            const gy = j * cell;
            const cx = w / 2 + gx * cos - gy * sin;
            const cy = h / 2 + gx * sin + gy * cos;
            if (cx < -cell || cy < -cell || cx > w + cell || cy > h + cell) continue;
            const sx = clamp(Math.round(cx), 0, w - 1);
            const sy = clamp(Math.round(cy), 0, h - 1);
            const index = (sy * w + sx) * 4;
            const alpha = src[index + 3] / 255;
            if (alpha <= 0.02) continue;
            const r = src[index];
            const g = src[index + 1];
            const b = src[index + 2];
            const k = 1 - Math.max(r, g, b) / 255;
            const value = clamp(channel.value(r, g, b, k), 0, 1) * alpha;
            if (value <= 0.01) continue;
            const size = Math.sqrt(value) * cell * 0.72 * gain;
            addDot(path, p.shape, cx, cy, size, cell, value * gain, angle);
          }
        }
        ctx.fillStyle = channel.color;
        ctx.fill(path);
      });
      ctx.globalCompositeOperation = 'source-over';
      if (alphaMask) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(alphaMask, 0, 0);
      }
    },
  });

  function addDot(path, shape, cx, cy, size, cell, value, angle) {
    switch (shape) {
      case 'square': {
        const s = size * 0.9;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const corners = [[-s, -s], [s, -s], [s, s], [-s, s]].map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]);
        path.moveTo(corners[0][0], corners[0][1]);
        corners.slice(1).forEach(([x, y]) => path.lineTo(x, y));
        path.closePath();
        break;
      }
      case 'diamond': {
        const s = size * 1.25;
        path.moveTo(cx, cy - s);
        path.lineTo(cx + s, cy);
        path.lineTo(cx, cy + s);
        path.lineTo(cx - s, cy);
        path.closePath();
        break;
      }
      case 'line': {
        const thickness = clamp(value, 0, 1) * cell * 0.5;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const half = cell * 0.55;
        const pts = [[-half, -thickness], [half, -thickness], [half, thickness], [-half, thickness]].map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]);
        path.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(([x, y]) => path.lineTo(x, y));
        path.closePath();
        break;
      }
      case 'cross': {
        const s = size * 1.1;
        const t = Math.max(0.6, size * 0.38);
        path.rect(cx - s, cy - t, s * 2, t * 2);
        path.rect(cx - t, cy - s, t * 2, s * 2);
        break;
      }
      default:
        path.moveTo(cx + size, cy);
        path.arc(cx, cy, size, 0, Math.PI * 2);
        break;
    }
  }

  register({
    type: 'pixelate',
    name: '像素化',
    cat: 'print',
    params: [
      { key: 'size', label: '像素尺寸', type: 'range', min: 2, max: 120, step: 1, def: 10, unit: 'px' },
      { key: 'shape', label: '形状', type: 'select', options: [['square', '方块'], ['circle', '圆点'], ['tile', '马赛克砖']], def: 'square' },
    ],
    apply(canvas, ctx, p, env) {
      const size = Math.max(2, Math.round(p.size * env.q));
      const w = canvas.width;
      const h = canvas.height;
      const small = makeCanvas(Math.max(1, Math.ceil(w / size)), Math.max(1, Math.ceil(h / size)));
      const sctx = small.getContext('2d', { willReadFrequently: true });
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'medium';
      sctx.drawImage(canvas, 0, 0, small.width * size, small.height * size, 0, 0, small.width, small.height);
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      if (p.shape === 'square') {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small, 0, 0, small.width * size, small.height * size);
      } else {
        const data = sctx.getImageData(0, 0, small.width, small.height).data;
        for (let y = 0; y < small.height; y += 1) {
          for (let x = 0; x < small.width; x += 1) {
            const i = (y * small.width + x) * 4;
            if (data[i + 3] < 8) continue;
            ctx.fillStyle = `rgba(${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3] / 255})`;
            if (p.shape === 'circle') {
              ctx.beginPath();
              ctx.arc(x * size + size / 2, y * size + size / 2, size * 0.46, 0, Math.PI * 2);
              ctx.fill();
            } else {
              ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
              ctx.fillStyle = 'rgba(255,255,255,0.18)';
              ctx.fillRect(x * size + 1, y * size + 1, size - 2, Math.max(1, size * 0.12));
            }
          }
        }
      }
      ctx.restore();
    },
  });

  register({
    type: 'xerox',
    name: '复印机',
    cat: 'print',
    desc: '高反差、碳粉颗粒、拖影与杂点',
    params: [
      { key: 'level', label: '阈值', type: 'range', min: 30, max: 225, step: 1, def: 128 },
      { key: 'contrast', label: '对比', type: 'range', min: 50, max: 400, step: 1, def: 180, unit: '%' },
      { key: 'toner', label: '碳粉不均', type: 'range', min: 0, max: 100, step: 1, def: 40, unit: '%' },
      { key: 'grain', label: '颗粒', type: 'range', min: 0, max: 100, step: 1, def: 35, unit: '%' },
      { key: 'streaks', label: '拖影条纹', type: 'range', min: 0, max: 100, step: 1, def: 25, unit: '%' },
      { key: 'specks', label: '杂点', type: 'range', min: 0, max: 100, step: 1, def: 20, unit: '%' },
      { key: 'ink', label: '墨色', type: 'color', def: '#111111' },
      { key: 'paper', label: '纸色', type: 'color', def: '#f2efe4' },
    ],
    apply(canvas, ctx, p, env) {
      const px = pixels(canvas);
      const { data, w, h } = px;
      const ink = hexToRgb(p.ink);
      const paper = hexToRgb(p.paper);
      const contrast = p.contrast / 100;
      const random = env.rng('xerox');
      const lowNoise = U.makeNoise2D((env.seed ^ 0x5e70) >>> 0);
      const grainNoise = U.makeNoise2D((env.seed ^ 0x9a17) >>> 0);
      const streakCols = new Float32Array(w);
      const streakCount = Math.round((p.streaks / 100) * 18);
      for (let s = 0; s < streakCount; s += 1) {
        const x0 = Math.floor(random() * w);
        const width = 1 + Math.floor(random() * 3 * env.q);
        const strength = (random() * 0.6 + 0.4) * (random() < 0.5 ? -1 : 1);
        for (let x = x0; x < Math.min(w, x0 + width); x += 1) streakCols[x] += strength;
      }
      const tonerAmp = (p.toner / 100) * 90;
      const grainAmp = (p.grain / 100) * 120;
      const lowScale = 1 / (220 * env.q);
      const grainScale = 1 / Math.max(1, 1.2 * env.q);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          let l = lum(data[i], data[i + 1], data[i + 2]);
          l = (l - 128) * contrast + 128;
          l += (lowNoise(x * lowScale, y * lowScale) - 0.5) * tonerAmp;
          l += (grainNoise(x * grainScale, y * grainScale) - 0.5) * grainAmp;
          l += streakCols[x] * 70 * (0.6 + 0.4 * Math.sin(y * 0.01));
          const t = l >= p.level ? 1 : 0;
          data[i] = lerp(ink.r, paper.r, t);
          data[i + 1] = lerp(ink.g, paper.g, t);
          data[i + 2] = lerp(ink.b, paper.b, t);
        }
      }
      commit(px);
      const specks = Math.round((p.specks / 100) * (w * h) / 2500);
      ctx.fillStyle = p.ink;
      for (let s = 0; s < specks; s += 1) {
        const r = (random() * 1.6 + 0.4) * env.q;
        ctx.globalAlpha = 0.5 + random() * 0.5;
        ctx.beginPath();
        ctx.arc(random() * w, random() * h, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (hasTransparency(data)) {
        /* keep the layer silhouette */
        ctx.globalCompositeOperation = 'destination-in';
        const mask = makeCanvas(w, h);
        const mctx = mask.getContext('2d');
        const maskData = mctx.createImageData(w, h);
        for (let i = 3; i < data.length; i += 4) maskData.data[i] = data[i];
        mctx.putImageData(maskData, 0, 0);
        ctx.drawImage(mask, 0, 0);
      }
    },
  });

  register({
    type: 'grain',
    name: '胶片颗粒',
    cat: 'print',
    params: [
      { key: 'amount', label: '强度', type: 'range', min: 0, max: 100, step: 1, def: 25, unit: '%' },
      { key: 'size', label: '颗粒大小', type: 'range', min: 1, max: 8, step: 0.5, def: 1, unit: 'px' },
      { key: 'color', label: '彩色颗粒', type: 'bool', def: false },
    ],
    apply(canvas, ctx, p, env) {
      const px = pixels(canvas);
      const { data, w, h } = px;
      const amp = (p.amount / 100) * 160;
      const scale = 1 / Math.max(0.5, p.size * env.q);
      const nr = U.makeNoise2D((env.seed ^ U.hashString(env.layerId) ^ 0x6a11) >>> 0);
      const ng = p.color ? U.makeNoise2D((env.seed ^ 0x77a1) >>> 0) : nr;
      const nb = p.color ? U.makeNoise2D((env.seed ^ 0x13c7) >>> 0) : nr;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          const sx = x * scale;
          const sy = y * scale;
          const vr = (nr(sx, sy) - 0.5) * amp;
          data[i] += vr;
          data[i + 1] += p.color ? (ng(sx + 31.7, sy) - 0.5) * amp : vr;
          data[i + 2] += p.color ? (nb(sx, sy + 17.3) - 0.5) * amp : vr;
        }
      }
      commit(px);
    },
  });

  register({
    type: 'scanlines',
    name: '扫描线 / CRT',
    cat: 'print',
    params: [
      { key: 'spacing', label: '线距', type: 'range', min: 2, max: 24, step: 1, def: 4, unit: 'px' },
      { key: 'darkness', label: '暗线强度', type: 'range', min: 0, max: 100, step: 1, def: 45, unit: '%' },
      { key: 'mask', label: 'RGB 荧光栅', type: 'range', min: 0, max: 100, step: 1, def: 25, unit: '%' },
      { key: 'vertical', label: '竖向', type: 'bool', def: false },
    ],
    apply(canvas, ctx, p, env) {
      const px = pixels(canvas);
      const { data, w, h } = px;
      const spacing = Math.max(2, Math.round(p.spacing * env.q));
      const dark = p.darkness / 100;
      const mask = p.mask / 100;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          const pos = p.vertical ? x : y;
          const phase = (pos % spacing) / spacing;
          const line = 1 - dark * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2));
          const stripe = Math.floor((p.vertical ? y : x) / Math.max(1, Math.round(env.q))) % 3;
          data[i] *= line * (stripe === 0 ? 1 : 1 - mask * 0.6);
          data[i + 1] *= line * (stripe === 1 ? 1 : 1 - mask * 0.6);
          data[i + 2] *= line * (stripe === 2 ? 1 : 1 - mask * 0.6);
        }
      }
      commit(px);
    },
  });

  register({
    type: 'jpeg',
    name: 'JPEG 压缩腐蚀',
    cat: 'print',
    desc: '8×8 DCT 量化：块状色斑与振铃',
    params: [
      { key: 'quality', label: '质量', type: 'range', min: 1, max: 60, step: 1, def: 6 },
      { key: 'chroma', label: '色度下采样', type: 'bool', def: true },
      { key: 'passes', label: '重复压缩', type: 'range', min: 1, max: 4, step: 1, def: 1 },
    ],
    apply(canvas, ctx, p, env) {
      const block = clamp(Math.round(8 * env.q), 4, 32);
      for (let pass = 0; pass < Math.round(p.passes); pass += 1) jpegPass(canvas, p, block, pass);
    },
  });

  const LUMA_Q = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
  const CHROMA_Q = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];
  const cosTables = new Map();

  function cosTable(n) {
    if (cosTables.has(n)) return cosTables.get(n);
    const table = new Float32Array(n * n);
    for (let k = 0; k < n; k += 1) {
      const scale = k === 0 ? Math.sqrt(1 / n) : Math.sqrt(2 / n);
      for (let x = 0; x < n; x += 1) table[k * n + x] = scale * Math.cos(((2 * x + 1) * k * Math.PI) / (2 * n));
    }
    cosTables.set(n, table);
    return table;
  }

  function jpegPass(canvas, p, n, pass) {
    const px = pixels(canvas);
    const { data, w, h } = px;
    const quality = clamp(p.quality, 1, 100);
    const qScale = quality < 50 ? 5000 / quality : 200 - quality * 2;
    const planes = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)];
    for (let i = 0, j = 0; j < w * h; i += 4, j += 1) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      planes[0][j] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
      planes[1][j] = -0.168736 * r - 0.331264 * g + 0.5 * b;
      planes[2][j] = 0.5 * r - 0.418688 * g - 0.081312 * b;
    }
    if (p.chroma) {
      for (let c = 1; c < 3; c += 1) {
        const plane = planes[c];
        for (let y = 0; y < h; y += 2) {
          for (let x = 0; x < w; x += 2) {
            const i0 = y * w + x;
            const i1 = Math.min(x + 1, w - 1) + y * w;
            const i2 = x + Math.min(y + 1, h - 1) * w;
            const i3 = Math.min(x + 1, w - 1) + Math.min(y + 1, h - 1) * w;
            const avg = (plane[i0] + plane[i1] + plane[i2] + plane[i3]) / 4;
            plane[i0] = avg;
            plane[i1] = avg;
            plane[i2] = avg;
            plane[i3] = avg;
          }
        }
      }
    }
    const table = cosTable(n);
    const blockIn = new Float32Array(n * n);
    const tmp = new Float32Array(n * n);
    const coef = new Float32Array(n * n);
    const offset = pass % 2 ? Math.floor(n / 2) : 0;
    planes.forEach((plane, c) => {
      const qBase = c === 0 ? LUMA_Q : CHROMA_Q;
      for (let by = -offset; by < h; by += n) {
        for (let bx = -offset; bx < w; bx += n) {
          for (let y = 0; y < n; y += 1) {
            for (let x = 0; x < n; x += 1) {
              const sx = clamp(bx + x, 0, w - 1);
              const sy = clamp(by + y, 0, h - 1);
              blockIn[y * n + x] = plane[sy * w + sx];
            }
          }
          for (let y = 0; y < n; y += 1) {
            for (let k = 0; k < n; k += 1) {
              let sum = 0;
              for (let x = 0; x < n; x += 1) sum += table[k * n + x] * blockIn[y * n + x];
              tmp[y * n + k] = sum;
            }
          }
          for (let k = 0; k < n; k += 1) {
            for (let l = 0; l < n; l += 1) {
              let sum = 0;
              for (let y = 0; y < n; y += 1) sum += table[l * n + y] * tmp[y * n + k];
              const qi = Math.min(7, Math.floor((l * 8) / n)) * 8 + Math.min(7, Math.floor((k * 8) / n));
              const step = clamp(Math.floor((qBase[qi] * qScale + 50) / 100), 1, 255) * (n / 8);
              coef[l * n + k] = Math.round(sum / step) * step;
            }
          }
          for (let l = 0; l < n; l += 1) {
            for (let x = 0; x < n; x += 1) {
              let sum = 0;
              for (let k = 0; k < n; k += 1) sum += table[k * n + x] * coef[l * n + k];
              tmp[l * n + x] = sum;
            }
          }
          for (let y = 0; y < n; y += 1) {
            const py = by + y;
            if (py < 0 || py >= h) continue;
            for (let x = 0; x < n; x += 1) {
              const pxx = bx + x;
              if (pxx < 0 || pxx >= w) continue;
              let sum = 0;
              for (let l = 0; l < n; l += 1) sum += table[l * n + y] * tmp[l * n + x];
              plane[py * w + pxx] = sum;
            }
          }
        }
      }
    });
    for (let i = 0, j = 0; j < w * h; i += 4, j += 1) {
      const Y = planes[0][j] + 128;
      const cb = planes[1][j];
      const cr = planes[2][j];
      data[i] = Y + 1.402 * cr;
      data[i + 1] = Y - 0.344136 * cb - 0.714136 * cr;
      data[i + 2] = Y + 1.772 * cb;
    }
    commit(px);
  }

  register({
    type: 'ascii',
    name: '字符画 ASCII',
    cat: 'print',
    params: [
      { key: 'cell', label: '字格', type: 'range', min: 4, max: 48, step: 1, def: 10, unit: 'px' },
      { key: 'charset', label: '字符集', type: 'select', options: [['classic', ' .:-=+*#%@'], ['blocks', ' ░▒▓█'], ['binary', '01'], ['kana', 'ｱｲｳｴｵｶｷｸｹｺ'], ['han', '一二三王田国電龍'], ['symbols', '·•○◎●★◆']], def: 'classic' },
      { key: 'colorMode', label: '着色', type: 'select', options: [['source', '原图颜色'], ['ink', '单色']], def: 'ink' },
      { key: 'ink', label: '字色', type: 'color', def: '#d7ff2f' },
      { key: 'bg', label: '底色', type: 'color', def: '#0b0b0d' },
      { key: 'bgOn', label: '填充底色', type: 'bool', def: true },
      { key: 'invert', label: '反转明暗', type: 'bool', def: false },
    ],
    apply(canvas, ctx, p, env) {
      const sets = {
        classic: ' .:-=+*#%@',
        blocks: ' ░▒▓█',
        binary: ' 01',
        kana: ' ｰｨｳｴｵｶｷｸｹｺﾀﾁﾂﾃﾄ',
        han: ' 一二三工王田国電龍',
        symbols: ' ·•○◎●★◆',
      };
      const chars = Array.from(sets[p.charset] || sets.classic);
      const w = canvas.width;
      const h = canvas.height;
      const cell = Math.max(4, Math.round(p.cell * env.q));
      const cols = Math.ceil(w / cell);
      const rows = Math.ceil(h / cell);
      const small = makeCanvas(cols, rows);
      const sctx = small.getContext('2d', { willReadFrequently: true });
      sctx.drawImage(canvas, 0, 0, cols * cell, rows * cell, 0, 0, cols, rows);
      const data = sctx.getImageData(0, 0, cols, rows).data;
      const mask = U.cloneCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      if (p.bgOn) {
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.font = `700 ${cell * 1.05}px "Courier New", "MS Gothic", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const i = (y * cols + x) * 4;
          if (data[i + 3] < 10) continue;
          let l = lum(data[i], data[i + 1], data[i + 2]) / 255;
          if (p.invert) l = 1 - l;
          const ch = chars[Math.min(chars.length - 1, Math.floor(l * chars.length))];
          if (ch === ' ') continue;
          ctx.fillStyle = p.colorMode === 'source' ? `rgb(${data[i]},${data[i + 1]},${data[i + 2]})` : p.ink;
          ctx.fillText(ch, x * cell + cell / 2, y * cell + cell / 2);
        }
      }
      if (hasTransparency(pixels(mask).data)) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(mask, 0, 0);
      }
    },
  });

  /* ======================= LIGHT / MATERIAL ======================= */

  register({
    type: 'glow',
    name: '辉光 Bloom',
    cat: 'light',
    desc: '亮部向外溢光',
    params: [
      { key: 'threshold', label: '阈值', type: 'range', min: 0, max: 255, step: 1, def: 110 },
      { key: 'radius', label: '半径', type: 'range', min: 1, max: 120, step: 1, def: 18, unit: 'px' },
      { key: 'strength', label: '强度', type: 'range', min: 0, max: 300, step: 1, def: 120, unit: '%' },
      { key: 'tint', label: '色调', type: 'color', def: '#ffffff' },
      { key: 'tintAmount', label: '着色', type: 'range', min: 0, max: 100, step: 1, def: 0, unit: '%' },
    ],
    pad: (p, q) => p.radius * q * 1.6,
    apply(canvas, ctx, p, env) {
      const w = canvas.width;
      const h = canvas.height;
      const bright = U.cloneCanvas(canvas);
      const bctx = bright.getContext('2d', { willReadFrequently: true });
      const img = bctx.getImageData(0, 0, w, h);
      const data = img.data;
      const tint = hexToRgb(p.tint);
      const tintAmount = p.tintAmount / 100;
      for (let i = 0; i < data.length; i += 4) {
        const l = lum(data[i], data[i + 1], data[i + 2]);
        const keep = clamp((l - p.threshold) / 40, 0, 1);
        data[i] = lerp(data[i], tint.r, tintAmount);
        data[i + 1] = lerp(data[i + 1], tint.g, tintAmount);
        data[i + 2] = lerp(data[i + 2], tint.b, tintAmount);
        data[i + 3] *= keep;
      }
      bctx.putImageData(img, 0, 0);
      const blurred = filtered(bright, `blur(${p.radius * env.q}px)`);
      ctx.globalCompositeOperation = 'lighter';
      let strength = p.strength / 100;
      while (strength > 0.001) {
        ctx.globalAlpha = Math.min(1, strength);
        ctx.drawImage(blurred, 0, 0);
        strength -= 1;
      }
    },
  });

  register({
    type: 'vignette',
    name: '暗角',
    cat: 'light',
    params: [
      { key: 'amount', label: '强度', type: 'range', min: 0, max: 100, step: 1, def: 55, unit: '%' },
      { key: 'size', label: '范围', type: 'range', min: 0, max: 100, step: 1, def: 55, unit: '%' },
      { key: 'color', label: '颜色', type: 'color', def: '#000000' },
    ],
    apply(canvas, ctx, p) {
      const w = canvas.width;
      const h = canvas.height;
      const radius = Math.hypot(w, h) / 2;
      const gradient = ctx.createRadialGradient(w / 2, h / 2, radius * (p.size / 100) * 0.9, w / 2, h / 2, radius);
      gradient.addColorStop(0, U.rgba(p.color, 0));
      gradient.addColorStop(1, U.rgba(p.color, p.amount / 100));
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    },
  });

  register({
    type: 'lightLeak',
    name: '漏光',
    cat: 'light',
    params: [
      { key: 'color1', label: '光色 1', type: 'color', def: '#ff7a18' },
      { key: 'color2', label: '光色 2', type: 'color', def: '#ff4ca7' },
      { key: 'angle', label: '方向', type: 'range', min: 0, max: 360, step: 1, def: 30, unit: '°' },
      { key: 'amount', label: '强度', type: 'range', min: 0, max: 100, step: 1, def: 60, unit: '%' },
      { key: 'spread', label: '扩散', type: 'range', min: 10, max: 100, step: 1, def: 55, unit: '%' },
    ],
    apply(canvas, ctx, p) {
      const w = canvas.width;
      const h = canvas.height;
      const angle = (p.angle * Math.PI) / 180;
      const r = Math.hypot(w, h) / 2;
      const cx = w / 2 + Math.cos(angle) * r * 0.9;
      const cy = h / 2 + Math.sin(angle) * r * 0.9;
      const spread = (p.spread / 100) * r * 1.6;
      const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, spread);
      g1.addColorStop(0, U.rgba(p.color1, p.amount / 100));
      g1.addColorStop(0.5, U.rgba(p.color2, (p.amount / 100) * 0.55));
      g1.addColorStop(1, U.rgba(p.color2, 0));
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = 1;
      const temp = U.cloneCanvas(canvas);
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(temp, 0, 0);
    },
  });

  /* height field shared by chrome / emboss / glass:
     blurred alpha (shape relief) mixed with blurred luminance (image relief) */
  function heightField(canvas, radius, lumWeight) {
    const w = canvas.width;
    const h = canvas.height;
    const blurred = filtered(canvas, `blur(${Math.max(0.5, radius)}px)`);
    const data = blurred.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const field = new Float32Array(w * h);
    for (let i = 0, j = 0; j < field.length; i += 4, j += 1) {
      const alpha = data[i + 3] / 255;
      const l = alpha > 0 ? lum(data[i], data[i + 1], data[i + 2]) / 255 : 0;
      field[j] = alpha * (1 - lumWeight) + l * alpha * lumWeight;
    }
    return field;
  }

  register({
    type: 'chrome',
    name: '液态镀铬',
    cat: 'light',
    desc: 'Y2K 金属反射：形状浮雕 + 环境映射',
    params: [
      { key: 'env', label: '金属', type: 'select', options: ENV_CHOICES, def: 'silver' },
      { key: 'depth', label: '浮雕深度', type: 'range', min: 0, max: 100, step: 1, def: 60, unit: '%' },
      { key: 'smooth', label: '圆润度', type: 'range', min: 1, max: 60, step: 1, def: 10, unit: 'px' },
      { key: 'bands', label: '反射层数', type: 'range', min: 1, max: 6, step: 0.1, def: 1.4 },
      { key: 'imageRelief', label: '图像起伏', type: 'range', min: 0, max: 100, step: 1, def: 35, unit: '%' },
      { key: 'shine', label: '高光', type: 'range', min: 0, max: 100, step: 1, def: 70, unit: '%' },
      { key: 'mix', label: '混合', type: 'range', min: 0, max: 100, step: 1, def: 100, unit: '%' },
    ],
    apply(canvas, ctx, p, env) {
      const w = canvas.width;
      const h = canvas.height;
      const field = heightField(canvas, p.smooth * env.q, p.imageRelief / 100);
      const lut = envLut(p.env);
      const px = pixels(canvas);
      const { data } = px;
      const depth = (p.depth / 100) * 18 * Math.max(1, p.smooth / 6);
      const bands = p.bands;
      const mix = p.mix / 100;
      const shine = p.shine / 100;
      const light = [-0.45, -0.6, 0.66];
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const j = y * w + x;
          const i = j * 4;
          if (data[i + 3] === 0) continue;
          const gx = (field[y * w + Math.min(w - 1, x + 1)] - field[y * w + Math.max(0, x - 1)]) * depth;
          const gy = (field[Math.min(h - 1, y + 1) * w + x] - field[Math.max(0, y - 1) * w + x]) * depth;
          const len = Math.hypot(gx, gy, 1);
          const nx = -gx / len;
          const ny = -gy / len;
          const nz = 1 / len;
          /* vertical environment lookup driven by the normal + position */
          let t = 0.5 + ny * 0.48 * bands + (y / h - 0.5) * 0.35 + nx * 0.08;
          t = t - Math.floor(t);
          const index = Math.round(t * 255) * 3;
          let r = lut[index];
          let g = lut[index + 1];
          let b = lut[index + 2];
          const spec = Math.pow(clamp(nx * light[0] + ny * light[1] + nz * light[2], 0, 1), 24) * 255 * shine;
          r += spec;
          g += spec;
          b += spec;
          data[i] = lerp(data[i], r, mix);
          data[i + 1] = lerp(data[i + 1], g, mix);
          data[i + 2] = lerp(data[i + 2], b, mix);
        }
      }
      commit(px);
    },
  });

  register({
    type: 'holo',
    name: '全息彩虹膜',
    cat: 'light',
    desc: '随角度变化的虹彩薄膜',
    params: [
      { key: 'scale', label: '色带宽度', type: 'range', min: 20, max: 1200, step: 1, def: 260, unit: 'px' },
      { key: 'angle', label: '角度', type: 'range', min: 0, max: 360, step: 1, def: 35, unit: '°' },
      { key: 'relief', label: '起伏影响', type: 'range', min: 0, max: 100, step: 1, def: 55, unit: '%' },
      { key: 'saturation', label: '饱和', type: 'range', min: 0, max: 100, step: 1, def: 75, unit: '%' },
      { key: 'mode', label: '混合', type: 'select', options: [['screen', '滤色'], ['overlay', '叠加'], ['color', '颜色'], ['soft-light', '柔光'], ['source-atop', '覆盖']], def: 'screen' },
      { key: 'mix', label: '强度', type: 'range', min: 0, max: 100, step: 1, def: 70, unit: '%' },
    ],
    apply(canvas, ctx, p, env) {
      const w = canvas.width;
      const h = canvas.height;
      const field = heightField(canvas, 6 * env.q, 0.6);
      const film = makeCanvas(w, h);
      const fctx = film.getContext('2d');
      const img = fctx.createImageData(w, h);
      const data = img.data;
      const src = pixels(canvas).data;
      const angle = (p.angle * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const scale = p.scale * env.q;
      const relief = p.relief / 100;
      const sat = p.saturation / 100;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const j = y * w + x;
          const i = j * 4;
          if (src[i + 3] === 0) continue;
          const t = (x * cos + y * sin) / scale + field[j] * relief * 2.2;
          const c = U.hslToRgb(t * 360, sat, 0.62);
          data[i] = c.r;
          data[i + 1] = c.g;
          data[i + 2] = c.b;
          data[i + 3] = src[i + 3];
        }
      }
      fctx.putImageData(img, 0, 0);
      const mask = U.cloneCanvas(canvas);
      ctx.globalAlpha = p.mix / 100;
      ctx.globalCompositeOperation = p.mode;
      ctx.drawImage(film, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0);
    },
  });

  register({
    type: 'emboss',
    name: '浮雕 / 斜面',
    cat: 'light',
    params: [
      { key: 'depth', label: '深度', type: 'range', min: 0, max: 100, step: 1, def: 50, unit: '%' },
      { key: 'size', label: '斜面大小', type: 'range', min: 1, max: 40, step: 1, def: 6, unit: 'px' },
      { key: 'angle', label: '光源角度', type: 'range', min: 0, max: 360, step: 1, def: 135, unit: '°' },
      { key: 'mode', label: '方式', type: 'select', options: [['bevel', '斜面光影'], ['relief', '灰色浮雕']], def: 'bevel' },
    ],
    apply(canvas, ctx, p, env) {
      const w = canvas.width;
      const h = canvas.height;
      const field = heightField(canvas, p.size * env.q, 0.4);
      const px = pixels(canvas);
      const { data } = px;
      const angle = (p.angle * Math.PI) / 180;
      const lx = Math.cos(angle);
      const ly = -Math.sin(angle);
      const depth = (p.depth / 100) * 30 * Math.max(1, p.size / 4);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const j = y * w + x;
          const i = j * 4;
          if (data[i + 3] === 0) continue;
          const gx = (field[y * w + Math.min(w - 1, x + 1)] - field[y * w + Math.max(0, x - 1)]) * depth;
          const gy = (field[Math.min(h - 1, y + 1) * w + x] - field[Math.max(0, y - 1) * w + x]) * depth;
          const shade = clamp(-(gx * lx + gy * ly), -1, 1);
          if (p.mode === 'relief') {
            const v = 128 + shade * 127;
            data[i] = v;
            data[i + 1] = v;
            data[i + 2] = v;
          } else if (shade > 0) {
            data[i] += (255 - data[i]) * shade;
            data[i + 1] += (255 - data[i + 1]) * shade;
            data[i + 2] += (255 - data[i + 2]) * shade;
          } else {
            data[i] *= 1 + shade;
            data[i + 1] *= 1 + shade;
            data[i + 2] *= 1 + shade;
          }
        }
      }
      commit(px);
    },
  });

  /* ======================= STYLIZE ======================= */

  register({
    type: 'edges',
    name: '边缘 / 霓虹描线',
    cat: 'stylize',
    params: [
      { key: 'mode', label: '方式', type: 'select', options: [['neon', '霓虹线（暗底）'], ['ink', '墨线（亮底）'], ['overlay', '叠加在原图']], def: 'neon' },
      { key: 'threshold', label: '灵敏度', type: 'range', min: 0, max: 100, step: 1, def: 55, unit: '%' },
      { key: 'color', label: '线色', type: 'color', def: '#20e3d1' },
      { key: 'bg', label: '底色', type: 'color', def: '#07070a' },
      { key: 'glow', label: '发光', type: 'range', min: 0, max: 40, step: 1, def: 6, unit: 'px' },
    ],
    pad: (p, q) => p.glow * q,
    apply(canvas, ctx, p, env) {
      const w = canvas.width;
      const h = canvas.height;
      const src = pixels(canvas).data;
      const l = new Float32Array(w * h);
      for (let i = 0, j = 0; j < l.length; i += 4, j += 1) l[j] = lum(src[i], src[i + 1], src[i + 2]) * (src[i + 3] / 255);
      const edges = makeCanvas(w, h);
      const ectx = edges.getContext('2d');
      const img = ectx.createImageData(w, h);
      const data = img.data;
      const color = hexToRgb(p.mode === 'ink' ? p.color : p.color);
      const sensitivity = 1.6 - (p.threshold / 100) * 1.4;
      for (let y = 1; y < h - 1; y += 1) {
        for (let x = 1; x < w - 1; x += 1) {
          const j = y * w + x;
          const gx = -l[j - w - 1] - 2 * l[j - 1] - l[j + w - 1] + l[j - w + 1] + 2 * l[j + 1] + l[j + w + 1];
          const gy = -l[j - w - 1] - 2 * l[j - w] - l[j - w + 1] + l[j + w - 1] + 2 * l[j + w] + l[j + w + 1];
          const mag = clamp(Math.hypot(gx, gy) / (255 * sensitivity), 0, 1);
          const i = j * 4;
          data[i] = color.r;
          data[i + 1] = color.g;
          data[i + 2] = color.b;
          data[i + 3] = mag * 255;
        }
      }
      ectx.putImageData(img, 0, 0);
      if (p.mode !== 'overlay') {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = p.mode === 'ink' ? p.bg === '#07070a' ? '#f4f1e7' : p.bg : p.bg;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = 'source-over';
      if (p.glow > 0) {
        ctx.drawImage(filtered(edges, `blur(${p.glow * env.q}px)`), 0, 0);
      }
      ctx.drawImage(edges, 0, 0);
    },
  });

  register({
    type: 'sharpen',
    name: '锐化',
    cat: 'stylize',
    params: [
      { key: 'amount', label: '强度', type: 'range', min: 0, max: 300, step: 1, def: 80, unit: '%' },
      { key: 'radius', label: '半径', type: 'range', min: 0.5, max: 10, step: 0.5, def: 1.5, unit: 'px' },
    ],
    apply(canvas, ctx, p, env) {
      const blurredData = pixels(filtered(canvas, `blur(${p.radius * env.q}px)`)).data;
      const px = pixels(canvas);
      const { data } = px;
      const amount = p.amount / 100;
      for (let i = 0; i < data.length; i += 4) {
        data[i] += (data[i] - blurredData[i]) * amount;
        data[i + 1] += (data[i + 1] - blurredData[i + 1]) * amount;
        data[i + 2] += (data[i + 2] - blurredData[i + 2]) * amount;
      }
      commit(px);
    },
  });

  register({
    type: 'motionBlur',
    name: '运动 / 缩放模糊',
    cat: 'stylize',
    params: [
      { key: 'mode', label: '方式', type: 'select', options: [['linear', '线性'], ['zoom', '缩放'], ['spin', '旋转']], def: 'linear' },
      { key: 'distance', label: '距离', type: 'range', min: 0, max: 300, step: 1, def: 40, unit: 'px' },
      { key: 'angle', label: '角度', type: 'range', min: -180, max: 180, step: 1, def: 0, unit: '°', when: (p) => p.mode === 'linear' },
      { key: 'amount', label: '缩放 / 旋转量', type: 'range', min: 0, max: 100, step: 1, def: 20, unit: '%', when: (p) => p.mode !== 'linear' },
      { key: 'samples', label: '采样', type: 'range', min: 4, max: 48, step: 1, def: 16 },
    ],
    pad: (p, q) => (p.mode === 'linear' ? p.distance * q * 0.5 : 0),
    apply(canvas, ctx, p, env) {
      const w = canvas.width;
      const h = canvas.height;
      const source = U.cloneCanvas(canvas);
      const samples = clamp(Math.round(p.samples), 2, 64);
      ctx.clearRect(0, 0, w, h);
      for (let s = 0; s < samples; s += 1) {
        const t = s / (samples - 1) - 0.5;
        ctx.save();
        ctx.globalAlpha = 1 / (s + 1);
        ctx.globalCompositeOperation = 'source-over';
        if (p.mode === 'linear') {
          const angle = (p.angle * Math.PI) / 180;
          ctx.translate(Math.cos(angle) * p.distance * env.q * t, Math.sin(angle) * p.distance * env.q * t);
        } else if (p.mode === 'zoom') {
          const scale = 1 + t * (p.amount / 100) * 0.6;
          ctx.translate(w / 2, h / 2);
          ctx.scale(scale, scale);
          ctx.translate(-w / 2, -h / 2);
        } else {
          ctx.translate(w / 2, h / 2);
          ctx.rotate(t * (p.amount / 100) * 0.6);
          ctx.translate(-w / 2, -h / 2);
        }
        ctx.drawImage(source, 0, 0);
        ctx.restore();
      }
    },
  });

  CC.effects = {
    CATEGORIES,
    register,
    get,
    list,
    defaults,
    create,
    normalize,
    padFor,
    applyStack,
    helpers: { pixels, commit, lum, filtered, replaceWith, remap, hasTransparency, rampLut, envLut, heightField, atScale },
    RAMPS,
    ENV_MAPS,
  };
})();
