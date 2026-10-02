/* CHAOS.COLLAGE — editor core (CC.App)
   Editor state, history, assets, persistence, viewport and layer operations.
   Interaction lives in app-tools.js, panels in app-panels.js, dialogs in
   app-dialogs.js; all of them extend the same CC.App object. */
(() => {
  'use strict';

  const CC = window.CC;
  const U = CC.util;
  const M = CC.model;
  const ui = CC.ui;

  const App = (CC.App = CC.App || {});

  const state = (App.state = {
    doc: null,
    assets: new Map(),
    selection: [],
    tool: 'select',
    opts: {
      shapeType: 'rect',
      brush: { style: 'round', size: 12, smooth: 55 },
      warpMode: 'distort',
      snap: true,
      grid: false,
      gridSize: 50,
      fg: '#111111',
      bg2: '#d7ff2f',
      textFamily: 'Arial Black',
    },
    view: { zoom: 1, panX: 0, panY: 0, fitted: true, dpr: 1, width: 0, height: 0 },
    history: [],
    future: [],
    saveStatus: 'idle',
    dirty: false,
    saving: false,
    saveAgain: false,
    saveBlocked: false,
    saveErrorAt: 0,
    fileHandle: null,
    pointer: null,
    hover: null,
    guides: [],
    clipboard: null,
    interacting: null,
    editingTextId: null,
    recentFonts: [],
    homeOpen: true,
    lastNudge: 0,
  });

  const dom = (App.dom = {});
  const HISTORY_LIMIT = 100;

  /* ---------------- renderer ---------------- */

  const renderer = (App.renderer = CC.createRenderer({
    getImage(id) {
      const asset = state.assets.get(id);
      if (asset?.ready) return asset.img;
      if (asset && !asset.loading && !asset.missing) loadAssetImage(asset);
      return null;
    },
    isAssetReady: (id) => !!state.assets.get(id)?.ready,
    isAssetMissing: (id) => {
      const asset = state.assets.get(id);
      return !asset || asset.missing;
    },
  }));

  /* ---------------- assets ---------------- */

  function loadAssetImage(asset) {
    if (asset.loading || asset.ready) return asset.promise;
    asset.loading = true;
    asset.promise = U.loadImage(asset.url).then((img) => {
      asset.img = img;
      asset.ready = true;
      asset.loading = false;
      asset.width = asset.width || img.naturalWidth || 512;
      asset.height = asset.height || img.naturalHeight || 512;
      requestRender();
      return img;
    }).catch(() => {
      asset.missing = true;
      asset.loading = false;
      requestRender();
      return null;
    });
    return asset.promise;
  }

  function registerAsset(record) {
    if (state.assets.has(record.id)) return state.assets.get(record.id);
    const asset = {
      id: record.id,
      name: record.name || '',
      mime: record.mime || record.blob?.type || 'image/png',
      width: record.width || 0,
      height: record.height || 0,
      blob: record.blob,
      url: URL.createObjectURL(record.blob),
      img: null,
      ready: false,
      loading: false,
      missing: false,
    };
    state.assets.set(asset.id, asset);
    loadAssetImage(asset);
    return asset;
  }

  function releaseAssets() {
    state.assets.forEach((asset) => URL.revokeObjectURL(asset.url));
    state.assets.clear();
  }

  async function importImageBlob(blob, name = '图片') {
    if (!state.doc) throw new Error('没有打开的工程');
    const buffer = await blob.arrayBuffer();
    const hash = await U.sha256Hex(buffer);
    const id = `A_${hash.slice(0, 20)}`;
    if (state.assets.has(id)) {
      const existing = state.assets.get(id);
      await loadAssetImage(existing);
      return existing;
    }
    const typed = new Blob([buffer], { type: blob.type || 'image/png' });
    const url = URL.createObjectURL(typed);
    let img;
    try {
      img = await U.loadImage(url);
    } catch (error) {
      URL.revokeObjectURL(url);
      throw new Error('图片无法解码');
    }
    const asset = {
      id,
      name,
      mime: typed.type,
      width: img.naturalWidth || 512,
      height: img.naturalHeight || 512,
      blob: typed,
      url,
      img,
      ready: true,
      loading: false,
      missing: false,
    };
    state.assets.set(id, asset);
    await CC.storage.putAsset(state.doc.id, asset);
    return asset;
  }

  async function addImageFiles(files, at) {
    const images = [...files].filter((file) => file.type.startsWith('image/'));
    if (!images.length) {
      ui.toast('请选择图片文件（PNG / JPG / WEBP / GIF / SVG）');
      return;
    }
    const before = snapshot();
    const added = [];
    for (const file of images) {
      try {
        const asset = await importImageBlob(file, file.name.replace(/\.[^.]+$/, ''));
        const layer = M.createImage(state.doc, asset.id, asset.width, asset.height, asset.name || '图像');
        placeLayer(layer, at, added.length);
        insertLayer(layer);
        added.push(layer.id);
      } catch (error) {
        ui.toast(`${file.name}：${error.message || '导入失败'}`, 'error');
      }
    }
    if (!added.length) return;
    state.selection = added;
    commit(added.length > 1 ? `导入 ${added.length} 张图片` : '导入图片', before);
    renderAll();
    ui.toast(added.length > 1 ? `已导入 ${added.length} 张图片` : '已导入图片');
  }

  function addImageAsset(assetId, at) {
    const asset = state.assets.get(assetId);
    if (!asset) return;
    const layer = M.createImage(state.doc, asset.id, asset.width || 512, asset.height || 512, asset.name || '图像');
    addLayer(layer, { label: '添加图片', at });
  }

  /* ---------------- history ---------------- */

  function snapshot() {
    return JSON.stringify({ doc: state.doc, selection: state.selection });
  }

  function commit(label, before, { coalesce = false } = {}) {
    if (!before) return false;
    const after = snapshot();
    if (before === after) return false;
    const last = state.history[state.history.length - 1];
    if (!(coalesce && last && last.label === label && Date.now() - last.time < 900)) {
      state.history.push({ snap: before, label, time: Date.now() });
      if (state.history.length > HISTORY_LIMIT) state.history.shift();
    } else last.time = Date.now();
    state.future.length = 0;
    markDirty();
    App.renderHistory?.();
    App.updateUndoButtons?.();
    return true;
  }

  /* run fn as one undoable step */
  function change(label, fn, { render = true, coalesce = false } = {}) {
    if (!state.doc) return;
    const before = snapshot();
    fn();
    const changed = commit(label, before, { coalesce });
    if (render) renderAll();
    return changed;
  }

  function restore(snap) {
    const data = JSON.parse(snap);
    state.doc = M.normalizeDoc(data.doc);
    state.selection = (data.selection || []).filter((id) => state.doc.layers.some((layer) => layer.id === id));
    stopTextEditing(false);
    markDirty();
    renderAll();
  }

  function undo() {
    if (!state.history.length) return;
    const entry = state.history.pop();
    state.future.push({ snap: snapshot(), label: entry.label, time: Date.now() });
    restore(entry.snap);
    ui.toast(`已撤销：${entry.label}`);
  }

  function redo() {
    if (!state.future.length) return;
    const entry = state.future.pop();
    state.history.push({ snap: snapshot(), label: entry.label, time: Date.now() });
    restore(entry.snap);
    ui.toast(`已重做：${entry.label}`);
  }

  function jumpHistory(index) {
    /* index: position in history list (0 = oldest); history.length = current */
    while (state.history.length > index && state.history.length) {
      const entry = state.history.pop();
      state.future.push({ snap: snapshot(), label: entry.label, time: Date.now() });
      restore(entry.snap);
    }
    while (state.history.length < index && state.future.length) {
      const entry = state.future.pop();
      state.history.push({ snap: snapshot(), label: entry.label, time: Date.now() });
      restore(entry.snap);
    }
  }

  /* ---------------- persistence ---------------- */

  function setSaveStatus(status) {
    state.saveStatus = status;
    App.renderSaveStatus?.();
  }

  function markDirty() {
    if (!state.doc) return;
    state.dirty = true;
    setSaveStatus('unsaved');
    scheduleSave();
  }

  const scheduleSave = U.debounce(() => {
    saveProject().catch((error) => console.error(error));
  }, 900);

  async function makeThumbnail() {
    const doc = state.doc;
    const max = 360;
    const scale = Math.min(max / doc.width, max / doc.height, 1);
    const canvas = U.makeCanvas(Math.max(1, Math.round(doc.width * scale)), Math.max(1, Math.round(doc.height * scale)));
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    try {
      renderer.renderDoc(ctx, doc, { q: Math.max(0.25, scale), deviceScale: scale, preferCached: true });
      return await U.canvasToBlob(canvas, 'image/webp', 0.82);
    } catch (error) {
      return null;
    } finally {
      U.releaseCanvas(canvas);
    }
  }

  /* The document is written first, with the previous thumbnail, so the IndexedDB
     transaction starts synchronously. That matters when the window is closing:
     pagehide gives no time to render a thumbnail before the write. */
  const thumbs = new Map();

  async function saveProject({ force = false, thumbnail = true, overwrite = false } = {}) {
    if (!state.doc) return;
    /* a failed cloud save waits for its retry / sign-in / conflict choice */
    if (state.saveBlocked && !overwrite) return;
    if (state.saving) {
      state.saveAgain = true;
      return;
    }
    if (!state.dirty && !force) return;
    state.saving = true;
    setSaveStatus('saving');
    const doc = state.doc;
    let saved = false;
    try {
      state.dirty = false;
      doc.updatedAt = Date.now();
      await CC.storage.putProject({
        id: doc.id,
        name: doc.name,
        width: doc.width,
        height: doc.height,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        doc: U.deepCopy(doc),
        thumb: thumbs.has(doc.id) ? thumbs.get(doc.id) : undefined,
        fileName: state.fileHandle?.name || '',
        force: overwrite,
      });
      saved = true;
      state.saveErrorAt = 0;
      setSaveStatus(state.dirty ? 'unsaved' : 'saved');
    } catch (error) {
      if (!['conflict', 'unauthorized'].includes(error?.code)) console.error(error);
      state.dirty = true;
      setSaveStatus('error');
      handleSaveError(error, doc);
    } finally {
      state.saving = false;
      if (state.saveAgain || state.dirty) {
        state.saveAgain = false;
        if (state.dirty) scheduleSave();
      }
    }
    if (saved) {
      App.autoWriteLinkedFile?.();
      if (thumbnail && document.visibilityState !== 'hidden') refreshThumbnail(doc);
    }
  }

  function handleSaveError(error, doc) {
    const unblock = () => {
      state.saveBlocked = false;
      if (state.dirty) scheduleSave();
    };
    if (error?.code === 'unauthorized') {
      state.saveBlocked = true;
      CC.cloud.showAuthGate({ reason: '登录已过期，请重新登录；未保存的改动会在登录后继续保存。', allowLocal: false }).then(unblock);
      return;
    }
    if (error?.code === 'conflict') {
      state.saveBlocked = true;
      ui.choiceDialog('工程在别处被修改了', `「${doc.name}」已在其他窗口或设备上保存过更新的版本。要保留哪一份？`, [
        { label: '加载云端版本', value: 'reload' },
        { label: '用当前窗口覆盖', value: 'overwrite', kind: 'primary' },
      ]).then(async (choice) => {
        if (choice === 'reload' && state.doc === doc) {
          state.saveBlocked = false;
          state.dirty = false;
          await App.openProject(doc.id);
          ui.toast('已加载云端版本');
          return;
        }
        if (choice === 'overwrite') {
          state.saveBlocked = false;
          await saveProject({ force: true, overwrite: true });
          return;
        }
        /* dialog dismissed: ask again on the next attempt */
        unblock();
      });
      return;
    }
    /* network or server trouble: keep the edits and retry quietly */
    if (state.saveErrorAt && Date.now() - state.saveErrorAt < 60000) {
      state.saveBlocked = true;
      setTimeout(unblock, 8000);
      return;
    }
    state.saveErrorAt = Date.now();
    ui.toast(`保存失败：${error.message || error}（会自动重试，请勿关闭页面）`, 'error');
    state.saveBlocked = true;
    setTimeout(unblock, 5000);
  }

  async function refreshThumbnail(doc) {
    const thumb = await makeThumbnail();
    if (!thumb || state.doc !== doc) return;
    thumbs.set(doc.id, thumb);
    await CC.storage.putThumb(doc.id, thumb).catch(() => {});
  }

  function flushSave() {
    scheduleSave.flush();
    if (state.dirty && !state.saving) saveProject({ thumbnail: false }).catch(() => {});
  }

  async function loadDocument(doc, assetRecords, { fileHandle = null } = {}) {
    stopTextEditing(false);
    releaseAssets();
    renderer.clear();
    state.doc = M.normalizeDoc(doc);
    state.selection = [];
    state.history = [];
    state.future = [];
    state.dirty = false;
    state.saveBlocked = false;
    state.fileHandle = fileHandle;
    assetRecords.forEach((record) => registerAsset(record));
    state.doc.layers.filter((layer) => layer.type === 'text').forEach(syncTextBox);
    App.hideHome?.();
    resizeViewport();
    fitView();
    setSaveStatus('saved');
    renderAll();
    CC.storage.setSetting('lastProjectId', state.doc.id).catch(() => {});
    /* fonts may arrive later (imported or system); resync text boxes when they do */
    document.fonts?.ready?.then(() => refreshFonts());
  }

  async function openProject(id) {
    if (state.doc && state.doc.id !== id) await saveProject();
    const record = await CC.storage.getProject(id);
    if (!record?.doc) {
      ui.toast('工程不存在或已损坏', 'error');
      return false;
    }
    const assets = await CC.storage.getAssets(id);
    const referenced = new Set();
    (record.doc.layers || []).forEach((layer) => {
      if (layer.assetId) referenced.add(layer.assetId);
    });
    const kept = [];
    for (const asset of assets) {
      if (referenced.has(asset.id)) kept.push(asset);
      else CC.storage.deleteAsset(id, asset.id).catch(() => {});
    }
    const handle = await CC.storage.getHandle(id);
    await loadDocument(record.doc, kept, { fileHandle: handle });
    return true;
  }

  async function createProject(options) {
    if (state.doc) await saveProject();
    const doc = M.newDoc(options);
    await loadDocument(doc, []);
    state.dirty = true;
    await saveProject({ force: true });
    CC.storage.requestPersist().catch(() => {});
    ui.toast(`已创建「${doc.name}」· ${doc.width} × ${doc.height}`);
    return doc;
  }

  async function closeProject() {
    stopTextEditing(true);
    await saveProject();
    App.showHome?.();
  }

  /* ---------------- viewport ---------------- */

  let rafPending = false;
  let needArt = true;
  let needOverlay = true;

  function requestRender(kind = 'all') {
    if (kind !== 'overlay') needArt = true;
    needOverlay = true;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(frame);
  }

  function frame() {
    rafPending = false;
    if (needArt) {
      needArt = false;
      renderArt();
    }
    if (needOverlay) {
      needOverlay = false;
      App.renderOverlay?.();
    }
  }

  function resizeViewport() {
    if (!dom.viewport) return;
    const rect = dom.viewport.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    state.view.dpr = dpr;
    state.view.width = rect.width;
    state.view.height = rect.height;
    [dom.art, dom.overlay].forEach((canvas) => {
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    });
    if (state.view.fitted && state.doc) fitView();
    requestRender();
  }

  function fitView() {
    if (!state.doc) return;
    const margin = 56;
    const vw = Math.max(80, state.view.width - margin * 2);
    const vh = Math.max(80, state.view.height - margin * 2);
    const zoom = U.clamp(Math.min(vw / state.doc.width, vh / state.doc.height), 0.02, 8);
    state.view.zoom = zoom;
    state.view.panX = (state.view.width - state.doc.width * zoom) / 2;
    state.view.panY = (state.view.height - state.doc.height * zoom) / 2;
    state.view.fitted = true;
    App.renderZoom?.();
    requestRender();
  }

  function zoomTo(zoom, sx = state.view.width / 2, sy = state.view.height / 2) {
    const next = U.clamp(zoom, 0.02, 32);
    const docX = (sx - state.view.panX) / state.view.zoom;
    const docY = (sy - state.view.panY) / state.view.zoom;
    state.view.zoom = next;
    state.view.panX = sx - docX * next;
    state.view.panY = sy - docY * next;
    state.view.fitted = false;
    App.renderZoom?.();
    requestRender();
  }

  const ZOOM_STEPS = [0.05, 0.08, 0.1, 0.125, 0.167, 0.25, 0.333, 0.5, 0.667, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];

  function zoomStep(direction, sx, sy) {
    const current = state.view.zoom;
    const next = direction > 0 ? ZOOM_STEPS.find((step) => step > current * 1.01) || 32 : [...ZOOM_STEPS].reverse().find((step) => step < current * 0.99) || 0.05;
    zoomTo(next, sx, sy);
  }

  function panBy(dx, dy) {
    state.view.panX += dx;
    state.view.panY += dy;
    state.view.fitted = false;
    requestRender();
  }

  function docToScreen(x, y) {
    return { x: state.view.panX + x * state.view.zoom, y: state.view.panY + y * state.view.zoom };
  }

  function screenToDoc(x, y) {
    return { x: (x - state.view.panX) / state.view.zoom, y: (y - state.view.panY) / state.view.zoom };
  }

  function eventToScreen(event) {
    const rect = dom.viewport.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  let checker = null;
  function checkerPattern(ctx) {
    if (!checker) {
      const tile = U.makeCanvas(16, 16);
      const tctx = tile.getContext('2d');
      tctx.fillStyle = '#ffffff';
      tctx.fillRect(0, 0, 16, 16);
      tctx.fillStyle = '#d9d9de';
      tctx.fillRect(0, 0, 8, 8);
      tctx.fillRect(8, 8, 8, 8);
      checker = tile;
    }
    return ctx.createPattern(checker, 'repeat');
  }

  function qualityFor(scale) {
    if (scale <= 0.3) return 0.25;
    if (scale <= 0.6) return 0.5;
    if (scale <= 1.15) return 1;
    return 2;
  }

  function renderArt() {
    const canvas = dom.art;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const doc = state.doc;
    if (!doc) return;
    const { zoom, panX, panY, dpr } = state.view;
    const scale = zoom * dpr;
    ctx.setTransform(scale, 0, 0, scale, panX * dpr, panY * dpr);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 28 * dpr;
    ctx.shadowOffsetY = 8 * dpr;
    ctx.fillStyle = doc.bg || '#ffffff';
    ctx.fillRect(0, 0, doc.width, doc.height);
    ctx.restore();
    if (doc.transparent) {
      const pattern = checkerPattern(ctx);
      pattern.setTransform(new DOMMatrix().scale(1 / zoom));
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, doc.width, doc.height);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, doc.width, doc.height);
    ctx.clip();
    const skip = state.editingTextId ? new Set([state.editingTextId]) : null;
    try {
      renderer.renderDoc(ctx, doc, {
        q: qualityFor(scale),
        deviceScale: scale,
        interactive: !!state.interacting,
        allowStale: state.interacting === 'resize',
        background: !doc.transparent,
        skip,
      });
    } catch (error) {
      console.error('render failed', error);
    }
    ctx.restore();
  }

  /* ---------------- geometry ---------------- */

  function layerMatrix(layer) {
    const angle = ((layer.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const fx = layer.flipX ? -1 : 1;
    const fy = layer.flipY ? -1 : 1;
    return [cos * fx, sin * fx, -sin * fy, cos * fy, layer.x, layer.y];
  }

  function localToDoc(layer, lx, ly) {
    return U.matApply(layerMatrix(layer), lx, ly);
  }

  function docToLocal(layer, x, y) {
    return U.matApply(U.matInvert(layerMatrix(layer)), x, y);
  }

  /* direction vectors of the layer's local axes in doc space (ignoring flip) */
  function layerAxes(layer) {
    const angle = ((layer.rotation || 0) * Math.PI) / 180;
    return { ux: Math.cos(angle), uy: Math.sin(angle), vx: -Math.sin(angle), vy: Math.cos(angle) };
  }

  function layerPolygon(layer) {
    return renderer.layerOutline(layer).map(([lx, ly]) => {
      const p = localToDoc(layer, lx, ly);
      return [p.x, p.y];
    });
  }

  function layerAABB(layer) {
    const pts = layerPolygon(layer);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }

  function unionAABB(boxes) {
    if (!boxes.length) return null;
    return {
      minX: Math.min(...boxes.map((b) => b.minX)),
      minY: Math.min(...boxes.map((b) => b.minY)),
      maxX: Math.max(...boxes.map((b) => b.maxX)),
      maxY: Math.max(...boxes.map((b) => b.maxY)),
    };
  }

  /* All layers under the point, topmost first. */
  function hitTestAll(point, { includeLocked = false } = {}) {
    const layers = state.doc?.layers || [];
    const hits = [];
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const layer = layers[i];
      if (!layer.visible || (layer.locked && !includeLocked)) continue;
      if (CC.warp.pointInPolygon(layerPolygon(layer), point.x, point.y)) hits.push(layer);
    }
    return hits;
  }

  /* preferSelected: a selected layer under the point wins over the layers
     stacked above it, so a lower layer picked in the layers panel stays the
     one being edited on the canvas. */
  function hitTest(point, { includeLocked = false, preferSelected = false } = {}) {
    const hits = hitTestAll(point, { includeLocked });
    if (preferSelected) {
      const selected = hits.find((layer) => state.selection.includes(layer.id));
      if (selected) return selected;
    }
    return hits[0] || null;
  }

  function layerById(id) {
    return state.doc?.layers.find((layer) => layer.id === id) || null;
  }

  function selectedLayers() {
    if (!state.doc) return [];
    return state.selection.map(layerById).filter(Boolean);
  }

  function primaryLayer() {
    const layers = selectedLayers();
    return layers.length ? layers[layers.length - 1] : null;
  }

  function select(ids, { additive = false, toggle = false } = {}) {
    const list = Array.isArray(ids) ? ids : ids ? [ids] : [];
    if (toggle) {
      const set = new Set(state.selection);
      list.forEach((id) => (set.has(id) ? set.delete(id) : set.add(id)));
      state.selection = [...set];
    } else if (additive) state.selection = [...new Set([...state.selection, ...list])];
    else state.selection = list;
    renderAll();
  }

  function viewCenterDoc() {
    const center = screenToDoc(state.view.width / 2, state.view.height / 2);
    const doc = state.doc;
    return { x: U.clamp(center.x, doc.width * 0.1, doc.width * 0.9), y: U.clamp(center.y, doc.height * 0.1, doc.height * 0.9) };
  }

  function placeLayer(layer, at, offsetIndex = 0) {
    const point = at || viewCenterDoc();
    layer.x = point.x + offsetIndex * 24;
    layer.y = point.y + offsetIndex * 24;
  }

  function insertLayer(layer) {
    const layers = state.doc.layers;
    const indices = state.selection.map((id) => layers.findIndex((item) => item.id === id)).filter((index) => index >= 0);
    if (indices.length) layers.splice(Math.max(...indices) + 1, 0, layer);
    else layers.push(layer);
  }

  function addLayer(layer, { label = '添加图层', at = null, keepPosition = false } = {}) {
    if (!state.doc) return null;
    const before = snapshot();
    if (!keepPosition) placeLayer(layer, at);
    if (layer.type === 'text') syncTextBox(layer);
    insertLayer(layer);
    state.selection = [layer.id];
    commit(label, before);
    renderAll();
    return layer;
  }

  /* ---------------- text boxes ---------------- */

  function syncTextBox(layer, { anchor = false } = {}) {
    if (layer.type !== 'text') return;
    const oldW = layer.w;
    const oldH = layer.h;
    const nat = CC.text.naturalSize(layer);
    layer.w = Math.max(1, nat.w * (layer.stretchX || 1));
    layer.h = Math.max(1, nat.h * (layer.stretchY || 1));
    if (anchor && Number.isFinite(oldW)) {
      const dw = layer.w - oldW;
      const dh = layer.h - oldH;
      const horizontal = layer.vertical ? -1 : layer.align === 'left' ? 1 : layer.align === 'right' ? -1 : 0;
      const { ux, uy, vx, vy } = layerAxes(layer);
      const sx = (horizontal * dw) / 2;
      const sy = dh / 2;
      layer.x += ux * sx + vx * sy;
      layer.y += uy * sx + vy * sy;
    }
  }

  function stretchFromBox(layer) {
    if (layer.type !== 'text') return;
    const nat = CC.text.naturalSize(layer);
    layer.stretchX = layer.w / Math.max(1, nat.w);
    layer.stretchY = layer.h / Math.max(1, nat.h);
  }

  function refreshFonts() {
    CC.text.invalidateFonts();
    if (state.doc) state.doc.layers.filter((layer) => layer.type === 'text').forEach((layer) => syncTextBox(layer));
    renderAll();
  }

  /* ---------------- layer operations ---------------- */

  function deleteSelection() {
    if (!state.selection.length) return;
    change(state.selection.length > 1 ? `删除 ${state.selection.length} 个图层` : '删除图层', () => {
      const removing = new Set(state.selection);
      const index = state.doc.layers.findIndex((layer) => removing.has(layer.id));
      state.doc.layers = state.doc.layers.filter((layer) => !removing.has(layer.id));
      const next = state.doc.layers[Math.min(Math.max(0, index - 1), state.doc.layers.length - 1)];
      state.selection = next ? [next.id] : [];
    });
  }

  function cloneLayer(layer, offset = 24) {
    const copy = U.deepCopy(layer);
    copy.id = U.uid(layer.type.slice(0, 2).toUpperCase());
    copy.effects = (copy.effects || []).map((effect) => ({ ...effect, id: U.uid('FX') }));
    copy.x += offset;
    copy.y += offset;
    return M.normalizeLayer(copy);
  }

  function duplicateSelection() {
    const layers = selectedLayers();
    if (!layers.length) return;
    change('复制图层', () => {
      const copies = [];
      layers.forEach((layer) => {
        const copy = cloneLayer(layer);
        copy.name = `${layer.name} 副本`;
        const index = state.doc.layers.indexOf(layer);
        state.doc.layers.splice(index + 1, 0, copy);
        copies.push(copy.id);
      });
      state.selection = copies;
    });
  }

  function copySelection(cut = false) {
    const layers = selectedLayers();
    if (!layers.length) return false;
    state.clipboard = { layers: U.deepCopy(layers), docId: state.doc.id, time: Date.now(), pasteCount: 0 };
    if (cut) deleteSelection();
    ui.toast(cut ? `已剪切 ${layers.length} 个图层` : `已复制 ${layers.length} 个图层`);
    return true;
  }

  function pasteClipboard() {
    const clip = state.clipboard;
    if (!clip?.layers?.length || !state.doc) return false;
    clip.pasteCount += 1;
    const missing = clip.layers.filter((layer) => layer.type === 'image' && !state.assets.has(layer.assetId));
    change('粘贴图层', () => {
      const ids = [];
      clip.layers.forEach((layer) => {
        const copy = cloneLayer(layer, clip.docId === state.doc.id ? 24 * clip.pasteCount : 0);
        insertLayer(copy);
        ids.push(copy.id);
      });
      state.selection = ids;
    });
    if (missing.length) ui.toast('部分图片来自其他工程，需在原工程中导出后再导入', 'error');
    return true;
  }

  function selectAll() {
    if (!state.doc) return;
    select(state.doc.layers.filter((layer) => layer.visible && !layer.locked).map((layer) => layer.id));
  }

  function moveLayers(direction) {
    const layers = state.doc.layers;
    const ids = new Set(state.selection);
    if (!ids.size) return;
    const labels = { front: '置于顶层', back: '置于底层', forward: '上移一层', backward: '下移一层' };
    change(labels[direction], () => {
      if (direction === 'front') state.doc.layers = [...layers.filter((l) => !ids.has(l.id)), ...layers.filter((l) => ids.has(l.id))];
      else if (direction === 'back') state.doc.layers = [...layers.filter((l) => ids.has(l.id)), ...layers.filter((l) => !ids.has(l.id))];
      else if (direction === 'forward') {
        for (let i = layers.length - 2; i >= 0; i -= 1) {
          if (ids.has(layers[i].id) && !ids.has(layers[i + 1].id)) [layers[i], layers[i + 1]] = [layers[i + 1], layers[i]];
        }
      } else {
        for (let i = 1; i < layers.length; i += 1) {
          if (ids.has(layers[i].id) && !ids.has(layers[i - 1].id)) [layers[i], layers[i - 1]] = [layers[i - 1], layers[i]];
        }
      }
    });
  }

  function reorderLayer(draggedId, targetId, before) {
    if (draggedId === targetId) return;
    change('调整图层顺序', () => {
      const visual = [...state.doc.layers].reverse();
      const from = visual.findIndex((layer) => layer.id === draggedId);
      if (from < 0) return;
      const [moved] = visual.splice(from, 1);
      let index = targetId ? visual.findIndex((layer) => layer.id === targetId) + (before ? 0 : 1) : visual.length;
      if (index < 0) index = visual.length;
      visual.splice(index, 0, moved);
      state.doc.layers = visual.reverse();
    });
  }

  function toggleLayerFlag(id, key, label) {
    const layer = layerById(id);
    if (!layer) return;
    change(label, () => {
      layer[key] = !layer[key];
    });
  }

  function flipSelection(axis) {
    const layers = selectedLayers();
    if (!layers.length) return;
    change(axis === 'x' ? '水平翻转' : '垂直翻转', () => {
      layers.forEach((layer) => {
        if (axis === 'x') layer.flipX = !layer.flipX;
        else layer.flipY = !layer.flipY;
      });
    });
  }

  function translateLayer(layer, dx, dy) {
    layer.x += dx;
    layer.y += dy;
  }

  function alignSelection(mode) {
    const layers = selectedLayers().filter((layer) => !layer.locked);
    if (!layers.length) return;
    const target = layers.length === 1
      ? { minX: 0, minY: 0, maxX: state.doc.width, maxY: state.doc.height }
      : unionAABB(layers.map(layerAABB));
    const names = { left: '左对齐', hcenter: '水平居中', right: '右对齐', top: '顶对齐', vcenter: '垂直居中', bottom: '底对齐' };
    change(names[mode] || '对齐', () => {
      layers.forEach((layer) => {
        const box = layerAABB(layer);
        if (mode === 'left') translateLayer(layer, target.minX - box.minX, 0);
        if (mode === 'right') translateLayer(layer, target.maxX - box.maxX, 0);
        if (mode === 'hcenter') translateLayer(layer, (target.minX + target.maxX) / 2 - (box.minX + box.maxX) / 2, 0);
        if (mode === 'top') translateLayer(layer, 0, target.minY - box.minY);
        if (mode === 'bottom') translateLayer(layer, 0, target.maxY - box.maxY);
        if (mode === 'vcenter') translateLayer(layer, 0, (target.minY + target.maxY) / 2 - (box.minY + box.maxY) / 2);
      });
    });
  }

  function distributeSelection(axis) {
    const layers = selectedLayers().filter((layer) => !layer.locked);
    if (layers.length < 3) {
      ui.toast('分布需要至少选中 3 个图层');
      return;
    }
    change(axis === 'x' ? '水平分布' : '垂直分布', () => {
      const items = layers.map((layer) => ({ layer, box: layerAABB(layer) }));
      const key = axis === 'x' ? (item) => (item.box.minX + item.box.maxX) / 2 : (item) => (item.box.minY + item.box.maxY) / 2;
      items.sort((a, b) => key(a) - key(b));
      const first = key(items[0]);
      const last = key(items[items.length - 1]);
      items.forEach((item, index) => {
        const target = first + ((last - first) * index) / (items.length - 1);
        const delta = target - key(item);
        translateLayer(item.layer, axis === 'x' ? delta : 0, axis === 'x' ? 0 : delta);
      });
    });
  }

  function nudge(dx, dy) {
    const layers = selectedLayers().filter((layer) => !layer.locked);
    if (!layers.length) return;
    change('微移', () => layers.forEach((layer) => translateLayer(layer, dx, dy)), { coalesce: true });
  }

  function resetWarp() {
    const layers = selectedLayers();
    if (!layers.length) return;
    change('重置变形', () => layers.forEach((layer) => {
      layer.warp = null;
    }));
  }

  function applyWarpPreset(kind, amount) {
    const layer = primaryLayer();
    if (!layer) return;
    change('变形预设', () => {
      const warp = layer.warp || { quad: CC.warp.identityQuad(), mesh: CC.warp.identityMesh() };
      if (['perspective-left', 'perspective-right', 'perspective-top', 'perspective-bottom', 'skew-x', 'skew-y'].includes(kind)) warp.quad = CC.warp.presetQuad(kind, amount);
      else warp.mesh = CC.warp.presetMesh(kind, amount);
      layer.warp = warp;
    });
  }

  async function rasterizeSelection() {
    const layer = primaryLayer();
    if (!layer) return;
    if (layer.type === 'image' && !renderer.needsRaster(layer) && !layer.flipX && !layer.flipY) {
      ui.toast('该图层已经是普通图像');
      return;
    }
    const before = snapshot();
    const q = Math.min(2, Math.max(1, 2400 / Math.max(layer.w, layer.h)));
    const result = renderer.renderLayerAlone(layer, state.doc, q);
    const blob = await U.canvasToBlob(result.canvas, 'image/png');
    U.releaseCanvas(result.canvas);
    const asset = await importImageBlob(blob, `${layer.name} 栅格化`);
    const cx = result.x + result.w / 2;
    const cy = result.y + result.h / 2;
    const { ux, uy, vx, vy } = layerAxes(layer);
    const image = M.normalizeLayer({
      ...M.baseLayer('image', `${layer.name}（栅格）`),
      assetId: asset.id,
      fit: 'stretch',
      x: layer.x + ux * cx + vx * cy,
      y: layer.y + uy * cx + vy * cy,
      w: result.w,
      h: result.h,
      rotation: layer.rotation,
      opacity: layer.opacity,
      blend: layer.blend,
      clip: layer.clip,
      repeater: U.deepCopy(layer.repeater),
      visible: layer.visible,
    });
    const index = state.doc.layers.indexOf(layer);
    state.doc.layers.splice(index, 1, image);
    state.selection = [image.id];
    commit('栅格化图层', before);
    renderAll();
    ui.toast('已栅格化：效果、变形和样式已合并到图像');
  }

  function reseed() {
    change('新随机种子', () => {
      state.doc.seed = Math.floor(Math.random() * 999999999);
    });
    ui.toast(`新种子 ${state.doc.seed}`);
  }

  const PALETTE = ['#d7ff2f', '#20e3d1', '#ff4ca7', '#ff7a18', '#3265ff', '#111111', '#f4f1e7'];

  function remixLayer(layer, random) {
    layer.rotation = U.clamp(layer.rotation + U.lerp(-24, 24, random()), -180, 180);
    layer.x = U.clamp(layer.x + U.lerp(-state.doc.width * 0.09, state.doc.width * 0.09, random()), -layer.w, state.doc.width + layer.w);
    layer.y = U.clamp(layer.y + U.lerp(-state.doc.height * 0.09, state.doc.height * 0.09, random()), -layer.h, state.doc.height + layer.h);
    if (layer.repeater.count > 1) {
      layer.repeater.dx = Math.round(U.lerp(-55, 55, random()));
      layer.repeater.dy = Math.round(U.lerp(-55, 55, random()));
      layer.repeater.rotationStep = Number(U.lerp(-8, 8, random()).toFixed(1));
    }
    if (layer.type === 'shape' || layer.type === 'vector' || layer.type === 'text') layer.fill = PALETTE[Math.floor(random() * PALETTE.length)];
    if (layer.type === 'window') layer.accent = PALETTE[Math.floor(random() * 5)];
    if (layer.type === 'text') syncTextBox(layer);
  }

  function remixSelectionOrAll() {
    if (!state.doc?.layers.length) return;
    const targets = selectedLayers().length ? selectedLayers() : state.doc.layers.filter((layer) => !(layer.type === 'image' && layer.w >= state.doc.width * 0.8));
    change('随机重排', () => {
      state.doc.seed = (Math.imul(state.doc.seed, 1664525) + 1013904223) >>> 0;
      const random = U.mulberry32(state.doc.seed);
      targets.filter((layer) => !layer.locked).forEach((layer) => remixLayer(layer, random));
    });
  }

  /* resize the canvas once: scale content / stretch content / extend by anchor */
  function resizeCanvas(width, height, mode = 'scale', anchor = [0.5, 0.5]) {
    const doc = state.doc;
    const W = doc.width;
    const H = doc.height;
    const nw = U.clamp(Math.round(width), 16, 16000);
    const nh = U.clamp(Math.round(height), 16, 16000);
    if (nw === W && nh === H) return;
    change('修改画布大小', () => {
      doc.layers.forEach((layer) => {
        if (mode === 'anchor') {
          layer.x += (nw - W) * anchor[0];
          layer.y += (nh - H) * anchor[1];
          return;
        }
        const sx = mode === 'stretch' ? nw / W : Math.min(nw / W, nh / H);
        const sy = mode === 'stretch' ? nh / H : sx;
        const ox = mode === 'stretch' ? 0 : (nw - W * sx) / 2;
        const oy = mode === 'stretch' ? 0 : (nh - H * sy) / 2;
        layer.x = layer.x * sx + ox;
        layer.y = layer.y * sy + oy;
        if (layer.type === 'text') {
          layer.fontSize *= sy;
          layer.stretchX *= sx / sy;
          syncTextBox(layer);
        } else {
          layer.w *= sx;
          layer.h *= sy;
        }
        if (layer.type === 'path' && layer.brush) layer.brush.size *= Math.sqrt(sx * sy);
        if (layer.repeater) {
          layer.repeater.dx *= sx;
          layer.repeater.dy *= sy;
          layer.repeater.jitterX *= sx;
          layer.repeater.jitterY *= sy;
        }
      });
      doc.width = nw;
      doc.height = nh;
    });
    fitView();
  }

  /* ---------------- text editing entry (UI lives in app-tools) ---------------- */

  function stopTextEditing(commitChanges = true) {
    App.finishTextEdit?.(commitChanges);
  }

  /* ---------------- render orchestration ---------------- */

  function renderAll() {
    App.renderPanels?.();
    requestRender();
  }

  Object.assign(App, {
    renderer,
    registerAsset,
    loadAssetImage,
    releaseAssets,
    importImageBlob,
    addImageFiles,
    addImageAsset,
    snapshot,
    commit,
    change,
    restore,
    undo,
    redo,
    jumpHistory,
    setSaveStatus,
    markDirty,
    saveProject,
    flushSave,
    loadDocument,
    openProject,
    createProject,
    closeProject,
    requestRender,
    resizeViewport,
    fitView,
    zoomTo,
    zoomStep,
    panBy,
    docToScreen,
    screenToDoc,
    eventToScreen,
    qualityFor,
    layerMatrix,
    localToDoc,
    docToLocal,
    layerAxes,
    layerPolygon,
    layerAABB,
    unionAABB,
    hitTest,
    hitTestAll,
    layerById,
    selectedLayers,
    primaryLayer,
    select,
    viewCenterDoc,
    placeLayer,
    insertLayer,
    addLayer,
    syncTextBox,
    stretchFromBox,
    refreshFonts,
    deleteSelection,
    cloneLayer,
    duplicateSelection,
    copySelection,
    pasteClipboard,
    selectAll,
    moveLayers,
    reorderLayer,
    toggleLayerFlag,
    flipSelection,
    alignSelection,
    distributeSelection,
    nudge,
    resetWarp,
    applyWarpPreset,
    rasterizeSelection,
    reseed,
    remixSelectionOrAll,
    resizeCanvas,
    stopTextEditing,
    renderAll,
  });
})();
