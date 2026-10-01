/* CHAOS.COLLAGE — non-destructive warping (CC.warp)
   A layer warp is { quad, mesh } in the layer's normalized box space [0,1]²:
   - quad: 4 corner pins (perspective / distort / skew) → projective map
   - mesh: 4×4 bicubic Bézier control net (bend / bulge) applied before quad
   Rendering subdivides the raster into triangles drawn with affine maps. */
(() => {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const { clamp, lerp, makeCanvas } = CC.util;

  function identityQuad() {
    return [[0, 0], [1, 0], [1, 1], [0, 1]];
  }

  function identityMesh() {
    const points = [];
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) points.push([col / 3, row / 3]);
    }
    return points;
  }

  function nearlyEqual(a, b) {
    return Math.abs(a - b) < 1e-6;
  }

  function quadIsIdentity(quad) {
    if (!Array.isArray(quad) || quad.length !== 4) return true;
    return identityQuad().every((point, i) => nearlyEqual(point[0], quad[i][0]) && nearlyEqual(point[1], quad[i][1]));
  }

  function meshIsIdentity(mesh) {
    if (!Array.isArray(mesh) || mesh.length !== 16) return true;
    return identityMesh().every((point, i) => nearlyEqual(point[0], mesh[i][0]) && nearlyEqual(point[1], mesh[i][1]));
  }

  function isActive(warp) {
    if (!warp) return false;
    return !quadIsIdentity(warp.quad) || !meshIsIdentity(warp.mesh);
  }

  /* unit square → quad projective map (Heckbert) */
  function quadHomography(quad) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
    const dx1 = x1 - x2;
    const dx2 = x3 - x2;
    const dx3 = x0 - x1 + x2 - x3;
    const dy1 = y1 - y2;
    const dy2 = y3 - y2;
    const dy3 = y0 - y1 + y2 - y3;
    let g = 0;
    let h = 0;
    if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
      const det = dx1 * dy2 - dx2 * dy1 || 1e-9;
      g = (dx3 * dy2 - dx2 * dy3) / det;
      h = (dx1 * dy3 - dx3 * dy1) / det;
    }
    return [
      x1 - x0 + g * x1, x3 - x0 + h * x3, x0,
      y1 - y0 + g * y1, y3 - y0 + h * y3, y0,
      g, h, 1,
    ];
  }

  function applyH(H, u, v) {
    let w = H[6] * u + H[7] * v + H[8];
    if (w < 0.04) w = 0.04;
    return [(H[0] * u + H[1] * v + H[2]) / w, (H[3] * u + H[4] * v + H[5]) / w];
  }

  function invertH(H) {
    const [a, b, c, d, e, f, g, h, i] = H;
    const A = e * i - f * h;
    const B = -(d * i - f * g);
    const C = d * h - e * g;
    const det = a * A + b * B + c * C || 1e-12;
    return [
      A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
      B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
      C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
    ];
  }

  function bernstein(t) {
    const s = 1 - t;
    return [s * s * s, 3 * t * s * s, 3 * t * t * s, t * t * t];
  }

  function meshEval(mesh, u, v) {
    const bu = bernstein(u);
    const bv = bernstein(v);
    let x = 0;
    let y = 0;
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const weight = bv[row] * bu[col];
        const point = mesh[row * 4 + col];
        x += point[0] * weight;
        y += point[1] * weight;
      }
    }
    return [x, y];
  }

  /* compile a warp into a fast (u, v) → normalized point mapper */
  function compile(warp) {
    const useMesh = warp && !meshIsIdentity(warp.mesh);
    const useQuad = warp && !quadIsIdentity(warp.quad);
    const H = useQuad ? quadHomography(warp.quad) : null;
    const mesh = useMesh ? warp.mesh : null;
    return (u, v) => {
      let point = mesh ? meshEval(mesh, u, v) : [u, v];
      if (H) point = applyH(H, point[0], point[1]);
      return point;
    };
  }

  /* boundary of the warped unit square, for hit testing and selection outlines */
  function outline(warp, steps = 10) {
    const map = compile(warp);
    const points = [];
    const edge = (u0, v0, u1, v1) => {
      for (let i = 0; i < steps; i += 1) {
        const t = i / steps;
        points.push(map(lerp(u0, u1, t), lerp(v0, v1, t)));
      }
    };
    edge(0, 0, 1, 0);
    edge(1, 0, 1, 1);
    edge(1, 1, 0, 1);
    edge(0, 1, 0, 0);
    return points;
  }

  function pointInPolygon(points, x, y) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
    }
    return inside;
  }

  /* Software rasterizer: every output pixel inside a grid triangle samples the
     source through that triangle's affine map with premultiplied bilinear
     filtering. Pixels are assigned (not blended), so shared edges never show
     seams and semi-transparent content keeps its exact alpha. */
  function rasterizeGrid(source, src, dst, n, count, ox, oy, width, height) {
    const sw = source.width;
    const sh = source.height;
    const sdata = source.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
    const output = new ImageData(width, height);
    const out = output.data;
    const sample = (sx, sy, index) => {
      const x = sx - 0.5;
      const y = sy - 0.5;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < 4; k += 1) {
        const px = x0 + (k & 1);
        const py = y0 + (k >> 1);
        if (px < 0 || py < 0 || px >= sw || py >= sh) continue;
        const weight = ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy);
        if (weight <= 0) continue;
        const i = (py * sw + px) * 4;
        const alpha = sdata[i + 3] * weight;
        r += sdata[i] * alpha;
        g += sdata[i + 1] * alpha;
        b += sdata[i + 2] * alpha;
        a += alpha;
      }
      if (a <= 0.001) return;
      out[index] = r / a;
      out[index + 1] = g / a;
      out[index + 2] = b / a;
      out[index + 3] = a;
    };
    const triangle = (s0, s1, s2, d0, d1, d2) => {
      const x0 = d0[0] - ox;
      const y0 = d0[1] - oy;
      const x1 = d1[0] - ox;
      const y1 = d1[1] - oy;
      const x2 = d2[0] - ox;
      const y2 = d2[1] - oy;
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-6) return;
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)));
      const inv = 1 / area;
      const eps = -1e-4;
      for (let py = minY; py <= maxY; py += 1) {
        const cy = py + 0.5;
        for (let px = minX; px <= maxX; px += 1) {
          const cx = px + 0.5;
          const l1 = ((cx - x0) * (y2 - y0) - (x2 - x0) * (cy - y0)) * inv;
          const l2 = ((x1 - x0) * (cy - y0) - (cx - x0) * (y1 - y0)) * inv;
          const l0 = 1 - l1 - l2;
          if (l0 < eps || l1 < eps || l2 < eps) continue;
          sample(s0[0] * l0 + s1[0] * l1 + s2[0] * l2, s0[1] * l0 + s1[1] * l1 + s2[1] * l2, (py * width + px) * 4);
        }
      }
    };
    for (let row = 0; row < n; row += 1) {
      for (let col = 0; col < n; col += 1) {
        const i00 = row * count + col;
        const i10 = i00 + 1;
        const i01 = i00 + count;
        const i11 = i01 + 1;
        triangle(src[i00], src[i10], src[i11], dst[i00], dst[i10], dst[i11]);
        triangle(src[i00], src[i11], src[i01], dst[i00], dst[i11], dst[i01]);
      }
    }
    return output;
  }

  /* Warp a raster whose normalized box occupies box = {x, y, w, h} (source px).
     Returns { canvas, ox, oy }: output top-left relative to the box center (px). */
  function render(source, warp, box, steps = 0) {
    const map = compile(warp);
    const n = steps || (warp && !meshIsIdentity(warp.mesh) ? 22 : 14);
    const u0 = -box.x / box.w;
    const u1 = (source.width - box.x) / box.w;
    const v0 = -box.y / box.h;
    const v1 = (source.height - box.y) / box.h;
    const count = n + 1;
    const src = new Array(count * count);
    const dst = new Array(count * count);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        const u = lerp(u0, u1, col / n);
        const v = lerp(v0, v1, row / n);
        const [mx, my] = map(u, v);
        const px = (mx - 0.5) * box.w;
        const py = (my - 0.5) * box.h;
        const index = row * count + col;
        src[index] = [box.x + u * box.w, box.y + v * box.h];
        dst[index] = [px, py];
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
    }
    /* guard against runaway perspective (points near the horizon) */
    const limit = Math.max(box.w, box.h) * 6;
    minX = Math.max(minX, -limit);
    minY = Math.max(minY, -limit);
    maxX = Math.min(maxX, limit);
    maxY = Math.min(maxY, limit);
    const ox = Math.floor(minX) - 2;
    const oy = Math.floor(minY) - 2;
    const width = Math.max(1, Math.min(8192, Math.ceil(maxX) - ox + 2));
    const height = Math.max(1, Math.min(8192, Math.ceil(maxY) - oy + 2));
    const canvas = makeCanvas(width, height);
    canvas.getContext('2d').putImageData(rasterizeGrid(source, src, dst, n, count, ox, oy, width, height), 0, 0);
    return { canvas, ox, oy };
  }

  /* map a local layer point (px, centered box) back to normalized quad/mesh space */
  function inverseQuad(quad, x, y) {
    const H = invertH(quadHomography(quad));
    return applyH(H, x, y);
  }

  /* presets for the transform tool */
  function presetQuad(kind, amount = 0.25) {
    const a = clamp(amount, -0.45, 0.45);
    switch (kind) {
      case 'perspective-left':
        return [[0, a], [1, 0], [1, 1], [0, 1 - a]];
      case 'perspective-right':
        return [[0, 0], [1, a], [1, 1 - a], [0, 1]];
      case 'perspective-top':
        return [[a, 0], [1 - a, 0], [1, 1], [0, 1]];
      case 'perspective-bottom':
        return [[0, 0], [1, 0], [1 - a, 1], [a, 1]];
      case 'skew-x':
        return [[a, 0], [1 + a, 0], [1 - a, 1], [-a, 1]];
      case 'skew-y':
        return [[0, a], [1, -a], [1, 1 - a], [0, 1 + a]];
      default:
        return identityQuad();
    }
  }

  function presetMesh(kind, amount = 0.3) {
    const mesh = identityMesh();
    const a = clamp(amount, -1, 1);
    mesh.forEach((point, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const cx = col / 3 - 0.5;
      const cy = row / 3 - 0.5;
      switch (kind) {
        case 'arc':
          point[1] += a * 0.5 * (1 - (cx * 2) ** 2) * -1;
          break;
        case 'arch':
          point[1] += a * 0.35 * (1 - (cx * 2) ** 2) * (row === 0 ? -1 : -0.3);
          break;
        case 'bulge':
          point[0] += cx * a * 0.5 * (1 - Math.abs(cy * 2));
          point[1] += cy * a * 0.5 * (1 - Math.abs(cx * 2));
          break;
        case 'pinch':
          point[0] -= cx * a * 0.45 * (1 - Math.abs(cy * 2));
          point[1] -= cy * a * 0.45 * (1 - Math.abs(cx * 2));
          break;
        case 'wave':
          point[1] += Math.sin(col / 3 * Math.PI * 2) * a * 0.18;
          break;
        case 'flag':
          point[1] += Math.sin(col / 3 * Math.PI * 1.5) * a * 0.16 * (col / 3);
          break;
        case 'twist':
          point[0] += cy * a * 0.5;
          point[1] -= cx * a * 0.5;
          break;
        case 'rise':
          point[1] -= a * 0.4 * (col / 3) * (1 - row / 3 * 0.4);
          break;
        default:
          break;
      }
    });
    return mesh;
  }

  CC.warp = {
    identityQuad,
    identityMesh,
    quadIsIdentity,
    meshIsIdentity,
    isActive,
    quadHomography,
    applyH,
    invertH,
    meshEval,
    compile,
    outline,
    pointInPolygon,
    render,
    inverseQuad,
    presetQuad,
    presetMesh,
  };
})();
