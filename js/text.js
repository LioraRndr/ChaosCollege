/* CHAOS.COLLAGE — paints and the text engine (CC.paint, CC.text)
   Text layers keep a natural size from their font metrics; the layer box is
   natural × stretch, so text can be stretched non-uniformly like any layer. */
(() => {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const { clamp, mixHex, hslToRgb, rgbToHex } = CC.util;

  /* ---------------- paints ---------------- */

  const PAINT_MODES = [
    ['solid', '纯色'],
    ['linear', '线性渐变'],
    ['radial', '径向渐变'],
    ['chrome', '镀铬金属'],
    ['holo', '彩虹全息'],
    ['none', '无填充'],
  ];

  function makePaint(ctx, spec, x, y, w, h) {
    const mode = spec.mode || 'solid';
    const c1 = spec.c1 || '#111111';
    const c2 = spec.c2 || '#ffffff';
    if (mode === 'none') return 'rgba(0,0,0,0)';
    if (mode === 'solid') return c1;
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (mode === 'radial') {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, Math.hypot(w, h) / 2));
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      return g;
    }
    const angle = (((spec.angle ?? 90) - 90) * Math.PI) / 180;
    const half = (Math.abs(w * Math.cos(angle)) + Math.abs(h * Math.sin(angle))) / 2 || 1;
    const dx = Math.cos(angle) * half;
    const dy = Math.sin(angle) * half;
    const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    if (mode === 'chrome') {
      g.addColorStop(0, c1);
      g.addColorStop(0.38, mixHex(c1, c2, 0.28));
      g.addColorStop(0.49, mixHex(c1, c2, 0.08));
      g.addColorStop(0.5, c2);
      g.addColorStop(0.62, mixHex(c1, c2, 0.62));
      g.addColorStop(0.85, mixHex(c1, c2, 0.2));
      g.addColorStop(1, c1);
    } else if (mode === 'holo') {
      for (let i = 0; i <= 6; i += 1) g.addColorStop(i / 6, rgbToHex(hslToRgb(300 - i * 50, 0.85, 0.72)));
    } else {
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
    }
    return g;
  }

  /* layer → paint spec (shapes, vectors and text share the same fields) */
  function layerPaint(layer) {
    return { mode: layer.fillMode || 'solid', c1: layer.fill, c2: layer.fill2 || '#ffffff', angle: layer.fillAngle ?? 90 };
  }

  CC.paint = { MODES: PAINT_MODES, make: makePaint, layerPaint };

  /* ---------------- text ---------------- */

  const supportsLetterSpacing = typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype;
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  const layoutCache = new Map();

  function fontOf(layer) {
    return CC.fonts.fontString({
      family: layer.fontFamily || 'Arial Black',
      size: Math.max(1, layer.fontSize || 64),
      weight: layer.fontWeight || 700,
      italic: !!layer.italic,
    });
  }

  function setTracking(ctx, tracking) {
    if (supportsLetterSpacing) ctx.letterSpacing = `${tracking || 0}px`;
  }

  function measureLine(ctx, line, tracking) {
    const chars = Array.from(line);
    if (!chars.length) return 0;
    if (supportsLetterSpacing) {
      setTracking(ctx, tracking);
      return ctx.measureText(line).width - (tracking || 0);
    }
    setTracking(ctx, 0);
    return chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + (tracking || 0) * (chars.length - 1);
  }

  function layoutKey(layer) {
    return [
      layer.text, layer.fontFamily, layer.fontWeight, layer.italic ? 1 : 0, layer.fontSize, layer.lineHeight,
      layer.tracking, layer.vertical ? 1 : 0, layer.arc || 0, layer.strokeWidth || 0, layer.stroke2Width || 0,
    ].join('\u0001');
  }

  let fontEpoch = 0;
  function invalidateFonts() {
    fontEpoch += 1;
    layoutCache.clear();
  }

  function layout(layer) {
    const key = `${layoutKey(layer)}\u0001${fontEpoch}`;
    const cached = layoutCache.get(key);
    if (cached) return cached;
    const size = Math.max(1, layer.fontSize || 64);
    const tracking = Number(layer.tracking) || 0;
    const lineH = size * (layer.lineHeight || 1);
    const font = fontOf(layer);
    mctx.font = font;
    setTracking(mctx, 0);
    const metrics = mctx.measureText('Hg国');
    const asc = metrics.fontBoundingBoxAscent ?? size * 0.82;
    const desc = metrics.fontBoundingBoxDescent ?? size * 0.22;
    const lines = String(layer.text ?? '').split('\n');
    const result = { font, size, tracking, lineH, asc, desc, lines, mode: 'horizontal' };
    const stroke = Math.max(0, layer.strokeWidth || 0) + Math.max(0, layer.stroke2Width || 0);
    result.pad = stroke + Math.max(2, size * 0.04);

    if (layer.vertical) {
      result.mode = 'vertical';
      const advance = size + tracking;
      const colStep = Math.max(size * 0.6, lineH);
      const longest = Math.max(1, ...lines.map((line) => Array.from(line).length));
      result.advance = advance;
      result.colStep = colStep;
      result.blockW = size + colStep * (lines.length - 1);
      result.blockH = Math.max(size, longest * advance - tracking);
    } else {
      result.widths = lines.map((line) => measureLine(mctx, line, tracking));
      result.blockW = Math.max(size * 0.3, ...result.widths);
      result.blockH = asc + desc + lineH * (lines.length - 1);
      const arc = clamp(Number(layer.arc) || 0, -360, 360);
      if (Math.abs(arc) >= 1) {
        result.mode = 'arc';
        const total = (Math.abs(arc) * Math.PI) / 180;
        const radius = result.blockW / total;
        const dir = arc > 0 ? 1 : -1;
        const glyphs = [];
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        lines.forEach((line, lineIndex) => {
          const r = Math.max(size * 0.5, radius - dir * lineIndex * lineH);
          const chars = Array.from(line);
          setTracking(mctx, 0);
          const widths = chars.map((ch) => mctx.measureText(ch).width);
          const lineWidth = widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1);
          let cursor = -lineWidth / 2;
          chars.forEach((ch, i) => {
            const center = cursor + widths[i] / 2;
            const theta = center / r;
            const x = Math.sin(theta) * r;
            const y = dir > 0 ? -Math.cos(theta) * r : Math.cos(theta) * r;
            const rotation = dir > 0 ? theta : -theta;
            glyphs.push({ ch, x, y, rotation, w: widths[i], line: lineIndex });
            const half = Math.max(widths[i], size) * 0.75;
            minX = Math.min(minX, x - half);
            maxX = Math.max(maxX, x + half);
            minY = Math.min(minY, y - half);
            maxY = Math.max(maxY, y + half);
            cursor += widths[i] + tracking;
          });
        });
        if (!glyphs.length) {
          minX = -size;
          maxX = size;
          minY = -size;
          maxY = size;
        }
        result.glyphs = glyphs;
        result.cx = (minX + maxX) / 2;
        result.cy = (minY + maxY) / 2;
        result.blockW = maxX - minX;
        result.blockH = maxY - minY;
      }
    }
    result.w = result.blockW + result.pad * 2;
    result.h = result.blockH + result.pad * 2;
    if (layoutCache.size > 400) layoutCache.clear();
    layoutCache.set(key, result);
    return result;
  }

  function naturalSize(layer) {
    const L = layout(layer);
    return { w: L.w, h: L.h };
  }

  /* draw a text layer centered at the origin in natural units × stretch */
  function draw(ctx, layer) {
    const L = layout(layer);
    const sx = Number(layer.stretchX) || 1;
    const sy = Number(layer.stretchY) || 1;
    ctx.save();
    ctx.scale(sx, sy);
    ctx.font = L.font;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    const fill = makePaint(ctx, layerPaint(layer), -L.blockW / 2, -L.blockH / 2, L.blockW, L.blockH);
    const passes = [];
    const strokeWidth = Math.max(0, layer.strokeWidth || 0);
    const stroke2Width = Math.max(0, layer.stroke2Width || 0);
    if (stroke2Width > 0) passes.push({ kind: 'stroke', style: layer.stroke2 || '#ffffff', width: (strokeWidth + stroke2Width) * 2 });
    if (strokeWidth > 0) passes.push({ kind: 'stroke', style: layer.stroke || '#111111', width: strokeWidth * 2 });
    if ((layer.fillMode || 'solid') !== 'none') passes.push({ kind: 'fill', style: fill });

    passes.forEach((pass) => {
      if (pass.kind === 'stroke') {
        ctx.strokeStyle = pass.style;
        ctx.lineWidth = pass.width;
      } else ctx.fillStyle = pass.style;
      const paint = (text, x, y) => {
        if (pass.kind === 'stroke') ctx.strokeText(text, x, y);
        else ctx.fillText(text, x, y);
      };
      if (L.mode === 'vertical') {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        setTracking(ctx, 0);
        L.lines.forEach((line, col) => {
          const x = L.blockW / 2 - L.size / 2 - col * L.colStep;
          Array.from(line).forEach((ch, k) => {
            paint(ch, x, -L.blockH / 2 + k * L.advance + L.size / 2);
          });
        });
      } else if (L.mode === 'arc') {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        setTracking(ctx, 0);
        const baselineShift = (L.asc - L.desc) / 2;
        L.glyphs.forEach((glyph) => {
          ctx.save();
          ctx.translate(glyph.x - L.cx, glyph.y - L.cy);
          ctx.rotate(glyph.rotation);
          paint(glyph.ch, 0, baselineShift);
          ctx.restore();
        });
      } else {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const align = layer.align || 'center';
        L.lines.forEach((line, index) => {
          const width = L.widths[index];
          const y = -L.blockH / 2 + L.asc + index * L.lineH;
          let x = -width / 2;
          if (align === 'left') x = -L.blockW / 2;
          if (align === 'right') x = L.blockW / 2 - width;
          if (supportsLetterSpacing || !L.tracking) {
            setTracking(ctx, L.tracking);
            paint(line, x, y);
          } else {
            let cursor = x;
            Array.from(line).forEach((ch) => {
              paint(ch, cursor, y);
              cursor += ctx.measureText(ch).width + L.tracking;
            });
          }
        });
        setTracking(ctx, 0);
      }
    });
    ctx.restore();
  }

  CC.text = {
    layout,
    naturalSize,
    draw,
    invalidateFonts,
    supportsLetterSpacing,
    get epoch() {
      return fontEpoch;
    },
  };
})();
