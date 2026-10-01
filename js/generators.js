/* CHAOS.COLLAGE — parametric generator layers (CC.generators)
   A generator layer is { type: 'gen', gen: <type>, p: {...} }. draw() renders
   into the layer box with the origin at the box center (local units); env.q is
   the raster scale, so pixel-based generators can match the output resolution. */
(() => {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const U = CC.util;
  const { clamp, lerp, makeCanvas, hexToRgb, rgba } = U;

  const registry = new Map();
  const CATEGORIES = [
    ['ui', '界面部件'],
    ['code', '码与标记'],
    ['pattern', '图案纹理'],
    ['space', '空间 / 3D'],
    ['type', '文字类'],
    ['y3k', 'Y3K 未来'],
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
      values[param.key] = param.def;
    });
    return values;
  }

  function font(size, weight = 700, family = 'Arial') {
    return `${weight} ${Math.max(1, size)}px ${CC.fonts ? CC.fonts.stack(family) : family}`;
  }

  /* draw a pixel buffer generator: fill(data, W, H) at raster resolution */
  function pixelCanvas(w, h, q, fill) {
    const W = Math.max(2, Math.round(Math.abs(w) * q));
    const H = Math.max(2, Math.round(Math.abs(h) * q));
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    fill(img.data, W, H);
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /* ======================= UI ======================= */

  register({
    type: 'progress',
    name: '进度条',
    cat: 'ui',
    size: [420, 64],
    params: [
      { key: 'value', label: '进度', type: 'range', min: 0, max: 100, step: 1, def: 64, unit: '%' },
      { key: 'style', label: '样式', type: 'select', options: [['win98', 'Win98 方块'], ['xp', 'XP 圆角'], ['acid', '酸性斜纹'], ['minimal', '极简']], def: 'win98' },
      { key: 'label', label: '文字', type: 'text', def: 'LOADING...' },
      { key: 'showPercent', label: '显示百分比', type: 'bool', def: true },
      { key: 'bar', label: '进度色', type: 'color', def: '#173fbe' },
      { key: 'track', label: '轨道色', type: 'color', def: '#ffffff' },
      { key: 'frame', label: '边框色', type: 'color', def: '#111111' },
    ],
    draw(ctx, w, h, p) {
      const x = -w / 2;
      const y = -h / 2;
      const value = clamp(p.value / 100, 0, 1);
      const pad = Math.max(3, h * 0.12);
      const labelH = p.label || p.showPercent ? h * 0.36 : 0;
      const barY = y + labelH;
      const barH = h - labelH;
      if (labelH) {
        ctx.fillStyle = p.frame;
        ctx.font = font(labelH * 0.72, 700, 'Courier New');
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(p.label || '', x, y + labelH / 2);
        if (p.showPercent) {
          ctx.textAlign = 'right';
          ctx.fillText(`${Math.round(value * 100)}%`, x + w, y + labelH / 2);
        }
      }
      if (p.style === 'xp') {
        const r = barH / 2;
        ctx.fillStyle = p.track;
        ctx.strokeStyle = p.frame;
        ctx.lineWidth = Math.max(1, barH * 0.06);
        roundRect(ctx, x, barY, w, barH, r);
        ctx.fill();
        ctx.stroke();
        ctx.save();
        roundRect(ctx, x + pad, barY + pad, Math.max(0, (w - pad * 2) * value), barH - pad * 2, r);
        ctx.clip();
        const g = ctx.createLinearGradient(0, barY, 0, barY + barH);
        g.addColorStop(0, U.mixHex(p.bar, '#ffffff', 0.55));
        g.addColorStop(0.5, p.bar);
        g.addColorStop(1, U.mixHex(p.bar, '#000000', 0.3));
        ctx.fillStyle = g;
        ctx.fillRect(x, barY, w, barH);
        ctx.restore();
        return;
      }
      ctx.fillStyle = p.track;
      ctx.fillRect(x, barY, w, barH);
      ctx.strokeStyle = p.frame;
      ctx.lineWidth = Math.max(1, barH * 0.07);
      ctx.strokeRect(x, barY, w, barH);
      const innerW = w - pad * 2;
      const innerH = barH - pad * 2;
      if (p.style === 'win98') {
        const block = Math.max(4, innerH * 0.62);
        const gap = Math.max(2, block * 0.22);
        const count = Math.floor((innerW * value) / (block + gap));
        ctx.fillStyle = p.bar;
        for (let i = 0; i < count; i += 1) ctx.fillRect(x + pad + i * (block + gap), barY + pad, block, innerH);
      } else if (p.style === 'acid') {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + pad, barY + pad, innerW * value, innerH);
        ctx.clip();
        ctx.fillStyle = p.bar;
        ctx.fillRect(x + pad, barY + pad, innerW * value, innerH);
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        const stripe = Math.max(4, innerH * 0.6);
        for (let sx = x - innerH; sx < x + w; sx += stripe * 2) {
          ctx.beginPath();
          ctx.moveTo(sx, barY + barH);
          ctx.lineTo(sx + stripe, barY + barH);
          ctx.lineTo(sx + stripe + innerH * 1.4, barY);
          ctx.lineTo(sx + innerH * 1.4, barY);
          ctx.fill();
        }
        ctx.restore();
      } else {
        ctx.fillStyle = p.bar;
        ctx.fillRect(x + pad, barY + pad, innerW * value, innerH);
      }
    },
  });

  register({
    type: 'browser',
    name: '浏览器窗口',
    cat: 'ui',
    size: [520, 360],
    params: [
      { key: 'title', label: '标题', type: 'text', def: 'Untitled - Internet Explorer' },
      { key: 'url', label: '地址', type: 'text', def: 'http://www.chaos-collage.net/' },
      { key: 'accent', label: '标题栏', type: 'color', def: '#0a246a' },
      { key: 'accent2', label: '渐变色', type: 'color', def: '#a6caf0' },
      { key: 'body', label: '页面色', type: 'color', def: '#ffffff' },
      { key: 'chrome', label: '框体色', type: 'color', def: '#c0c0c0' },
      { key: 'scroll', label: '滚动条', type: 'bool', def: true },
    ],
    draw(ctx, w, h, p) {
      const x = -w / 2;
      const y = -h / 2;
      const title = clamp(h * 0.075, 14, 30);
      const bar = clamp(h * 0.08, 16, 34);
      bevel(ctx, x, y, w, h, p.chrome);
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, p.accent);
      g.addColorStop(1, p.accent2);
      ctx.fillStyle = g;
      ctx.fillRect(x + 4, y + 4, w - 8, title);
      ctx.fillStyle = '#ffffff';
      ctx.font = font(title * 0.58, 700, 'Tahoma');
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(p.title, x + 10, y + 4 + title / 2, w - title * 4);
      for (let i = 0; i < 3; i += 1) {
        const bx = x + w - 8 - (i + 1) * (title * 0.95);
        bevel(ctx, bx, y + 6, title * 0.85, title - 4, p.chrome);
      }
      const toolbarY = y + 6 + title;
      ctx.fillStyle = p.chrome;
      ctx.fillRect(x + 4, toolbarY, w - 8, bar * 2);
      ctx.fillStyle = '#111111';
      ctx.font = font(bar * 0.48, 400, 'Tahoma');
      ['File', 'Edit', 'View', 'Favorites', 'Help'].forEach((item, index) => {
        ctx.fillText(item, x + 12 + index * bar * 2.4, toolbarY + bar / 2);
      });
      const fieldY = toolbarY + bar + 2;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 10 + bar * 2, fieldY, w - 24 - bar * 2, bar - 6);
      ctx.strokeStyle = '#808080';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 10 + bar * 2, fieldY, w - 24 - bar * 2, bar - 6);
      ctx.fillStyle = '#111111';
      ctx.fillText('Address', x + 10, fieldY + (bar - 6) / 2);
      ctx.fillText(p.url, x + 16 + bar * 2, fieldY + (bar - 6) / 2, w - 40 - bar * 2);
      const bodyY = toolbarY + bar * 2 + 4;
      const scrollW = p.scroll ? clamp(w * 0.04, 12, 22) : 0;
      ctx.fillStyle = p.body;
      ctx.fillRect(x + 6, bodyY, w - 12 - scrollW, y + h - 6 - bodyY);
      if (p.scroll) {
        ctx.fillStyle = '#dcdcdc';
        ctx.fillRect(x + w - 6 - scrollW, bodyY, scrollW, y + h - 6 - bodyY);
        bevel(ctx, x + w - 6 - scrollW, bodyY, scrollW, scrollW, p.chrome);
        bevel(ctx, x + w - 6 - scrollW, y + h - 6 - scrollW, scrollW, scrollW, p.chrome);
        bevel(ctx, x + w - 6 - scrollW, bodyY + scrollW * 1.4, scrollW, (y + h - bodyY) * 0.3, p.chrome);
      }
    },
  });

  register({
    type: 'taskbar',
    name: '任务栏',
    cat: 'ui',
    size: [640, 44],
    params: [
      { key: 'start', label: '开始按钮', type: 'text', def: 'Start' },
      { key: 'clock', label: '时间', type: 'text', def: '4:20 AM' },
      { key: 'tabs', label: '任务', type: 'text', def: 'My Computer|untitled.bmp|ERROR.exe' },
      { key: 'style', label: '样式', type: 'select', options: [['win98', 'Win98 灰'], ['xp', 'XP 蓝']], def: 'win98' },
    ],
    draw(ctx, w, h, p) {
      const x = -w / 2;
      const y = -h / 2;
      const xp = p.style === 'xp';
      if (xp) {
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, '#3a8cf5');
        g.addColorStop(0.15, '#245edb');
        g.addColorStop(1, '#1941a5');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
      } else {
        bevel(ctx, x, y, w, h, '#c0c0c0');
      }
      const startW = Math.max(h * 2.2, 60);
      if (xp) {
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, '#5eac56');
        g.addColorStop(1, '#2f8f2a');
        ctx.fillStyle = g;
        roundRect(ctx, x, y, startW, h, h * 0.45);
        ctx.fill();
      } else bevel(ctx, x + 4, y + 4, startW, h - 8, '#c0c0c0');
      ctx.fillStyle = xp ? '#ffffff' : '#111111';
      ctx.font = font(h * 0.42, 700, xp ? 'Trebuchet MS' : 'Tahoma');
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(p.start, x + 12, y + h / 2);
      const clockW = Math.max(h * 2, 70);
      if (!xp) {
        ctx.strokeStyle = '#808080';
        ctx.strokeRect(x + w - clockW - 4, y + 5, clockW, h - 10);
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = xp ? '#ffffff' : '#111111';
      ctx.font = font(h * 0.34, 400, 'Tahoma');
      ctx.fillText(p.clock, x + w - clockW / 2 - 4, y + h / 2);
      const tabs = String(p.tabs || '').split('|').filter(Boolean);
      const tabW = Math.min(h * 4.2, (w - startW - clockW - 30) / Math.max(1, tabs.length));
      tabs.forEach((tab, index) => {
        const tx = x + startW + 12 + index * (tabW + 4);
        if (xp) {
          ctx.fillStyle = index === 0 ? '#1e4fb8' : '#3c81f3';
          roundRect(ctx, tx, y + 4, tabW, h - 8, 4);
          ctx.fill();
        } else bevel(ctx, tx, y + 4, tabW, h - 8, '#c0c0c0', index === 0);
        ctx.fillStyle = xp ? '#ffffff' : '#111111';
        ctx.textAlign = 'left';
        ctx.fillText(tab, tx + 8, y + h / 2, tabW - 14);
      });
    },
  });

  /* ======================= CODE ======================= */

  register({
    type: 'qrcode',
    name: '伪二维码',
    cat: 'code',
    size: [220, 220],
    params: [
      { key: 'modules', label: '模块数', type: 'range', min: 21, max: 57, step: 4, def: 29 },
      { key: 'density', label: '密度', type: 'range', min: 20, max: 80, step: 1, def: 50, unit: '%' },
      { key: 'salt', label: '图案', type: 'range', min: 0, max: 999, step: 1, def: 7 },
      { key: 'fg', label: '前景', type: 'color', def: '#111111' },
      { key: 'bg', label: '背景', type: 'color', def: '#f4f1e7' },
      { key: 'dots', label: '圆点模块', type: 'bool', def: false },
    ],
    draw(ctx, w, h, p, env) {
      const n = Math.round(p.modules);
      const quiet = 2;
      const total = n + quiet * 2;
      const cw = w / total;
      const ch = h / total;
      const x0 = -w / 2;
      const y0 = -h / 2;
      ctx.fillStyle = p.bg;
      ctx.fillRect(x0, y0, w, h);
      const random = U.rng(env.seed, env.layerId, 'qr', p.salt);
      const finder = (gx, gy) => gx < 8 && gy < 8 || gx >= n - 8 && gy < 8 || gx < 8 && gy >= n - 8;
      ctx.fillStyle = p.fg;
      for (let gy = 0; gy < n; gy += 1) {
        for (let gx = 0; gx < n; gx += 1) {
          if (finder(gx, gy)) continue;
          const timing = (gx === 6 || gy === 6) && (gx + gy) % 2 === 0;
          if (timing || random() < p.density / 100) {
            const px = x0 + (gx + quiet) * cw;
            const py = y0 + (gy + quiet) * ch;
            if (p.dots) {
              ctx.beginPath();
              ctx.ellipse(px + cw / 2, py + ch / 2, cw * 0.42, ch * 0.42, 0, 0, Math.PI * 2);
              ctx.fill();
            } else ctx.fillRect(px, py, cw + 0.4, ch + 0.4);
          }
        }
      }
      [[0, 0], [n - 7, 0], [0, n - 7]].forEach(([gx, gy]) => {
        const px = x0 + (gx + quiet) * cw;
        const py = y0 + (gy + quiet) * ch;
        ctx.fillStyle = p.fg;
        ctx.fillRect(px, py, cw * 7, ch * 7);
        ctx.fillStyle = p.bg;
        ctx.fillRect(px + cw, py + ch, cw * 5, ch * 5);
        ctx.fillStyle = p.fg;
        ctx.fillRect(px + cw * 2, py + ch * 2, cw * 3, ch * 3);
      });
    },
  });

  /* ======================= PATTERN ======================= */

  register({
    type: 'rings',
    name: '雷达同心圆',
    cat: 'pattern',
    size: [360, 360],
    params: [
      { key: 'count', label: '圈数', type: 'range', min: 1, max: 40, step: 1, def: 8 },
      { key: 'width', label: '线宽', type: 'range', min: 0.5, max: 40, step: 0.5, def: 3, unit: 'px' },
      { key: 'color', label: '颜色', type: 'color', def: '#20e3d1' },
      { key: 'crosshair', label: '十字准星', type: 'bool', def: true },
      { key: 'dashed', label: '虚线', type: 'bool', def: false },
      { key: 'fade', label: '外圈渐隐', type: 'range', min: 0, max: 100, step: 1, def: 30, unit: '%' },
    ],
    draw(ctx, w, h, p) {
      const rx = w / 2;
      const ry = h / 2;
      const count = Math.round(p.count);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width;
      if (p.dashed) ctx.setLineDash([p.width * 4, p.width * 3]);
      for (let i = 1; i <= count; i += 1) {
        const t = i / count;
        ctx.globalAlpha = 1 - (p.fade / 100) * t;
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.max(0.1, rx * t - p.width / 2), Math.max(0.1, ry * t - p.width / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      if (p.crosshair) {
        ctx.beginPath();
        ctx.moveTo(-rx, 0);
        ctx.lineTo(rx, 0);
        ctx.moveTo(0, -ry);
        ctx.lineTo(0, ry);
        ctx.stroke();
      }
    },
  });

  register({
    type: 'grid',
    name: '网格 / 透视地面',
    cat: 'pattern',
    size: [600, 400],
    params: [
      { key: 'mode', label: '方式', type: 'select', options: [['flat', '平面网格'], ['floor', '透视地面'], ['tunnel', '透视隧道']], def: 'floor' },
      { key: 'cols', label: '列数', type: 'range', min: 2, max: 60, step: 1, def: 16 },
      { key: 'rows', label: '行数', type: 'range', min: 2, max: 60, step: 1, def: 12 },
      { key: 'width', label: '线宽', type: 'range', min: 0.5, max: 12, step: 0.5, def: 2, unit: 'px' },
      { key: 'color', label: '线色', type: 'color', def: '#ff4ca7' },
      { key: 'bgOn', label: '填充底色', type: 'bool', def: false },
      { key: 'bg', label: '底色', type: 'color', def: '#120024' },
      { key: 'glow', label: '发光', type: 'range', min: 0, max: 30, step: 1, def: 8, unit: 'px' },
    ],
    draw(ctx, w, h, p) {
      const x0 = -w / 2;
      const y0 = -h / 2;
      if (p.bgOn) {
        ctx.fillStyle = p.bg;
        ctx.fillRect(x0, y0, w, h);
      }
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.glow;
      ctx.beginPath();
      const cols = Math.round(p.cols);
      const rows = Math.round(p.rows);
      if (p.mode === 'flat') {
        for (let i = 0; i <= cols; i += 1) {
          const x = x0 + (i / cols) * w;
          ctx.moveTo(x, y0);
          ctx.lineTo(x, y0 + h);
        }
        for (let j = 0; j <= rows; j += 1) {
          const y = y0 + (j / rows) * h;
          ctx.moveTo(x0, y);
          ctx.lineTo(x0 + w, y);
        }
      } else if (p.mode === 'floor') {
        const horizon = y0;
        for (let i = -cols; i <= cols * 2; i += 1) {
          const t = i / cols;
          ctx.moveTo(x0 + w / 2 + (t - 0.5) * w * 0.08, horizon);
          ctx.lineTo(x0 + t * w * 3 - w, y0 + h);
        }
        for (let j = 1; j <= rows; j += 1) {
          const t = Math.pow(j / rows, 2.2);
          const y = horizon + t * h;
          ctx.moveTo(x0, y);
          ctx.lineTo(x0 + w, y);
        }
      } else {
        for (let j = 0; j <= rows; j += 1) {
          const t = Math.pow(j / rows, 1.8);
          const rw = w * (1 - t * 0.92);
          const rh = h * (1 - t * 0.92);
          ctx.rect(-rw / 2, -rh / 2, rw, rh);
        }
        for (let i = 0; i <= cols; i += 1) {
          const t = i / cols;
          ctx.moveTo(x0 + t * w, y0);
          ctx.lineTo(-w * 0.04 + t * w * 0.08, -h * 0.04);
          ctx.moveTo(x0 + t * w, y0 + h);
          ctx.lineTo(-w * 0.04 + t * w * 0.08, h * 0.04);
        }
        for (let j = 0; j <= Math.round(rows / 2); j += 1) {
          const t = j / Math.round(rows / 2);
          ctx.moveTo(x0, y0 + t * h);
          ctx.lineTo(-w * 0.04, -h * 0.04 + t * h * 0.08);
          ctx.moveTo(x0 + w, y0 + t * h);
          ctx.lineTo(w * 0.04, -h * 0.04 + t * h * 0.08);
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    },
  });

  register({
    type: 'dots',
    name: '点阵 / 网点渐变',
    cat: 'pattern',
    size: [400, 400],
    params: [
      { key: 'spacing', label: '间距', type: 'range', min: 4, max: 80, step: 1, def: 16, unit: 'px' },
      { key: 'size', label: '点大小', type: 'range', min: 5, max: 100, step: 1, def: 45, unit: '%' },
      { key: 'gradient', label: '渐变', type: 'select', options: [['none', '无'], ['linear', '线性渐小'], ['radial', '径向渐小'], ['noise', '噪声']], def: 'linear' },
      { key: 'angle', label: '渐变方向', type: 'range', min: 0, max: 360, step: 1, def: 90, unit: '°' },
      { key: 'shape', label: '点形', type: 'select', options: [['dot', '圆'], ['square', '方'], ['plus', '加号']], def: 'dot' },
      { key: 'color', label: '颜色', type: 'color', def: '#111111' },
    ],
    draw(ctx, w, h, p, env) {
      const s = Math.max(2, p.spacing);
      const angle = (p.angle * Math.PI) / 180;
      const noise = U.makeNoise2D((env.seed ^ 0xd075) >>> 0);
      ctx.fillStyle = p.color;
      const path = new Path2D();
      for (let y = -h / 2 + s / 2; y < h / 2; y += s) {
        for (let x = -w / 2 + s / 2; x < w / 2; x += s) {
          let t = 1;
          if (p.gradient === 'linear') t = clamp(0.5 + (x * Math.cos(angle) + y * Math.sin(angle)) / Math.hypot(w, h) * 1.4, 0, 1);
          if (p.gradient === 'radial') t = clamp(1 - Math.hypot(x / (w / 2), y / (h / 2)) * 0.75, 0, 1);
          if (p.gradient === 'noise') t = noise(x / (s * 5), y / (s * 5));
          const r = (s / 2) * (p.size / 100) * t * 1.4;
          if (r < 0.2) continue;
          if (p.shape === 'square') path.rect(x - r, y - r, r * 2, r * 2);
          else if (p.shape === 'plus') {
            path.rect(x - r, y - r * 0.3, r * 2, r * 0.6);
            path.rect(x - r * 0.3, y - r, r * 0.6, r * 2);
          } else {
            path.moveTo(x + r, y);
            path.arc(x, y, r, 0, Math.PI * 2);
          }
        }
      }
      ctx.fill(path);
    },
  });

  register({
    type: 'stripes',
    name: '条纹 / 警示带',
    cat: 'pattern',
    size: [500, 120],
    params: [
      { key: 'angle', label: '角度', type: 'range', min: -90, max: 90, step: 1, def: 45, unit: '°' },
      { key: 'width', label: '条宽', type: 'range', min: 2, max: 120, step: 1, def: 26, unit: 'px' },
      { key: 'gap', label: '间隔', type: 'range', min: 0, max: 120, step: 1, def: 26, unit: 'px' },
      { key: 'c1', label: '条纹色', type: 'color', def: '#111111' },
      { key: 'c2On', label: '填充间隔', type: 'bool', def: true },
      { key: 'c2', label: '间隔色', type: 'color', def: '#ffd400' },
    ],
    draw(ctx, w, h, p) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      ctx.clip();
      if (p.c2On) {
        ctx.fillStyle = p.c2;
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.rotate((p.angle * Math.PI) / 180);
      const span = Math.hypot(w, h);
      ctx.fillStyle = p.c1;
      for (let x = -span; x < span; x += p.width + p.gap) ctx.fillRect(x, -span, p.width, span * 2);
      ctx.restore();
    },
  });

  register({
    type: 'checker',
    name: '棋盘格',
    cat: 'pattern',
    size: [400, 400],
    params: [
      { key: 'size', label: '格子', type: 'range', min: 4, max: 200, step: 1, def: 40, unit: 'px' },
      { key: 'c1', label: '颜色 1', type: 'color', def: '#111111' },
      { key: 'c2', label: '颜色 2', type: 'color', def: '#f4f1e7' },
      { key: 'warp', label: '波浪扭曲', type: 'range', min: 0, max: 100, step: 1, def: 0, unit: '%' },
    ],
    draw(ctx, w, h, p, env) {
      const size = Math.max(2, p.size);
      const canvas = pixelCanvas(w, h, env.q, (data, W, H) => {
        const c1 = hexToRgb(p.c1);
        const c2 = hexToRgb(p.c2);
        const s = size * env.q;
        const amp = (p.warp / 100) * s * 1.4;
        for (let y = 0; y < H; y += 1) {
          for (let x = 0; x < W; x += 1) {
            const wx = x + Math.sin(y / (s * 1.7)) * amp;
            const wy = y + Math.sin(x / (s * 1.9)) * amp;
            const odd = (Math.floor(wx / s) + Math.floor(wy / s)) & 1;
            const c = odd ? c2 : c1;
            const i = (y * W + x) * 4;
            data[i] = c.r;
            data[i + 1] = c.g;
            data[i + 2] = c.b;
            data[i + 3] = 255;
          }
        }
      });
      ctx.drawImage(canvas, -w / 2, -h / 2, w, h);
    },
  });

  register({
    type: 'spiral',
    name: '螺旋',
    cat: 'pattern',
    size: [360, 360],
    params: [
      { key: 'turns', label: '圈数', type: 'range', min: 1, max: 30, step: 0.5, def: 8 },
      { key: 'width', label: '线宽', type: 'range', min: 0.5, max: 40, step: 0.5, def: 6, unit: 'px' },
      { key: 'kind', label: '类型', type: 'select', options: [['archimedean', '等距'], ['log', '对数（鹦鹉螺）'], ['hypno', '催眠双螺旋']], def: 'archimedean' },
      { key: 'color', label: '颜色', type: 'color', def: '#111111' },
    ],
    draw(ctx, w, h, p) {
      const turns = p.turns;
      const steps = Math.round(turns * 120);
      const drawArm = (offset) => {
        ctx.beginPath();
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          const a = t * turns * Math.PI * 2 + offset;
          const r = p.kind === 'log' ? Math.pow(t, 2.4) : t;
          const x = Math.cos(a) * r * (w / 2 - p.width);
          const y = Math.sin(a) * r * (h / 2 - p.width);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width;
      ctx.lineCap = 'round';
      drawArm(0);
      if (p.kind === 'hypno') drawArm(Math.PI);
    },
  });

  register({
    type: 'waveform',
    name: '声波 / 频谱',
    cat: 'pattern',
    size: [520, 140],
    params: [
      { key: 'bars', label: '数量', type: 'range', min: 8, max: 240, step: 1, def: 72 },
      { key: 'style', label: '样式', type: 'select', options: [['bars', '柱状'], ['mirror', '对称柱'], ['line', '波形线'], ['dots', '点阵']], def: 'mirror' },
      { key: 'smooth', label: '平滑', type: 'range', min: 0, max: 100, step: 1, def: 40, unit: '%' },
      { key: 'salt', label: '图案', type: 'range', min: 0, max: 999, step: 1, def: 3 },
      { key: 'color', label: '颜色', type: 'color', def: '#111111' },
      { key: 'color2', label: '渐变色', type: 'color', def: '#ff4ca7' },
    ],
    draw(ctx, w, h, p, env) {
      const random = U.rng(env.seed, env.layerId, 'wave', p.salt);
      const n = Math.round(p.bars);
      const values = [];
      let prev = random();
      for (let i = 0; i < n; i += 1) {
        const raw = Math.pow(random(), 1.6) * (0.4 + 0.6 * Math.sin((i / n) * Math.PI));
        prev = lerp(raw, prev, p.smooth / 100 * 0.85);
        values.push(clamp(prev, 0.03, 1));
      }
      const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      g.addColorStop(0, p.color);
      g.addColorStop(1, p.color2);
      ctx.fillStyle = g;
      ctx.strokeStyle = g;
      const step = w / n;
      if (p.style === 'line') {
        ctx.lineWidth = Math.max(1, step * 0.4);
        ctx.beginPath();
        values.forEach((v, i) => {
          const x = -w / 2 + i * step;
          const y = (i % 2 ? 1 : -1) * v * h / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        return;
      }
      values.forEach((v, i) => {
        const x = -w / 2 + i * step + step * 0.15;
        const bw = step * 0.7;
        if (p.style === 'bars') ctx.fillRect(x, h / 2 - v * h, bw, v * h);
        else if (p.style === 'mirror') ctx.fillRect(x, -v * h / 2, bw, v * h);
        else {
          const dots = Math.max(1, Math.round(v * 10));
          for (let d = 0; d < dots; d += 1) {
            ctx.beginPath();
            ctx.arc(x + bw / 2, h / 2 - (d + 0.5) * (h / 10), Math.min(bw, h / 10) * 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
    },
  });

  register({
    type: 'contour',
    name: '等高线',
    cat: 'pattern',
    size: [480, 480],
    params: [
      { key: 'levels', label: '层数', type: 'range', min: 2, max: 40, step: 1, def: 14 },
      { key: 'scale', label: '起伏尺度', type: 'range', min: 20, max: 1200, step: 1, def: 260, unit: 'px' },
      { key: 'width', label: '线宽', type: 'range', min: 0.5, max: 10, step: 0.5, def: 1.5, unit: 'px' },
      { key: 'color', label: '线色', type: 'color', def: '#111111' },
      { key: 'salt', label: '地形', type: 'range', min: 0, max: 999, step: 1, def: 11 },
    ],
    draw(ctx, w, h, p, env) {
      const noise = U.makeNoise2D((env.seed ^ U.hashString(`contour${p.salt}`)) >>> 0);
      const step = Math.max(2, Math.min(w, h) / 140);
      const cols = Math.ceil(w / step) + 1;
      const rows = Math.ceil(h / step) + 1;
      const field = new Float32Array(cols * rows);
      const scale = 1 / Math.max(5, p.scale);
      for (let j = 0; j < rows; j += 1) {
        for (let i = 0; i < cols; i += 1) {
          field[j * cols + i] = U.fbm(noise, i * step * scale, j * step * scale, 4);
        }
      }
      const levels = Math.round(p.levels);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width;
      ctx.lineJoin = 'round';
      const path = new Path2D();
      const ox = -w / 2;
      const oy = -h / 2;
      for (let k = 1; k <= levels; k += 1) {
        const level = 0.18 + (k / (levels + 1)) * 0.64;
        for (let j = 0; j < rows - 1; j += 1) {
          for (let i = 0; i < cols - 1; i += 1) {
            const a = field[j * cols + i];
            const b = field[j * cols + i + 1];
            const c = field[(j + 1) * cols + i + 1];
            const d = field[(j + 1) * cols + i];
            const code = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
            if (code === 0 || code === 15) continue;
            const x = ox + i * step;
            const y = oy + j * step;
            const lerpT = (v0, v1) => (level - v0) / (v1 - v0 || 1e-6);
            const top = [x + lerpT(a, b) * step, y];
            const right = [x + step, y + lerpT(b, c) * step];
            const bottom = [x + lerpT(d, c) * step, y + step];
            const left = [x, y + lerpT(a, d) * step];
            const seg = (p1, p2) => {
              path.moveTo(p1[0], p1[1]);
              path.lineTo(p2[0], p2[1]);
            };
            switch (code) {
              case 1: case 14: seg(left, bottom); break;
              case 2: case 13: seg(bottom, right); break;
              case 3: case 12: seg(left, right); break;
              case 4: case 11: seg(top, right); break;
              case 5: seg(left, top); seg(bottom, right); break;
              case 6: case 9: seg(top, bottom); break;
              case 7: case 8: seg(left, top); break;
              case 10: seg(left, bottom); seg(top, right); break;
              default: break;
            }
          }
        }
      }
      ctx.stroke(path);
    },
  });

  register({
    type: 'noise',
    name: '噪声纹理',
    cat: 'pattern',
    size: [480, 480],
    params: [
      { key: 'kind', label: '类型', type: 'select', options: [['smooth', '云雾'], ['ridged', '山脊'], ['marble', '大理石'], ['static', '雪花噪点']], def: 'smooth' },
      { key: 'scale', label: '尺度', type: 'range', min: 4, max: 1000, step: 1, def: 180, unit: 'px' },
      { key: 'contrast', label: '对比', type: 'range', min: 20, max: 400, step: 1, def: 140, unit: '%' },
      { key: 'c1', label: '暗色', type: 'color', def: '#111111' },
      { key: 'c2', label: '亮色', type: 'color', def: '#f4f1e7' },
      { key: 'salt', label: '图案', type: 'range', min: 0, max: 999, step: 1, def: 5 },
    ],
    draw(ctx, w, h, p, env) {
      const noise = U.makeNoise2D((env.seed ^ U.hashString(`noise${p.salt}`)) >>> 0);
      const c1 = hexToRgb(p.c1);
      const c2 = hexToRgb(p.c2);
      const random = U.rng(env.seed, env.layerId, 'static', p.salt);
      const canvas = pixelCanvas(w, h, env.q, (data, W, H) => {
        const scale = 1 / Math.max(1, p.scale * env.q);
        const contrast = p.contrast / 100;
        for (let y = 0; y < H; y += 1) {
          for (let x = 0; x < W; x += 1) {
            let v;
            if (p.kind === 'static') v = random();
            else {
              v = U.fbm(noise, x * scale, y * scale, 5);
              if (p.kind === 'ridged') v = 1 - Math.abs(v * 2 - 1);
              if (p.kind === 'marble') v = 0.5 + 0.5 * Math.sin((x * scale * 6 + v * 10));
            }
            v = clamp((v - 0.5) * contrast + 0.5, 0, 1);
            const i = (y * W + x) * 4;
            data[i] = lerp(c1.r, c2.r, v);
            data[i + 1] = lerp(c1.g, c2.g, v);
            data[i + 2] = lerp(c1.b, c2.b, v);
            data[i + 3] = 255;
          }
        }
      });
      ctx.drawImage(canvas, -w / 2, -h / 2, w, h);
    },
  });

  register({
    type: 'starfield',
    name: '星空 / 闪烁',
    cat: 'pattern',
    size: [500, 400],
    params: [
      { key: 'count', label: '星数', type: 'range', min: 5, max: 800, step: 1, def: 160 },
      { key: 'sparkles', label: '十字闪光', type: 'range', min: 0, max: 100, step: 1, def: 12, unit: '%' },
      { key: 'size', label: '大小', type: 'range', min: 0.5, max: 12, step: 0.5, def: 2, unit: 'px' },
      { key: 'color', label: '颜色', type: 'color', def: '#ffffff' },
      { key: 'salt', label: '分布', type: 'range', min: 0, max: 999, step: 1, def: 1 },
    ],
    draw(ctx, w, h, p, env) {
      const random = U.rng(env.seed, env.layerId, 'stars', p.salt);
      ctx.fillStyle = p.color;
      for (let i = 0; i < p.count; i += 1) {
        const x = (random() - 0.5) * w;
        const y = (random() - 0.5) * h;
        const r = p.size * (0.3 + Math.pow(random(), 3) * 1.4);
        ctx.globalAlpha = 0.4 + random() * 0.6;
        if (random() < p.sparkles / 100) {
          const s = r * 5;
          ctx.beginPath();
          ctx.moveTo(x, y - s);
          ctx.quadraticCurveTo(x, y, x + s, y);
          ctx.quadraticCurveTo(x, y, x, y + s);
          ctx.quadraticCurveTo(x, y, x - s, y);
          ctx.quadraticCurveTo(x, y, x, y - s);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    },
  });

  /* ======================= SPACE / 3D ======================= */

  register({
    type: 'orb',
    name: 'Y2K 光球',
    cat: 'space',
    size: [300, 300],
    params: [
      { key: 'c1', label: '中心色', type: 'color', def: '#ffffff' },
      { key: 'c2', label: '主体色', type: 'color', def: '#3265ff' },
      { key: 'c3', label: '边缘色', type: 'color', def: '#0b0b2a' },
      { key: 'gloss', label: '高光', type: 'range', min: 0, max: 100, step: 1, def: 80, unit: '%' },
      { key: 'ring', label: '光环', type: 'bool', def: false },
      { key: 'ringColor', label: '光环色', type: 'color', def: '#d7ff2f' },
      { key: 'glow', label: '外发光', type: 'range', min: 0, max: 80, step: 1, def: 0, unit: 'px' },
    ],
    draw(ctx, w, h, p) {
      const rx = w / 2 * 0.86;
      const ry = h / 2 * 0.86;
      ctx.save();
      ctx.scale(1, ry / rx);
      if (p.glow > 0) {
        ctx.shadowColor = p.c2;
        ctx.shadowBlur = p.glow;
      }
      const g = ctx.createRadialGradient(-rx * 0.3, -rx * 0.35, rx * 0.05, 0, 0, rx);
      g.addColorStop(0, p.c1);
      g.addColorStop(0.45, p.c2);
      g.addColorStop(1, p.c3);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (p.gloss > 0) {
        const hg = ctx.createLinearGradient(0, -rx, 0, -rx * 0.1);
        hg.addColorStop(0, `rgba(255,255,255,${(p.gloss / 100) * 0.9})`);
        hg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.ellipse(0, -rx * 0.48, rx * 0.68, rx * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${(p.gloss / 100) * 0.35})`;
        ctx.beginPath();
        ctx.ellipse(rx * 0.35, rx * 0.55, rx * 0.25, rx * 0.12, -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      if (p.ring) {
        ctx.strokeStyle = p.ringColor;
        ctx.lineWidth = Math.max(2, w * 0.025);
        ctx.beginPath();
        ctx.ellipse(0, 0, w / 2 * 0.98, h / 2 * 0.24, -0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
  });

  register({
    type: 'flare',
    name: '镜头星芒',
    cat: 'space',
    size: [360, 360],
    params: [
      { key: 'rays', label: '光芒数', type: 'range', min: 2, max: 16, step: 1, def: 4 },
      { key: 'thin', label: '光芒细度', type: 'range', min: 1, max: 100, step: 1, def: 70, unit: '%' },
      { key: 'core', label: '光核', type: 'range', min: 0, max: 100, step: 1, def: 30, unit: '%' },
      { key: 'color', label: '颜色', type: 'color', def: '#ffffff' },
      { key: 'tint', label: '光晕色', type: 'color', def: '#20e3d1' },
      { key: 'halo', label: '光晕', type: 'range', min: 0, max: 100, step: 1, def: 45, unit: '%' },
    ],
    draw(ctx, w, h, p) {
      const r = Math.min(w, h) / 2;
      ctx.globalCompositeOperation = 'lighter';
      if (p.halo > 0) {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, rgba(p.tint, (p.halo / 100) * 0.7));
        g.addColorStop(0.4, rgba(p.tint, (p.halo / 100) * 0.18));
        g.addColorStop(1, rgba(p.tint, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const n = Math.round(p.rays);
      const inner = r * (1 - p.thin / 100) * 0.25 + 0.5;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const a2 = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * w / 2;
        const y = Math.sin(a) * h / 2;
        const cx = Math.cos(a2) * inner;
        const cy = Math.sin(a2) * inner;
        if (i === 0) ctx.moveTo(x, y);
        ctx.quadraticCurveTo(cx * 0.3, cy * 0.3, Math.cos(((i + 1) / n) * Math.PI * 2 - Math.PI / 2) * w / 2, Math.sin(((i + 1) / n) * Math.PI * 2 - Math.PI / 2) * h / 2);
      }
      ctx.fill();
      if (p.core > 0) {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * (p.core / 100));
        g.addColorStop(0, rgba(p.color, 1));
        g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r * (p.core / 100), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  });

  function rotate3(point, ax, ay) {
    const [x, y, z] = point;
    const cy = Math.cos(ay);
    const sy = Math.sin(ay);
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const cx = Math.cos(ax);
    const sx = Math.sin(ax);
    return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
  }

  function drawWire(ctx, lines, w, h, p) {
    const persp = 3.2;
    const project = ([x, y, z]) => {
      const k = persp / (persp - z);
      return [x * k * (w / 2) * 0.82, y * k * (h / 2) * 0.82];
    };
    ctx.lineWidth = p.width;
    ctx.lineCap = 'round';
    for (const pass of ['back', 'front']) {
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = pass === 'back' ? p.back / 100 : 1;
      if (ctx.globalAlpha <= 0) continue;
      ctx.beginPath();
      lines.forEach((pts) => {
        for (let i = 0; i < pts.length - 1; i += 1) {
          const a = pts[i];
          const b = pts[i + 1];
          const front = (a[2] + b[2]) / 2 >= -0.05;
          if ((pass === 'front') !== front) continue;
          const pa = project(a);
          const pb = project(b);
          ctx.moveTo(pa[0], pa[1]);
          ctx.lineTo(pb[0], pb[1]);
        }
      });
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  register({
    type: 'wireSphere',
    name: '线框球体',
    cat: 'space',
    size: [320, 320],
    params: [
      { key: 'lat', label: '纬线', type: 'range', min: 2, max: 36, step: 1, def: 10 },
      { key: 'lon', label: '经线', type: 'range', min: 2, max: 48, step: 1, def: 16 },
      { key: 'tiltX', label: '俯仰', type: 'range', min: -90, max: 90, step: 1, def: 22, unit: '°' },
      { key: 'tiltY', label: '旋转', type: 'range', min: -180, max: 180, step: 1, def: 18, unit: '°' },
      { key: 'width', label: '线宽', type: 'range', min: 0.5, max: 10, step: 0.5, def: 1.5, unit: 'px' },
      { key: 'back', label: '背面可见', type: 'range', min: 0, max: 100, step: 1, def: 25, unit: '%' },
      { key: 'color', label: '颜色', type: 'color', def: '#111111' },
    ],
    draw(ctx, w, h, p) {
      const ax = (p.tiltX * Math.PI) / 180;
      const ay = (p.tiltY * Math.PI) / 180;
      const lines = [];
      const seg = 64;
      for (let i = 1; i < p.lat; i += 1) {
        const phi = (i / p.lat) * Math.PI - Math.PI / 2;
        const pts = [];
        for (let k = 0; k <= seg; k += 1) {
          const t = (k / seg) * Math.PI * 2;
          pts.push(rotate3([Math.cos(phi) * Math.cos(t), Math.sin(phi), Math.cos(phi) * Math.sin(t)], ax, ay));
        }
        lines.push(pts);
      }
      for (let j = 0; j < p.lon; j += 1) {
        const t = (j / p.lon) * Math.PI;
        const pts = [];
        for (let k = 0; k <= seg; k += 1) {
          const phi = (k / seg) * Math.PI * 2;
          pts.push(rotate3([Math.cos(phi) * Math.cos(t), Math.sin(phi), Math.cos(phi) * Math.sin(t)], ax, ay));
        }
        lines.push(pts);
      }
      drawWire(ctx, lines, w, h, p);
    },
  });

  register({
    type: 'wireTorus',
    name: '线框圆环',
    cat: 'space',
    size: [380, 300],
    params: [
      { key: 'ratio', label: '管径比', type: 'range', min: 10, max: 90, step: 1, def: 38, unit: '%' },
      { key: 'rings', label: '环向分段', type: 'range', min: 6, max: 64, step: 1, def: 28 },
      { key: 'tubes', label: '管向分段', type: 'range', min: 4, max: 32, step: 1, def: 12 },
      { key: 'tiltX', label: '俯仰', type: 'range', min: -90, max: 90, step: 1, def: 58, unit: '°' },
      { key: 'tiltY', label: '旋转', type: 'range', min: -180, max: 180, step: 1, def: 12, unit: '°' },
      { key: 'width', label: '线宽', type: 'range', min: 0.5, max: 10, step: 0.5, def: 1.2, unit: 'px' },
      { key: 'back', label: '背面可见', type: 'range', min: 0, max: 100, step: 1, def: 20, unit: '%' },
      { key: 'color', label: '颜色', type: 'color', def: '#111111' },
    ],
    draw(ctx, w, h, p) {
      const ax = (p.tiltX * Math.PI) / 180;
      const ay = (p.tiltY * Math.PI) / 180;
      const r = p.ratio / 100;
      const R = 1 / (1 + r);
      const tube = R * r;
      const lines = [];
      const seg = 48;
      for (let i = 0; i < p.rings; i += 1) {
        const u = (i / p.rings) * Math.PI * 2;
        const pts = [];
        for (let k = 0; k <= seg; k += 1) {
          const v = (k / seg) * Math.PI * 2;
          pts.push(rotate3([(R + tube * Math.cos(v)) * Math.cos(u), tube * Math.sin(v), (R + tube * Math.cos(v)) * Math.sin(u)], ax, ay));
        }
        lines.push(pts);
      }
      for (let j = 0; j < p.tubes; j += 1) {
        const v = (j / p.tubes) * Math.PI * 2;
        const pts = [];
        for (let k = 0; k <= seg * 2; k += 1) {
          const u = (k / (seg * 2)) * Math.PI * 2;
          pts.push(rotate3([(R + tube * Math.cos(v)) * Math.cos(u), tube * Math.sin(v), (R + tube * Math.cos(v)) * Math.sin(u)], ax, ay));
        }
        lines.push(pts);
      }
      drawWire(ctx, lines, w, h, p);
    },
  });

  register({
    type: 'terrain',
    name: '蒸汽波地形',
    cat: 'space',
    size: [640, 400],
    params: [
      { key: 'cols', label: '横向网格', type: 'range', min: 8, max: 80, step: 1, def: 34 },
      { key: 'rows', label: '纵深网格', type: 'range', min: 6, max: 60, step: 1, def: 28 },
      { key: 'height', label: '山高', type: 'range', min: 0, max: 100, step: 1, def: 70, unit: '%' },
      { key: 'valley', label: '中央峡谷', type: 'range', min: 0, max: 100, step: 1, def: 60, unit: '%' },
      { key: 'horizon', label: '地平线', type: 'range', min: 5, max: 80, step: 1, def: 42, unit: '%' },
      { key: 'color', label: '线色', type: 'color', def: '#ff4ca7' },
      { key: 'bg', label: '地面色', type: 'color', def: '#120024' },
      { key: 'sky', label: '天空', type: 'bool', def: true },
      { key: 'skyTop', label: '天空顶色', type: 'color', def: '#1a0638', when: (p) => p.sky },
      { key: 'skyBottom', label: '天空底色', type: 'color', def: '#ff4ca7', when: (p) => p.sky },
      { key: 'sun', label: '条纹夕阳', type: 'bool', def: true },
      { key: 'sunTop', label: '夕阳顶色', type: 'color', def: '#ffd400', when: (p) => p.sun },
      { key: 'sunBottom', label: '夕阳底色', type: 'color', def: '#ff4ca7', when: (p) => p.sun },
      { key: 'glow', label: '发光', type: 'range', min: 0, max: 30, step: 1, def: 6, unit: 'px' },
      { key: 'salt', label: '地形', type: 'range', min: 0, max: 999, step: 1, def: 21 },
    ],
    draw(ctx, w, h, p, env) {
      const noise = U.makeNoise2D((env.seed ^ U.hashString(`terrain${p.salt}`)) >>> 0);
      const cols = Math.round(p.cols);
      const rows = Math.round(p.rows);
      const x0 = -w / 2;
      const y0 = -h / 2;
      const horizon = y0 + h * (p.horizon / 100);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, w, h);
      ctx.clip();
      if (p.sky) {
        const g = ctx.createLinearGradient(0, y0, 0, horizon);
        g.addColorStop(0, p.skyTop);
        g.addColorStop(1, p.skyBottom);
        ctx.fillStyle = g;
        ctx.fillRect(x0, y0, w, horizon - y0 + 1);
      }
      if (p.sun) {
        const r = Math.min(w * 0.22, (horizon - y0) * 0.95);
        const cy = horizon - r * 0.35;
        const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
        g.addColorStop(0, p.sunTop);
        g.addColorStop(1, p.sunBottom);
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, cy, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = g;
        ctx.fillRect(-r, cy - r, r * 2, r * 2);
        /* classic sliced sun: bands get thicker toward the horizon */
        ctx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 7; i += 1) {
          const t = i / 7;
          const bandY = cy + r * (0.05 + t * 0.95);
          ctx.fillRect(-r, bandY, r * 2, r * (0.025 + t * 0.07));
        }
        ctx.restore();
      }
      ctx.fillStyle = p.bg;
      ctx.fillRect(x0, horizon, w, h - (horizon - y0));
      const span = h - (horizon - y0);
      const project = (x, y, z) => [x * (w * 0.5) / z, horizon + ((0.9 - y) / z) * span * 0.32];
      const heightAt = (x, z) => {
        const valley = 1 - Math.exp(-(x * x) / (0.06 + (1 - p.valley / 100) * 2));
        return U.fbm(noise, x * 1.6 + 10, z * 0.9, 4) * valley * (p.height / 100) * 2.2;
      };
      const zNear = 0.26;
      const zFar = 9;
      const grid = [];
      for (let j = 0; j <= rows; j += 1) {
        const t = j / rows;
        const z = zFar * Math.pow(zNear / zFar, t);
        const row = [];
        for (let i = 0; i <= cols; i += 1) {
          const xs = (i / cols - 0.5) * 2.6;
          row.push(project(xs * z, heightAt(xs, z), z));
        }
        grid.push(row);
      }
      ctx.lineWidth = Math.max(1, w / 500);
      ctx.strokeStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.lineJoin = 'round';
      for (let j = 0; j < rows; j += 1) {
        const a = grid[j];
        const b = grid[j + 1];
        for (let i = 0; i < cols; i += 1) {
          ctx.beginPath();
          ctx.moveTo(a[i][0], a[i][1]);
          ctx.lineTo(a[i + 1][0], a[i + 1][1]);
          ctx.lineTo(b[i + 1][0], b[i + 1][1]);
          ctx.lineTo(b[i][0], b[i][1]);
          ctx.closePath();
          ctx.shadowBlur = 0;
          ctx.fillStyle = p.bg;
          ctx.fill();
          ctx.shadowBlur = p.glow;
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    },
  });

  /* ======================= TYPE ======================= */

  register({
    type: 'ticker',
    name: '走马灯文字带',
    cat: 'type',
    size: [700, 60],
    params: [
      { key: 'text', label: '文字', type: 'text', def: 'NO SIGNAL ✦ STILL BLOOMING ✦' },
      { key: 'family', label: '字体', type: 'font', def: 'Arial Black' },
      { key: 'fg', label: '文字色', type: 'color', def: '#111111' },
      { key: 'bg', label: '底色', type: 'color', def: '#d7ff2f' },
      { key: 'hazard', label: '警示斜纹', type: 'bool', def: false },
      { key: 'border', label: '上下边线', type: 'bool', def: true },
      { key: 'gap', label: '间距', type: 'range', min: 0, max: 200, step: 1, def: 24, unit: 'px' },
    ],
    draw(ctx, w, h, p) {
      const x0 = -w / 2;
      const y0 = -h / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, w, h);
      ctx.clip();
      ctx.fillStyle = p.bg;
      ctx.fillRect(x0, y0, w, h);
      if (p.hazard) {
        ctx.fillStyle = p.fg;
        for (let x = x0 - h; x < x0 + w + h; x += h * 0.9) {
          ctx.beginPath();
          ctx.moveTo(x, y0 + h);
          ctx.lineTo(x + h * 0.45, y0 + h);
          ctx.lineTo(x + h * 0.45 + h * 0.7, y0);
          ctx.lineTo(x + h * 0.7, y0);
          ctx.fill();
        }
      }
      const size = h * 0.58;
      ctx.font = font(size, 900, p.family);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const text = String(p.text || ' ');
      const tw = ctx.measureText(text).width + p.gap;
      if (p.hazard) {
        ctx.fillStyle = p.bg;
        const pad = size * 0.25;
        for (let x = x0 + p.gap / 2; x < x0 + w; x += tw) ctx.fillRect(x - pad, y0 + h * 0.2, tw - p.gap + pad * 2, h * 0.6);
      }
      ctx.fillStyle = p.fg;
      for (let x = x0 + p.gap / 2; x < x0 + w; x += Math.max(10, tw)) ctx.fillText(text, x, 0);
      if (p.border) {
        ctx.fillRect(x0, y0, w, Math.max(1, h * 0.06));
        ctx.fillRect(x0, y0 + h - Math.max(1, h * 0.06), w, Math.max(1, h * 0.06));
      }
      ctx.restore();
    },
  });

  register({
    type: 'badge',
    name: '圆形文字徽章',
    cat: 'type',
    size: [280, 280],
    params: [
      { key: 'text', label: '环绕文字', type: 'text', def: 'CHAOS COLLAGE ✦ CERTIFIED ✦ ' },
      { key: 'center', label: '中心文字', type: 'text', def: '★' },
      { key: 'family', label: '字体', type: 'font', def: 'Arial Black' },
      { key: 'fg', label: '文字色', type: 'color', def: '#111111' },
      { key: 'bg', label: '底色', type: 'color', def: '#d7ff2f' },
      { key: 'ring', label: '内外圈线', type: 'bool', def: true },
      { key: 'scallop', label: '花边', type: 'range', min: 0, max: 40, step: 1, def: 18 },
    ],
    draw(ctx, w, h, p) {
      ctx.save();
      const sx = w / Math.min(w, h);
      const sy = h / Math.min(w, h);
      ctx.scale(sx, sy);
      const r = Math.min(w, h) / 2;
      ctx.fillStyle = p.bg;
      ctx.beginPath();
      const n = Math.round(p.scallop);
      if (n >= 6) {
        for (let i = 0; i <= n * 2; i += 1) {
          const a = (i / (n * 2)) * Math.PI * 2;
          const rr = i % 2 ? r * 0.93 : r;
          if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
      } else ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.fg;
      ctx.fillStyle = p.fg;
      ctx.lineWidth = r * 0.025;
      if (p.ring) {
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.84, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.56, 0, Math.PI * 2);
        ctx.stroke();
      }
      const size = r * 0.17;
      ctx.font = font(size, 900, p.family);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const chars = Array.from(String(p.text || ''));
      const radius = r * 0.7;
      const widths = chars.map((ch) => ctx.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0) || 1;
      const scale = (Math.PI * 2 * radius) / total;
      let angle = -Math.PI / 2;
      chars.forEach((ch, i) => {
        const a = angle + (widths[i] * scale) / radius / 2;
        ctx.save();
        ctx.rotate(a);
        ctx.translate(0, -radius);
        ctx.scale(Math.min(scale, 1.6), 1);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        angle += (widths[i] * scale) / radius;
      });
      ctx.font = font(r * 0.5, 900, p.family);
      ctx.fillText(String(p.center || ''), 0, r * 0.02);
      ctx.restore();
    },
  });

  /* ======================= Y3K ======================= */

  register({
    type: 'gradientMesh',
    name: '颗粒渐变',
    cat: 'y3k',
    size: [480, 600],
    params: [
      { key: 'c1', label: '颜色 1', type: 'color', def: '#ff5ec4' },
      { key: 'c2', label: '颜色 2', type: 'color', def: '#6a5cff' },
      { key: 'c3', label: '颜色 3', type: 'color', def: '#20e3d1' },
      { key: 'c4', label: '颜色 4', type: 'color', def: '#f6f3ff' },
      { key: 'blobs', label: '色块数', type: 'range', min: 2, max: 12, step: 1, def: 6 },
      { key: 'softness', label: '柔和', type: 'range', min: 5, max: 100, step: 1, def: 60, unit: '%' },
      { key: 'grain', label: '颗粒', type: 'range', min: 0, max: 100, step: 1, def: 28, unit: '%' },
      { key: 'salt', label: '构图', type: 'range', min: 0, max: 999, step: 1, def: 4 },
    ],
    draw(ctx, w, h, p, env) {
      const W = Math.max(2, Math.round(Math.abs(w) * env.q));
      const H = Math.max(2, Math.round(Math.abs(h) * env.q));
      const canvas = makeCanvas(W, H);
      const c = canvas.getContext('2d', { willReadFrequently: true });
      const random = U.rng(env.seed, env.layerId, 'mesh', p.salt);
      const colors = [p.c1, p.c2, p.c3, p.c4];
      c.fillStyle = p.c4;
      c.fillRect(0, 0, W, H);
      const blur = Math.max(W, H) * (p.softness / 100) * 0.18;
      c.filter = `blur(${blur}px)`;
      for (let i = 0; i < p.blobs; i += 1) {
        c.fillStyle = colors[i % 3];
        c.beginPath();
        c.ellipse(random() * W, random() * H, (0.2 + random() * 0.35) * W, (0.15 + random() * 0.3) * H, random() * Math.PI, 0, Math.PI * 2);
        c.fill();
      }
      c.filter = 'none';
      if (p.grain > 0) {
        const img = c.getImageData(0, 0, W, H);
        const data = img.data;
        const amp = (p.grain / 100) * 70;
        const r2 = U.rng(env.seed, env.layerId, 'grain');
        for (let i = 0; i < data.length; i += 4) {
          const n = (r2() - 0.5) * amp;
          data[i] += n;
          data[i + 1] += n;
          data[i + 2] += n;
        }
        c.putImageData(img, 0, 0);
      }
      ctx.drawImage(canvas, -w / 2, -h / 2, w, h);
    },
  });

  register({
    type: 'metaBlob',
    name: '液态金属',
    cat: 'y3k',
    size: [420, 420],
    params: [
      { key: 'count', label: '液滴数', type: 'range', min: 1, max: 12, step: 1, def: 6 },
      { key: 'size', label: '液滴大小', type: 'range', min: 10, max: 100, step: 1, def: 38, unit: '%' },
      { key: 'merge', label: '融合', type: 'range', min: 0, max: 100, step: 1, def: 45, unit: '%' },
      { key: 'env', label: '金属', type: 'select', options: [['silver', '银'], ['gold', '金'], ['ice', '冰蓝'], ['black', '黑铬'], ['rainbow', '彩虹铬'], ['acid', '酸性铬'], ['rose', '玫瑰铬']], def: 'silver' },
      { key: 'salt', label: '形态', type: 'range', min: 0, max: 999, step: 1, def: 9 },
    ],
    draw(ctx, w, h, p, env) {
      const W = Math.max(2, Math.round(Math.abs(w) * env.q));
      const H = Math.max(2, Math.round(Math.abs(h) * env.q));
      const random = U.rng(env.seed, env.layerId, 'blob', p.salt);
      const blobs = [];
      for (let i = 0; i < p.count; i += 1) {
        blobs.push({
          x: (0.22 + random() * 0.56) * W,
          y: (0.22 + random() * 0.56) * H,
          r: (0.08 + random() * 0.14) * Math.min(W, H) * (p.size / 55),
        });
      }
      const merge = 0.4 + (p.merge / 100) * 1.2;
      const field = new Float32Array(W * H);
      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
          let sum = 0;
          for (const b of blobs) {
            const dx = x - b.x;
            const dy = y - b.y;
            sum += (b.r * b.r * merge) / (dx * dx + dy * dy + 1);
          }
          field[y * W + x] = sum;
        }
      }
      const lut = CC.effects.helpers.envLut(p.env);
      const canvas = pixelCanvas(w, h, env.q, (data) => {
        for (let y = 0; y < H; y += 1) {
          for (let x = 0; x < W; x += 1) {
            const j = y * W + x;
            const v = field[j];
            if (v < 0.8) continue;
            /* rounded relief that keeps curving toward blob centers (no flat plateau) */
            const height = (k) => (k <= 1 ? 0 : Math.sqrt(1 - Math.pow(1 / k, 1.6)));
            const hc = height(v);
            const gx = height(field[y * W + Math.min(W - 1, x + 1)]) - height(field[y * W + Math.max(0, x - 1)]);
            const gy = height(field[Math.min(H - 1, y + 1) * W + x]) - height(field[Math.max(0, y - 1) * W + x]);
            const depth = Math.min(W, H) * 0.06;
            const len = Math.hypot(gx * depth, gy * depth, 1);
            const ny = -(gy * depth) / len;
            const nx = -(gx * depth) / len;
            let t = 0.5 + ny * 0.5 + (y / H - 0.5) * 0.3 + nx * 0.1;
            t = t - Math.floor(t);
            const index = Math.round(t * 255) * 3;
            const spec = Math.pow(clamp(-nx * 0.45 - ny * 0.6 + (1 / len) * 0.66, 0, 1), 28) * 255;
            const i = j * 4;
            data[i] = lut[index] + spec;
            data[i + 1] = lut[index + 1] + spec;
            data[i + 2] = lut[index + 2] + spec;
            data[i + 3] = clamp((v - 0.8) / 0.2, 0, 1) * 255 * (hc > 0 || v >= 1 ? 1 : 0.9);
          }
        }
      });
      ctx.drawImage(canvas, -w / 2, -h / 2, w, h);
    },
  });

  register({
    type: 'sigil',
    name: '赛博图腾',
    cat: 'y3k',
    size: [260, 420],
    params: [
      { key: 'spikes', label: '棘刺数', type: 'range', min: 2, max: 24, step: 1, def: 11 },
      { key: 'curl', label: '卷曲', type: 'range', min: 0, max: 100, step: 1, def: 75, unit: '%' },
      { key: 'thickness', label: '粗细', type: 'range', min: 10, max: 200, step: 1, def: 90, unit: '%' },
      { key: 'color', label: '颜色', type: 'color', def: '#111111' },
      { key: 'salt', label: '形态', type: 'range', min: 0, max: 999, step: 1, def: 13 },
    ],
    draw(ctx, w, h, p, env) {
      const d = CC.vectorAssets.sigilPath((env.seed ^ U.hashString(`${env.layerId}|${p.salt}`)) >>> 0, p.spikes, p.curl / 100, p.thickness / 100);
      ctx.save();
      ctx.translate(-w / 2, -h / 2);
      ctx.scale(w / 100, h / 100);
      ctx.fillStyle = p.color;
      ctx.fill(new Path2D(d));
      ctx.restore();
    },
  });

  register({
    type: 'rays',
    name: '体积光束',
    cat: 'y3k',
    size: [500, 500],
    params: [
      { key: 'count', label: '光束数', type: 'range', min: 2, max: 60, step: 1, def: 14 },
      { key: 'spread', label: '扩散角', type: 'range', min: 5, max: 360, step: 1, def: 90, unit: '°' },
      { key: 'origin', label: '光源位置', type: 'select', options: [['top', '顶部'], ['center', '中心'], ['bottom', '底部'], ['left', '左侧']], def: 'top' },
      { key: 'color', label: '颜色', type: 'color', def: '#ffffff' },
      { key: 'softness', label: '柔和', type: 'range', min: 0, max: 100, step: 1, def: 40, unit: '%' },
      { key: 'salt', label: '分布', type: 'range', min: 0, max: 999, step: 1, def: 2 },
    ],
    draw(ctx, w, h, p, env) {
      const random = U.rng(env.seed, env.layerId, 'rays', p.salt);
      const origins = { top: [0, -h / 2, Math.PI / 2], center: [0, 0, Math.PI / 2], bottom: [0, h / 2, -Math.PI / 2], left: [-w / 2, 0, 0] };
      const [ox, oy, base] = origins[p.origin] || origins.top;
      const length = Math.hypot(w, h);
      const spread = (p.spread * Math.PI) / 180;
      if (p.softness > 0) ctx.filter = `blur(${(p.softness / 100) * Math.min(w, h) * 0.03}px)`;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < p.count; i += 1) {
        const a = base + (random() - 0.5) * spread;
        const width = (0.01 + random() * 0.05) * Math.PI;
        const g = ctx.createLinearGradient(ox, oy, ox + Math.cos(a) * length, oy + Math.sin(a) * length);
        g.addColorStop(0, rgba(p.color, 0.5 + random() * 0.4));
        g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.cos(a - width) * length, oy + Math.sin(a - width) * length);
        ctx.lineTo(ox + Math.cos(a + width) * length, oy + Math.sin(a + width) * length);
        ctx.closePath();
        ctx.fill();
      }
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
    },
  });

  register({
    type: 'hud',
    name: '科技 HUD',
    cat: 'y3k',
    size: [360, 360],
    params: [
      { key: 'style', label: '样式', type: 'select', options: [['reticle', '准星瞄准'], ['brackets', '角标取景框'], ['gauge', '仪表盘'], ['telemetry', '遥测数据']], def: 'reticle' },
      { key: 'color', label: '颜色', type: 'color', def: '#20e3d1' },
      { key: 'width', label: '线宽', type: 'range', min: 0.5, max: 8, step: 0.5, def: 1.5, unit: 'px' },
      { key: 'label', label: '标签', type: 'text', def: 'TARGET_LOCK 03' },
      { key: 'value', label: '数值', type: 'range', min: 0, max: 100, step: 1, def: 72, unit: '%' },
      { key: 'ticks', label: '刻度', type: 'range', min: 8, max: 120, step: 1, def: 48 },
      { key: 'glow', label: '发光', type: 'range', min: 0, max: 30, step: 1, def: 6, unit: 'px' },
    ],
    draw(ctx, w, h, p, env) {
      const r = Math.min(w, h) / 2;
      ctx.save();
      ctx.strokeStyle = p.color;
      ctx.fillStyle = p.color;
      ctx.lineWidth = p.width;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.glow;
      ctx.lineCap = 'square';
      const mono = (size, weight = 600) => font(size, weight, 'Courier New');
      if (p.style === 'reticle') {
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([r * 0.05, r * 0.04]);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        for (let i = 0; i < p.ticks; i += 1) {
          const a = (i / p.ticks) * Math.PI * 2;
          const long = i % 4 === 0;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
          ctx.lineTo(Math.cos(a) * r * (long ? 0.8 : 0.86), Math.sin(a) * r * (long ? 0.8 : 0.86));
          ctx.stroke();
        }
        const gap = r * 0.12;
        ctx.beginPath();
        ctx.moveTo(-r, 0); ctx.lineTo(-gap, 0);
        ctx.moveTo(gap, 0); ctx.lineTo(r, 0);
        ctx.moveTo(0, -r); ctx.lineTo(0, -gap);
        ctx.moveTo(0, gap); ctx.lineTo(0, r);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.025 + p.width, 0, Math.PI * 2);
        ctx.fill();
        const sweep = (p.value / 100) * Math.PI * 2;
        ctx.lineWidth = p.width * 3;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.7, -Math.PI / 2, -Math.PI / 2 + sweep);
        ctx.stroke();
        ctx.font = mono(r * 0.08);
        ctx.textAlign = 'center';
        ctx.fillText(p.label, 0, r * 0.38);
        ctx.fillText(`${p.value}%`, 0, -r * 0.3);
      } else if (p.style === 'brackets') {
        const x = -w / 2 + p.width;
        const y = -h / 2 + p.width;
        const bw = w - p.width * 2;
        const bh = h - p.width * 2;
        const len = Math.min(bw, bh) * 0.16;
        ctx.lineWidth = p.width * 2;
        ctx.beginPath();
        [[x, y, 1, 1], [x + bw, y, -1, 1], [x + bw, y + bh, -1, -1], [x, y + bh, 1, -1]].forEach(([cx, cy, sx, sy]) => {
          ctx.moveTo(cx + sx * len, cy);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx, cy + sy * len);
        });
        ctx.stroke();
        ctx.lineWidth = p.width;
        ctx.beginPath();
        ctx.moveTo(-len * 0.4, 0); ctx.lineTo(len * 0.4, 0);
        ctx.moveTo(0, -len * 0.4); ctx.lineTo(0, len * 0.4);
        ctx.stroke();
        const size = Math.max(8, Math.min(bw, bh) * 0.05);
        ctx.font = mono(size);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(p.label, x + len * 0.3, y + len * 0.3);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        const random = U.rng(env.seed, env.layerId, 'coords');
        ctx.fillText(`${(random() * 90).toFixed(4)}°N ${(random() * 180).toFixed(4)}°E`, x + bw - len * 0.3, y + bh - len * 0.3);
        ctx.fillRect(x + len * 0.3, y + bh - len * 0.3 - size * 0.6, (bw * 0.3 * p.value) / 100, size * 0.5);
      } else if (p.style === 'gauge') {
        const start = Math.PI * 0.75;
        const end = Math.PI * 2.25;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = r * 0.08;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.78, start, end);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.78, start, start + (end - start) * (p.value / 100));
        ctx.stroke();
        ctx.lineWidth = p.width;
        for (let i = 0; i <= p.ticks; i += 1) {
          const a = start + ((end - start) * i) / p.ticks;
          const long = i % 5 === 0;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
          ctx.lineTo(Math.cos(a) * r * (long ? 0.86 : 0.9), Math.sin(a) * r * (long ? 0.86 : 0.9));
          ctx.stroke();
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = mono(r * 0.34, 700);
        ctx.fillText(String(p.value), 0, -r * 0.02);
        ctx.font = mono(r * 0.08);
        ctx.fillText(p.label, 0, r * 0.3);
      } else {
        const random = U.rng(env.seed, env.layerId, 'telemetry', p.label);
        const lines = Math.max(4, Math.round(h / Math.max(10, h * 0.075)));
        const size = (h / lines) * 0.62;
        ctx.font = mono(size);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillRect(-w / 2, -h / 2, w, (h / lines) * 0.9);
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillText(p.label, -w / 2 + size * 0.4, -h / 2 + (h / lines) * 0.45);
        ctx.restore();
        const keys = ['SYS', 'MEM', 'NET', 'GPU', 'VOID', 'CORE', 'SYNC', 'FLUX', 'NODE', 'LINK'];
        for (let i = 1; i < lines; i += 1) {
          const y = -h / 2 + (i + 0.5) * (h / lines);
          const v = random();
          const bars = Math.round(v * 8);
          const text = `${keys[Math.floor(random() * keys.length)]}.${String(Math.floor(random() * 99)).padStart(2, '0')}  ${'▮'.repeat(bars)}${'▯'.repeat(8 - bars)}  ${(v * 100).toFixed(1)}%`;
          ctx.fillText(text, -w / 2 + size * 0.4, y, w - size * 0.8);
        }
      }
      ctx.restore();
    },
  });

  /* ---------- shared drawing helpers ---------- */

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function bevel(ctx, x, y, w, h, face, pressed = false) {
    ctx.fillStyle = face;
    ctx.fillRect(x, y, w, h);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = pressed ? '#404040' : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x + 1, y + h - 1);
    ctx.lineTo(x + 1, y + 1);
    ctx.lineTo(x + w - 1, y + 1);
    ctx.stroke();
    ctx.strokeStyle = pressed ? '#ffffff' : '#404040';
    ctx.beginPath();
    ctx.moveTo(x + w - 1, y + 1);
    ctx.lineTo(x + w - 1, y + h - 1);
    ctx.lineTo(x + 1, y + h - 1);
    ctx.stroke();
  }

  CC.generators = { CATEGORIES, register, get, list, defaults, helpers: { roundRect, bevel, font } };
})();
