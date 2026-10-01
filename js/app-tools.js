/* CHAOS.COLLAGE — tools & interaction (extends CC.App)
   Pointer state machine for every tool, overlay drawing (selection, handles,
   warp nets, guides), smart snapping, inline text editing and shortcuts. */
(() => {
  'use strict';

  const CC = window.CC;
  const U = CC.util;
  const M = CC.model;
  const ui = CC.ui;
  const App = CC.App;
  const { state, dom } = App;

  const ACCENT = '#d7ff2f';
  const GUIDE = '#ff4ca7';
  const HANDLE_HIT = 9;

  const TOOLS = [
    { id: 'select', name: '选择 / 移动', key: 'V', icon: 'select' },
    { id: 'transform', name: '变形（透视 / 扭曲 / 斜切 / 网格）', key: 'W', icon: 'transform' },
    { id: 'hand', name: '抓手', key: 'H', icon: 'hand' },
    { id: 'zoom', name: '缩放', key: 'Z', icon: 'zoom' },
    { id: 'text', name: '文字', key: 'T', icon: 'text' },
    { id: 'shape', name: '形状', key: 'U', icon: 'shape' },
    { id: 'brush', name: '笔刷', key: 'B', icon: 'brush' },
    { id: 'eyedropper', name: '吸管', key: 'I', icon: 'eyedropper' },
  ];

  function setTool(tool) {
    if (!TOOLS.some((item) => item.id === tool)) return;
    if (state.editingTextId && tool !== 'text') App.finishTextEdit(true);
    state.tool = tool;
    state.hover = null;
    App.renderToolrail?.();
    App.renderOptionsBar?.();
    App.renderStatus?.();
    updateCursor();
    App.requestRender('overlay');
  }

  /* ---------------- handles ---------------- */

  function screenOfLocal(layer, lx, ly) {
    const p = App.localToDoc(layer, lx, ly);
    return App.docToScreen(p.x, p.y);
  }

  function warpOf(layer) {
    return layer.warp || { quad: CC.warp.identityQuad(), mesh: CC.warp.identityMesh() };
  }

  function normToLocal(layer, [u, v]) {
    return [(u - 0.5) * layer.w, (v - 0.5) * layer.h];
  }

  function localToNorm(layer, lx, ly) {
    return [lx / layer.w + 0.5, ly / layer.h + 0.5];
  }

  const RESIZE_HANDLES = [
    ['tl', -1, -1], ['t', 0, -1], ['tr', 1, -1], ['r', 1, 0],
    ['br', 1, 1], ['b', 0, 1], ['bl', -1, 1], ['l', -1, 0],
  ];

  function handlesFor(layer) {
    if (!layer || layer.locked || !layer.visible) return [];
    const handles = [];
    if (state.tool === 'select') {
      const small = layer.w * state.view.zoom < 24 || layer.h * state.view.zoom < 24;
      RESIZE_HANDLES.forEach(([key, hx, hy]) => {
        if (small && (hx === 0 || hy === 0)) return;
        const p = screenOfLocal(layer, (hx * layer.w) / 2, (hy * layer.h) / 2);
        handles.push({ key, kind: 'resize', hx, hy, x: p.x, y: p.y });
      });
      const top = screenOfLocal(layer, 0, -layer.h / 2);
      const center = screenOfLocal(layer, 0, 0);
      const len = Math.hypot(top.x - center.x, top.y - center.y) || 1;
      handles.push({ key: 'rotate', kind: 'rotate', x: top.x + ((top.x - center.x) / len) * 26, y: top.y + ((top.y - center.y) / len) * 26, anchor: top });
    } else if (state.tool === 'transform') {
      const warp = warpOf(layer);
      const map = CC.warp.compile(warp);
      const mode = state.opts.warpMode;
      if (mode === 'mesh') {
        const H = CC.warp.quadIsIdentity(warp.quad) ? null : CC.warp.quadHomography(warp.quad);
        warp.mesh.forEach((point, index) => {
          const n = H ? CC.warp.applyH(H, point[0], point[1]) : point;
          const [lx, ly] = normToLocal(layer, n);
          const p = screenOfLocal(layer, lx, ly);
          handles.push({ key: `m${index}`, kind: 'mesh', index, x: p.x, y: p.y });
        });
      } else {
        [[0, 0], [1, 0], [1, 1], [0, 1]].forEach((uv, index) => {
          const [lx, ly] = normToLocal(layer, map(uv[0], uv[1]));
          const p = screenOfLocal(layer, lx, ly);
          handles.push({ key: `c${index}`, kind: 'corner', index, x: p.x, y: p.y });
        });
        if (mode === 'skew') {
          [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]].forEach((uv, index) => {
            const [lx, ly] = normToLocal(layer, map(uv[0], uv[1]));
            const p = screenOfLocal(layer, lx, ly);
            handles.push({ key: `e${index}`, kind: 'edge', index, x: p.x, y: p.y });
          });
        }
      }
    }
    return handles;
  }

  function handleAt(screen) {
    if (state.selection.length !== 1) return null;
    const layer = App.primaryLayer();
    const handles = handlesFor(layer);
    let best = null;
    let bestDistance = HANDLE_HIT;
    handles.forEach((handle) => {
      const distance = Math.hypot(handle.x - screen.x, handle.y - screen.y);
      if (distance <= bestDistance) {
        best = handle;
        bestDistance = distance;
      }
    });
    return best ? { layer, handle: best } : null;
  }

  function cursorForHandle(layer, handle) {
    if (handle.kind === 'rotate') return 'grab';
    if (handle.kind !== 'resize') return 'crosshair';
    const center = screenOfLocal(layer, 0, 0);
    const angle = (Math.atan2(handle.y - center.y, handle.x - center.x) * 180) / Math.PI;
    const normalized = ((angle % 180) + 180) % 180;
    if (normalized < 22.5 || normalized >= 157.5) return 'ew-resize';
    if (normalized < 67.5) return 'nwse-resize';
    if (normalized < 112.5) return 'ns-resize';
    return 'nesw-resize';
  }

  function updateCursor(screen) {
    const el = dom.viewport;
    if (!el) return;
    if (state.pointer?.mode === 'pan' || state.spacePan) {
      el.style.cursor = state.pointer?.mode === 'pan' ? 'grabbing' : 'grab';
      return;
    }
    const tool = state.tool;
    if (tool === 'hand') el.style.cursor = 'grab';
    else if (tool === 'zoom') el.style.cursor = 'zoom-in';
    else if (tool === 'text') el.style.cursor = 'text';
    else if (tool === 'shape' || tool === 'brush') el.style.cursor = 'crosshair';
    else if (tool === 'eyedropper') el.style.cursor = 'copy';
    else if (screen) {
      const hit = handleAt(screen);
      if (hit) el.style.cursor = cursorForHandle(hit.layer, hit.handle);
      else el.style.cursor = state.hover ? 'move' : 'default';
    } else el.style.cursor = 'default';
  }

  /* ---------------- snapping ---------------- */

  function snapTargets(excludeIds) {
    const doc = state.doc;
    const xs = [0, doc.width / 2, doc.width];
    const ys = [0, doc.height / 2, doc.height];
    doc.layers.forEach((layer) => {
      if (!layer.visible || excludeIds.has(layer.id)) return;
      const box = App.layerAABB(layer);
      xs.push(box.minX, (box.minX + box.maxX) / 2, box.maxX);
      ys.push(box.minY, (box.minY + box.maxY) / 2, box.maxY);
    });
    return { xs, ys };
  }

  function snapBox(box, targets) {
    const threshold = 6 / state.view.zoom;
    const guides = [];
    let dx = 0;
    let dy = 0;
    let bestX = threshold;
    let bestY = threshold;
    let guideX = null;
    let guideY = null;
    [box.minX, (box.minX + box.maxX) / 2, box.maxX].forEach((value) => {
      targets.xs.forEach((target) => {
        const distance = Math.abs(target - value);
        if (distance < bestX) {
          bestX = distance;
          dx = target - value;
          guideX = target;
        }
      });
    });
    [box.minY, (box.minY + box.maxY) / 2, box.maxY].forEach((value) => {
      targets.ys.forEach((target) => {
        const distance = Math.abs(target - value);
        if (distance < bestY) {
          bestY = distance;
          dy = target - value;
          guideY = target;
        }
      });
    });
    if (guideX != null) guides.push({ axis: 'x', pos: guideX });
    if (guideY != null) guides.push({ axis: 'y', pos: guideY });
    return { dx, dy, guides };
  }

  /* ---------------- pointer ---------------- */

  function onPointerDown(event) {
    if (!state.doc || state.homeOpen) return;
    if (event.target !== dom.art && event.target !== dom.viewport) return;
    ui.closeMenus();
    ui.closeFontPicker();
    const screen = App.eventToScreen(event);
    const point = App.screenToDoc(screen.x, screen.y);
    dom.viewport.focus({ preventScroll: true });
    if (state.editingTextId) {
      App.finishTextEdit(true);
      if (state.tool === 'text') return;
    }

    const base = { id: event.pointerId, start: screen, startDoc: point, changed: false, shift: event.shiftKey, alt: event.altKey };
    if (event.button === 1 || (event.button === 0 && (state.spacePan || state.tool === 'hand'))) {
      state.pointer = { ...base, mode: 'pan', panX: state.view.panX, panY: state.view.panY };
      capture(event);
      updateCursor();
      event.preventDefault();
      return;
    }
    if (event.button === 2) return;
    if (event.button !== 0) return;

    switch (state.tool) {
      case 'zoom':
        App.zoomStep(event.altKey ? -1 : 1, screen.x, screen.y);
        return;
      case 'eyedropper':
        pickColor(screen);
        return;
      case 'text': {
        const hit = App.hitTest(point, { preferSelected: true });
        if (hit?.type === 'text') {
          App.select(hit.id);
          startTextEdit(hit, { selectAll: false });
        } else {
          const layer = M.createText(state.doc, '文字', { fill: state.opts.fg, fontFamily: state.opts.textFamily });
          App.addLayer(layer, { label: '添加文字', at: point });
          startTextEdit(layer, { selectAll: true });
        }
        return;
      }
      case 'shape':
        state.pointer = { ...base, mode: 'draw-shape', current: point };
        capture(event);
        return;
      case 'brush':
        state.pointer = { ...base, mode: 'brush', points: [[point.x, point.y]] };
        capture(event);
        return;
      default:
        break;
    }

    /* select / transform tools */
    const handleHit = handleAt(screen);
    if (handleHit) {
      const { layer, handle } = handleHit;
      const before = App.snapshot();
      const mode = handle.kind === 'resize' ? 'resize' : handle.kind === 'rotate' ? 'rotate' : `warp-${handle.kind}`;
      if (mode.startsWith('warp') && !layer.warp) layer.warp = { quad: CC.warp.identityQuad(), mesh: CC.warp.identityMesh() };
      state.pointer = {
        ...base,
        mode,
        handle,
        layerId: layer.id,
        before,
        startLayer: U.deepCopy(layer),
        startAngle: Math.atan2(point.y - layer.y, point.x - layer.x),
      };
      if (mode === 'resize') state.interacting = 'resize';
      capture(event);
      return;
    }

    /* shift / ctrl toggles the topmost layer; a plain click keeps editing the
       current selection when it is under the pointer, even if covered */
    const toggling = event.shiftKey || event.ctrlKey || event.metaKey;
    const hit = App.hitTest(point, { preferSelected: !toggling });
    if (!hit) {
      if (!event.shiftKey) state.selection = [];
      state.pointer = { ...base, mode: 'marquee', current: screen, baseSelection: event.shiftKey ? [...state.selection] : [] };
      capture(event);
      App.renderAll();
      return;
    }
    if (toggling) {
      App.select(hit.id, { toggle: true });
      return;
    }
    if (!state.selection.includes(hit.id)) state.selection = [hit.id];
    const before = App.snapshot();
    if (event.altKey) {
      /* alt-drag duplicates the selection and drags the copies */
      const copies = [];
      App.selectedLayers().forEach((layer) => {
        const copy = App.cloneLayer(layer, 0);
        copy.name = `${layer.name} 副本`;
        state.doc.layers.splice(state.doc.layers.indexOf(layer) + 1, 0, copy);
        copies.push(copy.id);
      });
      state.selection = copies;
    }
    const moving = App.selectedLayers().filter((layer) => !layer.locked);
    const ids = new Set(moving.map((layer) => layer.id));
    state.pointer = {
      ...base,
      mode: 'move',
      before,
      origins: moving.map((layer) => ({ id: layer.id, x: layer.x, y: layer.y })),
      box: App.unionAABB(moving.map(App.layerAABB)),
      targets: state.opts.snap ? snapTargets(ids) : null,
      duplicated: event.altKey,
    };
    capture(event);
    App.renderAll();
  }

  function capture(event) {
    try {
      dom.viewport.setPointerCapture(event.pointerId);
    } catch (error) {
      /* ignore */
    }
  }

  function onPointerMove(event) {
    if (!state.doc || state.homeOpen) return;
    const screen = App.eventToScreen(event);
    const point = App.screenToDoc(screen.x, screen.y);
    App.renderCursorPos?.(point);
    const pointer = state.pointer;
    if (!pointer || pointer.id !== event.pointerId) {
      const hover = ['select', 'transform', 'text'].includes(state.tool) ? App.hitTest(point, { preferSelected: true }) : null;
      if ((hover?.id || null) !== (state.hover?.id || null)) {
        state.hover = hover;
        App.requestRender('overlay');
      }
      updateCursor(screen);
      return;
    }
    pointer.changed = pointer.changed || Math.hypot(screen.x - pointer.start.x, screen.y - pointer.start.y) > 2;
    switch (pointer.mode) {
      case 'pan':
        state.view.panX = pointer.panX + (screen.x - pointer.start.x);
        state.view.panY = pointer.panY + (screen.y - pointer.start.y);
        state.view.fitted = false;
        App.requestRender();
        break;
      case 'move':
        moveDrag(pointer, point, event);
        break;
      case 'resize':
        resizeDrag(pointer, point, event);
        break;
      case 'rotate':
        rotateDrag(pointer, point, event);
        break;
      case 'warp-corner':
      case 'warp-edge':
      case 'warp-mesh':
        warpDrag(pointer, point, event);
        break;
      case 'marquee':
        pointer.current = screen;
        marqueeSelect(pointer);
        break;
      case 'draw-shape':
        pointer.current = point;
        pointer.shiftNow = event.shiftKey;
        pointer.altNow = event.altKey;
        App.requestRender('overlay');
        break;
      case 'brush': {
        const last = pointer.points[pointer.points.length - 1];
        if (Math.hypot(point.x - last[0], point.y - last[1]) * state.view.zoom >= 1.5) pointer.points.push([point.x, point.y]);
        App.requestRender('overlay');
        break;
      }
      default:
        break;
    }
  }

  function moveDrag(pointer, point, event) {
    if (!pointer.changed) return;
    let dx = point.x - pointer.startDoc.x;
    let dy = point.y - pointer.startDoc.y;
    if (event.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    state.guides = [];
    if (pointer.targets && !(event.ctrlKey || event.metaKey) && pointer.box) {
      const box = { minX: pointer.box.minX + dx, maxX: pointer.box.maxX + dx, minY: pointer.box.minY + dy, maxY: pointer.box.maxY + dy };
      const snap = snapBox(box, pointer.targets);
      dx += snap.dx;
      dy += snap.dy;
      state.guides = snap.guides;
    }
    pointer.origins.forEach((origin) => {
      const layer = App.layerById(origin.id);
      if (!layer) return;
      layer.x = origin.x + dx;
      layer.y = origin.y + dy;
    });
    App.requestRender();
    App.renderTransformFields?.();
  }

  function resizeDrag(pointer, point, event) {
    const layer = App.layerById(pointer.layerId);
    const start = pointer.startLayer;
    if (!layer) return;
    const local = App.docToLocal(start, point.x, point.y);
    const { hx, hy } = pointer.handle;
    const symmetric = event.altKey;
    let newW = start.w;
    let newH = start.h;
    if (hx) newW = symmetric ? Math.abs(local.x) * 2 : hx * local.x + start.w / 2;
    if (hy) newH = symmetric ? Math.abs(local.y) * 2 : hy * local.y + start.h / 2;
    if (event.shiftKey) {
      const ratio = start.w / start.h;
      if (hx && hy) {
        const scale = Math.max(newW / start.w, newH / start.h);
        newW = start.w * scale;
        newH = start.h * scale;
      } else if (hx) newH = newW / ratio;
      else newW = newH * ratio;
    }
    newW = Math.max(2, newW);
    newH = Math.max(2, newH);
    let cx = 0;
    let cy = 0;
    if (!symmetric) {
      if (hx) cx = -hx * (start.w / 2) + hx * (newW / 2);
      if (hy) cy = -hy * (start.h / 2) + hy * (newH / 2);
    }
    const center = App.localToDoc(start, cx, cy);
    layer.w = newW;
    layer.h = newH;
    layer.x = center.x;
    layer.y = center.y;
    if (layer.type === 'text') App.stretchFromBox(layer);
    pointer.changed = true;
    App.requestRender();
    App.renderTransformFields?.();
  }

  function rotateDrag(pointer, point, event) {
    const layer = App.layerById(pointer.layerId);
    if (!layer) return;
    const angle = Math.atan2(point.y - layer.y, point.x - layer.x);
    let rotation = pointer.startLayer.rotation + ((angle - pointer.startAngle) * 180) / Math.PI;
    rotation = ((rotation + 540) % 360) - 180;
    if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
    layer.rotation = rotation;
    pointer.changed = true;
    App.requestRender();
    App.renderTransformFields?.();
  }

  function warpDrag(pointer, point) {
    const layer = App.layerById(pointer.layerId);
    if (!layer) return;
    const start = pointer.startLayer;
    const startWarp = start.warp || { quad: CC.warp.identityQuad(), mesh: CC.warp.identityMesh() };
    const warp = layer.warp || (layer.warp = U.deepCopy(startWarp));
    const local = App.docToLocal(start, point.x, point.y);
    const n = localToNorm(start, local.x, local.y);
    const startLocal = App.docToLocal(start, pointer.startDoc.x, pointer.startDoc.y);
    const n0 = localToNorm(start, startLocal.x, startLocal.y);
    const du = n[0] - n0[0];
    const dv = n[1] - n0[1];
    const handle = pointer.handle;
    const mode = state.opts.warpMode;
    const quad0 = startWarp.quad;
    if (handle.kind === 'corner') {
      const i = handle.index;
      if (mode === 'perspective') {
        const quad = U.deepCopy(quad0);
        if (Math.abs(du) >= Math.abs(dv)) {
          const partner = { 0: 1, 1: 0, 2: 3, 3: 2 }[i];
          quad[i][0] = quad0[i][0] + du;
          quad[partner][0] = quad0[partner][0] - du;
        } else {
          const partner = { 0: 3, 3: 0, 1: 2, 2: 1 }[i];
          quad[i][1] = quad0[i][1] + dv;
          quad[partner][1] = quad0[partner][1] - dv;
        }
        warp.quad = quad;
      } else {
        const quad = U.deepCopy(quad0);
        quad[i] = [quad0[i][0] + du, quad0[i][1] + dv];
        warp.quad = quad;
      }
    } else if (handle.kind === 'edge') {
      const quad = U.deepCopy(quad0);
      const pairs = { 0: [0, 1], 1: [1, 2], 2: [3, 2], 3: [0, 3] };
      const [a, b] = pairs[handle.index];
      if (handle.index === 0 || handle.index === 2) {
        quad[a][0] = quad0[a][0] + du;
        quad[b][0] = quad0[b][0] + du;
      } else {
        quad[a][1] = quad0[a][1] + dv;
        quad[b][1] = quad0[b][1] + dv;
      }
      warp.quad = quad;
    } else if (handle.kind === 'mesh') {
      let target = n;
      if (!CC.warp.quadIsIdentity(warp.quad)) target = CC.warp.inverseQuad(warp.quad, n[0], n[1]);
      warp.mesh = U.deepCopy(startWarp.mesh);
      warp.mesh[handle.index] = [target[0], target[1]];
    }
    pointer.changed = true;
    App.requestRender();
  }

  function marqueeSelect(pointer) {
    const a = App.screenToDoc(pointer.start.x, pointer.start.y);
    const b = App.screenToDoc(pointer.current.x, pointer.current.y);
    const rect = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) };
    const hits = state.doc.layers.filter((layer) => {
      if (!layer.visible || layer.locked) return false;
      const box = App.layerAABB(layer);
      return box.maxX >= rect.minX && box.minX <= rect.maxX && box.maxY >= rect.minY && box.minY <= rect.maxY;
    }).map((layer) => layer.id);
    state.selection = [...new Set([...pointer.baseSelection, ...hits])];
    App.requestRender('overlay');
  }

  function onPointerUp(event) {
    const pointer = state.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    state.pointer = null;
    state.guides = [];
    const wasInteracting = state.interacting;
    state.interacting = null;
    try {
      dom.viewport.releasePointerCapture(event.pointerId);
    } catch (error) {
      /* ignore */
    }
    switch (pointer.mode) {
      case 'move':
        if (pointer.changed || pointer.duplicated) App.commit(pointer.duplicated ? '复制并移动' : '移动', pointer.before);
        break;
      case 'resize':
        if (pointer.changed) App.commit('缩放 / 拉伸', pointer.before);
        break;
      case 'rotate':
        if (pointer.changed) App.commit('旋转', pointer.before);
        break;
      case 'warp-corner':
      case 'warp-edge':
      case 'warp-mesh': {
        const layer = App.layerById(pointer.layerId);
        if (layer && !CC.warp.isActive(layer.warp)) layer.warp = null;
        if (pointer.changed) App.commit(pointer.mode === 'warp-mesh' ? '网格变形' : '透视 / 扭曲', pointer.before);
        break;
      }
      case 'marquee':
        App.renderAll();
        break;
      case 'draw-shape':
        finishShape(pointer);
        break;
      case 'brush':
        finishBrush(pointer);
        break;
      default:
        break;
    }
    if (wasInteracting || pointer.mode !== 'pan') App.renderAll();
    updateCursor(App.eventToScreen(event));
  }

  function finishShape(pointer) {
    const a = pointer.startDoc;
    const b = pointer.current || a;
    let w = Math.abs(b.x - a.x);
    let h = Math.abs(b.y - a.y);
    const type = state.opts.shapeType;
    const layer = M.createShape(state.doc, type, { fill: state.opts.fg });
    if (!pointer.changed || (w < 3 && h < 3)) {
      App.addLayer(layer, { label: '添加形状', at: a });
      return;
    }
    if (pointer.shiftNow) {
      const size = Math.max(w, h);
      w = size;
      h = type === 'line' ? layer.h : size;
    }
    if (type === 'line') {
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      layer.w = Math.max(4, Math.hypot(b.x - a.x, b.y - a.y));
      layer.rotation = pointer.shiftNow ? Math.round(angle / 15) * 15 : angle;
      App.addLayer(layer, { label: '画线', at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } });
      return;
    }
    layer.w = Math.max(2, w);
    layer.h = Math.max(2, h);
    const center = pointer.altNow ? a : { x: a.x + (Math.sign(b.x - a.x) * w) / 2, y: a.y + (Math.sign(b.y - a.y) * h) / 2 };
    if (pointer.altNow) {
      layer.w *= 2;
      layer.h *= 2;
    }
    App.addLayer(layer, { label: '绘制形状', at: center });
  }

  function smoothPoints(points, amount) {
    const window = Math.round((amount / 100) * 6);
    if (window < 1 || points.length < 4) return points;
    return points.map((point, index) => {
      if (index === 0 || index === points.length - 1) return point;
      let sx = 0;
      let sy = 0;
      let count = 0;
      for (let k = -window; k <= window; k += 1) {
        const p = points[U.clamp(index + k, 0, points.length - 1)];
        sx += p[0];
        sy += p[1];
        count += 1;
      }
      return [sx / count, sy / count];
    });
  }

  function finishBrush(pointer) {
    let points = pointer.points;
    if (points.length < 2) {
      const [x, y] = points[0];
      points = [[x, y], [x + 0.5, y + 0.5]];
    }
    const brush = state.opts.brush;
    points = smoothPoints(points, brush.smooth);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const pad = brush.size / 2 + 2 + (brush.style === 'neon' ? brush.size * 2 : brush.style === 'spray' ? brush.size : 0);
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    const w = Math.max(2, maxX - minX);
    const h = Math.max(2, maxY - minY);
    const layer = M.normalizeLayer({
      type: 'path',
      name: { round: '笔刷', marker: '马克笔', neon: '霓虹笔', dashed: '虚线笔', spray: '喷漆' }[brush.style] || '笔刷',
      w,
      h,
      points: points.map(([x, y]) => [Number(((x - minX) / w).toFixed(5)), Number(((y - minY) / h).toFixed(5))]),
      brush: { style: brush.style, size: brush.size, color: state.opts.fg, core: '#ffffff' },
    });
    App.addLayer(layer, { label: '笔刷绘制', at: { x: minX + w / 2, y: minY + h / 2 } });
  }

  function pickColor(screen) {
    const dpr = state.view.dpr;
    const ctx = dom.art.getContext('2d');
    const x = Math.round(screen.x * dpr);
    const y = Math.round(screen.y * dpr);
    if (x < 0 || y < 0 || x >= dom.art.width || y >= dom.art.height) return;
    const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
    if (a === 0) return;
    const hex = U.rgbToHex({ r, g, b });
    state.opts.fg = hex;
    const layers = App.selectedLayers();
    if (layers.length) {
      App.change('吸取颜色', () => layers.forEach((layer) => setLayerPrimaryColor(layer, hex)));
    } else App.renderPanels();
    ui.toast(`取色 ${hex}${layers.length ? ' · 已应用到选中图层' : ''}`);
  }

  function setLayerPrimaryColor(layer, hex) {
    if (layer.type === 'path') layer.brush.color = hex;
    else if (layer.type === 'window') layer.accent = hex;
    else if (layer.type === 'gen') {
      const def = CC.generators.get(layer.gen);
      const colorParam = def?.params.find((param) => param.type === 'color');
      if (colorParam) layer.p[colorParam.key] = hex;
    } else if ('fill' in layer) layer.fill = hex;
  }

  /* ---------------- wheel / keyboard ---------------- */

  function onWheel(event) {
    if (!state.doc || state.homeOpen) return;
    event.preventDefault();
    const screen = App.eventToScreen(event);
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0022));
      App.zoomTo(state.view.zoom * factor, screen.x, screen.y);
    } else {
      const scale = event.deltaMode === 1 ? 16 : 1;
      if (event.shiftKey && !event.deltaX) App.panBy(-event.deltaY * scale, 0);
      else App.panBy(-event.deltaX * scale, -event.deltaY * scale);
    }
  }

  function isTyping() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || el.isContentEditable) return true;
    if (tag === 'INPUT') return !['range', 'checkbox', 'color', 'button', 'radio'].includes(el.type);
    return false;
  }

  function onKeyDown(event) {
    if (ui.dialogsOpen() || ui.menusOpen()) return;
    const command = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (state.homeOpen) {
      if (command && key === 'o') {
        event.preventDefault();
        App.openProjectFile?.();
      }
      return;
    }
    if (!state.doc) return;
    if (state.editingTextId) {
      if (event.key === 'Escape' || (event.key === 'Enter' && command)) {
        event.preventDefault();
        App.finishTextEdit(true);
      }
      return;
    }
    const typing = isTyping();
    if (command && key === 's') {
      event.preventDefault();
      if (event.shiftKey) App.saveAsFile?.();
      else App.saveCommand?.();
      return;
    }
    if (command && key === 'o') {
      event.preventDefault();
      App.openProjectFile?.();
      return;
    }
    if (command && key === 'e') {
      event.preventDefault();
      if (event.shiftKey) App.quickExport?.();
      else App.openExportDialog?.();
      return;
    }
    if (command && event.altKey && key === 'n') {
      event.preventDefault();
      App.openNewProjectDialog?.();
      return;
    }
    if (typing) return;
    if (command && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) App.redo();
      else App.undo();
      return;
    }
    if (command && key === 'y') {
      event.preventDefault();
      App.redo();
      return;
    }
    if (command && key === 'c') {
      if (App.copySelection(false)) event.preventDefault();
      return;
    }
    if (command && key === 'x') {
      if (App.copySelection(true)) event.preventDefault();
      return;
    }
    if (command && key === 'd') {
      event.preventDefault();
      App.duplicateSelection();
      return;
    }
    if (command && key === 'a') {
      event.preventDefault();
      App.selectAll();
      return;
    }
    if (command && (key === '0' || key === ')')) {
      event.preventDefault();
      App.fitView();
      return;
    }
    if (command && key === '1') {
      event.preventDefault();
      App.zoomTo(1);
      return;
    }
    if (command && (key === '=' || key === '+')) {
      event.preventDefault();
      App.zoomStep(1);
      return;
    }
    if (command && (key === '-' || key === '_')) {
      event.preventDefault();
      App.zoomStep(-1);
      return;
    }
    if (command && (event.key === ']' || event.key === '}')) {
      event.preventDefault();
      App.moveLayers(event.shiftKey ? 'front' : 'forward');
      return;
    }
    if (command && (event.key === '[' || event.key === '{')) {
      event.preventDefault();
      App.moveLayers(event.shiftKey ? 'back' : 'backward');
      return;
    }
    if (command && event.altKey && key === 'g') {
      event.preventDefault();
      const layer = App.primaryLayer();
      if (layer) App.toggleLayerFlag(layer.id, 'clip', layer.clip ? '取消剪切蒙版' : '创建剪切蒙版');
      return;
    }
    if (command) return;
    if (event.key === ' ' && !state.spacePan) {
      state.spacePan = true;
      updateCursor();
      event.preventDefault();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      App.deleteSelection();
      return;
    }
    if (event.key === 'Escape') {
      if (state.pointer) return;
      if (state.selection.length) App.select([]);
      App.closeFlyout?.();
      return;
    }
    if (event.key === 'Enter') {
      const layer = App.primaryLayer();
      if (layer?.type === 'text' && !layer.locked) {
        event.preventDefault();
        startTextEdit(layer, { selectAll: true });
      }
      return;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[event.key]) {
      event.preventDefault();
      const amount = event.shiftKey ? 10 : 1;
      App.nudge(arrows[event.key][0] * amount, arrows[event.key][1] * amount);
      return;
    }
    if (event.altKey) return;
    const tool = TOOLS.find((item) => item.key.toLowerCase() === key);
    if (tool) {
      event.preventDefault();
      setTool(tool.id);
      return;
    }
    /* preventDefault so the key is not typed into the flyout search that gets focus */
    if (key === 'g' || key === 'e') {
      event.preventDefault();
      App.toggleFlyout?.(key === 'g' ? 'generators' : 'elements');
      return;
    }
    if (key === 'x') {
      const swap = state.opts.fg;
      state.opts.fg = state.opts.bg2;
      state.opts.bg2 = swap;
      App.renderToolrail?.();
    }
  }

  function onKeyUp(event) {
    if (event.key === ' ') {
      state.spacePan = false;
      updateCursor();
    }
  }

  /* ---------------- inline text editing ---------------- */

  function positionTextEditor(layer) {
    const editor = dom.textEditor;
    const L = CC.text.layout(layer);
    const zoom = state.view.zoom;
    const center = App.docToScreen(layer.x, layer.y);
    const width = Math.max(40, L.blockW + L.size * 0.6);
    const height = Math.max(L.size, L.blockH + L.size * 0.2);
    editor.style.left = `${center.x}px`;
    editor.style.top = `${center.y}px`;
    editor.style.width = `${width}px`;
    editor.style.height = `${height}px`;
    editor.style.fontFamily = CC.fonts.stack(layer.fontFamily);
    editor.style.fontWeight = layer.fontWeight || 700;
    editor.style.fontStyle = layer.italic ? 'italic' : 'normal';
    editor.style.fontSize = `${L.size}px`;
    editor.style.lineHeight = `${L.lineH}px`;
    editor.style.letterSpacing = `${L.tracking}px`;
    editor.style.textAlign = layer.align || 'center';
    editor.style.writingMode = layer.vertical ? 'vertical-rl' : 'horizontal-tb';
    const solid = (layer.fillMode || 'solid') === 'solid';
    editor.style.color = solid ? layer.fill : layer.fillMode === 'none' ? layer.stroke || '#111111' : layer.fill || '#111111';
    const sx = (layer.stretchX || 1) * zoom * (layer.flipX ? -1 : 1);
    const sy = (layer.stretchY || 1) * zoom * (layer.flipY ? -1 : 1);
    editor.style.transform = `translate(-50%, -50%) rotate(${layer.rotation || 0}deg) scale(${sx}, ${sy})`;
  }

  function startTextEdit(layer, { selectAll = false } = {}) {
    if (!layer || layer.type !== 'text' || layer.locked) return;
    if (state.editingTextId) App.finishTextEdit(true);
    state.editingTextId = layer.id;
    state.textEditBefore = App.snapshot();
    state.textEditOriginalName = layer.name;
    state.textEditOriginalFirst = String(layer.text || '').split('\n')[0].slice(0, 24);
    const editor = dom.textEditor;
    editor.value = layer.text;
    editor.hidden = false;
    positionTextEditor(layer);
    App.requestRender();
    requestAnimationFrame(() => {
      editor.focus();
      if (selectAll) editor.select();
      else editor.setSelectionRange(editor.value.length, editor.value.length);
    });
  }

  function onTextInput() {
    const layer = App.layerById(state.editingTextId);
    if (!layer) return;
    layer.text = dom.textEditor.value;
    App.syncTextBox(layer, { anchor: true });
    positionTextEditor(layer);
    App.requestRender('overlay');
  }

  function finishTextEdit(commitChanges = true) {
    if (!state.editingTextId) return;
    const layer = App.layerById(state.editingTextId);
    const before = state.textEditBefore;
    state.editingTextId = null;
    dom.textEditor.hidden = true;
    dom.textEditor.blur();
    if (layer) {
      if (!String(layer.text).trim()) {
        state.doc.layers = state.doc.layers.filter((item) => item.id !== layer.id);
        state.selection = state.selection.filter((id) => id !== layer.id);
      } else if (state.textEditOriginalName === state.textEditOriginalFirst || state.textEditOriginalName === '文字') {
        layer.name = String(layer.text).split('\n')[0].slice(0, 24) || '文字';
      }
    }
    if (commitChanges) App.commit('编辑文字', before);
    App.renderAll();
  }

  /* ---------------- overlay ---------------- */

  function drawPolygon(ctx, points, close = true) {
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      const p = App.docToScreen(x, y);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    if (close) ctx.closePath();
  }

  function drawHandle(ctx, x, y, kind) {
    ctx.beginPath();
    if (kind === 'rotate' || kind === 'mesh') ctx.arc(x, y, kind === 'mesh' ? 4.2 : 5, 0, Math.PI * 2);
    else if (kind === 'edge') {
      ctx.moveTo(x, y - 5.5);
      ctx.lineTo(x + 5.5, y);
      ctx.lineTo(x, y + 5.5);
      ctx.lineTo(x - 5.5, y);
      ctx.closePath();
    } else ctx.rect(x - 4.5, y - 4.5, 9, 9);
    ctx.fill();
    ctx.stroke();
  }

  function renderOverlay() {
    const canvas = dom.overlay;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { dpr } = state.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const doc = state.doc;
    if (!doc) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const tl = App.docToScreen(0, 0);
    const br = App.docToScreen(doc.width, doc.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(tl.x) - 0.5, Math.round(tl.y) - 0.5, Math.round(br.x - tl.x) + 1, Math.round(br.y - tl.y) + 1);

    if (state.opts.grid) {
      const size = Math.max(2, state.opts.gridSize || 50);
      if (size * state.view.zoom >= 6) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        ctx.clip();
        ctx.strokeStyle = 'rgba(32,227,209,0.28)';
        ctx.beginPath();
        for (let x = size; x < doc.width; x += size) {
          const sx = Math.round(App.docToScreen(x, 0).x) + 0.5;
          ctx.moveTo(sx, tl.y);
          ctx.lineTo(sx, br.y);
        }
        for (let y = size; y < doc.height; y += size) {
          const sy = Math.round(App.docToScreen(0, y).y) + 0.5;
          ctx.moveTo(tl.x, sy);
          ctx.lineTo(br.x, sy);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    const selected = App.selectedLayers();
    const selectedIds = new Set(selected.map((layer) => layer.id));
    if (state.hover && !selectedIds.has(state.hover.id) && !state.pointer) {
      ctx.strokeStyle = 'rgba(215,255,47,0.55)';
      ctx.lineWidth = 1;
      drawPolygon(ctx, App.layerPolygon(state.hover));
      ctx.stroke();
    }

    selected.forEach((layer) => {
      if (!layer.visible && state.selection.length > 1) return;
      ctx.strokeStyle = layer.locked ? 'rgba(255,255,255,0.45)' : ACCENT;
      ctx.lineWidth = 1.25;
      ctx.setLineDash(layer.locked ? [4, 3] : []);
      drawPolygon(ctx, App.layerPolygon(layer));
      ctx.stroke();
      ctx.setLineDash([]);
    });

    if (selected.length > 1) {
      const box = App.unionAABB(selected.map(App.layerAABB));
      ctx.strokeStyle = 'rgba(215,255,47,0.6)';
      ctx.setLineDash([5, 4]);
      drawPolygon(ctx, [[box.minX, box.minY], [box.maxX, box.minY], [box.maxX, box.maxY], [box.minX, box.maxY]]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (selected.length === 1 && !state.editingTextId) {
      const layer = selected[0];
      const handles = handlesFor(layer);
      if (state.tool === 'select' && CC.warp.isActive(layer.warp)) {
        ctx.strokeStyle = 'rgba(215,255,47,0.45)';
        ctx.setLineDash([3, 4]);
        const box = [[-layer.w / 2, -layer.h / 2], [layer.w / 2, -layer.h / 2], [layer.w / 2, layer.h / 2], [-layer.w / 2, layer.h / 2]].map(([lx, ly]) => {
          const p = App.localToDoc(layer, lx, ly);
          return [p.x, p.y];
        });
        drawPolygon(ctx, box);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (state.tool === 'transform' && state.opts.warpMode === 'mesh' && !layer.locked) {
        const warp = warpOf(layer);
        const map = CC.warp.compile(warp);
        ctx.strokeStyle = 'rgba(32,227,209,0.55)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 6; i += 1) {
          const t = i / 6;
          const row = [];
          const col = [];
          for (let k = 0; k <= 20; k += 1) {
            const s = k / 20;
            const r = normToLocal(layer, map(s, t));
            const c = normToLocal(layer, map(t, s));
            const pr = App.localToDoc(layer, r[0], r[1]);
            const pc = App.localToDoc(layer, c[0], c[1]);
            row.push([pr.x, pr.y]);
            col.push([pc.x, pc.y]);
          }
          drawPolygon(ctx, row, false);
          ctx.stroke();
          drawPolygon(ctx, col, false);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(215,255,47,0.35)';
        ctx.setLineDash([2, 3]);
        for (let r = 0; r < 4; r += 1) {
          ctx.beginPath();
          for (let c = 0; c < 4; c += 1) {
            const h = handles[r * 4 + c];
            if (c === 0) ctx.moveTo(h.x, h.y);
            else ctx.lineTo(h.x, h.y);
          }
          ctx.stroke();
          ctx.beginPath();
          for (let c = 0; c < 4; c += 1) {
            const h = handles[c * 4 + r];
            if (c === 0) ctx.moveTo(h.x, h.y);
            else ctx.lineTo(h.x, h.y);
          }
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      const rotate = handles.find((handle) => handle.kind === 'rotate');
      if (rotate) {
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rotate.anchor.x, rotate.anchor.y);
        ctx.lineTo(rotate.x, rotate.y);
        ctx.stroke();
      }
      ctx.fillStyle = '#0b0b0d';
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.4;
      handles.forEach((handle) => drawHandle(ctx, handle.x, handle.y, handle.kind));
      if (state.pointer && ['resize', 'rotate'].includes(state.pointer.mode)) {
        const label = state.pointer.mode === 'rotate' ? `${layer.rotation.toFixed(1)}°` : `${Math.round(layer.w)} × ${Math.round(layer.h)}`;
        const p = App.docToScreen(layer.x, layer.y);
        drawTag(ctx, p.x, p.y, label);
      }
    }

    if (state.guides.length) {
      ctx.strokeStyle = GUIDE;
      ctx.lineWidth = 1;
      state.guides.forEach((guide) => {
        ctx.beginPath();
        if (guide.axis === 'x') {
          const x = Math.round(App.docToScreen(guide.pos, 0).x) + 0.5;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, state.view.height);
        } else {
          const y = Math.round(App.docToScreen(0, guide.pos).y) + 0.5;
          ctx.moveTo(0, y);
          ctx.lineTo(state.view.width, y);
        }
        ctx.stroke();
      });
    }

    const pointer = state.pointer;
    if (pointer?.mode === 'marquee' && pointer.current) {
      const x = Math.min(pointer.start.x, pointer.current.x);
      const y = Math.min(pointer.start.y, pointer.current.y);
      const w = Math.abs(pointer.current.x - pointer.start.x);
      const h = Math.abs(pointer.current.y - pointer.start.y);
      ctx.fillStyle = 'rgba(215,255,47,0.07)';
      ctx.strokeStyle = 'rgba(215,255,47,0.8)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    }
    if (pointer?.mode === 'draw-shape' && pointer.current) {
      const a = App.docToScreen(pointer.startDoc.x, pointer.startDoc.y);
      const b = App.docToScreen(pointer.current.x, pointer.current.y);
      ctx.strokeStyle = ACCENT;
      ctx.setLineDash([5, 4]);
      if (state.opts.shapeType === 'line') {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      } else {
        let w = b.x - a.x;
        let h = b.y - a.y;
        if (pointer.shiftNow) {
          const size = Math.max(Math.abs(w), Math.abs(h));
          w = Math.sign(w || 1) * size;
          h = Math.sign(h || 1) * size;
        }
        const x = pointer.altNow ? a.x - w : a.x;
        const y = pointer.altNow ? a.y - h : a.y;
        ctx.strokeRect(x, y, pointer.altNow ? w * 2 : w, pointer.altNow ? h * 2 : h);
        drawTag(ctx, b.x + 12, b.y + 14, `${Math.round(Math.abs(w) / state.view.zoom * (pointer.altNow ? 2 : 1))} × ${Math.round(Math.abs(h) / state.view.zoom * (pointer.altNow ? 2 : 1))}`);
      }
      ctx.setLineDash([]);
    }
    if (pointer?.mode === 'brush' && pointer.points.length) {
      const brush = state.opts.brush;
      ctx.strokeStyle = state.opts.fg;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = Math.max(1, brush.size * state.view.zoom);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawPolygon(ctx, pointer.points, false);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawTag(ctx, x, y, text) {
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    const width = ctx.measureText(text).width + 12;
    ctx.fillStyle = 'rgba(12,12,14,0.88)';
    ctx.fillRect(x - width / 2, y - 10, width, 20);
    ctx.fillStyle = '#ededea';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  /* ---------------- drop / paste ---------------- */

  async function handleFiles(files, at) {
    const list = [...files];
    const project = list.find((file) => /\.(chaos|json)$/i.test(file.name));
    if (project) {
      await App.openProjectFromFile?.(project);
      return;
    }
    const fonts = list.filter((file) => /\.(ttf|otf|woff2?)$/i.test(file.name));
    if (fonts.length) await App.importFontFiles?.(fonts);
    const images = list.filter((file) => file.type.startsWith('image/'));
    if (images.length) {
      if (!state.doc) {
        ui.toast('请先新建或打开一个工程');
        return;
      }
      await App.addImageFiles(images, at);
    }
  }

  function setupInteraction() {
    const viewport = dom.viewport;
    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('pointercancel', onPointerUp);
    viewport.addEventListener('pointerleave', () => {
      if (!state.pointer && state.hover) {
        state.hover = null;
        App.requestRender('overlay');
      }
    });
    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('dblclick', (event) => {
      if (!state.doc || state.tool !== 'select') return;
      const screen = App.eventToScreen(event);
      const hit = App.hitTest(App.screenToDoc(screen.x, screen.y), { preferSelected: true });
      if (hit?.type === 'text') startTextEdit(hit, { selectAll: true });
      else if (hit) App.focusInspectorContent?.();
    });
    viewport.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (!state.doc) return;
      const screen = App.eventToScreen(event);
      const point = App.screenToDoc(screen.x, screen.y);
      const hit = App.hitTest(point, { includeLocked: true, preferSelected: true });
      if (hit && !state.selection.includes(hit.id)) App.select(hit.id);
      App.openContextMenu?.(event.clientX, event.clientY, !!hit, App.hitTestAll(point, { includeLocked: true }));
    });
    dom.textEditor.addEventListener('input', onTextInput);
    dom.textEditor.addEventListener('blur', () => {
      if (state.editingTextId) finishTextEdit(true);
    });
    dom.textEditor.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        finishTextEdit(true);
      }
    });

    let dragDepth = 0;
    viewport.addEventListener('dragenter', (event) => {
      if (!event.dataTransfer?.types?.includes('Files')) return;
      event.preventDefault();
      dragDepth += 1;
      dom.dropOverlay.classList.add('visible');
    });
    viewport.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types?.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    viewport.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) dom.dropOverlay.classList.remove('visible');
    });
    viewport.addEventListener('drop', (event) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      dragDepth = 0;
      dom.dropOverlay.classList.remove('visible');
      const screen = App.eventToScreen(event);
      handleFiles(event.dataTransfer.files, state.doc ? App.screenToDoc(screen.x, screen.y) : null);
    });
    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('drop', (event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (event.dataTransfer?.files?.length) handleFiles(event.dataTransfer.files, null);
    });

    document.addEventListener('paste', (event) => {
      if (state.homeOpen || !state.doc || isTyping() || ui.dialogsOpen()) return;
      const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith('image/'));
      if (files.length) {
        event.preventDefault();
        App.addImageFiles(files, null);
        return;
      }
      if (App.pasteClipboard()) {
        event.preventDefault();
        return;
      }
      const text = event.clipboardData?.getData('text/plain');
      if (text && text.trim()) {
        event.preventDefault();
        const layer = M.createText(state.doc, text.slice(0, 2000), { fill: state.opts.fg, fontFamily: state.opts.textFamily });
        App.addLayer(layer, { label: '粘贴文字' });
      }
    });

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', () => {
      state.spacePan = false;
    });
  }

  Object.assign(App, {
    TOOLS,
    setTool,
    setupInteraction,
    renderOverlay,
    startTextEdit,
    finishTextEdit,
    updateCursor,
    handleFiles,
    setLayerPrimaryColor,
  });
})();
