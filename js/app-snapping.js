/* CHAOS.COLLAGE — screen-distance snapping for moves and constrained resizes. */
(() => {
  'use strict';
  const { App } = window.CC;
  const { state } = App;

  function snapTargets(excludeIds) {
    const doc = state.doc;
    const targets = { xs: [], ys: [] };
    const add = (box, name, canvas = false) => {
      ['x', 'y'].forEach((axis) => {
        const lo = axis === 'x' ? 'minX' : 'minY';
        const hi = axis === 'x' ? 'maxX' : 'maxY';
        const from = axis === 'x' ? box.minY : box.minX;
        const to = axis === 'x' ? box.maxY : box.maxX;
        const labels = axis === 'x' ? ['左边缘', '水平居中', '右边缘'] : ['上边缘', '垂直居中', '下边缘'];
        [box[lo], (box[lo] + box[hi]) / 2, box[hi]].forEach((pos, i) => {
          targets[`${axis}s`].push({ pos, from, to, label: `${name} · ${labels[i]}`, center: i === 1, canvas });
        });
      });
    };
    add({ minX: 0, minY: 0, maxX: doc.width, maxY: doc.height }, '画布', true);
    App.selectionUnits(doc.layers.filter((l) => l.visible && !excludeIds.has(l.id))).forEach((layers) => {
      add(App.unionAABB(layers.map(App.layerAABB)), layers.length > 1 ? '组合' : layers[0].name);
    });
    return targets;
  }

  function nearestSnap(values, targets) {
    const threshold = 7 / state.view.zoom;
    let best = null;
    values.forEach((value) => targets.forEach((target) => {
      const delta = target.pos - value;
      const distance = Math.abs(delta);
      if (distance > threshold) return;
      if (!best || distance < best.distance - 1e-6 || (Math.abs(distance - best.distance) < 1e-6 && target.center && !best.target.center)) {
        best = { delta, distance, target };
      }
    }));
    return best;
  }

  function snapGuide(axis, hit, box) {
    return { axis, ...hit.target,
      from: Math.min(hit.target.from, axis === 'x' ? box.minY : box.minX),
      to: Math.max(hit.target.to, axis === 'x' ? box.maxY : box.maxX) };
  }

  function snapBox(box, targets, axes = { x: true, y: true }) {
    const x = axes.x ? nearestSnap([box.minX, (box.minX + box.maxX) / 2, box.maxX], targets.xs) : null;
    const y = axes.y ? nearestSnap([box.minY, (box.minY + box.maxY) / 2, box.maxY], targets.ys) : null;
    return { dx: x?.delta || 0, dy: y?.delta || 0,
      guides: [x && snapGuide('x', x, box), y && snapGuide('y', y, box)].filter(Boolean) };
  }

  // compute(point) returns the actual dragged handle after Shift / Alt constraints.
  // Project onto feasible handle motion, so a guide always describes a real snap.
  function snapResize(point, targets, compute) {
    const base = compute(point);
    const px = compute({ x: point.x + 0.01, y: point.y });
    const py = compute({ x: point.x, y: point.y + 0.01 });
    const gx = [(px.handle.x - base.handle.x) / 0.01, (py.handle.x - base.handle.x) / 0.01];
    const gy = [(px.handle.y - base.handle.y) / 0.01, (py.handle.y - base.handle.y) / 0.01];
    const nx = gx[0] ** 2 + gx[1] ** 2;
    const ny = gy[0] ** 2 + gy[1] ** 2;
    const x = nx > 1e-8 ? nearestSnap([base.handle.x], targets.xs) : null;
    const y = ny > 1e-8 ? nearestSnap([base.handle.y], targets.ys) : null;
    const proposals = [];
    if (x) proposals.push({ x: point.x + gx[0] * x.delta / nx, y: point.y + gx[1] * x.delta / nx });
    if (y) proposals.push({ x: point.x + gy[0] * y.delta / ny, y: point.y + gy[1] * y.delta / ny });
    const det = gx[0] * gy[1] - gx[1] * gy[0];
    if (x && y && Math.abs(det) > 1e-8) proposals.push({
      x: point.x + (x.delta * gy[1] - y.delta * gx[1]) / det,
      y: point.y + (y.delta * gx[0] - x.delta * gy[0]) / det,
    });
    let result = { geometry: base, guides: [], distance: Infinity };
    proposals.forEach((p) => {
      const geometry = compute(p);
      const guides = [];
      if (x && Math.abs(geometry.handle.x - x.target.pos) < 0.01) guides.push(snapGuide('x', x, geometry.box));
      if (y && Math.abs(geometry.handle.y - y.target.pos) < 0.01) guides.push(snapGuide('y', y, geometry.box));
      const distance = Math.hypot(geometry.handle.x - base.handle.x, geometry.handle.y - base.handle.y);
      if (distance > 14 / state.view.zoom) return;
      if (guides.length > result.guides.length || (guides.length === result.guides.length && distance < result.distance)) result = { geometry, guides, distance };
    });
    return result;
  }

  // In individual mode, the space between centers stays fixed. Invert the
  // resulting outer handle motion so the visible handle follows the pointer.
  function matchResizeHandle(point, compute, axes, constrainedAxis = null) {
    let p = { ...point };
    let geometry = compute(p);
    for (let i = 0; i < 4; i += 1) {
      const dx = axes.x ? point.x - geometry.handle.x : 0;
      const dy = axes.y ? point.y - geometry.handle.y : 0;
      if (Math.hypot(dx, dy) < 0.001) break;
      const px = compute({ x: p.x + 0.1, y: p.y });
      const py = compute({ x: p.x, y: p.y + 0.1 });
      const a = (px.handle.x - geometry.handle.x) / 0.1;
      const b = (py.handle.x - geometry.handle.x) / 0.1;
      const c = (px.handle.y - geometry.handle.y) / 0.1;
      const d = (py.handle.y - geometry.handle.y) / 0.1;
      const det = a * d - b * c;
      if (axes.x && axes.y && !constrainedAxis && Math.abs(det) > 1e-8) {
        p.x += (dx * d - dy * b) / det; p.y += (dy * a - dx * c) / det;
      } else {
        const useX = constrainedAxis ? constrainedAxis === 'x' : axes.x;
        const gx = useX ? a : c; const gy = useX ? b : d;
        const norm = gx * gx + gy * gy;
        if (norm < 1e-8) break;
        const delta = useX ? dx : dy;
        p.x += gx * delta / norm; p.y += gy * delta / norm;
      }
      geometry = compute(p);
    }
    return geometry;
  }

  Object.assign(App, { snapTargets, nearestSnap, snapBox, snapResize, matchResizeHandle });
})();
