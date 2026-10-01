/* CHAOS.COLLAGE — shared helpers (CC.util)
   Classic script (no modules) so index.html keeps working from file://. */
(() => {
  'use strict';

  const CC = (window.CC = window.CC || {});

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, value) {
    const t = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function uid(prefix = 'L') {
    return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
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

  /* deterministic generator from a base seed plus any number of salts */
  function rng(seed, ...parts) {
    return mulberry32(parts.reduce((acc, part) => (acc ^ hashString(part)) >>> 0, seed >>> 0));
  }

  /* smooth 2D value noise on an integer lattice (deterministic per seed) */
  function makeNoise2D(seed) {
    const lattice = (x, y) => {
      let value = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
      value = Math.imul(value ^ (value >>> 13), 1274126177);
      return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
    };
    return (x, y) => {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = x - ix;
      const fy = y - iy;
      const tx = fx * fx * (3 - 2 * fx);
      const ty = fy * fy * (3 - 2 * fy);
      const a = lattice(ix, iy);
      const b = lattice(ix + 1, iy);
      const c = lattice(ix, iy + 1);
      const d = lattice(ix + 1, iy + 1);
      return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
    };
  }

  function fbm(noise, x, y, octaves = 4) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i += 1) {
      sum += noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function deepCopy(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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

  /* ---- color ---- */

  function hexToRgb(hex) {
    const raw = String(hex || '').trim().replace(/^#/, '');
    const full = raw.length === 3 || raw.length === 4 ? raw.split('').map((ch) => ch + ch).join('') : raw;
    const num = parseInt(full.slice(0, 6), 16);
    if (Number.isNaN(num)) return { r: 17, g: 17, b: 17 };
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function rgbToHex({ r, g, b }) {
    const part = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    return `#${part(r)}${part(g)}${part(b)}`;
  }

  function mixRgb(a, b, t) {
    return `rgb(${Math.round(lerp(a.r, b.r, t))},${Math.round(lerp(a.g, b.g, t))},${Math.round(lerp(a.b, b.b, t))})`;
  }

  function mixHex(a, b, t) {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    return rgbToHex({ r: lerp(ca.r, cb.r, t), g: lerp(ca.g, cb.g, t), b: lerp(ca.b, cb.b, t) });
  }

  function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
  }

  function hslToRgb(h, s, l) {
    const hue = ((h % 360) + 360) % 360 / 360;
    if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const conv = (t) => {
      let x = t;
      if (x < 0) x += 1;
      if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return { r: conv(hue + 1 / 3) * 255, g: conv(hue) * 255, b: conv(hue - 1 / 3) * 255 };
  }

  function rgbToHsl(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    return { h: h * 60, s, l };
  }

  /* multi-stop color ramp → 256-entry RGB lookup table */
  function buildRamp(stops) {
    const sorted = [...stops].sort((a, b) => a[0] - b[0]).map(([pos, color]) => [pos, hexToRgb(color)]);
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i += 1) {
      const t = i / 255;
      let k = 0;
      while (k < sorted.length - 2 && t > sorted[k + 1][0]) k += 1;
      const [p0, c0] = sorted[k];
      const [p1, c1] = sorted[Math.min(k + 1, sorted.length - 1)];
      const local = p1 > p0 ? clamp((t - p0) / (p1 - p0), 0, 1) : 0;
      lut[i * 3] = lerp(c0.r, c1.r, local);
      lut[i * 3 + 1] = lerp(c0.g, c1.g, local);
      lut[i * 3 + 2] = lerp(c0.b, c1.b, local);
    }
    return lut;
  }

  /* ---- canvas ---- */

  function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  function context2d(canvas, readFrequently = false) {
    return canvas.getContext('2d', readFrequently ? { willReadFrequently: true } : undefined);
  }

  function cloneCanvas(source) {
    const copy = makeCanvas(source.width, source.height);
    copy.getContext('2d').drawImage(source, 0, 0);
    return copy;
  }

  function releaseCanvas(canvas) {
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
  }

  function canvasToBlob(canvas, type = 'image/png', quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), type, quality);
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return response.blob();
  }

  async function sha256Hex(buffer) {
    if (window.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    /* insecure contexts lack subtle crypto; FNV over bytes is enough for dedupe */
    const bytes = new Uint8Array(buffer);
    let h1 = 2166136261;
    let h2 = 5381;
    for (let i = 0; i < bytes.length; i += 1) {
      h1 = Math.imul(h1 ^ bytes[i], 16777619);
      h2 = (Math.imul(h2, 33) + bytes[i]) >>> 0;
    }
    return `${(h1 >>> 0).toString(16)}${h2.toString(16)}${bytes.length.toString(16)}`;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = src;
    });
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function formatTime(timestamp) {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 24 * 60 * 60 * 1000 && date.getDate() === new Date(now).getDate()) {
      return `今天 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function safeFileName(name, fallback = 'chaos-collage') {
    const cleaned = String(name || '')
      .trim()
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    return cleaned || fallback;
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function debounce(fn, wait) {
    let timer = null;
    const wrapped = (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn(...args);
      }, wait);
    };
    wrapped.flush = (...args) => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        fn(...args);
      }
    };
    wrapped.cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    return wrapped;
  }

  /* 2D affine helpers on [a, b, c, d, e, f] (canvas setTransform order) */
  function matMultiply(m, n) {
    return [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4],
      m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  }

  function matInvert(m) {
    const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
    return [
      m[3] / det,
      -m[1] / det,
      -m[2] / det,
      m[0] / det,
      (m[2] * m[5] - m[3] * m[4]) / det,
      (m[1] * m[4] - m[0] * m[5]) / det,
    ];
  }

  function matApply(m, x, y) {
    return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
  }

  CC.util = {
    clamp,
    lerp,
    smoothstep,
    uid,
    hashString,
    mulberry32,
    rng,
    makeNoise2D,
    fbm,
    escapeHtml,
    deepCopy,
    getByPath,
    setByPath,
    hexToRgb,
    rgbToHex,
    mixRgb,
    mixHex,
    rgba,
    hslToRgb,
    rgbToHsl,
    buildRamp,
    makeCanvas,
    context2d,
    cloneCanvas,
    releaseCanvas,
    canvasToBlob,
    blobToDataUrl,
    dataUrlToBlob,
    sha256Hex,
    loadImage,
    formatBytes,
    formatTime,
    safeFileName,
    downloadBlob,
    debounce,
    matMultiply,
    matInvert,
    matApply,
  };
})();
