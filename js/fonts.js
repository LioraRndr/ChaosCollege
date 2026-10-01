/* CHAOS.COLLAGE — font catalog (CC.fonts)
   Curated system font groups with availability detection, the Local Font
   Access API for "all installed fonts", and imported font files (FontFace). */
(() => {
  'use strict';

  const CC = (window.CC = window.CC || {});

  const CJK_FALLBACK = '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "WenQuanYi Micro Hei"';
  const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);

  /* label: shown in the picker; family: CSS family name */
  const GROUPS = [
    {
      id: 'cn-sans',
      name: '中文 · 黑体 / 无衬线',
      fonts: [
        ['Microsoft YaHei', '微软雅黑'],
        ['Microsoft YaHei UI', '微软雅黑 UI'],
        ['DengXian', '等线'],
        ['SimHei', '黑体'],
        ['PingFang SC', '苹方'],
        ['Hiragino Sans GB', '冬青黑体'],
        ['Heiti SC', '黑体-简'],
        ['Source Han Sans SC', '思源黑体'],
        ['Noto Sans SC', 'Noto Sans SC'],
        ['Noto Sans CJK SC', 'Noto Sans CJK SC'],
        ['HarmonyOS Sans SC', '鸿蒙黑体'],
        ['MiSans', 'MiSans'],
        ['Alibaba PuHuiTi', '阿里巴巴普惠体'],
        ['OPPOSans', 'OPPOSans'],
        ['WenQuanYi Micro Hei', '文泉驿微米黑'],
        ['YouYuan', '幼圆'],
        ['STXihei', '华文细黑'],
      ],
    },
    {
      id: 'cn-serif',
      name: '中文 · 宋体 / 楷体 / 书法',
      fonts: [
        ['SimSun', '宋体'],
        ['NSimSun', '新宋体'],
        ['FangSong', '仿宋'],
        ['KaiTi', '楷体'],
        ['Source Han Serif SC', '思源宋体'],
        ['Noto Serif SC', 'Noto Serif SC'],
        ['Noto Serif CJK SC', 'Noto Serif CJK SC'],
        ['Songti SC', '宋体-简'],
        ['Kaiti SC', '楷体-简'],
        ['STSong', '华文宋体'],
        ['STKaiti', '华文楷体'],
        ['STFangsong', '华文仿宋'],
        ['STZhongsong', '华文中宋'],
        ['STXingkai', '华文行楷'],
        ['STLiti', '华文隶书'],
        ['STXinwei', '华文新魏'],
        ['STHupo', '华文琥珀'],
        ['STCaiyun', '华文彩云'],
        ['LiSu', '隶书'],
        ['FZShuTi', '方正舒体'],
        ['FZYaoti', '方正姚体'],
      ],
    },
    {
      id: 'sans',
      name: '无衬线 Sans',
      fonts: [
        ['Arial', 'Arial'],
        ['Arial Black', 'Arial Black'],
        ['Arial Narrow', 'Arial Narrow'],
        ['Helvetica Neue', 'Helvetica Neue'],
        ['Helvetica', 'Helvetica'],
        ['Segoe UI', 'Segoe UI'],
        ['Segoe UI Black', 'Segoe UI Black'],
        ['Segoe UI Variable Display', 'Segoe UI Variable'],
        ['Bahnschrift', 'Bahnschrift'],
        ['Verdana', 'Verdana'],
        ['Tahoma', 'Tahoma'],
        ['Trebuchet MS', 'Trebuchet MS'],
        ['Calibri', 'Calibri'],
        ['Candara', 'Candara'],
        ['Corbel', 'Corbel'],
        ['Century Gothic', 'Century Gothic'],
        ['Franklin Gothic Medium', 'Franklin Gothic'],
        ['Gill Sans MT', 'Gill Sans MT'],
        ['Gill Sans', 'Gill Sans'],
        ['Futura', 'Futura'],
        ['Avenir Next', 'Avenir Next'],
        ['Optima', 'Optima'],
        ['Lucida Sans Unicode', 'Lucida Sans'],
        ['Roboto', 'Roboto'],
        ['Inter', 'Inter'],
        ['Montserrat', 'Montserrat'],
        ['Noto Sans', 'Noto Sans'],
        ['Ubuntu', 'Ubuntu'],
        ['DejaVu Sans', 'DejaVu Sans'],
        ['Liberation Sans', 'Liberation Sans'],
      ],
    },
    {
      id: 'serif',
      name: '衬线 Serif',
      fonts: [
        ['Times New Roman', 'Times New Roman'],
        ['Georgia', 'Georgia'],
        ['Garamond', 'Garamond'],
        ['EB Garamond', 'EB Garamond'],
        ['Palatino Linotype', 'Palatino'],
        ['Book Antiqua', 'Book Antiqua'],
        ['Cambria', 'Cambria'],
        ['Constantia', 'Constantia'],
        ['Baskerville', 'Baskerville'],
        ['Baskerville Old Face', 'Baskerville Old Face'],
        ['Didot', 'Didot'],
        ['Bodoni 72', 'Bodoni 72'],
        ['Bodoni MT', 'Bodoni MT'],
        ['Rockwell', 'Rockwell'],
        ['Bookman Old Style', 'Bookman'],
        ['Century Schoolbook', 'Century Schoolbook'],
        ['Sylfaen', 'Sylfaen'],
        ['Noto Serif', 'Noto Serif'],
        ['DejaVu Serif', 'DejaVu Serif'],
        ['Liberation Serif', 'Liberation Serif'],
      ],
    },
    {
      id: 'mono',
      name: '等宽 Mono',
      fonts: [
        ['Courier New', 'Courier New'],
        ['Consolas', 'Consolas'],
        ['Lucida Console', 'Lucida Console'],
        ['Cascadia Code', 'Cascadia Code'],
        ['Cascadia Mono', 'Cascadia Mono'],
        ['OCR A Extended', 'OCR A Extended'],
        ['Menlo', 'Menlo'],
        ['Monaco', 'Monaco'],
        ['SF Mono', 'SF Mono'],
        ['JetBrains Mono', 'JetBrains Mono'],
        ['Fira Code', 'Fira Code'],
        ['DejaVu Sans Mono', 'DejaVu Sans Mono'],
        ['Liberation Mono', 'Liberation Mono'],
        ['Noto Sans Mono', 'Noto Sans Mono'],
      ],
    },
    {
      id: 'display',
      name: '展示 / 装饰 Display',
      fonts: [
        ['Impact', 'Impact'],
        ['Haettenschweiler', 'Haettenschweiler'],
        ['Stencil', 'Stencil'],
        ['Showcard Gothic', 'Showcard Gothic'],
        ['Bauhaus 93', 'Bauhaus 93'],
        ['Broadway', 'Broadway'],
        ['Algerian', 'Algerian'],
        ['Wide Latin', 'Wide Latin'],
        ['Snap ITC', 'Snap ITC'],
        ['Ravie', 'Ravie'],
        ['Jokerman', 'Jokerman'],
        ['Chiller', 'Chiller'],
        ['Old English Text MT', 'Old English Text'],
        ['Magneto', 'Magneto'],
        ['Playbill', 'Playbill'],
        ['Harrington', 'Harrington'],
        ['Curlz MT', 'Curlz MT'],
        ['Copperplate Gothic Bold', 'Copperplate Gothic'],
        ['Copperplate', 'Copperplate'],
        ['Agency FB', 'Agency FB'],
        ['Berlin Sans FB Demi', 'Berlin Sans FB'],
        ['Cooper Black', 'Cooper Black'],
        ['Gill Sans Ultra Bold', 'Gill Sans Ultra'],
        ['Goudy Stout', 'Goudy Stout'],
        ['Niagara Solid', 'Niagara'],
        ['Papyrus', 'Papyrus'],
        ['Comic Sans MS', 'Comic Sans MS'],
        ['Marker Felt', 'Marker Felt'],
        ['Chalkduster', 'Chalkduster'],
        ['Herculanum', 'Herculanum'],
        ['Luminari', 'Luminari'],
      ],
    },
    {
      id: 'script',
      name: '手写 / 书写 Script',
      fonts: [
        ['Segoe Script', 'Segoe Script'],
        ['Segoe Print', 'Segoe Print'],
        ['Brush Script MT', 'Brush Script'],
        ['Lucida Handwriting', 'Lucida Handwriting'],
        ['Lucida Calligraphy', 'Lucida Calligraphy'],
        ['Edwardian Script ITC', 'Edwardian Script'],
        ['Vladimir Script', 'Vladimir Script'],
        ['Kunstler Script', 'Kunstler Script'],
        ['Mistral', 'Mistral'],
        ['Freestyle Script', 'Freestyle Script'],
        ['Ink Free', 'Ink Free'],
        ['Gabriola', 'Gabriola'],
        ['Bradley Hand', 'Bradley Hand'],
        ['Snell Roundhand', 'Snell Roundhand'],
        ['Zapfino', 'Zapfino'],
      ],
    },
    {
      id: 'symbol',
      name: '符号 Symbol',
      fonts: [
        ['Segoe UI Symbol', 'Segoe UI Symbol'],
        ['Segoe UI Emoji', 'Segoe UI Emoji'],
        ['Wingdings', 'Wingdings'],
        ['Wingdings 2', 'Wingdings 2'],
        ['Webdings', 'Webdings'],
        ['Marlett', 'Marlett'],
        ['Symbol', 'Symbol'],
        ['Apple Color Emoji', 'Apple Color Emoji'],
        ['Noto Color Emoji', 'Noto Color Emoji'],
      ],
    },
    {
      id: 'generic',
      name: '通用回退',
      fonts: [
        ['sans-serif', '系统无衬线'],
        ['serif', '系统衬线'],
        ['monospace', '系统等宽'],
        ['system-ui', '系统界面'],
        ['cursive', '系统手写'],
        ['fantasy', '系统装饰'],
      ],
    },
  ];

  const labels = new Map();
  GROUPS.forEach((group) => group.fonts.forEach(([family, label]) => labels.set(family, label)));

  const availability = new Map();
  const imported = new Map(); /* family → record */
  let localFamilies = [];
  const listeners = new Set();
  let measureCtx = null;

  function quoteFamily(family) {
    if (GENERIC.has(family)) return family;
    return `"${String(family).replace(/["\\]/g, '')}"`;
  }

  function stack(family) {
    const primary = family || 'Arial';
    return `${quoteFamily(primary)}, ${CJK_FALLBACK}, sans-serif`;
  }

  function fontString({ family, size, weight = 400, italic = false }) {
    return `${italic ? 'italic ' : ''}${weight} ${Math.max(1, size)}px ${stack(family)}`;
  }

  function detect(family) {
    if (GENERIC.has(family) || imported.has(family)) return true;
    if (availability.has(family)) return availability.get(family);
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    const sample = 'mmmmmmmmmmlli1WQ@#永和の가';
    const bases = ['monospace', 'serif', 'sans-serif'];
    let available = false;
    for (const base of bases) {
      measureCtx.font = `72px ${base}`;
      const baseWidth = measureCtx.measureText(sample).width;
      measureCtx.font = `72px ${quoteFamily(family)}, ${base}`;
      const width = measureCtx.measureText(sample).width;
      if (Math.abs(width - baseWidth) > 0.5) {
        available = true;
        break;
      }
    }
    availability.set(family, available);
    return available;
  }

  function label(family) {
    if (imported.has(family)) return family;
    return labels.get(family) || family;
  }

  /* groups for the picker: imported → curated (available only) → local fonts */
  function pickerGroups({ includeUnavailable = false } = {}) {
    const result = [];
    if (imported.size) {
      result.push({ id: 'imported', name: '已导入字体', fonts: [...imported.keys()].sort().map((family) => ({ family, label: family, available: true })) });
    }
    const curated = new Set();
    GROUPS.forEach((group) => {
      const fonts = group.fonts
        .map(([family, text]) => ({ family, label: text, available: detect(family) }))
        .filter((font) => includeUnavailable || font.available);
      fonts.forEach((font) => curated.add(font.family));
      if (fonts.length) result.push({ id: group.id, name: group.name, fonts });
    });
    if (localFamilies.length) {
      const fonts = localFamilies
        .filter((family) => !curated.has(family) && !imported.has(family))
        .map((family) => ({ family, label: family, available: true }));
      if (fonts.length) result.push({ id: 'local', name: `本机全部字体（${localFamilies.length}）`, fonts });
    }
    return result;
  }

  function hasLocalFontAccess() {
    return typeof window.queryLocalFonts === 'function';
  }

  async function queryLocal() {
    if (!hasLocalFontAccess()) throw new Error('当前浏览器不支持读取本机字体（需要 Chrome / Edge 103+）');
    const fonts = await window.queryLocalFonts();
    const families = [...new Set(fonts.map((font) => font.family).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    localFamilies = families;
    families.forEach((family) => availability.set(family, true));
    emit();
    return families;
  }

  function setLocalFamilies(families) {
    localFamilies = Array.isArray(families) ? families : [];
    emit();
  }

  /* read the OpenType name table (TTF/OTF only) for the real family name */
  function readFamilyName(buffer) {
    try {
      const view = new DataView(buffer);
      const tag = view.getUint32(0);
      if (tag !== 0x00010000 && tag !== 0x4f54544f && tag !== 0x74727565) return null;
      const numTables = view.getUint16(4);
      let nameOffset = -1;
      for (let i = 0; i < numTables; i += 1) {
        const record = 12 + i * 16;
        const tableTag = String.fromCharCode(view.getUint8(record), view.getUint8(record + 1), view.getUint8(record + 2), view.getUint8(record + 3));
        if (tableTag === 'name') {
          nameOffset = view.getUint32(record + 8);
          break;
        }
      }
      if (nameOffset < 0) return null;
      const count = view.getUint16(nameOffset + 2);
      const stringOffset = nameOffset + view.getUint16(nameOffset + 4);
      const candidates = [];
      for (let i = 0; i < count; i += 1) {
        const record = nameOffset + 6 + i * 12;
        const platformId = view.getUint16(record);
        const languageId = view.getUint16(record + 4);
        const nameId = view.getUint16(record + 6);
        const length = view.getUint16(record + 8);
        const offset = view.getUint16(record + 10);
        if (nameId !== 1 && nameId !== 16) continue;
        let text = '';
        const start = stringOffset + offset;
        if (platformId === 3 || platformId === 0) {
          for (let j = 0; j < length; j += 2) text += String.fromCharCode(view.getUint16(start + j));
        } else if (platformId === 1) {
          for (let j = 0; j < length; j += 1) text += String.fromCharCode(view.getUint8(start + j));
        } else continue;
        const score = (nameId === 16 ? 4 : 0) + (platformId === 3 ? 2 : 0) + (languageId === 0x0804 || languageId === 0x0409 ? 1 : 0);
        candidates.push({ text: text.trim(), score });
      }
      candidates.sort((a, b) => b.score - a.score);
      return candidates.find((item) => item.text)?.text || null;
    } catch (error) {
      return null;
    }
  }

  function uniqueFamily(base) {
    let family = base;
    let index = 2;
    while (imported.has(family)) {
      family = `${base} ${index}`;
      index += 1;
    }
    return family;
  }

  async function registerRecord(record) {
    if (!record?.blob || !record.family) return null;
    if (imported.has(record.family)) return imported.get(record.family);
    const buffer = await record.blob.arrayBuffer();
    const face = new FontFace(record.family, buffer);
    await face.load();
    document.fonts.add(face);
    imported.set(record.family, { ...record, face });
    availability.set(record.family, true);
    emit();
    return imported.get(record.family);
  }

  async function importFile(file) {
    const buffer = await file.arrayBuffer();
    const parsed = readFamilyName(buffer);
    const base = (parsed || file.name.replace(/\.[^.]+$/, '')).trim() || 'Imported Font';
    if (imported.has(base)) {
      const existing = imported.get(base);
      if (existing.blob?.size === file.size) return { record: existing, duplicate: true };
    }
    const family = uniqueFamily(base);
    const record = {
      id: `F_${CC.util.hashString(`${family}|${file.size}|${file.name}`).toString(36)}`,
      family,
      fileName: file.name,
      mime: file.type || 'font/ttf',
      size: file.size,
      blob: new Blob([buffer], { type: file.type || 'font/ttf' }),
      addedAt: Date.now(),
    };
    await registerRecord(record);
    return { record, duplicate: false };
  }

  function removeImported(family) {
    const record = imported.get(family);
    if (!record) return;
    try {
      document.fonts.delete(record.face);
    } catch (error) {
      /* ignore */
    }
    imported.delete(family);
    availability.delete(family);
    emit();
  }

  function importedRecords() {
    return [...imported.values()];
  }

  function ensureLoaded(family, weight = 400, italic = false) {
    if (!document.fonts?.load) return Promise.resolve();
    return document.fonts.load(fontString({ family, size: 32, weight, italic }), 'Aa永').catch(() => {});
  }

  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function emit() {
    listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error(error);
      }
    });
  }

  CC.fonts = {
    GROUPS,
    stack,
    fontString,
    detect,
    label,
    pickerGroups,
    hasLocalFontAccess,
    queryLocal,
    setLocalFamilies,
    get localFamilies() {
      return localFamilies;
    },
    importFile,
    registerRecord,
    removeImported,
    importedRecords,
    isImported: (family) => imported.has(family),
    ensureLoaded,
    onChange,
  };
})();
