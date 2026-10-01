/* CHAOS.COLLAGE — scene renderer (CC.createRenderer)
   Pipeline per layer:
     vector content ──(no fx / warp / style)──► composite directly
     vector content ─► raster (q) ─► effect stack ─► outline ─► warp ─► cache
                                         └► composite with shadow / glow
   Clipping groups (layer.clip) mask a run of layers by the base layer below. */
(() => {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const U = CC.util;
  const { clamp, lerp, makeCanvas, hashString } = U;

  const RASTER_BUDGET = 192 * 1024 * 1024;
  const MAX_RASTER_PIXELS = 40 * 1000 * 1000;
  const ALWAYS_RASTER = new Set(['gen', 'shatter']);

  function fitRect(sourceW, sourceH, targetW, targetH, mode = 'cover') {
    const scale = mode === 'contain' ? Math.min(targetW / sourceW, targetH / sourceH) : Math.max(targetW / sourceW, targetH / sourceH);
    const width = sourceW * scale;
    const height = sourceH * scale;
    return { x: (targetW - width) / 2, y: (targetH - height) / 2, width, height };
  }

  function roundRectPath(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function createRenderer(host) {
    const rasterCache = new Map(); /* key → entry (LRU by insertion order) */
    const lastByLayer = new Map(); /* layer id → { contentKey, entry } */
    const buildTime = new Map(); /* layer id → ms of last full build */
    let rasterBytes = 0;
    const temps = [];

    function getTemp(index, width, height) {
      if (!temps[index]) temps[index] = makeCanvas(1, 1);
      const canvas = temps[index];
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      return canvas;
    }

    function releaseTemps() {
      temps.forEach((canvas) => U.releaseCanvas(canvas));
    }

    function discard(key) {
      const entry = rasterCache.get(key);
      if (!entry) return;
      rasterBytes -= entry.bytes;
      rasterCache.delete(key);
      U.releaseCanvas(entry.canvas);
    }

    function clear() {
      for (const key of [...stageCache.keys()]) stageDiscard(key);
      stageBytes = 0;
      for (const key of [...rasterCache.keys()]) discard(key);
      rasterBytes = 0;
      lastByLayer.clear();
      releaseTemps();
    }

    function store(key, entry) {
      if (entry.bytes > RASTER_BUDGET) return;
      discard(key);
      while (rasterCache.size && rasterBytes + entry.bytes > RASTER_BUDGET) discard(rasterCache.keys().next().value);
      rasterCache.set(key, entry);
      rasterBytes += entry.bytes;
    }

    function touch(key) {
      const entry = rasterCache.get(key);
      if (!entry) return null;
      rasterCache.delete(key);
      rasterCache.set(key, entry);
      return entry;
    }

    /* ---------------- content keys ---------------- */

    function activeEffects(layer) {
      return (layer.effects || []).filter((effect) => effect.on && CC.effects.get(effect.type));
    }

    function hasStyle(layer) {
      const style = layer.style || {};
      return !!(style.outline?.on || style.shadow?.on || style.glow?.on);
    }

    function needsRaster(layer) {
      return ALWAYS_RASTER.has(layer.type) || activeEffects(layer).length > 0 || CC.warp.isActive(layer.warp) || hasStyle(layer);
    }

    function contentKey(layer, doc) {
      const {
        x, y, rotation, opacity, blend, visible, locked, name, repeater, clip, flipX, flipY, style, ...rest
      } = layer;
      const parts = [JSON.stringify(rest), JSON.stringify(style?.outline?.on ? style.outline : null), doc.seed];
      if (layer.type === 'image') parts.push(host.isAssetReady(layer.assetId) ? 'ready' : 'pending');
      activeEffects(layer).forEach((effect) => {
        const def = CC.effects.get(effect.type);
        (def.deps ? def.deps(effect.p) : []).forEach((depId) => {
          const donor = doc.layers.find((candidate) => candidate.id === depId);
          if (donor) parts.push(`${depId}:${donor.assetId}:${donor.fit}:${host.isAssetReady(donor.assetId) ? 1 : 0}`);
        });
      });
      if (layer.type === 'text' || layer.type === 'gen' || layer.type === 'window') parts.push(CC.text.epoch);
      return hashString(parts.join('\u0002')).toString(36) + rest.type;
    }

    /* ---------------- vector content ---------------- */

    function drawImageLayer(ctx, layer) {
      const w = layer.w;
      const h = layer.h;
      const img = host.getImage(layer.assetId);
      if (!img) {
        ctx.fillStyle = '#2b2b31';
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.fillStyle = '#8f8f9b';
        ctx.font = `700 ${Math.max(10, Math.min(w, h) * 0.06)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(host.isAssetMissing?.(layer.assetId) ? '图片缺失' : '图片载入中', 0, 0);
        return false;
      }
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const fit = layer.fit || 'stretch';
      ctx.imageSmoothingEnabled = layer.smoothing !== false;
      ctx.imageSmoothingQuality = 'high';
      if (fit === 'contain') {
        const box = fitRect(iw, ih, w, h, 'contain');
        ctx.drawImage(img, -w / 2 + box.x, -h / 2 + box.y, box.width, box.height);
      } else if (fit === 'cover') {
        const zoom = Math.max(1, Number(layer.cropZoom) || 1);
        const scale = Math.max(w / iw, h / ih) * zoom;
        const sw = Math.min(iw, w / scale);
        const sh = Math.min(ih, h / scale);
        const sx = clamp(((iw - sw) / 2) * (1 + (Number(layer.cropX) || 0)), 0, iw - sw);
        const sy = clamp(((ih - sh) / 2) * (1 + (Number(layer.cropY) || 0)), 0, ih - sh);
        ctx.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
      } else {
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      }
      return true;
    }

    function shapePaint(ctx, layer, x, y, w, h) {
      return CC.paint.make(ctx, CC.paint.layerPaint(layer), x, y, w, h);
    }

    function drawShape(ctx, layer, instanceIndex, seed) {
      const w = layer.w;
      const h = layer.h;
      const x = -w / 2;
      const y = -h / 2;
      const strokeWidth = layer.strokeWidth || 0;
      const fillMode = layer.fillMode || 'solid';
      ctx.save();
      ctx.fillStyle = shapePaint(ctx, layer, x, y, w, h);
      ctx.strokeStyle = layer.stroke || '#111111';
      ctx.lineWidth = strokeWidth;
      ctx.lineJoin = 'round';
      if (layer.dash > 0) ctx.setLineDash([layer.dash, layer.dash * 0.8]);
      const finish = () => {
        if (fillMode !== 'none') ctx.fill();
        if (strokeWidth > 0) ctx.stroke();
      };
      const sides = clamp(Math.round(layer.sides || 6), 3, 64);
      const inner = clamp(layer.innerRatio ?? 0.45, 0.02, 0.98);
      switch (layer.shapeType) {
        case 'circle':
        case 'ellipse':
          ctx.beginPath();
          ctx.ellipse(0, 0, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
          finish();
          break;
        case 'triangle':
          ctx.beginPath();
          ctx.moveTo(0, -h / 2);
          ctx.lineTo(w / 2, h / 2);
          ctx.lineTo(-w / 2, h / 2);
          ctx.closePath();
          finish();
          break;
        case 'polygon':
          ctx.beginPath();
          for (let i = 0; i < sides; i += 1) {
            const a = -Math.PI / 2 + (i / sides) * Math.PI * 2;
            const px = (Math.cos(a) * w) / 2;
            const py = (Math.sin(a) * h) / 2;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          finish();
          break;
        case 'star':
        case 'burst': {
          const points = layer.shapeType === 'burst' ? clamp(Math.round(layer.sides || 12), 6, 40) : clamp(Math.round(layer.sides || 5), 3, 40);
          const ratio = layer.shapeType === 'burst' ? (layer.innerRatio ?? 0.45) : inner;
          ctx.beginPath();
          for (let i = 0; i < points * 2; i += 1) {
            const r = i % 2 === 0 ? 1 : ratio;
            const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
            const px = (Math.cos(a) * w * r) / 2;
            const py = (Math.sin(a) * h * r) / 2;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          finish();
          break;
        }
        case 'sparkle': {
          const points = clamp(Math.round(layer.sides || 4), 3, 16);
          ctx.beginPath();
          for (let i = 0; i < points; i += 1) {
            const a = -Math.PI / 2 + (i / points) * Math.PI * 2;
            const b = -Math.PI / 2 + ((i + 1) / points) * Math.PI * 2;
            const m = (a + b) / 2;
            if (i === 0) ctx.moveTo((Math.cos(a) * w) / 2, (Math.sin(a) * h) / 2);
            ctx.quadraticCurveTo((Math.cos(m) * w * inner * 0.4) / 2, (Math.sin(m) * h * inner * 0.4) / 2, (Math.cos(b) * w) / 2, (Math.sin(b) * h) / 2);
          }
          ctx.closePath();
          finish();
          break;
        }
        case 'ring':
          ctx.beginPath();
          ctx.ellipse(0, 0, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
          ctx.ellipse(0, 0, (Math.abs(w) / 2) * inner, (Math.abs(h) / 2) * inner, 0, Math.PI * 2, 0, true);
          finish();
          break;
        case 'cross': {
          const t = inner * 0.5;
          ctx.beginPath();
          ctx.rect(-w / 2, (-h * t) / 2, w, h * t);
          ctx.rect((-w * t) / 2, -h / 2, w * t, h);
          if (fillMode !== 'none') ctx.fill('nonzero');
          if (strokeWidth > 0) ctx.stroke();
          break;
        }
        case 'arrow': {
          const shaftH = h * 0.34;
          const headW = w * 0.28;
          ctx.beginPath();
          ctx.moveTo(-w / 2, -shaftH / 2);
          ctx.lineTo(w / 2 - headW, -shaftH / 2);
          ctx.lineTo(w / 2 - headW, -h / 2);
          ctx.lineTo(w / 2, 0);
          ctx.lineTo(w / 2 - headW, h / 2);
          ctx.lineTo(w / 2 - headW, shaftH / 2);
          ctx.lineTo(-w / 2, shaftH / 2);
          ctx.closePath();
          finish();
          break;
        }
        case 'barcode': {
          ctx.fillRect(x, y, w, h);
          const random = U.rng(seed, layer.id, instanceIndex, 'barcode');
          let cursor = x + w * 0.06;
          const end = x + w * 0.94;
          ctx.fillStyle = layer.stroke || '#111111';
          while (cursor < end) {
            const bar = lerp(1.5, Math.max(3, w * 0.05), random());
            const gap = lerp(1, Math.max(2, w * 0.018), random());
            ctx.fillRect(cursor, y + h * 0.1, Math.min(bar, end - cursor), h * 0.72);
            cursor += bar + gap;
          }
          ctx.font = `700 ${Math.max(7, h * 0.08)}px "Courier New", monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(String((hashString(layer.id) + instanceIndex) % 99999999).padStart(8, '0'), 0, y + h * 0.96);
          break;
        }
        case 'tape': {
          ctx.globalAlpha *= 0.78;
          roundRectPath(ctx, x, y, w, h, Math.max(2, h * 0.08));
          ctx.fill();
          ctx.save();
          ctx.clip();
          ctx.globalAlpha *= 0.22;
          ctx.strokeStyle = layer.stroke || '#111111';
          ctx.lineWidth = Math.max(1, h * 0.03);
          for (let px = x - h; px < x + w + h; px += h * 0.35) {
            ctx.beginPath();
            ctx.moveTo(px, y + h);
            ctx.lineTo(px + h, y);
            ctx.stroke();
          }
          ctx.restore();
          break;
        }
        case 'line':
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = Math.max(1, Math.abs(h));
          ctx.lineCap = layer.radius > 0 ? 'round' : 'butt';
          ctx.beginPath();
          ctx.moveTo(-w / 2 + (layer.radius > 0 ? Math.abs(h) / 2 : 0), 0);
          ctx.lineTo(w / 2 - (layer.radius > 0 ? Math.abs(h) / 2 : 0), 0);
          ctx.stroke();
          break;
        case 'rect':
        default:
          if (layer.radius > 0) roundRectPath(ctx, x, y, w, h, layer.radius);
          else {
            ctx.beginPath();
            ctx.rect(x, y, w, h);
          }
          finish();
          break;
      }
      ctx.restore();
    }

    function drawWindow(ctx, layer) {
      const x = -layer.w / 2;
      const y = -layer.h / 2;
      const w = layer.w;
      const h = layer.h;
      const style = layer.windowStyle || 'classic';
      const titleHeight = clamp(h * 0.18, 18, Math.max(18, h * 0.3));
      const accent = layer.accent || '#173fbe';
      const bodyFont = Math.max(9, Math.min(h * 0.075, w * 0.06));
      ctx.save();
      if (layer.windowShadow !== false) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + 8, y + 8, w, h);
      }
      if (style === 'xp') {
        roundRectPath(ctx, x, y, w, h, Math.min(10, titleHeight * 0.4));
        ctx.fillStyle = '#ece9d8';
        ctx.fill();
        ctx.save();
        ctx.clip();
        const g = ctx.createLinearGradient(0, y, 0, y + titleHeight + 6);
        g.addColorStop(0, U.mixHex(accent, '#ffffff', 0.45));
        g.addColorStop(0.2, accent);
        g.addColorStop(1, U.mixHex(accent, '#000000', 0.25));
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, titleHeight + 6);
        ctx.restore();
        ctx.strokeStyle = U.mixHex(accent, '#000000', 0.35);
        ctx.lineWidth = 2;
        roundRectPath(ctx, x, y, w, h, Math.min(10, titleHeight * 0.4));
        ctx.stroke();
        ctx.fillStyle = '#d8442c';
        roundRectPath(ctx, x + w - titleHeight - 2, y + 4, titleHeight - 4, titleHeight - 4, 3);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        const bx = x + w - titleHeight - 2;
        const bs = titleHeight - 4;
        ctx.beginPath();
        ctx.moveTo(bx + bs * 0.3, y + 4 + bs * 0.3);
        ctx.lineTo(bx + bs * 0.7, y + 4 + bs * 0.7);
        ctx.moveTo(bx + bs * 0.7, y + 4 + bs * 0.3);
        ctx.lineTo(bx + bs * 0.3, y + 4 + bs * 0.7);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
      } else if (style === 'mac') {
        ctx.fillStyle = '#dddddd';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#eeeeee';
        ctx.fillRect(x + 2, y + 2, w - 4, titleHeight);
        ctx.strokeStyle = '#999999';
        ctx.lineWidth = 1;
        for (let ly = y + 6; ly < y + titleHeight - 2; ly += 3) {
          ctx.beginPath();
          ctx.moveTo(x + 8, ly);
          ctx.lineTo(x + w - 8, ly);
          ctx.stroke();
        }
        ctx.fillStyle = '#eeeeee';
        ctx.strokeStyle = '#111111';
        ctx.fillRect(x + 10, y + titleHeight * 0.25, titleHeight * 0.5, titleHeight * 0.5);
        ctx.strokeRect(x + 10, y + titleHeight * 0.25, titleHeight * 0.5, titleHeight * 0.5);
        ctx.fillStyle = '#111111';
      } else if (style === 'dark') {
        roundRectPath(ctx, x, y, w, h, 8);
        ctx.fillStyle = '#1c1c22';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ['#ff5f57', '#febc2e', '#28c840'].forEach((color, index) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x + 14 + index * 16, y + titleHeight / 2 + 2, Math.min(5, titleHeight * 0.22), 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.fillStyle = '#ededea';
      } else {
        ctx.fillStyle = '#c7c7c7';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x + 2, y + h - 2);
        ctx.lineTo(x + 2, y + 2);
        ctx.lineTo(x + w - 2, y + 2);
        ctx.stroke();
        ctx.fillStyle = style === 'acid' ? '#d7ff2f' : accent;
        ctx.fillRect(x + 5, y + 5, w - 10, titleHeight);
        const buttonSize = titleHeight - 8;
        ctx.fillStyle = '#d4d4d4';
        ctx.fillRect(x + w - buttonSize - 8, y + 9, buttonSize, buttonSize);
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + w - buttonSize - 8, y + 9, buttonSize, buttonSize);
        ctx.beginPath();
        ctx.moveTo(x + w - buttonSize - 4, y + 13);
        ctx.lineTo(x + w - 12, y + 9 + buttonSize - 4);
        ctx.moveTo(x + w - 12, y + 13);
        ctx.lineTo(x + w - buttonSize - 4, y + 9 + buttonSize - 4);
        ctx.stroke();
        ctx.fillStyle = style === 'acid' ? '#111111' : '#ffffff';
      }
      ctx.font = `700 ${Math.max(10, titleHeight * 0.42)}px ${CC.fonts.stack(style === 'mac' ? 'Chicago' : 'Tahoma')}`;
      ctx.textAlign = style === 'mac' ? 'center' : 'left';
      ctx.textBaseline = 'middle';
      const titleText = String(layer.title || 'WARNING');
      if (style === 'mac') {
        const tw = Math.min(w * 0.6, ctx.measureText(titleText).width + 16);
        ctx.fillStyle = '#eeeeee';
        ctx.fillRect(-tw / 2, y + 3, tw, titleHeight - 2);
        ctx.fillStyle = '#111111';
        ctx.fillText(titleText, 0, y + 2 + titleHeight / 2, w * 0.6);
      } else ctx.fillText(titleText, x + (style === 'dark' ? 64 : 12), y + 5 + titleHeight / 2, w - titleHeight * 2.5);

      const bodyTop = y + 14 + titleHeight;
      ctx.fillStyle = style === 'dark' ? '#d8d8dc' : '#111111';
      ctx.font = `${bodyFont}px ${CC.fonts.stack(layer.bodyFont || 'Courier New')}`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      const iconSize = layer.icon && layer.icon !== 'none' ? Math.min(h * 0.26, w * 0.18) : 0;
      if (iconSize) drawWindowIcon(ctx, layer.icon, x + 14 + iconSize / 2, bodyTop + iconSize / 2, iconSize);
      const bodyX = x + 14 + (iconSize ? iconSize + 12 : 0);
      const bodyLines = String(layer.body || '').split('\n').slice(0, 8);
      bodyLines.forEach((line, index) => {
        ctx.fillText(line, bodyX, bodyTop + index * bodyFont * 1.25, x + w - bodyX - 10);
      });
      const buttons = String(layer.buttons ?? 'OK').split('|').map((item) => item.trim()).filter(Boolean);
      const okW = clamp(w * 0.23, 56, 110);
      const okH = clamp(h * 0.15, 22, 34);
      buttons.slice(0, 3).forEach((label, index) => {
        const bx = x + w - (okW + 10) * (buttons.length - index) - 6;
        const by = y + h - okH - 12;
        if (style === 'dark') {
          ctx.fillStyle = index === buttons.length - 1 ? '#3265ff' : '#33333a';
          roundRectPath(ctx, bx, by, okW, okH, 6);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
        } else if (style === 'xp') {
          ctx.fillStyle = '#f4f3ee';
          roundRectPath(ctx, bx, by, okW, okH, 3);
          ctx.fill();
          ctx.strokeStyle = '#003c74';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = '#111111';
        } else {
          ctx.fillStyle = style === 'mac' ? '#eeeeee' : '#d4d4d4';
          if (style === 'mac') roundRectPath(ctx, bx, by, okW, okH, okH / 2);
          else {
            ctx.beginPath();
            ctx.rect(bx, by, okW, okH);
          }
          ctx.fill();
          ctx.strokeStyle = '#111111';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = '#111111';
        }
        ctx.font = `700 ${Math.max(9, okH * 0.42)}px ${CC.fonts.stack('Tahoma')}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + okW / 2, by + okH / 2, okW - 6);
      });
      ctx.restore();
    }

    function drawWindowIcon(ctx, icon, cx, cy, size) {
      ctx.save();
      const r = size / 2;
      if (icon === 'error') {
        ctx.fillStyle = '#d61f1f';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = r * 0.28;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.42, cy - r * 0.42);
        ctx.lineTo(cx + r * 0.42, cy + r * 0.42);
        ctx.moveTo(cx + r * 0.42, cy - r * 0.42);
        ctx.lineTo(cx - r * 0.42, cy + r * 0.42);
        ctx.stroke();
      } else if (icon === 'warning') {
        ctx.fillStyle = '#ffd400';
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = Math.max(1, r * 0.08);
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r, cy + r * 0.85);
        ctx.lineTo(cx - r, cy + r * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#111111';
        ctx.fillRect(cx - r * 0.1, cy - r * 0.45, r * 0.2, r * 0.75);
        ctx.fillRect(cx - r * 0.1, cy + r * 0.45, r * 0.2, r * 0.2);
      } else if (icon === 'info' || icon === 'question') {
        ctx.fillStyle = '#1d5fe0';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${r * 1.3}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon === 'info' ? 'i' : '?', cx, cy + r * 0.05);
      }
      ctx.restore();
    }

    function drawVector(ctx, layer) {
      const asset = CC.vectorAssets.get(layer.asset);
      const w = layer.w;
      const h = layer.h;
      if (!asset) {
        ctx.strokeStyle = '#ff4ca7';
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        return;
      }
      const [vw, vh] = asset.vb;
      ctx.save();
      ctx.translate(-w / 2, -h / 2);
      ctx.scale(w / vw, h / vh);
      const colors = {
        a: CC.paint.make(ctx, CC.paint.layerPaint(layer), 0, 0, vw, vh),
        b: layer.color2 || '#ffffff',
        ink: layer.ink || '#111111',
        hi: layer.highlight || '#ffffff',
      };
      const avgScale = Math.sqrt((w / vw) * (h / vh)) || 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (layer.strokeWidth > 0) {
        ctx.strokeStyle = layer.stroke || colors.ink;
        asset.parts.forEach((part) => {
          ctx.lineWidth = ((layer.strokeWidth * 2) / avgScale) + (part.stroke ? part.stroke * (layer.lineScale || 1) : 0);
          ctx.stroke(CC.vectorAssets.path(part.d));
        });
      }
      asset.parts.forEach((part) => {
        const color = colors[part.role] || colors.a;
        const path = CC.vectorAssets.path(part.d);
        if (part.role === 'a' && (layer.fillMode || 'solid') === 'none') return;
        if (part.stroke) {
          ctx.strokeStyle = color;
          ctx.lineWidth = part.stroke * (layer.lineScale || 1);
          ctx.stroke(path);
        } else {
          ctx.fillStyle = color;
          ctx.fill(path, part.evenodd ? 'evenodd' : 'nonzero');
        }
      });
      ctx.restore();
    }

    function drawPathLayer(ctx, layer, seed) {
      const points = layer.points || [];
      if (points.length < 2) return;
      const w = layer.w;
      const h = layer.h;
      const brush = layer.brush || {};
      const size = Math.max(0.5, brush.size || 8);
      const color = brush.color || '#111111';
      const pts = points.map(([u, v]) => [(u - 0.5) * w, (v - 0.5) * h]);
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i += 1) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2;
          const my = (pts[i][1] + pts[i + 1][1]) / 2;
          ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last[0], last[1]);
      };
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = brush.style === 'marker' ? 'square' : 'round';
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      switch (brush.style) {
        case 'neon':
          ctx.shadowColor = color;
          ctx.shadowBlur = size * 2.2;
          trace();
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = brush.core || '#ffffff';
          ctx.lineWidth = size * 0.35;
          trace();
          ctx.stroke();
          break;
        case 'marker':
          ctx.globalAlpha *= 0.82;
          ctx.lineWidth = size * 1.4;
          trace();
          ctx.stroke();
          break;
        case 'dashed':
          ctx.setLineDash([size * 2.2, size * 1.6]);
          trace();
          ctx.stroke();
          break;
        case 'spray': {
          const random = U.rng(seed, layer.id, 'spray');
          ctx.fillStyle = color;
          for (let i = 0; i < pts.length - 1; i += 1) {
            const [ax, ay] = pts[i];
            const [bx, by] = pts[i + 1];
            const dist = Math.hypot(bx - ax, by - ay);
            const dots = Math.ceil(dist / Math.max(1, size * 0.15)) * 3;
            for (let k = 0; k < dots; k += 1) {
              const t = random();
              const r = Math.sqrt(random()) * size;
              const a = random() * Math.PI * 2;
              ctx.fillRect(lerp(ax, bx, t) + Math.cos(a) * r, lerp(ay, by, t) + Math.sin(a) * r, Math.max(0.6, size * 0.06), Math.max(0.6, size * 0.06));
            }
          }
          break;
        }
        default:
          trace();
          ctx.stroke();
          break;
      }
      ctx.restore();
    }

    /* draw a layer's content in its local box (origin = box center) */
    function drawContent(ctx, layer, doc, env) {
      switch (layer.type) {
        case 'image':
          return drawImageLayer(ctx, layer);
        case 'text':
          CC.text.draw(ctx, layer);
          return true;
        case 'window':
          drawWindow(ctx, layer);
          return true;
        case 'vector':
          drawVector(ctx, layer);
          return true;
        case 'path':
          drawPathLayer(ctx, layer, doc.seed);
          return true;
        case 'gen': {
          const def = CC.generators.get(layer.gen);
          if (!def) return true;
          ctx.save();
          def.draw(ctx, layer.w, layer.h, { ...CC.generators.defaults(layer.gen), ...(layer.p || {}) }, {
            q: env.q,
            seed: doc.seed,
            layerId: layer.id,
          });
          ctx.restore();
          return true;
        }
        case 'shatter': {
          const params = { ...CC.shatter.defaults(), ...(layer.shatter || {}) };
          const W = clamp(Math.round(Math.abs(layer.w) * env.q), 2, 4000);
          const H = clamp(Math.round(Math.abs(layer.h) * env.q), 2, 4000);
          const output = makeCanvas(W, H);
          CC.shatter.render(output, layer.id, params, env.q, doc.seed);
          ctx.drawImage(output, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
          U.releaseCanvas(output);
          return true;
        }
        case 'shape':
        default:
          drawShape(ctx, layer, env.instanceIndex || 0, doc.seed);
          return true;
      }
    }

    /* ---------------- raster pipeline ---------------- */

    function applyOutline(canvas, outline, q) {
      const radius = Math.max(0.5, (outline.width || 0) * q);
      const w = canvas.width;
      const h = canvas.height;
      const silhouette = makeCanvas(w, h);
      const sctx = silhouette.getContext('2d');
      sctx.drawImage(canvas, 0, 0);
      sctx.globalCompositeOperation = 'source-in';
      sctx.fillStyle = outline.color || '#ffffff';
      sctx.fillRect(0, 0, w, h);
      const out = makeCanvas(w, h);
      const octx = out.getContext('2d');
      const rings = radius > 6 ? [radius * 0.5, radius] : [radius];
      rings.forEach((r) => {
        const steps = clamp(Math.ceil(r * 1.6), 12, 64);
        for (let i = 0; i < steps; i += 1) {
          const a = (i / steps) * Math.PI * 2;
          octx.drawImage(silhouette, Math.cos(a) * r, Math.sin(a) * r);
        }
      });
      octx.drawImage(canvas, 0, 0);
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(out, 0, 0);
      ctx.restore();
      U.releaseCanvas(silhouette);
      U.releaseCanvas(out);
    }

    const stageCache = new Map();
    let stageBytes = 0;
    const STAGE_BUDGET = 96 * 1024 * 1024;

    function stageGet(key) {
      const canvas = stageCache.get(key);
      if (!canvas) return null;
      stageCache.delete(key);
      stageCache.set(key, canvas);
      return canvas;
    }

    function stageDiscard(key) {
      const canvas = stageCache.get(key);
      if (!canvas) return;
      stageBytes -= canvas.width * canvas.height * 4;
      stageCache.delete(key);
      U.releaseCanvas(canvas);
    }

    function stageStore(key, canvas) {
      const bytes = canvas.width * canvas.height * 4;
      if (bytes > STAGE_BUDGET / 2) {
        U.releaseCanvas(canvas);
        return;
      }
      stageDiscard(key);
      while (stageCache.size && (stageBytes + bytes > STAGE_BUDGET || stageCache.size >= 32)) stageDiscard(stageCache.keys().next().value);
      stageCache.set(key, canvas);
      stageBytes += bytes;
    }

    function stageKeysFor(layer, doc, effects, geometry) {
      const {
        x, y, rotation, opacity, blend, visible, locked, name, repeater, clip, flipX, flipY, style, effects: _effects, warp, ...rest
      } = layer;
      const deps = [];
      effects.forEach((effect) => {
        const def = CC.effects.get(effect.type);
        (def.deps ? def.deps(effect.p) : []).forEach((depId) => {
          const donor = doc.layers.find((candidate) => candidate.id === depId);
          if (donor) deps.push(`${depId}:${donor.assetId}:${donor.fit}:${host.isAssetReady(donor.assetId) ? 1 : 0}`);
        });
      });
      const prefix = `${layer.id}|${hashString(JSON.stringify(rest))}|${deps.join(',')}|${doc.seed}|${CC.text.epoch}|${geometry}`;
      const keys = [];
      let chain = '';
      effects.forEach((effect) => {
        chain += `${effect.type}:${JSON.stringify(effect.p)};`;
        keys.push(`${prefix}|${hashString(chain)}`);
      });
      return keys;
    }

    function buildRaster(layer, doc, q) {
      const started = performance.now();
      const effects = activeEffects(layer);
      const outline = layer.style?.outline?.on ? layer.style.outline : null;
      const lw = Math.max(1, Math.abs(layer.w));
      const lh = Math.max(1, Math.abs(layer.h));
      let scale = q;
      if (lw * lh * scale * scale > MAX_RASTER_PIXELS) scale = Math.sqrt(MAX_RASTER_PIXELS / (lw * lh));
      const W = Math.max(1, Math.round(lw * scale));
      const H = Math.max(1, Math.round(lh * scale));
      const qx = W / lw;
      const qy = H / lh;
      const pad = Math.ceil(CC.effects.padFor(effects, scale) + (outline ? outline.width * scale + 2 : 0) + 2);
      const canvas = makeCanvas(W + pad * 2, H + pad * 2);
      const ctx = canvas.getContext('2d', { willReadFrequently: effects.length > 0 });
      /* stage cache: editing effect N reuses the cached output of effects 0..N-1 */
      const stageKeys = effects.length ? stageKeysFor(layer, doc, effects, `${scale}|${W}x${H}|${pad}`) : [];
      let start = 0;
      let complete = true;
      for (let i = stageKeys.length - 1; i >= 0; i -= 1) {
        const cached = stageGet(stageKeys[i]);
        if (cached) {
          ctx.drawImage(cached, 0, 0);
          start = i + 1;
          break;
        }
      }
      if (start === 0) {
        ctx.save();
        ctx.translate(pad + W / 2, pad + H / 2);
        ctx.scale(qx, qy);
        complete = drawContent(ctx, layer, doc, { q: scale, instanceIndex: 0 }) !== false;
        ctx.restore();
      }
      const env = {
        q: scale,
        seed: doc.seed,
        layerId: layer.id,
        fitRect,
        getDonor: (sourceId) => {
          const donor = doc.layers.find((candidate) => candidate.id === sourceId && candidate.id !== layer.id && candidate.type === 'image');
          if (!donor) return null;
          const image = host.getImage(donor.assetId);
          return image ? { image, fit: donor.fit === 'stretch' ? 'cover' : donor.fit } : null;
        },
      };
      for (let i = start; i < effects.length; i += 1) {
        const stageStarted = performance.now();
        CC.effects.applyStack(canvas, [effects[i]], env);
        if (complete && performance.now() - stageStarted > 6) stageStore(stageKeys[i], U.cloneCanvas(canvas));
      }
      if (outline && outline.width > 0) applyOutline(canvas, outline, scale);
      let result = { canvas, x: -(W / 2 + pad) / qx, y: -(H / 2 + pad) / qy, w: canvas.width / qx, h: canvas.height / qy };
      if (CC.warp.isActive(layer.warp)) {
        const warped = CC.warp.render(canvas, layer.warp, { x: pad, y: pad, w: W, h: H });
        U.releaseCanvas(canvas);
        result = { canvas: warped.canvas, x: warped.ox / qx, y: warped.oy / qy, w: warped.canvas.width / qx, h: warped.canvas.height / qy };
      }
      result.bytes = result.canvas.width * result.canvas.height * 4;
      result.complete = complete;
      result.boxW = layer.w;
      result.boxH = layer.h;
      buildTime.set(layer.id, performance.now() - started);
      return result;
    }

    function qualityFor(layer, q, opts) {
      if (opts.interactive && (buildTime.get(layer.id) || 0) > 45) return Math.max(0.125, q / 2);
      return q;
    }

    function getRaster(layer, doc, q, opts = {}) {
      const contentK = contentKey(layer, doc);
      const last = lastByLayer.get(layer.id);
      if (opts.preferCached && last && last.contentKey === contentK && rasterCache.has(last.key)) return touch(last.key);
      const quality = qualityFor(layer, q, opts);
      const key = `${layer.id}|${contentK}|${quality}`;
      const cached = touch(key);
      if (cached) {
        lastByLayer.set(layer.id, { contentKey: contentK, key });
        return cached;
      }
      if (opts.allowStale && last && rasterCache.has(last.key) && last.contentKey !== contentK) {
        const stale = touch(last.key);
        if (stale && stale.boxW && stale.boxH) {
          const sx = layer.w / stale.boxW;
          const sy = layer.h / stale.boxH;
          return { ...stale, x: stale.x * sx, y: stale.y * sy, w: stale.w * sx, h: stale.h * sy, stale: true, cached: true };
        }
      }
      const entry = buildRaster(layer, doc, quality);
      if (entry.complete) {
        store(key, entry);
        entry.cached = rasterCache.get(key) === entry;
        if (entry.cached) lastByLayer.set(layer.id, { contentKey: contentK, key });
      }
      return entry;
    }

    /* ---------------- compositing ---------------- */

    function drawShadowOnly(ctx, raster, color, blur, dx, dy) {
      const m = ctx.getTransform();
      const far = 100000;
      const scale = Math.hypot(m.a, m.b) || 1;
      const L = far / scale;
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.shadowOffsetX = dx - m.a * L;
      ctx.shadowOffsetY = dy - m.b * L;
      ctx.drawImage(raster.canvas, raster.x + L, raster.y, raster.w, raster.h);
      ctx.restore();
    }

    function compositeRaster(ctx, layer, raster, opts) {
      const style = layer.style || {};
      const ds = opts.deviceScale || 1;
      if (opts.maskOnly) {
        ctx.drawImage(raster.canvas, raster.x, raster.y, raster.w, raster.h);
        return;
      }
      if (style.glow?.on) {
        const glow = style.glow;
        const strength = clamp(Math.round(glow.strength || 1), 1, 4);
        for (let i = 0; i < strength; i += 1) drawShadowOnly(ctx, raster, U.rgba(glow.color || '#ffffff', glow.opacity ?? 0.9), (glow.blur || 20) * ds, 0, 0);
      }
      if (style.shadow?.on) {
        const shadow = style.shadow;
        const angle = ((shadow.angle ?? 135) * Math.PI) / 180;
        const distance = (shadow.distance ?? 12) * ds;
        drawShadowOnly(ctx, raster, U.rgba(shadow.color || '#000000', shadow.opacity ?? 0.5), (shadow.blur ?? 12) * ds, Math.cos(angle) * distance, Math.sin(angle) * distance);
      }
      ctx.drawImage(raster.canvas, raster.x, raster.y, raster.w, raster.h);
    }

    /* frosted glass: blur what is already on the target and keep it inside the layer's shape */
    function drawBackdrop(ctx, layer, doc, opts, instanceIndex) {
      const backdrop = layer.style.backdrop;
      const target = ctx.canvas;
      const transform = ctx.getTransform();
      const ds = opts.deviceScale || 1;
      const blurred = getTemp(3, target.width, target.height);
      const bctx = blurred.getContext('2d');
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.globalCompositeOperation = 'copy';
      bctx.filter = `blur(${Math.max(0, backdrop.blur || 0) * ds}px) saturate(${backdrop.saturate ?? 100}%) brightness(${backdrop.brightness ?? 100}%)`;
      bctx.drawImage(target, 0, 0);
      bctx.filter = 'none';
      const mask = getTemp(4, target.width, target.height);
      const mctx = mask.getContext('2d');
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.clearRect(0, 0, mask.width, mask.height);
      mctx.setTransform(transform);
      mctx.globalAlpha = 1;
      drawLayerBody(mctx, layer, doc, { ...opts, maskOnly: true }, instanceIndex);
      bctx.globalCompositeOperation = 'destination-in';
      bctx.drawImage(mask, 0, 0);
      bctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(blurred, 0, 0);
      ctx.restore();
    }

    function drawLayerBody(ctx, layer, doc, opts, instanceIndex) {
      if (needsRaster(layer)) {
        const raster = getRaster(layer, doc, opts.q || 1, opts);
        if (!raster) return;
        compositeRaster(ctx, layer, raster, opts);
        if (!raster.cached && !raster.stale) U.releaseCanvas(raster.canvas);
        return;
      }
      drawContent(ctx, layer, doc, { q: opts.q || 1, instanceIndex });
    }

    function defaultRepeater() {
      return { count: 1, dx: 14, dy: 14, scaleStep: 1, rotationStep: 0, opacityStep: 1, jitterX: 0, jitterY: 0, jitterRotation: 0 };
    }

    function drawLayer(ctx, layer, doc, opts = {}) {
      if (!layer.visible) return;
      const repeat = { ...defaultRepeater(), ...(layer.repeater || {}) };
      const count = clamp(Math.round(repeat.count || 1), 1, 120);
      const layerSeed = hashString(layer.id) ^ doc.seed;
      for (let index = count - 1; index >= 0; index -= 1) {
        const random = U.mulberry32((layerSeed + index * 2654435761) >>> 0);
        const jitterX = index === 0 ? 0 : (random() * 2 - 1) * (repeat.jitterX || 0);
        const jitterY = index === 0 ? 0 : (random() * 2 - 1) * (repeat.jitterY || 0);
        const jitterRotation = index === 0 ? 0 : (random() * 2 - 1) * (repeat.jitterRotation || 0);
        const scale = clamp(Math.pow(repeat.scaleStep || 1, index), 0.02, 20);
        const alpha = clamp((opts.forceOpacity ?? layer.opacity ?? 1) * Math.pow(repeat.opacityStep ?? 1, index), 0, 1);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = opts.forceBlend || layer.blend || 'source-over';
        ctx.translate(layer.x + index * (repeat.dx || 0) + jitterX, layer.y + index * (repeat.dy || 0) + jitterY);
        ctx.rotate((((layer.rotation || 0) + index * (repeat.rotationStep || 0) + jitterRotation) * Math.PI) / 180);
        ctx.scale(scale * (layer.flipX ? -1 : 1), scale * (layer.flipY ? -1 : 1));
        if (layer.style?.backdrop?.on && !opts.maskOnly) drawBackdrop(ctx, layer, doc, opts, index);
        drawLayerBody(ctx, layer, doc, opts, index);
        ctx.restore();
      }
    }

    function drawClipGroup(ctx, base, children, doc, opts) {
      const target = ctx.canvas;
      const transform = ctx.getTransform();
      const group = getTemp(0, target.width, target.height);
      const gctx = group.getContext('2d');
      gctx.setTransform(1, 0, 0, 1, 0, 0);
      gctx.clearRect(0, 0, group.width, group.height);
      gctx.setTransform(transform);
      drawLayer(gctx, base, doc, { ...opts, forceBlend: 'source-over' });
      const mask = getTemp(1, target.width, target.height);
      const mctx = mask.getContext('2d');
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.clearRect(0, 0, mask.width, mask.height);
      mctx.drawImage(group, 0, 0);
      const layerCanvas = getTemp(2, target.width, target.height);
      const lctx = layerCanvas.getContext('2d');
      children.forEach((child) => {
        if (!child.visible) return;
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.globalCompositeOperation = 'source-over';
        lctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
        lctx.setTransform(transform);
        drawLayer(lctx, child, doc, { ...opts, forceBlend: 'source-over' });
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.globalCompositeOperation = 'destination-in';
        lctx.drawImage(mask, 0, 0);
        lctx.globalCompositeOperation = 'source-over';
        gctx.save();
        gctx.setTransform(1, 0, 0, 1, 0, 0);
        gctx.globalCompositeOperation = child.blend || 'source-over';
        gctx.drawImage(layerCanvas, 0, 0);
        gctx.restore();
      });
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = base.blend || 'source-over';
      ctx.drawImage(group, 0, 0);
      ctx.restore();
    }

    function renderLayers(ctx, layers, doc, opts) {
      let i = 0;
      while (i < layers.length) {
        const layer = layers[i];
        let j = i + 1;
        while (j < layers.length && layers[j].clip) j += 1;
        if (opts.skip?.has(layer.id)) {
          i = j;
          continue;
        }
        const children = layers.slice(i + 1, j).filter((child) => !opts.skip?.has(child.id));
        if (layer.visible) {
          if (children.some((child) => child.visible)) drawClipGroup(ctx, layer, children, doc, opts);
          else drawLayer(ctx, layer, doc, opts);
        }
        i = j;
      }
    }

    function renderDoc(ctx, doc, opts = {}) {
      ctx.save();
      if (opts.background !== false && !doc.transparent) {
        ctx.fillStyle = doc.bg || '#f1eddf';
        ctx.fillRect(0, 0, doc.width, doc.height);
      }
      renderLayers(ctx, doc.layers, doc, opts);
      ctx.restore();
    }

    /* render one layer alone (raster bake / thumbnails) at scale q into a tight canvas */
    function renderLayerAlone(layer, doc, q) {
      const outlinePts = layerOutline(layer);
      const style = layer.style || {};
      const extra = (style.shadow?.on ? (style.shadow.distance || 0) + (style.shadow.blur || 0) * 2 : 0) + (style.glow?.on ? (style.glow.blur || 0) * 2 : 0);
      let pad = extra + CC.effects.padFor(activeEffects(layer), 1) + (style.outline?.on ? style.outline.width : 0) + 4;
      if (needsRaster(layer)) {
        const raster = getRaster(layer, doc, q, {});
        outlinePts.push([raster.x, raster.y], [raster.x + raster.w, raster.y + raster.h]);
        pad = extra + 4;
      }
      const minX = Math.min(...outlinePts.map((p) => p[0])) - pad;
      const minY = Math.min(...outlinePts.map((p) => p[1])) - pad;
      const maxX = Math.max(...outlinePts.map((p) => p[0])) + pad;
      const maxY = Math.max(...outlinePts.map((p) => p[1])) + pad;
      const canvas = makeCanvas((maxX - minX) * q, (maxY - minY) * q);
      const ctx = canvas.getContext('2d');
      ctx.scale(q, q);
      ctx.translate(-minX, -minY);
      ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
      drawLayerBody(ctx, layer, doc, { q, deviceScale: q }, 0);
      return { canvas, x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    /* outline polygon of a layer in local (unrotated, unflipped) coordinates */
    function layerOutline(layer) {
      const w = layer.w;
      const h = layer.h;
      if (CC.warp.isActive(layer.warp)) {
        return CC.warp.outline(layer.warp, 8).map(([u, v]) => [(u - 0.5) * w, (v - 0.5) * h]);
      }
      return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    }

    function stats() {
      return { entries: rasterCache.size, bytes: rasterBytes };
    }

    return {
      renderDoc,
      drawLayer,
      drawContent,
      getRaster,
      renderLayerAlone,
      layerOutline,
      needsRaster,
      contentKey,
      clear,
      releaseTemps,
      stats,
      fitRect,
    };
  }

  CC.createRenderer = createRenderer;
  CC.fitRect = fitRect;
})();
