// Real model/core/tool handlers in a DOM-free VM. No browser or project storage.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const plain = (x) => JSON.parse(JSON.stringify(x));

function harness() {
  const handlers = {};
  const element = () => ({ style: {}, classList: { add() {}, remove() {} },
    addEventListener(name, fn) { handlers[name] = fn; }, focus() {},
    setPointerCapture() {}, releasePointerCapture() {}, getBoundingClientRect() { return { left: 0, top: 0 }; } });
  const sandbox = { console, setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: () => 1, URL, Blob,
    crypto: require('node:crypto').webcrypto, document: { addEventListener() {}, activeElement: null },
    addEventListener(name, fn) { handlers[`window:${name}`] = fn; } };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  function load(name) { vm.runInContext(fs.readFileSync(path.join(root, 'js', name), 'utf8'), context, { filename: name }); }
  load('util.js'); load('warp.js'); load('storage.js');
  const CC = sandbox.CC;
  Object.assign(CC, {
    effects: { normalize: (fx) => fx }, shatter: { defaults: () => ({}) }, generators: { defaults: () => ({}) },
    text: { naturalSize: (l) => ({ w: l.text.length * l.fontSize * 0.6, h: l.fontSize * l.lineHeight }), invalidateFonts() {} },
    fonts: { ensureLoaded: () => Promise.resolve() },
    ui: { toast() {}, closeMenus() {}, closeFontPicker() {}, dialogsOpen: () => false, menusOpen: () => false },
    createRenderer: () => ({ clear() {}, layerOutline(l) {
      return (CC.warp.isActive(l.warp) ? CC.warp.outline(l.warp, 8) : CC.warp.identityQuad()).map(([u, v]) => [(u - 0.5) * l.w, (v - 0.5) * l.h]);
    } }),
  });
  load('model.js'); load('app-core.js'); load('app-editing.js'); load('app-snapping.js'); load('app-tools.js');
  const { App, model: M, util: U } = CC;
  const { state, dom } = App;
  dom.viewport = element(); dom.art = element(); dom.textEditor = element(); dom.dropOverlay = element();
  App.setupInteraction();
  state.homeOpen = false; state.view.zoom = 1;
  state.doc = M.newDoc({ width: 1000, height: 800 });
  function add(options = {}) { const l = M.normalizeLayer({ type: 'shape', x: 200, y: 200, w: 100, h: 80, ...options }); state.doc.layers.push(l); return l; }
  function event(name, x, y, options = {}) {
    const e = { type: name, pointerId: 1, button: 0, target: dom.art, clientX: x, clientY: y, preventDefault() {}, ...options };
    handlers[name](e);
  }
  function drag(a, b, options = {}) { event('pointerdown', ...a, options); event('pointermove', ...b, options); event('pointerup', ...b, options); }
  return { CC, App, M, U, state, add, event, drag, handlers };
}

test('group selection, nested ungroup, undo / redo and JSON normalization', () => {
  const { App, state, add, M } = harness();
  const a = add(); const b = add({ x: 400 }); const c = add({ x: 700 });
  App.select([a.id, b.id]); App.groupSelection();
  const inner = App.selectedGroup(); assert.ok(inner);
  App.select(a.id); assert.equal(state.selection.length, 2);
  App.select(c.id, { additive: true }); App.groupSelection();
  assert.equal(App.selectedLayers()[0].groupPath.length, 2);
  App.ungroupSelection(); assert.equal(App.groupOf(App.layerById(a.id)), inner);
  App.undo(); assert.equal(App.layerById(a.id).groupPath.length, 2);
  App.redo(); assert.equal(App.layerById(a.id).groupPath.length, 1);
  state.doc = M.normalizeDoc(plain(state.doc)); App.select(b.id); assert.equal(state.selection.length, 2);
});

test('duplicate and paste create independent groups in the original stacking order', () => {
  const { App, state, add } = harness();
  const a = add({ name: 'lower' }); const b = add({ name: 'upper', x: 400 });
  App.select([b.id, a.id]); App.groupSelection(); const group = App.selectedGroup();
  App.duplicateSelection(); const copies = App.selectedLayers();
  assert.notEqual(App.selectedGroup(), group); assert.equal(copies[0].name, 'lower 副本');
  assert.deepEqual(plain(state.doc.layers.slice(0, 2).map((l) => l.id)), [a.id, b.id]);
  App.select(a.id); App.copySelection(); App.pasteClipboard();
  assert.notEqual(App.selectedGroup(), group); assert.notEqual(App.selectedGroup(), App.groupOf(copies[0]));
  assert.deepEqual(plain(App.selectedLayers().map((l) => l.name)), ['lower', 'upper']);
});

test('group alignment / nudge / flip retain internal layout; flags apply to all members', () => {
  const { App, state, add } = harness();
  const a = add(); const b = add({ x: 400, w: 200 });
  App.select([a.id, b.id]); App.groupSelection();
  App.alignSelection('hcenter'); near(b.x - a.x, 200);
  const box = App.unionAABB([a, b].map(App.layerAABB)); near((box.minX + box.maxX) / 2, 500);
  App.nudge(10, 20); near(b.x - a.x, 200);
  App.flipSelection('x'); near(a.x - b.x, 200);
  App.toggleLayerFlag(a.id, 'locked', 'lock'); assert.ok(a.locked && b.locked);
  const before = JSON.stringify(state.doc); App.scaleSelectionBy(200); assert.equal(JSON.stringify(state.doc), before);
  App.toggleLayerFlag(b.id, 'locked', 'unlock'); assert.ok(!a.locked && !b.locked);
  App.toggleLayerFlag(a.id, 'visible', 'hide'); assert.ok(!a.visible && !b.visible);
});

test('overall percentage scale changes positions; individual scale preserves centers', () => {
  const { App, state, add } = harness();
  const a = add(); const b = add({ x: 500, w: 200 }); App.select([a.id, b.id]);
  App.scaleSelectionBy(200); near(b.x - a.x, 600); near(a.w, 200);
  App.undo(); const starts = App.selectedLayers().map((l) => [l.x, l.y]);
  state.opts.multiResize = 'individual'; App.scaleSelectionBy(150);
  App.selectedLayers().forEach((l, i) => { near(l.x, starts[i][0]); near(l.y, starts[i][1]); });
  near(App.selectedLayers()[0].w, 150);
});

test('individual scaling of a group plus a loose object preserves each object center', () => {
  const { App, state, add } = harness(); const a = add(); const b = add({ x: 400 }); const c = add({ x: 700 });
  App.select([a.id, b.id]); App.groupSelection(); App.select(c.id, { additive: true });
  state.opts.multiResize = 'individual'; App.scaleSelectionBy(200);
  near((a.x + b.x) / 2, 300); near(b.x - a.x, 400); near(c.x, 700); near(c.w, 200);
});

test('nonuniform overall scaling is exact for rotated, flipped and already warped layers', () => {
  const { App, add, U, CC } = harness();
  for (const rotation of [0, 30, 90, -145]) for (const flipX of [false, true]) {
    const layer = add({ rotation, flipX, warp: { quad: [[0.1, 0], [1.1, 0.1], [1, 1], [-0.1, 0.8]], mesh: CC.warp.identityMesh() } });
    const start = U.deepCopy(layer); const anchor = { x: 50, y: 60 };
    const result = App.scaledLayers([start], 1.8, 0.7, anchor)[0];
    const f0 = CC.warp.compile(start.warp); const f1 = CC.warp.compile(result.warp);
    for (const uv of [[0, 0], [1, 0], [0.3, 0.7], [1, 1]]) {
      const a = f0(...uv); const b = f1(...uv);
      const p = App.localToDoc(start, (a[0] - 0.5) * start.w, (a[1] - 0.5) * start.h);
      const q = App.localToDoc(result, (b[0] - 0.5) * result.w, (b[1] - 0.5) * result.h);
      near(q.x, anchor.x + (p.x - anchor.x) * 1.8); near(q.y, anchor.y + (p.y - anchor.y) * 0.7);
    }
  }
});

test('format copy keeps content, geometry and identity; nested styles are independent', () => {
  const { App, add } = harness();
  const a = add({ fill: '#ff0088', opacity: 0.5, effects: [{ id: 'fx', type: 'grain', on: true, p: { amount: 5 } }] });
  const b = add({ x: 500, shapeType: 'ellipse', name: 'keep' }); a.style.shadow.on = true;
  const format = App.captureFormat(a); App.applyFormat(format, [b.id]);
  assert.equal(b.fill, '#ff0088'); assert.equal(b.shapeType, 'ellipse'); assert.equal(b.name, 'keep'); near(b.x, 500); near(b.w, 100);
  b.style.shadow.blur = 123; assert.notEqual(a.style.shadow.blur, 123); assert.notEqual(b.effects[0].id, a.effects[0].id);
  b.effects[0].p.amount = 8; assert.equal(a.effects[0].p.amount, 5);
});

test('text formatting preserves words and position, image targets keep their asset', () => {
  const { App, add } = harness();
  const a = add({ type: 'text', text: 'SOURCE', fontSize: 100, fontFamily: 'serif', fill: '#ee0077' });
  const b = add({ type: 'text', text: 'TARGET', fontSize: 40, x: 500 }); const image = add({ type: 'image', assetId: 'A_keep', x: 600 });
  App.applyFormat(App.captureFormat(a), [b.id, image.id]);
  assert.equal(b.text, 'TARGET'); near(b.x, 500); near(b.fontSize, 100); near(b.w, 360);
  assert.equal(image.assetId, 'A_keep'); assert.equal(image.fill, undefined); near(image.w, 100);
});

test('continuous and single-use painter; locked targets are unchanged', () => {
  const { App, state, add } = harness(); const a = add({ fill: '#aabbcc' }); const b = add({ x: 400 }); const c = add({ x: 600, locked: true });
  App.select(a.id); App.setTool('format'); App.paintFormatAt(b); assert.equal(state.tool, 'select'); assert.equal(b.fill, a.fill);
  App.setTool('format'); state.formatPainter.continuous = true; App.paintFormatAt(b); assert.equal(state.tool, 'format');
  const fill = c.fill; App.paintFormatAt(c); assert.equal(c.fill, fill);
});

test('move snaps to canvas center / edge and object center / edge at every zoom', () => {
  const { App, state, add } = harness(); add({ x: 700, y: 500 });
  for (const zoom of [0.2, 1, 4]) {
    state.view.zoom = zoom; const targets = App.snapTargets(new Set());
    for (const value of [0, 500, 1000, 650, 700, 750]) {
      const box = { minX: value + 4 / zoom, maxX: value + 4 / zoom, minY: 100, maxY: 120 };
      const snap = App.snapBox(box, targets); near(snap.dx, -4 / zoom); assert.ok(snap.guides.some((g) => g.axis === 'x'));
    }
    assert.equal(App.nearestSnap([9999], targets.xs), null);
  }
});

test('single and multi resize handlers support Shift, Alt, snap and undo as one step', () => {
  const { App, state, add, drag } = harness(); const a = add(); const b = add({ x: 400 });
  App.select([a.id, b.id]); state.opts.snap = false;
  drag([450, 240], [600, 280], { shiftKey: true }); near(a.w, 150); near(b.x - a.x, 300); assert.equal(state.history.length, 1);
  App.undo(); App.select([a.id, b.id]);
  drag([450, 240], [525, 260], { altKey: true }); near((App.selectedLayers()[0].x + App.selectedLayers()[1].x) / 2, 300);
  App.undo(); App.select(a.id); state.opts.snap = true;
  drag([250, 200], [497, 200]); near(App.layerById(a.id).x + App.layerById(a.id).w / 2, 500);
});

test('dragging with Ctrl bypasses snap and Shift-constrained moves do not drift', () => {
  const { App, add, drag, event } = harness(); const a = add({ x: 200, y: 198 }); App.select(a.id);
  drag([250, 198], [497, 198], { ctrlKey: true }); near(a.x + a.w / 2, 497);
  const x = a.x; const y = a.y;
  event('pointerdown', x, y); event('pointermove', x + 20, y + 1, { shiftKey: true }); event('pointerup', x + 20, y + 1);
  near(a.y, y); near(a.x, x + 20);
});

test('multi resize snaps a real boundary; individual mode keeps centers while snapping', () => {
  const { App, state, add, drag } = harness(); const a = add(); const b = add({ x: 400 });
  App.select([a.id, b.id]); drag([450, 200], [497, 200]);
  near(App.unionAABB(App.selectedLayers().map(App.layerAABB)).maxX, 500);
  App.undo(); App.select([a.id, b.id]); state.opts.multiResize = 'individual';
  drag([450, 200], [497, 200]);
  near(App.layerById(a.id).x, 200); near(App.layerById(b.id).x, 400);
  near(App.unionAABB(App.selectedLayers().map(App.layerAABB)).maxX, 500);
});

test('Alt-drag duplicates a whole group without linking it to the source', () => {
  const { App, state, add, drag } = harness(); const a = add(); const b = add({ x: 400 });
  App.select([a.id, b.id]); App.groupSelection(); const group = App.selectedGroup();
  drag([200, 200], [220, 230], { altKey: true });
  assert.equal(state.doc.layers.length, 4); assert.notEqual(App.selectedGroup(), group);
  assert.deepEqual(plain(state.doc.layers.slice(0, 2).map((l) => l.id)), [a.id, b.id]);
  near(App.selectedLayers()[0].x, 220); App.undo(); assert.equal(state.doc.layers.length, 2);
});

test('.chaos file round trip retains nested group identities and transforms', async () => {
  const { CC, App, M, state, add } = harness(); const a = add(); const b = add({ x: 400 }); const c = add({ x: 600 });
  App.select([a.id, b.id]); App.groupSelection(); App.select(c.id, { additive: true }); App.groupSelection(); App.scaleSelectionBy(125);
  const file = await CC.storage.buildProjectFile(state.doc, [], []);
  const restored = await CC.storage.parseProjectFile(await file.text());
  state.doc = M.normalizeDoc(restored.doc); App.select(a.id);
  assert.equal(state.selection.length, 3); assert.equal(App.layerById(a.id).groupPath.length, 2); near(App.layerById(a.id).w, 125);
});

test('pointer cancellation restores the whole resize and creates no history step', () => {
  const { App, state, add, event } = harness(); const a = add(); const b = add({ x: 400 }); App.select([a.id, b.id]);
  const before = App.snapshot(); event('pointerdown', 450, 240); event('pointermove', 590, 300); event('pointercancel', 590, 300);
  assert.equal(App.snapshot(), before); assert.equal(state.history.length, 0); assert.equal(state.guides.length, 0);
});

test('minimum-size clamping preserves uniform scale for extremely thin objects', () => {
  const { App, add } = harness(); const a = add({ w: 1000, h: 2 }); const b = add({ x: 600 }); App.select([a.id, b.id]);
  App.scaleSelectionBy(1); near(a.w / a.h, 500); near(b.w / b.h, 1.25);
});

test('rotating a group changes member positions and angles as one undoable step', () => {
  const { App, state, add, drag } = harness(); const a = add(); const b = add({ x: 400 }); App.select([a.id, b.id]); App.groupSelection();
  const count = state.history.length; drag([300, 134], [366, 200], { shiftKey: true });
  near(a.rotation, 90); near(a.x, 300); near(b.x, 300); near(b.y - a.y, 200); assert.equal(state.history.length, count + 1);
});
