/* CHAOS.COLLAGE — selection units, format painter and shared transforms. */
(() => {
  'use strict';
  const CC = window.CC;
  const { util: U, model: M, ui, App } = CC;
  const { state } = App;

  // Outer group first. Flat render layers retain their original stacking order.
  function groupOf(layer) { return layer?.groupPath?.[0] || null; }

  function expandSelection(ids) {
    const wanted = new Set(ids);
    const groups = new Set(ids.map(App.layerById).map(groupOf).filter(Boolean));
    return (state.doc?.layers || []).filter((l) => wanted.has(l.id) || groups.has(groupOf(l))).map((l) => l.id);
  }

  function selectionUnits(layers = App.selectedLayers()) {
    const units = new Map();
    layers.forEach((layer) => {
      const key = groupOf(layer) || layer.id;
      if (!units.has(key)) units.set(key, []);
      units.get(key).push(layer);
    });
    return [...units.values()];
  }

  function isLayerLocked(layer) {
    const group = groupOf(layer);
    return layer.locked || !!(group && state.doc.layers.some((l) => groupOf(l) === group && l.locked));
  }

  function editableSelection() { return App.selectedLayers().filter((l) => !isLayerLocked(l)); }

  function selectedGroup() {
    const layers = App.selectedLayers();
    const group = groupOf(layers[0]);
    return group && layers.every((l) => groupOf(l) === group)
      && expandSelection([layers[0].id]).length === layers.length ? group : null;
  }

  function canGroup() { return selectionUnits().length > 1 && App.selectedLayers().every((l) => !isLayerLocked(l)); }
  function canUngroup() { return App.selectedLayers().some(groupOf) && App.selectedLayers().every((l) => !isLayerLocked(l)); }

  function groupSelection() {
    if (!canGroup()) return;
    App.change('组合对象', () => {
      const group = U.uid('G');
      expandSelection(state.selection).map(App.layerById).forEach((l) => { l.groupPath = [group, ...(l.groupPath || [])]; });
      state.selection = expandSelection(state.selection);
      state.opts.multiResize = 'overall';
    });
  }

  function ungroupSelection() {
    if (!canUngroup()) return;
    App.change('解除组合', () => {
      const groups = new Set(App.selectedLayers().map(groupOf).filter(Boolean));
      state.doc.layers.forEach((l) => { if (groups.has(groupOf(l))) l.groupPath = l.groupPath.slice(1); });
    });
  }

  // A copy operation shares this map across all members, but never with originals.
  function remapGroupPath(copy, groups) {
    copy.groupPath = (copy.groupPath || []).map((id) => {
      if (!groups.has(id)) groups.set(id, U.uid('G'));
      return groups.get(id);
    });
    return copy;
  }

  function selectionBoxLayer(layers = App.selectedLayers()) {
    if (layers.length < 2 || layers.some(isLayerLocked)) return null;
    const box = App.unionAABB(layers.map(App.layerAABB));
    return { id: '__selection__', type: 'selection', visible: true, locked: false,
      x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2,
      w: Math.max(1, box.maxX - box.minX), h: Math.max(1, box.maxY - box.minY), rotation: 0 };
  }

  function resizeMode() { return selectedGroup() ? 'overall' : state.opts.multiResize || 'overall'; }

  function scaledLayers(starts, sx, sy, anchor, mode = 'overall') {
    // Clamp once for the whole selection, preserving every member's proportions.
    if (Math.abs(sx - sy) < 1e-10) sx = sy = Math.max(sx, ...starts.map((l) => Math.max(2 / l.w, 2 / l.h)));
    sx = Math.max(sx, ...starts.map((l) => 2 / l.w));
    sy = Math.max(sy, ...starts.map((l) => 2 / l.h));
    const centers = new Map();
    if (mode === 'individual') selectionUnits(starts).filter((unit) => unit.length > 1).forEach((unit) => {
      const box = App.unionAABB(unit.map(App.layerAABB));
      centers.set(groupOf(unit[0]), { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });
    });
    return starts.map((start) => {
      const layer = { ...start };
      const origin = mode === 'individual' ? centers.get(groupOf(start)) || start : anchor;
      layer.x = origin.x + (start.x - origin.x) * sx;
      layer.y = origin.y + (start.y - origin.y) * sy;
      layer.w = start.w * sx;
      layer.h = start.h * sy;
      layer.warp = start.warp ? U.deepCopy(start.warp) : null;
      // Compose world-axis stretch with the existing quad for rotated members.
      // This preserves the exact group silhouette, including flips / mesh warps.
      if ((mode !== 'individual' || centers.has(groupOf(start))) && Math.abs(sx - sy) > 1e-8 && Math.abs(Math.sin((start.rotation || 0) * Math.PI / 180)) > 1e-8) {
        const quad = (start.warp?.quad || CC.warp.identityQuad()).map(([u, v]) => {
          const p = App.localToDoc(start, (u - 0.5) * start.w, (v - 0.5) * start.h);
          const local = App.docToLocal(layer, layer.x + (p.x - start.x) * sx, layer.y + (p.y - start.y) * sy);
          return [local.x / layer.w + 0.5, local.y / layer.h + 0.5];
        });
        layer.warp = { quad, mesh: U.deepCopy(start.warp?.mesh || CC.warp.identityMesh()) };
      }
      return layer;
    });
  }

  function scaleLayers(starts, sx, sy, anchor, mode = 'overall') {
    scaledLayers(starts, sx, sy, anchor, mode).forEach((scaled) => {
      const layer = App.layerById(scaled.id);
      if (!layer || isLayerLocked(layer)) return;
      Object.assign(layer, scaled);
      if (layer.type === 'text') App.stretchFromBox(layer);
    });
  }

  function scaleSelectionBy(percent) {
    const layers = App.selectedLayers();
    if (!layers.length || layers.some(isLayerLocked) || !Number.isFinite(percent) || percent <= 0 || percent > 10000) return;
    const box = App.unionAABB(layers.map(App.layerAABB));
    const mode = resizeMode();
    App.change(mode === 'individual' ? '分别缩放' : '整体缩放', () => {
      scaleLayers(U.deepCopy(layers), percent / 100, percent / 100, { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }, mode);
    });
  }

  const PAINT_KEYS = ['fill', 'fillMode', 'fill2', 'fillAngle', 'stroke', 'strokeWidth'];
  const TEXT_KEYS = ['fontFamily', 'fontWeight', 'italic', 'fontSize', 'lineHeight', 'tracking', 'align', 'vertical', 'arc', 'stroke2', 'stroke2Width'];
  const TYPE_KEYS = {
    text: TEXT_KEYS,
    shape: ['radius', 'dash'],
    vector: ['color2', 'ink', 'highlight', 'lineScale'],
    window: ['accent', 'windowStyle', 'bodyFont', 'windowShadow'],
    path: ['brush'],
  };

  function captureFormat(layer) {
    if (!layer) return null;
    const values = {};
    ['opacity', 'blend', 'style', 'effects', ...PAINT_KEYS, ...(TYPE_KEYS[layer.type] || [])].forEach((key) => {
      if (layer[key] !== undefined) values[key] = U.deepCopy(layer[key]);
    });
    return { type: layer.type, name: layer.name, sourceId: layer.id, values };
  }

  function copyFormat() {
    const format = captureFormat(App.primaryLayer());
    if (!format) { ui.toast('先选择提供格式的对象'); return false; }
    state.formatClipboard = format;
    return true;
  }

  function applyFormat(format, ids = state.selection) {
    if (!format || !state.doc) return false;
    const targets = expandSelection(ids).map(App.layerById).filter((l) => l && !isLayerLocked(l) && l.id !== format.sourceId);
    if (!targets.length) { ui.toast('请选择其他未锁定的目标对象'); return false; }
    App.change('应用格式', () => targets.forEach((layer) => {
      const allowed = ['opacity', 'blend', 'style', 'effects'];
      if (['text', 'shape', 'vector'].includes(layer.type)) allowed.push(...PAINT_KEYS);
      if (layer.type === format.type) allowed.push(...(TYPE_KEYS[layer.type] || []));
      allowed.forEach((key) => {
        if (format.values[key] !== undefined) layer[key] = U.deepCopy(format.values[key]);
      });
      layer.effects = (layer.effects || []).map((fx) => ({ ...fx, id: U.uid('FX') }));
      if (layer.type === 'text') {
        App.syncTextBox(layer);
        CC.fonts.ensureLoaded(layer.fontFamily, layer.fontWeight, layer.italic).then(() => App.refreshFonts());
      }
    }));
    ui.toast(`已应用格式 · ${targets.length} 个对象`);
    return true;
  }

  function startFormatPainter(continuous = false) {
    if (!state.doc) return;
    const format = captureFormat(App.primaryLayer());
    state.formatPainter = { format, continuous };
    if (format) state.formatClipboard = format;
  }

  function paintFormatAt(layer) {
    const painter = state.formatPainter;
    if (!painter || !layer) return;
    if (!painter.format) {
      painter.format = captureFormat(layer);
      state.formatClipboard = painter.format;
      App.select(layer.id);
      App.renderOptionsBar();
      return;
    }
    if (applyFormat(painter.format, [layer.id]) && !painter.continuous) App.setTool('select');
  }

  Object.assign(App, { groupOf, expandSelection, selectionUnits, isLayerLocked, editableSelection, selectedGroup,
    canGroup, canUngroup, groupSelection, ungroupSelection, remapGroupPath, selectionBoxLayer,
    resizeMode, scaledLayers, scaleLayers, scaleSelectionBy, captureFormat, copyFormat, applyFormat, startFormatPainter, paintFormatAt });
})();
