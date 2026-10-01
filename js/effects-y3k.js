/* CHAOS.COLLAGE — Y3K material effects and one-click looks (extends CC.effects).
   Y3K = the post-Y2K retro-futurist direction: liquid chrome, iridescent film,
   glass / translucency, soft auras and precise tech detailing. See
   docs/research/y3k.md for the reference notes behind these choices. */
(() => {
  'use strict';

  const CC = window.CC;
  const U = CC.util;
  const { clamp, makeCanvas, hexToRgb } = U;
  const { register } = CC.effects;
  const { pixels, commit, filtered, heightField } = CC.effects.helpers;

  /* ---------------- glass refraction ---------------- */

  register({
    type: 'glass',
    name: '玻璃折射',
    cat: 'light',
    desc: '涟漪玻璃 / 棱纹玻璃 / 透镜：位移折射 + 色散 + 磨砂 + 高光',
    params: [
      { key: 'mode', label: '玻璃', type: 'select', options: [['ribbed', '棱纹玻璃'], ['ripple', '涟漪玻璃'], ['lens', '透镜（随形状起伏）']], def: 'ribbed' },
      { key: 'refraction', label: '折射', type: 'range', min: 0, max: 160, step: 1, def: 28, unit: 'px' },
      { key: 'scale', label: '纹理尺度', type: 'range', min: 6, max: 600, step: 1, def: 46, unit: 'px' },
      { key: 'angle', label: '纹理方向', type: 'range', min: 0, max: 180, step: 1, def: 0, unit: '°', when: (p) => p.mode === 'ribbed' },
      { key: 'chroma', label: '色散', type: 'range', min: 0, max: 100, step: 1, def: 30, unit: '%' },
      { key: 'frost', label: '磨砂', type: 'range', min: 0, max: 30, step: 0.5, def: 2, unit: 'px' },
      { key: 'shine', label: '高光', type: 'range', min: 0, max: 100, step: 1, def: 45, unit: '%' },
      { key: 'tint', label: '玻璃色', type: 'color', def: '#bfe6ff' },
      { key: 'tintAmount', label: '着色', type: 'range', min: 0, max: 100, step: 1, def: 10, unit: '%' },
    ],
    apply(canvas, ctx, p, env) {
      const w = canvas.width;
      const h = canvas.height;
      const amount = p.refraction * env.q;
      const S = Math.max(2, p.scale * env.q);
      const angle = (p.angle * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const noise = U.makeNoise2D((env.seed ^ U.hashString(env.layerId) ^ 0x61a55) >>> 0);
      const field = p.mode === 'lens' ? heightField(canvas, S * 0.25, 0.5) : null;
      const source = p.frost > 0 ? filtered(canvas, `blur(${p.frost * env.q}px)`) : canvas;
      const src = source.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
      const px = pixels(canvas);
      const { data } = px;
      const chroma = (p.chroma / 100) * 0.35;
      const sampleChannel = (sx, sy, c) => {
        const x = clamp(sx - 0.5, 0, w - 1);
        const y = clamp(sy - 0.5, 0, h - 1);
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = Math.min(w - 1, x0 + 1);
        const y1 = Math.min(h - 1, y0 + 1);
        const fx = x - x0;
        const fy = y - y0;
        const a = src[(y0 * w + x0) * 4 + c];
        const b = src[(y0 * w + x1) * 4 + c];
        const d = src[(y1 * w + x0) * 4 + c];
        const e = src[(y1 * w + x1) * 4 + c];
        return (a + (b - a) * fx) * (1 - fy) + (d + (e - d) * fx) * fy;
      };
      const tint = hexToRgb(p.tint);
      const tintAmount = p.tintAmount / 100;
      const shine = p.shine / 100;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          let dx = 0;
          let dy = 0;
          let highlight = 0;
          if (p.mode === 'ribbed') {
            const u = (x * cos + y * sin) / S;
            const f = u - Math.floor(u);
            /* each rib acts like a small cylindrical lens: compresses toward its center */
            const lens = (f - 0.5) * 2;
            const offset = lens * amount;
            dx = offset * cos;
            dy = offset * sin;
            highlight = Math.pow(Math.max(0, 1 - Math.abs(f - 0.22) * 9), 2) * 0.9 + Math.pow(Math.max(0, 1 - Math.abs(f - 0.97) * 14), 2) * 0.4;
          } else if (p.mode === 'ripple') {
            const e = 0.5;
            const nx = (noise((x + e) / S, y / S) - noise((x - e) / S, y / S)) * S;
            const ny = (noise(x / S, (y + e) / S) - noise(x / S, (y - e) / S)) * S;
            dx = nx * amount * 0.6;
            dy = ny * amount * 0.6;
            highlight = Math.pow(clamp(-nx * 0.6 - ny * 0.8, 0, 1), 3) * 1.2;
          } else {
            const i = y * w + x;
            const gx = field[y * w + Math.min(w - 1, x + 1)] - field[y * w + Math.max(0, x - 1)];
            const gy = field[Math.min(h - 1, y + 1) * w + x] - field[Math.max(0, y - 1) * w + x];
            dx = -gx * amount * 6;
            dy = -gy * amount * 6;
            highlight = Math.pow(clamp(-gx * 3 - gy * 4, 0, 1), 2) * (field[i] > 0 ? 1 : 0);
          }
          const index = (y * w + x) * 4;
          const cx = x + 0.5;
          const cy = y + 0.5;
          let r = sampleChannel(cx + dx * (1 + chroma), cy + dy * (1 + chroma), 0);
          let g = sampleChannel(cx + dx, cy + dy, 1);
          let b = sampleChannel(cx + dx * (1 - chroma), cy + dy * (1 - chroma), 2);
          const a = sampleChannel(cx + dx, cy + dy, 3);
          r += (tint.r - r) * tintAmount;
          g += (tint.g - g) * tintAmount;
          b += (tint.b - b) * tintAmount;
          const lift = highlight * shine * 140;
          data[index] = r + lift;
          data[index + 1] = g + lift;
          data[index + 2] = b + lift;
          data[index + 3] = a;
        }
      }
      commit(px);
      if (source !== canvas) U.releaseCanvas(source);
    },
  });

  /* ---------------- aura (soft colored halo behind the content) ---------------- */

  register({
    type: 'aura',
    name: '氛围光晕',
    cat: 'light',
    desc: '在内容背后铺一层柔和的渐变辉光（Y3K 柔光）',
    params: [
      { key: 'radius', label: '扩散', type: 'range', min: 4, max: 240, step: 1, def: 60, unit: 'px' },
      { key: 'color1', label: '颜色 1', type: 'color', def: '#8a5cff' },
      { key: 'color2', label: '颜色 2', type: 'color', def: '#20e3d1' },
      { key: 'angle', label: '渐变方向', type: 'range', min: 0, max: 360, step: 1, def: 30, unit: '°' },
      { key: 'intensity', label: '强度', type: 'range', min: 0, max: 300, step: 1, def: 140, unit: '%' },
    ],
    pad: (p, q) => p.radius * q * 2.2,
    apply(canvas, ctx, p, env) {
      const w = canvas.width;
      const h = canvas.height;
      const silhouette = makeCanvas(w, h);
      const sctx = silhouette.getContext('2d');
      sctx.drawImage(canvas, 0, 0);
      sctx.globalCompositeOperation = 'source-in';
      const angle = (p.angle * Math.PI) / 180;
      const half = Math.hypot(w, h) / 2;
      const g = sctx.createLinearGradient(w / 2 - Math.cos(angle) * half, h / 2 - Math.sin(angle) * half, w / 2 + Math.cos(angle) * half, h / 2 + Math.sin(angle) * half);
      g.addColorStop(0, p.color1);
      g.addColorStop(1, p.color2);
      sctx.fillStyle = g;
      sctx.fillRect(0, 0, w, h);
      const blurred = filtered(silhouette, `blur(${p.radius * env.q}px)`);
      ctx.globalCompositeOperation = 'destination-over';
      let strength = p.intensity / 100;
      while (strength > 0.001) {
        ctx.globalAlpha = Math.min(1, strength);
        ctx.drawImage(blurred, 0, 0);
        strength -= 1;
      }
      U.releaseCanvas(silhouette);
      U.releaseCanvas(blurred);
    },
  });

  /* ---------------- one-click looks (effect stacks + styles) ---------------- */

  const LOOKS = [
    { id: 'y3k-chrome', group: 'Y3K', name: '液态铬', effects: [['chrome', { env: 'silver', depth: 70, smooth: 12, imageRelief: 25 }], ['aura', { color1: '#bfe6ff', color2: '#ff8ad8', radius: 40, intensity: 90 }]] },
    { id: 'y3k-holo-glass', group: 'Y3K', name: '全息玻璃', effects: [['glass', { mode: 'ribbed', refraction: 24, scale: 40 }], ['holo', { mode: 'soft-light', mix: 65 }]] },
    { id: 'y3k-ice', group: 'Y3K', name: '冰蓝金属', effects: [['chrome', { env: 'ice', depth: 60, smooth: 10 }], ['glow', { threshold: 170, radius: 30, strength: 90, tint: '#9fd8ff', tintAmount: 40 }]] },
    { id: 'y3k-aura', group: 'Y3K', name: '虹彩光晕', effects: [['aura', { color1: '#8a5cff', color2: '#20e3d1', radius: 70, intensity: 160 }], ['glow', { threshold: 120, radius: 20, strength: 60 }]] },
    { id: 'y3k-reeded', group: 'Y3K', name: '棱纹玻璃', effects: [['glass', { mode: 'ribbed', refraction: 40, scale: 30, frost: 3, chroma: 45 }]] },
    { id: 'y3k-blur', group: 'Y3K', name: '速度模糊', effects: [['motionBlur', { mode: 'linear', distance: 90, samples: 24 }], ['rgbSplit', { distance: 5 }]] },
    { id: 'y3k-grain-dream', group: 'Y3K', name: '颗粒梦境', effects: [['gradientMap', { ramp: 'holo', mix: 70 }], ['glow', { threshold: 140, radius: 40, strength: 70 }], ['grain', { amount: 22, size: 1.5 }]] },
    { id: 'glitch-cyber', group: '故障', name: '赛博故障', effects: [['sliceShift', { count: 40, shift: 80, chance: 40 }], ['rgbSplit', { distance: 7 }], ['scanlines', { spacing: 4, darkness: 35, mask: 20 }]] },
    { id: 'glitch-stuck', group: '故障', name: '卡帧拖坏', effects: [['frameMosh', {}], ['rgbSplit', { distance: 4 }]] },
    { id: 'glitch-vhs', group: '故障', name: 'VHS 回忆', effects: [['vhs', {}], ['vignette', { amount: 45 }], ['grain', { amount: 18 }]] },
    { id: 'glitch-jpeg', group: '故障', name: '压缩烂图', effects: [['jpeg', { quality: 4, passes: 2 }], ['blockGlitch', { intensity: 30 }]] },
    { id: 'glitch-sort', group: '故障', name: '像素流淌', effects: [['pixelSort', { direction: 'vertical', low: 60, high: 230 }], ['melt', { length: 160 }]] },
    { id: 'print-xerox', group: '印刷', name: '复印机朋克', effects: [['xerox', {}], ['grain', { amount: 15 }]] },
    { id: 'print-halftone', group: '印刷', name: 'CMYK 网点', effects: [['adjust', { contrast: 120, saturation: 130 }], ['halftone', { mode: 'cmyk', cell: 10 }]] },
    { id: 'print-riso', group: '印刷', name: '孔版印刷', effects: [['gradientMap', { ramp: 'riso' }], ['dither', { mode: 'noise', palette: 'levels', levels: 3, scale: 1, spread: 40 }], ['grain', { amount: 12 }]] },
    { id: 'print-gameboy', group: '印刷', name: 'GameBoy', effects: [['dither', { mode: 'bayer4', palette: 'gameboy', scale: 3 }]] },
    { id: 'light-neon', group: '光效', name: '霓虹描线', effects: [['edges', { mode: 'neon', color: '#20e3d1', glow: 10 }], ['glow', { threshold: 60, radius: 24, strength: 120 }]] },
    { id: 'light-thermal', group: '光效', name: '热成像', effects: [['gradientMap', { ramp: 'thermal' }], ['glow', { threshold: 180, radius: 18 }]] },
  ];

  function lookEffects(look) {
    return look.effects.map(([type, overrides]) => CC.effects.create(type, overrides));
  }

  CC.effects.LOOKS = LOOKS;
  CC.effects.lookEffects = lookEffects;
})();
