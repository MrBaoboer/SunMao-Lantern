/**
 * 格心纹样（麻叶纹 · 冰裂纹 · 万字纹）—— 程序化生成真实镂空棂条
 *
 * 三种纹样都表述为一组「二维线段 + 线宽」，再挤出成厚 a/3 的棂条。
 * 用真几何而非 alpha 贴图，是因为 M1 点亮时「光被木格挡成一格一格」
 * 依赖真实遮挡关系；同时地面纹样光斑的投影贴图也由同一份线段数据烘出，
 * 保证「你选的纹样」在灯笼上、在地上、在海报上永远是同一个。
 *
 * 局部坐标：x = 宽度(u)，y = 厚度(w)，z = 高度(v)
 */

import * as THREE from 'three';
import { a, C, M, J4 } from '../core/modulus.js';

export const PATTERNS = [
  { id: 'mayo', name: '麻叶纹', sub: '明清窗棂常见 · 放射对称', meaning: '六出放射，寓意生生不息' },
  { id: 'wanzi', name: '万字纹', sub: '吉祥连续纹 · 回环无尽', meaning: '回环相连，谓「万福不断头」' },
];

const W = J4.PANEL_W;            // 96
const WS = J4.PANEL_W_SHOULDER;  // 84
const H = J4.PANEL_H;            // 125
const T = J4.PANEL_T;            // 4
const FRAME = a(1 / 3);          // 边框棂条宽 4
const RIB = a(1 / 4);            // 内部棂条宽 3

/** 确定性随机 —— 同一纹样每次生成结果一致 */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 板肩轮廓：返回给定高度 v（以板底为 0）处的半宽 */
function halfWidthAt(v) {
  if (v <= J4.SHOULDER_BOT) return WS / 2;
  if (v >= H - J4.SHOULDER_TOP) return WS / 2;
  return W / 2;
}

/** 边框（含板肩台阶）—— 线段列表 */
function frameSegments() {
  const segs = [];
  const vb = J4.SHOULDER_BOT;          // 6
  const vt = H - J4.SHOULDER_TOP;      // 116
  const hw = W / 2, hs = WS / 2;
  const k = FRAME / 2;
  // 左右竖边：分三段跟随板肩
  for (const s of [-1, 1]) {
    segs.push({ x0: s * (hs - k), y0: k, x1: s * (hs - k), y1: vb, w: FRAME });
    segs.push({ x0: s * (hw - k), y0: vb, x1: s * (hw - k), y1: vt, w: FRAME });
    segs.push({ x0: s * (hs - k), y0: vt, x1: s * (hs - k), y1: H - k, w: FRAME });
    // 板肩台阶横档
    segs.push({ x0: s * hs, y0: vb - k, x1: s * hw, y1: vb - k, w: FRAME });
    segs.push({ x0: s * hs, y0: vt + k, x1: s * hw, y1: vt + k, w: FRAME });
  }
  // 上下横边（沿板肩宽）
  segs.push({ x0: -hs, y0: k, x1: hs, y1: k, w: FRAME });
  segs.push({ x0: -hs, y0: H - k, x1: hs, y1: H - k, w: FRAME });
  return segs;
}

/** 内部可布纹样的矩形区域 */
const FIELD = { x0: -W / 2 + FRAME, x1: W / 2 - FRAME, y0: J4.SHOULDER_BOT + FRAME, y1: H - J4.SHOULDER_TOP - FRAME };

/**
 * Liang–Barsky 线段裁剪。
 * 必须真裁剪而不是「两端点都在区域内才保留」——后者会把大量跨界棂条整条丢掉，
 * 纹样会碎成一地断棍。
 */
function clipSeg(x0, y0, x1, y1, w = RIB) {
  const dx = x1 - x0, dy = y1 - y0;
  let t0 = 0, t1 = 1;
  const test = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  if (!test(-dx, x0 - FIELD.x0)) return null;
  if (!test(dx, FIELD.x1 - x0)) return null;
  if (!test(-dy, y0 - FIELD.y0)) return null;
  if (!test(dy, FIELD.y1 - y0)) return null;
  const a0 = { x: x0 + t0 * dx, y: y0 + t0 * dy };
  const a1 = { x: x0 + t1 * dx, y: y0 + t1 * dy };
  if (Math.hypot(a1.x - a0.x, a1.y - a0.y) < 1.2) return null;
  return { x0: a0.x, y0: a0.y, x1: a1.x, y1: a1.y, w };
}

/** 按端点去重，避免相邻单元共享的棂条被画两遍 */
function dedupe(segs) {
  const seen = new Set();
  const out = [];
  for (const s of segs) {
    if (!s) continue;
    const k = (v) => Math.round(v * 4) / 4;
    const p = `${k(s.x0)},${k(s.y0)}|${k(s.x1)},${k(s.y1)}`;
    const q = `${k(s.x1)},${k(s.y1)}|${k(s.x0)},${k(s.y0)}`;
    if (seen.has(p) || seen.has(q)) continue;
    seen.add(p);
    out.push(s);
  }
  return out;
}

// ── 万字纹：卍 字连续铺陈，四臂钩转落在单元角点上，故相邻单元自然接续 ──
//     「回环相连，没有起点也没有终点」= 万福不断头
function wanziSegments() {
  const raw = [];
  const cell = 26;
  const A = cell / 2;
  const cols = Math.ceil((FIELD.x1 - FIELD.x0) / cell) + 1;
  const rows = Math.ceil((FIELD.y1 - FIELD.y0) / cell) + 1;
  const ox = (FIELD.x0 + FIELD.x1) / 2 - ((cols - 1) * cell) / 2;
  const oy = (FIELD.y0 + FIELD.y1) / 2 - ((rows - 1) * cell) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = ox + c * cell, y = oy + r * cell;
      raw.push(
        clipSeg(x - A, y, x + A, y),        // 横贯
        clipSeg(x, y - A, x, y + A),        // 竖贯
        clipSeg(x + A, y, x + A, y + A),    // 四钩：顺时针转折
        clipSeg(x - A, y, x - A, y - A),
        clipSeg(x, y + A, x - A, y + A),
        clipSeg(x, y - A, x + A, y - A),
      );
    }
  }
  return dedupe(raw);
}

// ── 麻叶纹：六边形棂格 + 每格六出放射，相邻格共边 ──
//     「六出放射，像麻叶舒展，寓意生生不息」
function mayoSegments() {
  const raw = [];
  const R = 15;                              // 六边形外接圆半径
  const stepX = 1.5 * R, stepY = Math.sqrt(3) * R;
  const cols = Math.ceil((FIELD.x1 - FIELD.x0) / stepX) + 2;
  const rows = Math.ceil((FIELD.y1 - FIELD.y0) / stepY) + 2;
  const ox = (FIELD.x0 + FIELD.x1) / 2 - ((cols - 1) * stepX) / 2;
  const oy = (FIELD.y0 + FIELD.y1) / 2 - ((rows - 1) * stepY) / 2;
  const vert = (cx, cy, k) => [
    cx + R * Math.cos((k * Math.PI) / 3),
    cy + R * Math.sin((k * Math.PI) / 3),
  ];
  for (let r = -1; r < rows; r++) {
    for (let c = -1; c < cols; c++) {
      // 平顶六边形密铺：奇数列在 Y 上错开半格
      const cx = ox + c * stepX;
      const cy = oy + r * stepY + (c % 2 ? stepY / 2 : 0);
      for (let k = 0; k < 6; k++) {
        const v0 = vert(cx, cy, k), v1 = vert(cx, cy, k + 1);
        raw.push(clipSeg(v0[0], v0[1], v1[0], v1[1]));           // 六边形边
        raw.push(clipSeg(cx, cy, v0[0], v0[1], RIB * 0.82));     // 六出放射
      }
    }
  }
  return dedupe(raw);
}

const GENERATORS = { mayo: mayoSegments, wanzi: wanziSegments };

/** 取某纹样的全部线段（含边框） */
export function latticeSegments(patternId) {
  const gen = GENERATORS[patternId] || GENERATORS.mayo;
  return [...frameSegments(), ...gen()];
}

/**
 * 线段 → 挤出棂条的合并几何。
 * 局部坐标以板中心为原点：x=宽, y=厚, z=高。
 */
export function buildLatticeGeometry(patternId) {
  const segs = latticeSegments(patternId);
  const P = [], N = [], UVs = [], CUT = [], IDX = [];
  const half = T / 2;
  const zOff = -H / 2;

  for (const s of segs) {
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0;
    const len = Math.hypot(dx, dy);
    if (len < 0.4) continue;
    const th = Math.atan2(dy, dx);
    const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2 + zOff;
    const hw = s.w / 2, hl = len / 2 + s.w / 2; // 端部略作延伸，保证接头封闭
    const cos = Math.cos(th), sin = Math.sin(th);

    // 8 个角点（局部盒 → 平面内旋转）
    const corner = (u, v, w) => {
      const X = cx + u * cos - v * sin;
      const Z = cy + u * sin + v * cos;
      return [X, w, Z];
    };
    const v000 = corner(-hl, -hw, -half), v100 = corner(hl, -hw, -half);
    const v110 = corner(hl, hw, -half), v010 = corner(-hl, hw, -half);
    const v001 = corner(-hl, -hw, half), v101 = corner(hl, -hw, half);
    const v111 = corner(hl, hw, half), v011 = corner(-hl, hw, half);

    const faces = [
      { v: [v001, v101, v111, v011], n: [0, 1, 0] },    // 外面（+厚）
      { v: [v100, v000, v010, v110], n: [0, -1, 0] },   // 内面（−厚）
      { v: [v000, v100, v101, v001], n: [sin, 0, -cos] },
      { v: [v110, v010, v011, v111], n: [-sin, 0, cos] },
      { v: [v100, v110, v111, v101], n: [cos, 0, sin] },
      { v: [v010, v000, v001, v011], n: [-cos, 0, -sin] },
    ];
    for (const f of faces) {
      const base = P.length / 3;
      for (const p of f.v) { P.push(p[0], p[1], p[2]); N.push(f.n[0], f.n[1], f.n[2]); CUT.push(0); }
      UVs.push(0, 0, 1, 0, 1, 1, 0, 1);
      IDX.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(UVs), 2));
  g.setAttribute('aCut', new THREE.BufferAttribute(new Float32Array(CUT), 1));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(IDX), 1));
  g.computeBoundingSphere();
  g.userData.faceCount = IDX.length / 3;
  g.userData.segmentCount = segs.length;
  return g;
}

/**
 * 纹样投影贴图 —— 供 M1 地面光斑（SpotLight cookie）与 M3 海报边框复用。
 * 白 = 透光，黑 = 棂条遮挡。
 */
export function buildPatternTexture(patternId, size = 512) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  // 板面区域映射到画布中央（保持宽高比 96 : 125）
  const scale = (size * 0.86) / H;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(scale, -scale);
  ctx.translate(0, -H / 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(-W / 2, 0, W, H);
  ctx.strokeStyle = '#000';
  ctx.lineCap = 'round';
  for (const s of latticeSegments(patternId)) {
    ctx.lineWidth = s.w;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.lineTo(s.x1, s.y1);
    ctx.stroke();
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** 格心在世界中的摆位（4 片：2 片入顺枨槽、2 片入横枨槽） */
export function panelPlacements() {
  const n = C.EDGE - M.SEC / 2 - J4.SLOT_INSET - J4.PANEL_T / 2; // 槽中心线 ±(4.5a − a/4)
  const zc = (C.LOWER_Z1 - J4.BITE_LOW + C.UPPER_Z0 + J4.BITE_UP) / 2;
  return [
    { id: 'LT-01', pos: [0, +n, zc], rotZ: 0, axis: 'y', s: +1, outward: [0, +1, 0] },
    { id: 'LT-02', pos: [+n, 0, zc], rotZ: Math.PI / 2, axis: 'x', s: +1, outward: [+1, 0, 0] },
    { id: 'LT-03', pos: [0, -n, zc], rotZ: Math.PI, axis: 'y', s: -1, outward: [0, -1, 0] },
    { id: 'LT-04', pos: [-n, 0, zc], rotZ: -Math.PI / 2, axis: 'x', s: -1, outward: [-1, 0, 0] },
  ];
}

export const PANEL_DIMS = { W, WS, H, T, FIELD };
