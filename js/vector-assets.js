/* CHAOS.COLLAGE — built-in vector sticker library (CC.vectorAssets)
   Every asset is a list of SVG path parts drawn with Path2D into the layer box.
   Part roles map to layer colors: a = primary paint, b = secondary, ink = line
   color, hi = highlight. stroke: n draws the part as a line (viewBox units). */
(() => {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const { mulberry32 } = CC.util;

  const f = (value) => Math.round(value * 100) / 100;

  function circle(cx, cy, r) {
    return `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0Z`;
  }

  function ellipse(cx, cy, rx, ry, rotation = 0, steps = 40) {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const pts = [];
    for (let i = 0; i < steps; i += 1) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.cos(a) * rx;
      const y = Math.sin(a) * ry;
      pts.push([cx + x * cos - y * sin, cy + x * sin + y * cos]);
    }
    return poly(pts);
  }

  function rect(x, y, w, h, r = 0) {
    if (!r) return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;
    const rr = Math.min(r, w / 2, h / 2);
    return `M${f(x + rr)} ${f(y)}H${f(x + w - rr)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + rr)}V${f(y + h - rr)}Q${f(x + w)} ${f(y + h)} ${f(x + w - rr)} ${f(y + h)}H${f(x + rr)}Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - rr)}V${f(y + rr)}Q${f(x)} ${f(y)} ${f(x + rr)} ${f(y)}Z`;
  }

  function poly(points, close = true) {
    return `M${points.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}${close ? 'Z' : ''}`;
  }

  function star(cx, cy, n, ro, ri, rotation = -Math.PI / 2) {
    const pts = [];
    for (let i = 0; i < n * 2; i += 1) {
      const r = i % 2 === 0 ? ro : ri;
      const a = rotation + (i / (n * 2)) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return poly(pts);
  }

  function sparkle(cx, cy, n, ro, ri, rotation = -Math.PI / 2) {
    /* concave curved star: quadratic curves through the inner radius */
    let d = '';
    for (let i = 0; i < n; i += 1) {
      const a = rotation + (i / n) * Math.PI * 2;
      const next = rotation + ((i + 1) / n) * Math.PI * 2;
      const mid = (a + next) / 2;
      const p = [cx + Math.cos(a) * ro, cy + Math.sin(a) * ro];
      const q = [cx + Math.cos(next) * ro, cy + Math.sin(next) * ro];
      const c = [cx + Math.cos(mid) * ri, cy + Math.sin(mid) * ri];
      if (i === 0) d += `M${f(p[0])} ${f(p[1])}`;
      d += `Q${f(c[0])} ${f(c[1])} ${f(q[0])} ${f(q[1])}`;
    }
    return `${d}Z`;
  }

  function line(x1, y1, x2, y2) {
    return `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
  }

  function pixelArt(rows, cell = 10) {
    let d = '';
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch !== '.' && ch !== ' ') d += `M${x * cell} ${y * cell}h${cell}v${cell}h${-cell}Z`;
      });
    });
    return d;
  }

  function pixelLayer(rows, char, cell = 10) {
    let d = '';
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === char) d += `M${x * cell} ${y * cell}h${cell}v${cell}h${-cell}Z`;
      });
    });
    return d;
  }

  function butterflyPath() {
    const pts = [];
    for (let i = 0; i <= 720; i += 1) {
      const t = (i / 720) * Math.PI * 12;
      const r = Math.exp(Math.sin(t)) - 2 * Math.cos(4 * t) + Math.pow(Math.sin((2 * t - Math.PI) / 24), 5);
      pts.push([50 + Math.sin(t) * r * 11.5, 54 - Math.cos(t) * r * 11.5]);
    }
    return poly(pts);
  }

  function flowerPath(petals, cx, cy, length, width) {
    let d = '';
    for (let i = 0; i < petals; i += 1) {
      const a = (i / petals) * Math.PI * 2;
      d += ellipse(cx + Math.cos(a) * length * 0.55, cy + Math.sin(a) * length * 0.55, length * 0.55, width, a, 28);
    }
    return d;
  }

  function blossomPath() {
    let d = '';
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      const pts = [];
      for (let k = 0; k <= 30; k += 1) {
        const t = (k / 30) * Math.PI;
        const r = 44 * Math.sin(t) * (1 - 0.18 * Math.pow(Math.cos(t * 2), 8));
        const local = (t - Math.PI / 2) * 0.62;
        pts.push([50 + Math.cos(a + local) * r, 50 + Math.sin(a + local) * r]);
      }
      d += poly(pts);
    }
    return d;
  }

  function sunRays(n, r0, r1) {
    let d = '';
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const da = Math.PI / n * 0.45;
      d += poly([
        [50 + Math.cos(a - da) * r0, 50 + Math.sin(a - da) * r0],
        [50 + Math.cos(a) * r1, 50 + Math.sin(a) * r1],
        [50 + Math.cos(a + da) * r0, 50 + Math.sin(a + da) * r0],
      ]);
    }
    return d;
  }

  function spinnerDots(n) {
    let d = '';
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      d += circle(50 + Math.cos(a) * 36, 50 + Math.sin(a) * 36, 4 + (i / n) * 6);
    }
    return d;
  }

  function globeLines() {
    let d = circle(50, 50, 44);
    [0.35, 0.72].forEach((k) => {
      d += ellipse(50, 50, 44 * k, 44, 0, 48);
    });
    d += line(50, 6, 50, 94);
    [-0.55, 0, 0.55].forEach((k) => {
      const y = 50 + k * 44;
      const half = Math.sqrt(Math.max(0, 44 * 44 - (k * 44) ** 2));
      d += line(50 - half, y, 50 + half, y);
    });
    return d;
  }

  function infinityPath() {
    const pts = [];
    for (let i = 0; i <= 120; i += 1) {
      const t = (i / 120) * Math.PI * 2;
      const s = 1 + Math.sin(t) ** 2;
      pts.push([50 + (44 * Math.cos(t)) / s, 50 + (44 * Math.sin(t) * Math.cos(t)) / s]);
    }
    return poly(pts, true);
  }

  function wingPath() {
    let d = '';
    const feathers = 9;
    for (let row = 0; row < 3; row += 1) {
      for (let i = 0; i < feathers - row * 2; i += 1) {
        const t = i / (feathers - 1);
        const angle = -0.15 - t * 1.25 + row * 0.08;
        const length = (78 - row * 18) * (0.55 + 0.45 * Math.sin(Math.PI * (0.25 + t * 0.75)));
        const base = [18 + t * 30 + row * 6, 30 + t * 12 + row * 14];
        const tip = [base[0] + Math.cos(angle) * length, base[1] - Math.sin(angle) * length * 0.95];
        const nx = -(tip[1] - base[1]);
        const ny = tip[0] - base[0];
        const len = Math.hypot(nx, ny) || 1;
        const wdt = 7 - row * 1.4;
        d += `M${f(base[0])} ${f(base[1])}Q${f((base[0] + tip[0]) / 2 + (nx / len) * wdt)} ${f((base[1] + tip[1]) / 2 + (ny / len) * wdt)} ${f(tip[0])} ${f(tip[1])}Q${f((base[0] + tip[0]) / 2 - (nx / len) * wdt)} ${f((base[1] + tip[1]) / 2 - (ny / len) * wdt)} ${f(base[0])} ${f(base[1])}Z`;
      }
    }
    return d;
  }

  function barbedWire() {
    let d = 'M0 20C50 12 100 28 150 20S250 12 300 20';
    for (let x = 25; x < 300; x += 50) {
      d += line(x - 9, 9, x + 9, 31) + line(x + 9, 9, x - 9, 31);
    }
    return d;
  }

  function chainLinks() {
    let d = '';
    for (let i = 0; i < 4; i += 1) {
      const x = 10 + i * 70;
      d += i % 2 === 0 ? rect(x, 18, 90, 44, 22) : rect(x + 8, 30, 74, 20, 10);
    }
    return d;
  }

  const PIXEL_HEART = [
    '.XX...XX.',
    'XXXX.XXXX',
    'XXXXXXXXX',
    'XXXXXXXXX',
    '.XXXXXXX.',
    '..XXXXX..',
    '...XXX...',
    '....X....',
  ];
  const PIXEL_HEART_HI = [
    '.........',
    '.H.......',
    '.HH......',
    '.........',
  ];
  const PIXEL_CURSOR = [
    'K..........',
    'KK.........',
    'KWK........',
    'KWWK.......',
    'KWWWK......',
    'KWWWWK.....',
    'KWWWWWK....',
    'KWWWWWWK...',
    'KWWWWWWWK..',
    'KWWWWWWWWK.',
    'KWWWWWKKKKK',
    'KWWKWWK....',
    'KWK.KWWK...',
    'KK..KWWK...',
    'K....KWWK..',
    '.....KWWK..',
    '......KK...',
  ];
  const PIXEL_INVADER = [
    '..X.....X..',
    '...X...X...',
    '..XXXXXXX..',
    '.XX.XXX.XX.',
    'XXXXXXXXXXX',
    'X.XXXXXXX.X',
    'X.X.....X.X',
    '...XX.XX...',
  ];
  const PIXEL_STAR = [
    '....X....',
    '....X....',
    '...XXX...',
    'XXXXXXXXX',
    '.XXXXXXX.',
    '..XXXXX..',
    '..XX.XX..',
    '.XX...XX.',
    '.X.....X.',
  ];
  const PIXEL_SMILE = [
    '..XXXXX..',
    '.XXXXXXX.',
    'XX.XXX.XX',
    'XX.XXX.XX',
    'XXXXXXXXX',
    'X.XXXXX.X',
    'XX.....XX',
    '.XXXXXXX.',
    '..XXXXX..',
  ];

  const ASSETS = [
    /* ---- Y2K 符号 ---- */
    { id: 'sparkle4', name: '四芒星', cat: 'y2k', vb: [100, 100], parts: [{ d: sparkle(50, 50, 4, 50, 9), role: 'a' }] },
    { id: 'sparkle8', name: '八芒闪光', cat: 'y2k', vb: [100, 100], parts: [{ d: sparkle(50, 50, 4, 50, 8) + sparkle(50, 50, 4, 30, 6, -Math.PI / 4), role: 'a' }] },
    { id: 'sparkle-cluster', name: '星光组', cat: 'y2k', vb: [100, 100], parts: [{ d: sparkle(38, 58, 4, 38, 7) + sparkle(78, 22, 4, 20, 4) + sparkle(82, 74, 4, 12, 3), role: 'a' }] },
    { id: 'star5', name: '五角星', cat: 'y2k', vb: [100, 100], parts: [{ d: star(50, 54, 5, 50, 20), role: 'a' }] },
    { id: 'star-badge', name: '星形徽章', cat: 'y2k', vb: [100, 100], parts: [{ d: star(50, 50, 16, 50, 40), role: 'a' }, { d: circle(50, 50, 31), role: 'b' }] },
    { id: 'heart', name: '爱心', cat: 'y2k', vb: [100, 92], parts: [{ d: 'M50 88C20 66 0 46 0 28C0 12 12 2 26 2C38 2 46 10 50 18C54 10 62 2 74 2C88 2 100 12 100 28C100 46 80 66 50 88Z', role: 'a' }, { d: ellipse(24, 22, 9, 5, -0.6), role: 'hi' }] },
    { id: 'heart-wings', name: '天使之心', cat: 'y2k', vb: [200, 100], parts: [{ d: 'M100 92C74 72 58 54 58 38C58 24 68 14 80 14C90 14 96 20 100 27C104 20 110 14 120 14C132 14 142 24 142 38C142 54 126 72 100 92Z', role: 'a' }, { d: wingPath().replace(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g, (m, x, y) => `${f(60 - Number(x) * 0.62)} ${f(Number(y) * 0.8 + 4)}`), role: 'b' }, { d: wingPath().replace(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g, (m, x, y) => `${f(140 + Number(x) * 0.62)} ${f(Number(y) * 0.8 + 4)}`), role: 'b' }] },
    { id: 'bolt', name: '闪电', cat: 'y2k', vb: [100, 100], parts: [{ d: 'M58 0L16 56H46L34 100L84 38H54L68 0Z', role: 'a' }] },
    { id: 'flame', name: '火焰', cat: 'y2k', vb: [100, 120], parts: [{ d: 'M50 0C58 22 86 38 86 74C86 100 70 118 50 118C30 118 14 100 14 76C14 56 26 46 32 34C34 48 40 54 46 56C42 36 44 16 50 0Z', role: 'a' }, { d: 'M50 56C56 70 70 78 70 94C70 108 61 116 50 116C39 116 30 108 30 96C30 84 38 78 42 70C44 78 48 80 52 80C50 72 49 64 50 56Z', role: 'b' }] },
    { id: 'bow', name: '蝴蝶结', cat: 'y2k', vb: [120, 100], parts: [{ d: 'M60 42C44 20 14 8 6 22C-2 38 10 62 30 62C44 62 54 52 60 46ZM60 42C76 20 106 8 114 22C122 38 110 62 90 62C76 62 66 52 60 46ZM54 48C46 66 34 84 26 96L40 92L46 100C52 82 56 66 60 54ZM66 48C74 66 86 84 94 96L80 92L74 100C68 82 64 66 60 54Z', role: 'a' }, { d: rect(52, 36, 16, 20, 7), role: 'b' }] },
    { id: 'butterfly', name: '蝴蝶', cat: 'y2k', vb: [100, 100], parts: [{ d: butterflyPath(), role: 'a' }] },
    { id: 'wing', name: '天使翅膀', cat: 'y2k', vb: [110, 100], parts: [{ d: wingPath(), role: 'a' }] },
    { id: 'crown', name: '皇冠', cat: 'y2k', vb: [100, 90], parts: [{ d: 'M6 70L10 18L32 44L50 8L68 44L90 18L94 70Z', role: 'a' }, { d: rect(6, 72, 88, 14, 3), role: 'b' }, { d: circle(50, 8, 6) + circle(10, 18, 5) + circle(90, 18, 5), role: 'b' }] },
    { id: 'cherry', name: '樱桃', cat: 'y2k', vb: [100, 100], parts: [{ d: 'M30 62C40 40 52 20 70 6M70 6C66 30 70 50 74 64', role: 'ink', stroke: 4 }, { d: circle(28, 74, 20) + circle(72, 78, 20), role: 'a' }, { d: ellipse(22, 66, 5, 3, -0.7) + ellipse(66, 70, 5, 3, -0.7), role: 'hi' }] },
    { id: 'daisy', name: '雏菊', cat: 'y2k', vb: [100, 100], parts: [{ d: flowerPath(12, 50, 50, 46, 9), role: 'a' }, { d: circle(50, 50, 14), role: 'b' }] },
    { id: 'blossom', name: '五瓣花', cat: 'y2k', vb: [100, 100], parts: [{ d: blossomPath(), role: 'a' }, { d: circle(50, 50, 9), role: 'b' }] },
    { id: 'smiley', name: '笑脸', cat: 'y2k', vb: [100, 100], parts: [{ d: circle(50, 50, 48), role: 'a' }, { d: ellipse(34, 38, 6, 11) + ellipse(66, 38, 6, 11), role: 'ink' }, { d: 'M24 58C32 80 68 80 76 58', role: 'ink', stroke: 6 }] },
    { id: 'peace', name: '和平', cat: 'y2k', vb: [100, 100], parts: [{ d: circle(50, 50, 44) + line(50, 6, 50, 94) + line(50, 50, 19, 81) + line(50, 50, 81, 81), role: 'a', stroke: 10 }] },
    { id: 'yinyang', name: '阴阳', cat: 'y2k', vb: [100, 100], parts: [{ d: circle(50, 50, 48), role: 'a' }, { d: 'M50 2A48 48 0 0 1 50 98A24 24 0 0 1 50 50A24 24 0 0 0 50 2Z', role: 'ink' }, { d: circle(50, 26, 7), role: 'ink' }, { d: circle(50, 74, 7), role: 'a' }] },
    { id: 'eye', name: '全视之眼', cat: 'y2k', vb: [120, 70], parts: [{ d: 'M4 35C30 2 90 2 116 35C90 68 30 68 4 35Z', role: 'a' }, { d: circle(60, 35, 20), role: 'b' }, { d: circle(60, 35, 9), role: 'ink' }, { d: circle(54, 29, 4), role: 'hi' }] },
    { id: 'moon', name: '月牙', cat: 'y2k', vb: [100, 100], parts: [{ d: 'M62 4A47 47 0 1 0 96 72A38 38 0 1 1 62 4Z', role: 'a' }] },
    { id: 'sun', name: '太阳', cat: 'y2k', vb: [100, 100], parts: [{ d: sunRays(16, 30, 49), role: 'b' }, { d: circle(50, 50, 26), role: 'a' }] },
    { id: 'planet', name: '星球光环', cat: 'y2k', vb: [120, 100], parts: [{ d: circle(60, 50, 30), role: 'a' }, { d: ellipse(60, 50, 56, 13, -0.25, 60), role: 'b', stroke: 5 }] },
    { id: 'globe', name: '线框地球', cat: 'y2k', vb: [100, 100], parts: [{ d: globeLines(), role: 'a', stroke: 3 }] },
    { id: 'infinity', name: '无限', cat: 'y2k', vb: [100, 100], parts: [{ d: infinityPath(), role: 'a', stroke: 8 }] },
    { id: 'drop', name: '水滴', cat: 'y2k', vb: [80, 100], parts: [{ d: 'M40 0C52 26 76 46 76 66C76 86 60 98 40 98C20 98 4 86 4 66C4 46 28 26 40 0Z', role: 'a' }, { d: ellipse(26, 66, 6, 12, 0.3), role: 'hi' }] },
    { id: 'alien', name: '外星人', cat: 'y2k', vb: [100, 100], parts: [{ d: 'M50 4C80 4 95 28 92 48C88 72 66 96 50 96C34 96 12 72 8 48C5 28 20 4 50 4Z', role: 'a' }, { d: ellipse(32, 50, 16, 8, 0.6) + ellipse(68, 50, 16, 8, -0.6), role: 'ink' }] },
    { id: 'ghost', name: '幽灵', cat: 'y2k', vb: [100, 110], parts: [{ d: 'M10 50C10 20 28 4 50 4C72 4 90 20 90 50V104L76 94L63 106L50 94L37 106L24 94L10 104Z', role: 'a' }, { d: ellipse(36, 46, 7, 10) + ellipse(64, 46, 7, 10), role: 'ink' }] },
    { id: 'skull', name: '骷髅', cat: 'y2k', vb: [100, 110], parts: [{ d: 'M50 4C78 4 94 24 94 48C94 64 86 72 78 78V96H22V78C14 72 6 64 6 48C6 24 22 4 50 4Z', role: 'a' }, { d: ellipse(32, 52, 12, 13) + ellipse(68, 52, 12, 13) + poly([[50, 66], [44, 78], [56, 78]]), role: 'ink' }, { d: line(36, 86, 36, 96) + line(50, 86, 50, 96) + line(64, 86, 64, 96), role: 'ink', stroke: 3 }] },
    { id: 'kiss', name: '唇印', cat: 'y2k', vb: [120, 70], parts: [{ d: 'M4 34C18 14 34 6 46 10C52 12 56 16 60 18C64 16 68 12 74 10C86 6 102 14 116 34C100 58 80 66 60 66C40 66 20 58 4 34Z', role: 'a' }, { d: 'M12 34C30 30 46 34 60 36C74 34 90 30 108 34C90 40 74 40 60 40C46 40 30 40 12 34Z', role: 'ink' }] },
    { id: 'eightball', name: '8 号球', cat: 'y2k', vb: [100, 100], parts: [{ d: circle(50, 50, 48), role: 'ink' }, { d: circle(56, 42, 20), role: 'hi' }, { d: circle(56, 35, 6) + circle(56, 49, 7), role: 'ink', stroke: 3 }] },

    /* ---- UI / 电脑 ---- */
    { id: 'cursor', name: '鼠标指针', cat: 'ui', vb: [70, 100], parts: [{ d: 'M8 4V80L26 63L38 92L50 87L38 58H62Z', role: 'hi' }, { d: 'M8 4V80L26 63L38 92L50 87L38 58H62Z', role: 'ink', stroke: 4 }] },
    { id: 'hourglass', name: '沙漏', cat: 'ui', vb: [100, 100], parts: [{ d: 'M20 4H80V16L56 50L80 84V96H20V84L44 50L20 16Z', role: 'a' }, { d: 'M30 12H70L50 42ZM50 62L72 88H28Z', role: 'b' }] },
    { id: 'spinner', name: '加载圈', cat: 'ui', vb: [100, 100], parts: [{ d: spinnerDots(10), role: 'a' }] },
    { id: 'warning', name: '警告三角', cat: 'ui', vb: [100, 90], parts: [{ d: 'M50 4L97 86H3Z', role: 'a' }, { d: rect(45, 30, 10, 32, 3) + circle(50, 73, 6), role: 'ink' }] },
    { id: 'ban', name: '禁止', cat: 'ui', vb: [100, 100], parts: [{ d: circle(50, 50, 42) + line(20, 20, 80, 80), role: 'a', stroke: 11 }] },
    { id: 'check', name: '对勾', cat: 'ui', vb: [100, 100], parts: [{ d: 'M10 54L38 82L92 18', role: 'a', stroke: 16 }] },
    { id: 'cross', name: '叉号', cat: 'ui', vb: [100, 100], parts: [{ d: line(14, 14, 86, 86) + line(86, 14, 14, 86), role: 'a', stroke: 18 }] },
    { id: 'asterisk', name: '星号', cat: 'ui', vb: [100, 100], parts: [{ d: line(50, 6, 50, 94) + line(12, 28, 88, 72) + line(88, 28, 12, 72), role: 'a', stroke: 16 }] },
    { id: 'play', name: '播放键', cat: 'ui', vb: [100, 100], parts: [{ d: circle(50, 50, 48), role: 'a' }, { d: 'M40 30L72 50L40 70Z', role: 'b' }] },
    { id: 'cd', name: '光盘 CD', cat: 'ui', vb: [100, 100], parts: [{ d: circle(50, 50, 48) + circle(50, 50, 8), role: 'a', evenodd: true }, { d: circle(50, 50, 18) + circle(50, 50, 8), role: 'b', evenodd: true }, { d: 'M50 8A42 42 0 0 1 86 30L70 40A24 24 0 0 0 50 28Z', role: 'hi' }] },
    { id: 'floppy', name: '软盘', cat: 'ui', vb: [100, 100], parts: [{ d: 'M6 4H82L96 18V96H6Z', role: 'a' }, { d: rect(26, 4, 46, 30, 2), role: 'b' }, { d: rect(56, 9, 10, 20, 1), role: 'a' }, { d: rect(18, 52, 66, 40, 3), role: 'hi' }] },
    { id: 'flipphone', name: '翻盖手机', cat: 'ui', vb: [60, 120], parts: [{ d: rect(8, 4, 44, 56, 10) + rect(8, 62, 44, 54, 10), role: 'a' }, { d: rect(14, 12, 32, 34, 3), role: 'b' }, { d: [0, 1, 2, 3].map((row) => [0, 1, 2].map((col) => rect(16 + col * 11, 74 + row * 9, 7, 5, 2)).join('')).join(''), role: 'ink' }] },
    { id: 'lock', name: '挂锁', cat: 'ui', vb: [80, 100], parts: [{ d: 'M20 46V30C20 14 30 6 40 6C50 6 60 14 60 30V46', role: 'ink', stroke: 9 }, { d: rect(6, 44, 68, 52, 8), role: 'a' }, { d: circle(40, 66, 7) + rect(37, 66, 6, 16, 2), role: 'ink' }] },
    { id: 'bubble', name: '对话气泡', cat: 'ui', vb: [120, 100], parts: [{ d: 'M14 4H106C112 4 116 8 116 14V64C116 70 112 74 106 74H48L22 96L28 74H14C8 74 4 70 4 64V14C4 8 8 4 14 4Z', role: 'a' }] },
    { id: 'thought', name: '想法气泡', cat: 'ui', vb: [120, 100], parts: [{ d: circle(36, 40, 26) + circle(62, 30, 28) + circle(88, 42, 24) + circle(62, 54, 24) + circle(20, 86, 6) + circle(10, 96, 3), role: 'a' }] },
    { id: 'arrow-curve', name: '弯箭头', cat: 'ui', vb: [120, 100], parts: [{ d: 'M10 86C20 40 56 20 98 24', role: 'a', stroke: 9 }, { d: 'M88 6L114 24L90 44Z', role: 'a' }] },
    { id: 'music', name: '音符', cat: 'ui', vb: [80, 100], parts: [{ d: ellipse(22, 82, 16, 12, -0.4) + ellipse(62, 72, 16, 12, -0.4), role: 'a' }, { d: 'M34 78V14L74 4V68', role: 'a', stroke: 7 }] },
    { id: 'barbed', name: '铁丝网', cat: 'ui', vb: [300, 40], parts: [{ d: barbedWire(), role: 'a', stroke: 3 }] },
    { id: 'chain', name: '锁链', cat: 'ui', vb: [300, 80], parts: [{ d: chainLinks(), role: 'a', stroke: 8 }] },

    /* ---- 像素 ---- */
    { id: 'px-heart', name: '像素爱心', cat: 'pixel', vb: [90, 80], pixel: true, parts: [{ d: pixelArt(PIXEL_HEART), role: 'a' }, { d: pixelLayer(PIXEL_HEART_HI, 'H'), role: 'hi' }] },
    { id: 'px-cursor', name: '像素指针', cat: 'pixel', vb: [110, 170], pixel: true, parts: [{ d: pixelLayer(PIXEL_CURSOR, 'W'), role: 'hi' }, { d: pixelLayer(PIXEL_CURSOR, 'K'), role: 'ink' }] },
    { id: 'px-invader', name: '像素外星', cat: 'pixel', vb: [110, 80], pixel: true, parts: [{ d: pixelArt(PIXEL_INVADER), role: 'a' }] },
    { id: 'px-star', name: '像素星', cat: 'pixel', vb: [90, 90], pixel: true, parts: [{ d: pixelArt(PIXEL_STAR), role: 'a' }] },
    { id: 'px-smile', name: '像素笑脸', cat: 'pixel', vb: [90, 90], pixel: true, parts: [{ d: pixelArt(PIXEL_SMILE), role: 'a', evenodd: true }] },
  ];

  const CATS = [
    ['y2k', 'Y2K 符号'],
    ['ui', 'UI / 电脑'],
    ['pixel', '像素'],
  ];

  const pathCache = new Map();
  function path(d) {
    let cached = pathCache.get(d);
    if (!cached) {
      cached = new Path2D(d);
      pathCache.set(d, cached);
    }
    return cached;
  }

  function get(id) {
    return ASSETS.find((asset) => asset.id === id) || null;
  }

  /* procedural cybersigil: mirrored thorny strokes from a seed */
  function sigilPath(seed, spikes = 7, curl = 0.6, thickness = 0.5) {
    const random = mulberry32(seed >>> 0);
    let half = '';
    const count = Math.max(2, Math.round(spikes));
    for (let i = 0; i < count; i += 1) {
      const y0 = 8 + (i / count) * 84;
      const x0 = 50;
      const len = 18 + random() * 34;
      const angle = (-0.9 + random() * 1.8) + (i / count - 0.5) * 0.8;
      const tipX = x0 + Math.cos(angle) * len;
      const tipY = y0 + Math.sin(angle) * len * 0.8;
      const bend = (random() - 0.5) * 40 * curl;
      const w = (2 + random() * 6) * thickness;
      half += `M${f(x0)} ${f(y0 - w)}Q${f((x0 + tipX) / 2 + bend)} ${f((y0 + tipY) / 2 - w - bend * 0.4)} ${f(tipX)} ${f(tipY)}Q${f((x0 + tipX) / 2 + bend * 0.6)} ${f((y0 + tipY) / 2 + w)} ${f(x0)} ${f(y0 + w)}Z`;
    }
    const spine = rect(50 - 3 * thickness - 1, 4, (3 * thickness + 1) * 2, 92, 3);
    const mirrored = half.replace(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g, (m, x, y) => `${f(100 - Number(x))} ${y}`);
    return half + mirrored + spine;
  }

  CC.vectorAssets = { ASSETS, CATS, get, path, sigilPath, shapes: { circle, ellipse, rect, poly, star, sparkle, line } };
})();
