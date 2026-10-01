/* CHAOS.COLLAGE — 3D shatter layer (CC.shatter)
   icosphere explosion / spiky solid, perspective projection, painter's
   algorithm and flat Y2K shading in pure Canvas. Seeded and deterministic. */
(() => {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const { clamp, lerp, mulberry32, hashString, hexToRgb, mixRgb } = CC.util;

  function defaults() {
    return {
      mode: 'burst',
      density: 3,
      explode: 100,
      tumble: 45,
      twist: 30,
      scatter: 40,
      gloss: 70,
      accentRatio: 16,
      spikes: 45,
      jagged: 55,
      spikeCount: 35,
      spikeLen: 60,
      bands: 4,
      body: '#0d0d10',
      highlight: '#f4f1e7',
      accent: '#e62e1b',
      wireframe: true,
      wireColor: '#f4f1e7',
    };
  }

  function normalize3(v) {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  function cross3(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  function rotateAroundAxis(rel, axis, angle) {
    if (!angle) return rel;
    const [x, y, z] = rel;
    const [ax, ay, az] = axis;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dot = x * ax + y * ay + z * az;
    return [
      x * cos + (ay * z - az * y) * sin + ax * dot * (1 - cos),
      y * cos + (az * x - ax * z) * sin + ay * dot * (1 - cos),
      z * cos + (ax * y - ay * x) * sin + az * dot * (1 - cos),
    ];
  }

  function rotateTilt(p, tiltX, tiltY) {
    const cx = Math.cos(tiltX);
    const sx = Math.sin(tiltX);
    const cy = Math.cos(tiltY);
    const sy = Math.sin(tiltY);
    const y1 = p[1] * cx - p[2] * sx;
    const z1 = p[1] * sx + p[2] * cx;
    return [p[0] * cy + z1 * sy, y1, -p[0] * sy + z1 * cy];
  }

  function buildIcosphere(subdivisions) {
    const t = (1 + Math.sqrt(5)) / 2;
    const vertices = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map((v) => normalize3(v));
    let faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    for (let s = 0; s < subdivisions; s += 1) {
      const midCache = new Map();
      const midpoint = (a, b) => {
        const key = a < b ? a * 4096 + b : b * 4096 + a;
        let index = midCache.get(key);
        if (index !== undefined) return index;
        vertices.push(normalize3([
          (vertices[a][0] + vertices[b][0]) / 2,
          (vertices[a][1] + vertices[b][1]) / 2,
          (vertices[a][2] + vertices[b][2]) / 2,
        ]));
        index = vertices.length - 1;
        midCache.set(key, index);
        return index;
      };
      const next = [];
      faces.forEach(([a, b, c]) => {
        const ab = midpoint(a, b);
        const bc = midpoint(b, c);
        const ca = midpoint(c, a);
        next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      });
      faces = next;
    }
    return { vertices, faces };
  }

  const geomCache = new Map();

  function buildGeometry(layerId, params, seed) {
    const key = [
      layerId, seed, params.mode, params.density, params.explode,
      params.tumble, params.twist, params.scatter, params.spikes,
      params.jagged, params.spikeCount, params.spikeLen,
    ].join('|');
    const cached = geomCache.get(key);
    if (cached) return cached;

    const subdivisions = clamp(Math.round(params.density), 1, 4) - 1;
    const { vertices, faces } = buildIcosphere(subdivisions);
    const random = mulberry32((seed ^ hashString(layerId) ^ 0x53485452) >>> 0);
    const explode = clamp(params.explode / 100, 0, 2);
    const tiltX = lerp(-0.3, 0.42, random());
    const tiltY = lerp(-0.55, 0.55, random());

    const items = [];
    let maxR = 1;

    const faceNormal = (pts) => normalize3(cross3(
      [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]],
      [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]],
    ));
    const pushFace = (pts, roll, refDir = null) => {
      const tilted = pts.map((p) => rotateTilt(p, tiltX, tiltY));
      tilted.forEach(([x, y, z]) => {
        maxR = Math.max(maxR, Math.hypot(x, y, z));
      });
      let normal = faceNormal(tilted);
      if (refDir && normal[0] * refDir[0] + normal[1] * refDir[1] + normal[2] * refDir[2] < 0) {
        normal = [-normal[0], -normal[1], -normal[2]];
      }
      items.push({ kind: 'face', pts: tilted, normal, z: (tilted[0][2] + tilted[1][2] + tilted[2][2]) / 3, roll });
    };

    if (params.mode === 'spike') {
      /* spiky solid: shared-vertex displacement keeps the mesh joined, random faces extrude into long spikes */
      const jag = clamp(params.jagged / 100, 0, 1) * 0.85;
      const displaced = vertices.map((v) => {
        const r = 1 + (random() * 2 - 1) * jag;
        return [v[0] * r, v[1] * r, v[2] * r];
      });
      const spikeProb = clamp(params.spikeCount / 100, 0, 1) * 0.55;
      const spikeLenMax = lerp(0.3, 1.6, clamp(params.spikeLen / 100, 0, 1));
      faces.forEach((face) => {
        const tri = face.map((index) => displaced[index]);
        const roll = random();
        const centroid = [
          (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
          (tri[0][1] + tri[1][1] + tri[2][1]) / 3,
          (tri[0][2] + tri[1][2] + tri[2][2]) / 3,
        ];
        if (random() < spikeProb) {
          const n = faceNormal(tri);
          const len = spikeLenMax * (0.35 + random() * 0.9);
          const apex = [centroid[0] + n[0] * len, centroid[1] + n[1] * len, centroid[2] + n[2] * len];
          pushFace([tri[0], tri[1], apex], roll, centroid);
          pushFace([tri[1], tri[2], apex], roll, centroid);
          pushFace([tri[2], tri[0], apex], roll, centroid);
        } else {
          pushFace(tri, roll, centroid);
        }
      });
    } else {
      const tumble = clamp(params.tumble / 100, 0, 1);
      const twist = clamp(params.twist / 100, 0, 1);
      const scatter = clamp(params.scatter / 100, 0, 1);
      faces.forEach((face) => {
        const tri = face.map((index) => vertices[index]);
        const centroid = [
          (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
          (tri[0][1] + tri[1][1] + tri[2][1]) / 3,
          (tri[0][2] + tri[1][2] + tri[2][2]) / 3,
        ];
        let normal = faceNormal(tri);
        if (normal[0] * centroid[0] + normal[1] * centroid[1] + normal[2] * centroid[2] < 0) {
          normal = [-normal[0], -normal[1], -normal[2]];
        }
        const push = explode * (0.12 + Math.pow(random(), 1.7) * 1.2);
        const drift = scatter * 0.42;
        const offset = [
          normal[0] * push + (random() * 2 - 1) * drift,
          normal[1] * push + (random() * 2 - 1) * drift,
          normal[2] * push + (random() * 2 - 1) * drift,
        ];
        const spin = (random() * 2 - 1) * tumble * Math.PI;
        const flipAxis = normalize3([random() * 2 - 1, random() * 2 - 1, random() * 2 - 1]);
        const flip = (random() * 2 - 1) * tumble * 1.25;
        const faceScale = lerp(0.55, 1.2, Math.pow(random(), 0.8));
        let pts = tri.map((v) => {
          let rel = [v[0] - centroid[0], v[1] - centroid[1], v[2] - centroid[2]];
          rel = rotateAroundAxis(rel, normal, spin);
          rel = rotateAroundAxis(rel, flipAxis, flip);
          return [
            centroid[0] + offset[0] + rel[0] * faceScale,
            centroid[1] + offset[1] + rel[1] * faceScale,
            centroid[2] + offset[2] + rel[2] * faceScale,
          ];
        });
        if (twist > 0) {
          const spiral = twist * push * 1.5;
          const cos = Math.cos(spiral);
          const sin = Math.sin(spiral);
          pts = pts.map(([x, y, z]) => [x * cos + z * sin, y, -x * sin + z * cos]);
        }
        pushFace(pts, random());
      });
    }

    const radialDrive = params.mode === 'spike' ? 0.55 : explode;
    const spikeCount = Math.round(clamp(params.spikes, 0, 100) * 0.9);
    for (let i = 0; i < spikeCount; i += 1) {
      const angle = random() * Math.PI * 2;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const r0 = 0.05 + random() * (0.16 + radialDrive * 0.12);
      const length = lerp(0.22, 1.05, Math.pow(random(), 0.62)) * (1 + radialDrive * 0.3);
      const halfWidth = length * lerp(0.006, 0.03, random());
      const zPlane = (random() * 2 - 1) * (0.5 + radialDrive * 0.35);
      const perpX = -dirY;
      const perpY = dirX;
      let pts = [
        [dirX * r0 + perpX * halfWidth, dirY * r0 + perpY * halfWidth, zPlane],
        [dirX * r0 - perpX * halfWidth, dirY * r0 - perpY * halfWidth, zPlane],
        [dirX * (r0 + length), dirY * (r0 + length), zPlane + (random() * 2 - 1) * 0.25],
      ];
      pts = pts.map((p) => rotateTilt(p, tiltX, tiltY));
      items.push({ kind: 'spike', pts, z: (pts[0][2] + pts[1][2] + pts[2][2]) / 3, roll: random(), tint: random() });
    }

    const geometry = { items, maxR };
    geomCache.set(key, geometry);
    if (geomCache.size > 24) geomCache.delete(geomCache.keys().next().value);
    return geometry;
  }

  function render(output, layerId, params, qualityScale, seed) {
    const width = output.width;
    const height = output.height;
    const octx = output.getContext('2d');
    const geometry = buildGeometry(layerId, params, seed);
    const items = geometry.items;
    const explode = clamp(params.explode / 100, 0, 2);
    const spikeMode = params.mode === 'spike';
    const camDist = spikeMode ? 3.4 : 2.7 + explode * 1.1;
    const scale = spikeMode
      ? (Math.min(width, height) / 2) * (0.92 / Math.max(geometry.maxR, 0.5))
      : (Math.min(width, height) / 2) * (0.8 / (1 + explode * 1.25));
    const cx = width / 2;
    const cy = height / 2;
    const light = normalize3([-0.42, -0.62, 0.85]);
    const gloss = clamp(params.gloss / 100, 0, 1);
    const shadePow = lerp(0.9, 3.4, gloss);
    const accentChance = clamp(params.accentRatio / 100, 0, 1);
    const body = hexToRgb(params.body);
    const highlight = hexToRgb(params.highlight);
    const accent = hexToRgb(params.accent);
    const lineWidth = Math.max(0.5, 0.7 * qualityScale);
    const project = ([x, y, z]) => {
      const persp = camDist / Math.max(camDist - z, 0.55);
      return [cx + x * scale * persp, cy - y * scale * persp];
    };
    const sorted = [...items].sort((a, b) => a.z - b.z);
    sorted.forEach((item) => {
      const a = project(item.pts[0]);
      const b = project(item.pts[1]);
      const c = project(item.pts[2]);
      octx.beginPath();
      octx.moveTo(a[0], a[1]);
      octx.lineTo(b[0], b[1]);
      octx.lineTo(c[0], c[1]);
      octx.closePath();
      let fill;
      if (item.roll < accentChance) {
        const dim = item.kind === 'face'
          ? 0.7 + clamp((item.normal[0] * light[0] + item.normal[1] * light[1] + item.normal[2] * light[2]) * 0.5 + 0.5, 0, 1) * 0.42
          : 0.92;
        fill = `rgb(${Math.round(accent.r * dim)},${Math.round(accent.g * dim)},${Math.round(accent.b * dim)})`;
      } else if (item.kind === 'spike') {
        fill = item.tint < 0.62 ? mixRgb(body, highlight, 0.85) : mixRgb(body, highlight, 0.4);
      } else {
        const ndl = item.normal[0] * light[0] + item.normal[1] * light[1] + item.normal[2] * light[2];
        const bands = spikeMode ? Math.round(clamp(params.bands, 0, 8)) : 0;
        if (bands >= 2) {
          /* Y2K hard-edged banded lighting + thresholded highlight */
          const banded = Math.floor(clamp(ndl, 0, 1) * bands + 0.0001) / bands;
          const reflectZ = 2 * ndl * item.normal[2] - light[2];
          const specRaw = Math.pow(clamp(reflectZ, 0, 1), lerp(6, 34, gloss));
          const t = specRaw > 0.3 ? 1 : Math.pow(banded, 1.35) * 0.95;
          fill = mixRgb(body, highlight, clamp(t, 0, 1));
        } else {
          const diffuse = clamp(ndl, 0, 1);
          const reflectZ = 2 * ndl * item.normal[2] - light[2];
          const spec = Math.pow(clamp(reflectZ, 0, 1), lerp(4, 30, gloss)) * 1.6;
          fill = mixRgb(body, highlight, clamp(Math.pow(diffuse, shadePow) * 0.9 + spec, 0, 1));
        }
      }
      octx.fillStyle = fill;
      octx.fill();
      if (params.wireframe) {
        octx.strokeStyle = params.wireColor;
        octx.globalAlpha = item.kind === 'spike' ? 0.16 : 0.3;
        octx.lineWidth = lineWidth;
        octx.stroke();
        octx.globalAlpha = 1;
      }
    });
  }

  CC.shatter = { defaults, render };
})();
