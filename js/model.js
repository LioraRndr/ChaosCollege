/* CHAOS.COLLAGE — document model (CC.model)
   Pure data helpers: document / layer defaults, normalization, size presets
   and layer factories. No DOM and no editor state. */
(() => {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const U = CC.util;

  const DOC_VERSION = 2;

  /* ---------------- size presets ---------------- */

  const PRESETS = [
    {
      id: 'ratio',
      name: '常用比例',
      items: [
        { name: '4:5 竖版', w: 1080, h: 1350 },
        { name: '1:1 方形', w: 1080, h: 1080 },
        { name: '9:16 竖屏', w: 1080, h: 1920 },
        { name: '16:9 横屏', w: 1920, h: 1080 },
        { name: '3:4 竖版', w: 1080, h: 1440 },
        { name: '4:3 横版', w: 1440, h: 1080 },
        { name: '2:3 海报', w: 1200, h: 1800 },
        { name: '3:2 横幅', w: 1800, h: 1200 },
        { name: '21:9 宽屏', w: 2560, h: 1080 },
      ],
    },
    {
      id: 'social',
      name: '社交平台',
      items: [
        { name: '小红书笔记 3:4', w: 1242, h: 1656 },
        { name: 'Instagram 帖子', w: 1080, h: 1350 },
        { name: '抖音 / 视频号 / Stories', w: 1080, h: 1920 },
        { name: '微信公众号封面', w: 900, h: 383 },
        { name: '微信朋友圈 / 头像', w: 1080, h: 1080 },
        { name: 'B 站 / YouTube 封面', w: 1920, h: 1080 },
        { name: '微博横图', w: 1200, h: 675 },
        { name: 'X / Twitter 头图', w: 1500, h: 500 },
      ],
    },
    {
      id: 'print',
      name: '印刷 300 DPI',
      items: [
        { name: 'A5 竖版', w: 1748, h: 2480 },
        { name: 'A4 竖版', w: 2480, h: 3508 },
        { name: 'A3 竖版', w: 3508, h: 4961 },
        { name: 'B5 竖版', w: 2079, h: 2953 },
        { name: '明信片 148×100', w: 1748, h: 1181 },
        { name: '名片 90×54', w: 1063, h: 638 },
        { name: '12 寸唱片封面', w: 3600, h: 3600 },
        { name: '50×70cm 海报 150dpi', w: 2953, h: 4134 },
      ],
    },
    {
      id: 'screen',
      name: '屏幕 / 壁纸',
      items: [
        { name: '桌面 1080p', w: 1920, h: 1080 },
        { name: '桌面 2K', w: 2560, h: 1440 },
        { name: '桌面 4K', w: 3840, h: 2160 },
        { name: '手机壁纸', w: 1179, h: 2556 },
        { name: '平板横屏', w: 2732, h: 2048 },
        { name: '演示 16:9', w: 1920, h: 1080 },
      ],
    },
    {
      id: 'classic',
      name: '经典（旧版尺寸）',
      items: [
        { name: '竖版 900×1125', w: 900, h: 1125 },
        { name: '方形 1000×1000', w: 1000, h: 1000 },
        { name: '横版 1280×720', w: 1280, h: 720 },
      ],
    },
  ];

  const UNITS = {
    px: { label: '像素 px', toPx: (value) => value },
    mm: { label: '毫米 mm', toPx: (value, dpi) => (value / 25.4) * dpi },
    cm: { label: '厘米 cm', toPx: (value, dpi) => (value / 2.54) * dpi },
    in: { label: '英寸 in', toPx: (value, dpi) => value * dpi },
  };

  function ratioLabel(w, h) {
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const g = gcd(Math.round(w), Math.round(h)) || 1;
    const rw = Math.round(w) / g;
    const rh = Math.round(h) / g;
    if (rw <= 32 && rh <= 32) return `${rw}:${rh}`;
    return w >= h ? `${(w / h).toFixed(2)}:1` : `1:${(h / w).toFixed(2)}`;
  }

  /* ---------------- defaults ---------------- */

  function defaultRepeater() {
    return { count: 1, dx: 14, dy: 14, scaleStep: 1, rotationStep: 0, opacityStep: 1, jitterX: 0, jitterY: 0, jitterRotation: 0 };
  }

  function defaultStyle() {
    return {
      shadow: { on: false, color: '#000000', opacity: 0.45, blur: 18, distance: 14, angle: 135 },
      glow: { on: false, color: '#d7ff2f', opacity: 0.9, blur: 24, strength: 1 },
      outline: { on: false, color: '#ffffff', width: 10 },
    };
  }

  const TYPE_DEFAULTS = {
    image: () => ({ assetId: '', fit: 'stretch', cropZoom: 1, cropX: 0, cropY: 0, smoothing: true }),
    text: () => ({
      text: 'TYPE',
      fontFamily: 'Arial Black',
      fontWeight: 900,
      italic: false,
      fontSize: 96,
      lineHeight: 1,
      tracking: 0,
      align: 'center',
      vertical: false,
      arc: 0,
      fill: '#111111',
      fillMode: 'solid',
      fill2: '#ff4ca7',
      fillAngle: 90,
      stroke: '#ffffff',
      strokeWidth: 0,
      stroke2: '#111111',
      stroke2Width: 0,
      stretchX: 1,
      stretchY: 1,
    }),
    shape: () => ({
      shapeType: 'rect',
      fill: '#d7ff2f',
      fillMode: 'solid',
      fill2: '#20e3d1',
      fillAngle: 90,
      stroke: '#111111',
      strokeWidth: 0,
      radius: 0,
      sides: 5,
      innerRatio: 0.45,
      dash: 0,
    }),
    window: () => ({
      title: 'WARNING',
      body: 'Something has gone wrong.',
      accent: '#173fbe',
      windowStyle: 'classic',
      icon: 'warning',
      buttons: 'OK',
      bodyFont: 'Courier New',
      windowShadow: true,
    }),
    vector: () => ({
      asset: 'sparkle4',
      fill: '#d7ff2f',
      fillMode: 'solid',
      fill2: '#20e3d1',
      fillAngle: 90,
      color2: '#ff4ca7',
      ink: '#111111',
      highlight: '#ffffff',
      stroke: '#111111',
      strokeWidth: 0,
      lineScale: 1,
    }),
    gen: () => ({ gen: 'orb', p: {} }),
    shatter: () => ({ shatter: CC.shatter.defaults() }),
    path: () => ({ points: [], brush: { style: 'round', size: 10, color: '#111111', core: '#ffffff' } }),
  };

  const TYPE_NAMES = {
    image: '图像',
    text: '文字',
    shape: '形状',
    window: '窗口',
    vector: '贴纸',
    gen: '生成器',
    shatter: '3D 爆裂',
    path: '笔刷',
  };

  function baseLayer(type, name = '') {
    return {
      id: U.uid(type.slice(0, 2).toUpperCase()),
      type,
      name: name || TYPE_NAMES[type] || '图层',
      visible: true,
      locked: false,
      x: 0,
      y: 0,
      w: 300,
      h: 200,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      blend: 'source-over',
      clip: false,
      repeater: defaultRepeater(),
      effects: [],
      style: defaultStyle(),
      warp: null,
    };
  }

  function normalizeLayer(raw) {
    const type = TYPE_DEFAULTS[raw?.type] ? raw.type : 'shape';
    const layer = { ...baseLayer(type, raw?.name), ...TYPE_DEFAULTS[type](), ...(raw || {}) };
    layer.type = type;
    layer.repeater = { ...defaultRepeater(), ...(raw?.repeater || {}) };
    const style = defaultStyle();
    const rawStyle = raw?.style || {};
    layer.style = {
      shadow: { ...style.shadow, ...(rawStyle.shadow || {}) },
      glow: { ...style.glow, ...(rawStyle.glow || {}) },
      outline: { ...style.outline, ...(rawStyle.outline || {}) },
    };
    layer.effects = (raw?.effects || []).map((effect) => CC.effects.normalize(effect)).filter(Boolean);
    if (layer.warp) {
      layer.warp = {
        quad: Array.isArray(layer.warp.quad) && layer.warp.quad.length === 4 ? layer.warp.quad : CC.warp.identityQuad(),
        mesh: Array.isArray(layer.warp.mesh) && layer.warp.mesh.length === 16 ? layer.warp.mesh : CC.warp.identityMesh(),
      };
    }
    if (type === 'gen') layer.p = { ...CC.generators.defaults(layer.gen), ...(raw?.p || {}) };
    if (type === 'shatter') layer.shatter = { ...CC.shatter.defaults(), ...(raw?.shatter || {}) };
    if (type === 'path') layer.brush = { ...TYPE_DEFAULTS.path().brush, ...(raw?.brush || {}) };
    ['x', 'y', 'w', 'h', 'rotation', 'opacity'].forEach((key) => {
      if (!Number.isFinite(Number(layer[key]))) layer[key] = baseLayer(type)[key];
      layer[key] = Number(layer[key]);
    });
    layer.w = Math.max(1, Math.abs(layer.w));
    layer.h = Math.max(1, Math.abs(layer.h));
    return layer;
  }

  function newDoc({ name = '未命名工程', width = 1080, height = 1350, bg = '#f1eddf', transparent = false } = {}) {
    const now = Date.now();
    return {
      version: DOC_VERSION,
      id: U.uid('P'),
      name,
      width: Math.round(width),
      height: Math.round(height),
      bg,
      transparent,
      seed: Math.floor(Math.random() * 999999),
      layers: [],
      createdAt: now,
      updatedAt: now,
      exportSettings: { format: 'png', scale: 1, quality: 92, transparent: false },
    };
  }

  function normalizeDoc(raw) {
    const base = newDoc();
    const doc = { ...base, ...(raw || {}) };
    doc.version = DOC_VERSION;
    doc.width = U.clamp(Math.round(Number(doc.width) || base.width), 16, 16000);
    doc.height = U.clamp(Math.round(Number(doc.height) || base.height), 16, 16000);
    doc.seed = Number.isFinite(Number(doc.seed)) ? Number(doc.seed) >>> 0 : base.seed;
    doc.layers = (doc.layers || []).map(normalizeLayer);
    doc.exportSettings = { ...base.exportSettings, ...(raw?.exportSettings || {}) };
    return doc;
  }

  /* ---------------- factories (sizes relative to the canvas) ---------------- */

  function unit(doc) {
    return Math.min(doc.width, doc.height) / 1000;
  }

  function createImage(doc, assetId, natW, natH, name = '图像') {
    const layer = normalizeLayer({ type: 'image', name, assetId });
    const maxW = doc.width * 0.76;
    const maxH = doc.height * 0.7;
    const scale = Math.min(maxW / natW, maxH / natH, 1.5);
    layer.w = Math.max(16, natW * scale);
    layer.h = Math.max(16, natH * scale);
    return layer;
  }

  function createText(doc, text = 'TYPE', overrides = {}) {
    const u = unit(doc);
    return normalizeLayer({ type: 'text', name: String(text).split('\n')[0].slice(0, 24) || '文字', text, fontSize: Math.round(96 * u), ...overrides });
  }

  function createShape(doc, shapeType = 'rect', overrides = {}) {
    const u = unit(doc);
    const presets = {
      rect: { w: 320, h: 200 },
      roundrect: { w: 320, h: 200 },
      ellipse: { w: 240, h: 240 },
      triangle: { w: 240, h: 210 },
      polygon: { w: 240, h: 240, sides: 6 },
      star: { w: 260, h: 260, sides: 5, innerRatio: 0.42 },
      sparkle: { w: 220, h: 220, sides: 4, innerRatio: 0.3 },
      burst: { w: 220, h: 220, sides: 14, innerRatio: 0.62, fill: '#ff4ca7', strokeWidth: 4 },
      arrow: { w: 330, h: 90, fill: '#20e3d1' },
      line: { w: 420, h: 12, fill: '#111111' },
      ring: { w: 240, h: 240, innerRatio: 0.62 },
      cross: { w: 200, h: 200, innerRatio: 0.6, fill: '#ff4ca7' },
      barcode: { w: 230, h: 100, fill: '#f4f1e7', stroke: '#111111' },
      tape: { w: 360, h: 70, fill: '#d7ff2f', rotation: -8 },
    };
    const preset = presets[shapeType] || presets.rect;
    const names = { rect: '矩形', roundrect: '圆角矩形', ellipse: '椭圆', triangle: '三角形', polygon: '多边形', star: '星形', sparkle: '闪光星', burst: '爆裂形', arrow: '箭头', line: '直线', ring: '圆环', cross: '十字', barcode: '条形码', tape: '胶带' };
    const layer = normalizeLayer({
      type: 'shape',
      name: names[shapeType] || '形状',
      shapeType: shapeType === 'roundrect' ? 'rect' : shapeType,
      ...preset,
      radius: shapeType === 'roundrect' ? 36 * u : 0,
      ...overrides,
    });
    if (!overrides.w) layer.w = preset.w * u;
    if (!overrides.h) layer.h = preset.h * u;
    return layer;
  }

  function createWindow(doc, overrides = {}) {
    const u = unit(doc);
    return normalizeLayer({ type: 'window', name: '错误窗口', title: 'WARNING', body: 'Visual memory overflow.\nContinue rendering?', w: 340 * u, h: 190 * u, ...overrides });
  }

  function createVector(doc, assetId, overrides = {}) {
    const asset = CC.vectorAssets.get(assetId);
    const u = unit(doc);
    const [vw, vh] = asset ? asset.vb : [100, 100];
    const base = 240 * u;
    const scale = base / Math.max(vw, vh);
    return normalizeLayer({ type: 'vector', name: asset?.name || '贴纸', asset: assetId, w: vw * scale, h: vh * scale, ...overrides });
  }

  function createGenerator(doc, genType, overrides = {}) {
    const def = CC.generators.get(genType);
    const u = unit(doc);
    const [w, h] = def?.size || [300, 300];
    return normalizeLayer({ type: 'gen', name: def?.name || '生成器', gen: genType, p: CC.generators.defaults(genType), w: w * u, h: h * u, ...overrides });
  }

  function createShatter(doc, mode = 'burst') {
    const size = Math.min(doc.width, doc.height) * 0.8;
    const layer = normalizeLayer({ type: 'shatter', name: mode === 'spike' ? '尖刺实体' : '爆裂碎片', w: size, h: size });
    layer.shatter.mode = mode;
    if (mode === 'spike') Object.assign(layer.shatter, { gloss: 75, accentRatio: 14, spikes: 40 });
    return layer;
  }

  function createConfetti(doc) {
    const u = unit(doc);
    return normalizeLayer({
      type: 'shape',
      name: '纸屑云',
      shapeType: 'triangle',
      fill: '#ff7a18',
      w: 20 * u,
      h: 42 * u,
      repeater: { ...defaultRepeater(), count: 34, dx: 0, dy: 0, scaleStep: 0.995, rotationStep: 7, opacityStep: 0.985, jitterX: doc.width * 0.43, jitterY: doc.height * 0.42, jitterRotation: 180 },
    });
  }

  /* text presets: quick looks for the text inspector */
  const TEXT_PRESETS = [
    { id: 'chrome', name: '镀铬标题', values: { fillMode: 'chrome', fill: '#ffffff', fill2: '#1e2230', strokeWidth: 3, stroke: '#111111', stroke2Width: 0, fontFamily: 'Arial Black', fontWeight: 900, italic: true } },
    { id: 'acid', name: '酸性描边', values: { fillMode: 'solid', fill: '#d7ff2f', strokeWidth: 6, stroke: '#111111', stroke2Width: 4, stroke2: '#ff4ca7', fontFamily: 'Impact', fontWeight: 400 } },
    { id: 'outline', name: '空心轮廓', values: { fillMode: 'none', strokeWidth: 2.5, stroke: '#111111', stroke2Width: 0, fontFamily: 'Arial Black', fontWeight: 900 } },
    { id: 'holo', name: '全息渐变', values: { fillMode: 'holo', fill: '#ffffff', strokeWidth: 0, stroke2Width: 0, fontFamily: 'Arial Black', fontWeight: 900 } },
    { id: 'sticker', name: '贴纸双描边', values: { fillMode: 'solid', fill: '#ff4ca7', strokeWidth: 5, stroke: '#ffffff', stroke2Width: 4, stroke2: '#111111', fontFamily: 'Arial Black', fontWeight: 900 } },
    { id: 'mono', name: '等宽注释', values: { fillMode: 'solid', fill: '#111111', strokeWidth: 0, stroke2Width: 0, fontFamily: 'Courier New', fontWeight: 700, tracking: 2, italic: false } },
    { id: 'serif', name: '杂志衬线', values: { fillMode: 'solid', fill: '#111111', strokeWidth: 0, stroke2Width: 0, fontFamily: 'Georgia', fontWeight: 400, italic: true, tracking: -1 } },
    { id: 'gradient', name: '霓虹渐变', values: { fillMode: 'linear', fill: '#20e3d1', fill2: '#ff4ca7', fillAngle: 0, strokeWidth: 0, stroke2Width: 0, fontFamily: 'Arial Black', fontWeight: 900 } },
  ];

  CC.model = {
    DOC_VERSION,
    PRESETS,
    UNITS,
    TYPE_NAMES,
    TEXT_PRESETS,
    ratioLabel,
    defaultRepeater,
    defaultStyle,
    baseLayer,
    normalizeLayer,
    newDoc,
    normalizeDoc,
    unit,
    createImage,
    createText,
    createShape,
    createWindow,
    createVector,
    createGenerator,
    createShatter,
    createConfetti,
  };
})();
