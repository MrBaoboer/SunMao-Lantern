/**
 * §4.3 非木构件：格心之外的装饰与功能件
 *
 * ★V-25 明确：祥云牙子（J-5 角牙）与龙纹角花（J-6 柱头压片）承担真实结构职能，
 *   不是贴花。因此它们的几何必须与上枨框的槽位严格对位。
 *
 * ★V-27（本版校验新增）：原 J-6「角花内腔 a×a×a/2 套住柱头段上部」与
 *   「压舌落入上枨框顶面浅槽」在高度上无法同时成立 —— 柱头段高 2a，
 *   内腔够不到 z=14a 的压槽。本实现改为**带外挡边的方形盖板**：
 *   板贴上枨框顶面、方孔套住柱头根部、压舌落入压槽、
 *   **外缘出挑 a/6 挡在柱头外拔路径上** —— 这才真正锁死立柱。
 */

import * as THREE from 'three';
import { a, C, M, J3, J5, J6, QUADRANTS } from '../core/modulus.js';
import { makeWoodMaterial, makeGoldMaterial, makeSilkMaterial, makeCoreMaterial, makeCutPaperMaterial, makePaperMaterial, PALETTE } from './materials.js';

const HEAD_TOP = J3.SEG.HEAD[1];

// ══════════════════════════════════════════════════════════
// 祥云牙子 DC-CLOUD ×4 —— J-5 角牙：装饰 + 角部支撑（受剪）
// ══════════════════════════════════════════════════════════
export function buildCornerBracket({ sx, sy }) {
  // 位于上枨框顺枨底面角槽内，板面平行 XZ，厚 a/6
  const dropH = a(2);
  const x0 = C.INNER_FACE - J5.TENON_L;   // 18
  const x1 = C.INNER_FACE;                // 42
  const zTop = C.UPPER_Z0;                // 156
  const zBot = zTop - dropH;

  const shape = new THREE.Shape();
  const L = x1 - x0;
  shape.moveTo(0, 0);
  shape.lineTo(L, 0);
  shape.lineTo(L, -dropH);
  // 云头：三段回旋曲线，是「祥云」的形，也是受剪的腹板
  shape.bezierCurveTo(L * 0.72, -dropH * 0.42, L * 0.80, -dropH * 0.92, L * 0.52, -dropH * 0.72);
  shape.bezierCurveTo(L * 0.34, -dropH * 0.58, L * 0.44, -dropH * 0.16, L * 0.24, -dropH * 0.30);
  shape.bezierCurveTo(L * 0.12, -dropH * 0.40, L * 0.10, -dropH * 0.12, 0, -dropH * 0.16);
  shape.lineTo(0, 0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: J5.TENON_T, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 1, curveSegments: 12,
  });
  // 局部 (u=沿 x, v=沿 z, 挤出沿 +Z) → 摆到世界
  geo.rotateX(Math.PI / 2);
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, makeWoodMaterial({
    grainAxis: 0, center: new THREE.Vector3(0, 0, 0), tone: 0.22,
  }));
  mesh.castShadow = true;
  g.add(mesh);

  // 上缘 a/6 插舌，落入上枨框底面角槽
  const tongue = new THREE.Mesh(
    new THREE.BoxGeometry(J5.TENON_L, J5.TENON_T, J5.SLOT_D),
    mesh.material,
  );
  tongue.position.set(J5.TENON_L / 2, J5.TENON_T / 2, J5.SLOT_D / 2);
  g.add(tongue);

  g.position.set(sx * x0, sy * (C.INNER_FACE), zTop);
  g.scale.set(sx, sy, 1);
  g.userData = {
    id: `DC-CLOUD-0${QUADRANTS.findIndex((q) => q.sx === sx && q.sy === sy) + 1}`,
    kind: 'bracket', structural: true,
    slideIn: new THREE.Vector3(-sx * 18, -sy * 6, -10), // 自外侧斜向内上方插入
  };
  void zBot;
  return g;
}

// ══════════════════════════════════════════════════════════
// 龙纹角花 DC-DRAGON ×4 —— J-6 柱头压片（★V-27 带外挡边）
// ══════════════════════════════════════════════════════════
export function buildCornerPlate({ sx, sy }) {
  const g = new THREE.Group();
  const mat = makeGoldMaterial();

  const inn = C.RAIL_B_X - M.SEC / 2;      // 42 板内缘
  const head0 = C.COL_AXIS - M.SEC / 2;    // 48 柱头内侧面
  const head1 = C.COL_AXIS + M.SEC / 2;    // 60 柱头外侧面
  const out = head1 + J6.LIP;              // 62 外挡边
  const zTop = C.UPPER_Z1;                 // 168 上枨框顶面
  const t = J6.PLATE_T;

  // 板：方形环角块（[inn,out]² 减去柱头方孔 [head0,head1]²）
  const rect = (u0, v0, u1, v1) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(u1 - u0, v1 - v0, t), mat);
    m.position.set((u0 + u1) / 2, (v0 + v1) / 2, zTop + t / 2);
    m.castShadow = true;
    return m;
  };
  g.add(rect(inn, inn, head0, out));   // 内侧长条
  g.add(rect(head0, inn, out, head0)); // 底侧长条
  g.add(rect(head1, head0, out, out)); // ★外挡边（X 向）—— 挡住柱头径向外拔
  g.add(rect(head0, head1, head1, out)); // ★外挡边（Y 向）

  // 压舌：落入上枨框顶面压槽，把角花自身锁在框上
  const tongue = new THREE.Mesh(
    new THREE.BoxGeometry(J6.TONGUE_L, J6.TONGUE_T, J6.TONGUE_T), mat,
  );
  tongue.position.set(inn + J6.TONGUE_L / 2, C.RAIL_A_Y + J6.TONGUE_T / 2, zTop - J6.TONGUE_T / 2);
  g.add(tongue);

  // 龙纹：三道回旋脊线（低面数的意象化处理，非写实龙）
  for (let i = 0; i < 3; i++) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(inn + 3 + i * 2, inn + 16 - i * 3, zTop + t),
      new THREE.Vector3(inn + 9 + i * 2, inn + 12 - i * 2, zTop + t + 1.1),
      new THREE.Vector3(inn + 15 - i, inn + 5 + i, zTop + t + 0.7),
      new THREE.Vector3(inn + 18 + i, inn + 1 + i * 2, zTop + t),
    ]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.7, 5, false), mat);
    g.add(tube);
  }

  g.scale.set(sx, sy, 1);
  g.userData = {
    id: `DC-DRAGON-0${QUADRANTS.findIndex((q) => q.sx === sx && q.sy === sy) + 1}`,
    kind: 'plate', structural: true,
  };
  return g;
}

// ══════════════════════════════════════════════════════════
// 中国结 DC-KNOT-01 —— 挂于中梁底面中心
// ══════════════════════════════════════════════════════════
export function buildKnot() {
  const g = new THREE.Group();
  const mat = makeSilkMaterial();
  const cord = 1.5;
  // 盘长结：两组交错的方环
  for (let i = 0; i < 2; i++) {
    for (let k = 0; k < 2; k++) {
      const r = 7 - k * 2.4;
      const torus = new THREE.Mesh(new THREE.TorusGeometry(r, cord, 6, 4), mat);
      torus.rotation.z = Math.PI / 4 + (i * Math.PI) / 2;
      torus.rotation.x = i ? 0.28 : -0.28;
      torus.position.z = -6 - k * 0.8;
      g.add(torus);
    }
  }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(cord, cord, 8, 6), mat);
  stem.rotation.x = Math.PI / 2;
  stem.position.z = -2;
  g.add(stem);
  g.userData = { id: 'DC-KNOT-01', kind: 'knot' };
  return g;
}

// ══════════════════════════════════════════════════════════
// 红流苏 DC-TASSEL-01 —— 需柔体摆动（简化骨骼 3–4 骨节）
// ══════════════════════════════════════════════════════════
export function buildTassel() {
  const g = new THREE.Group();
  const mat = makeSilkMaterial();
  const head = new THREE.Mesh(new THREE.SphereGeometry(4.2, 12, 8), mat);
  g.add(head);
  const strands = new THREE.Group();
  const N = 22, len = a(6);
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2;
    const rr = 1.2 + (i % 3) * 0.7;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.28, len, 4), mat);
    s.rotation.x = Math.PI / 2;
    s.position.set(Math.cos(ang) * rr, Math.sin(ang) * rr, -len / 2 - 3);
    strands.add(s);
  }
  g.add(strands);
  g.userData = { id: 'DC-TASSEL-01', kind: 'tassel', strands };
  return g;
}

// ══════════════════════════════════════════════════════════
// 灯芯 LG-CORE-01 + 火焰 —— M1 点灯目标（S30 严禁提前点亮）
// ══════════════════════════════════════════════════════════
export function buildLampCore() {
  const g = new THREE.Group();
  const metal = makeCoreMaterial();
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(8, 10, 2.4, 20), metal);
  dish.rotation.x = Math.PI / 2; dish.position.z = 1.2;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 5, 12), metal);
  stem.rotation.x = Math.PI / 2; stem.position.z = 5;
  const candle = new THREE.Mesh(
    new THREE.CylinderGeometry(4.4, 4.6, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xf6ead0, roughness: 0.72 }),
  );
  candle.rotation.x = Math.PI / 2; candle.position.z = 15.5;
  g.add(dish, stem, candle);

  // 火焰：双层 billboard，未点亮时不可见
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xffc266, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(9, 15), flameMat);
  flame.position.z = 30;
  flame.renderOrder = 5;
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff9a3c, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), glowMat);
  glow.position.z = 28;
  glow.renderOrder = 4;
  g.add(flame, glow);

  g.userData = { id: 'LG-CORE-01', kind: 'core', flame, glow, flameMat, glowMat, wickHeight: 30 };
  return g;
}

// ══════════════════════════════════════════════════════════
// 绵纸 DC-PAPER ×4 —— 糊在格心内侧，transmission 0.45
// ══════════════════════════════════════════════════════════
export function buildPaper() {
  const w = a(8) - 1, h = a(10) + a(1 / 4) + a(1 / 6) - 1;
  const geo = new THREE.PlaneGeometry(w, h, 6, 8);
  // 极轻微的起伏，模拟糊纸后的服帖感
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setZ(i, Math.sin(p.getX(i) * 0.09) * Math.cos(p.getY(i) * 0.07) * 0.55);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, makePaperMaterial());
  mesh.rotation.x = Math.PI / 2;
  mesh.userData = { kind: 'paper' };
  return mesh;
}

// ══════════════════════════════════════════════════════════
// 窗花 DC-CUT ×4 —— 贴在绵纸外侧（★V-12 内外顺序不可颠倒）
// ══════════════════════════════════════════════════════════
export const CUTOUT_MOTIFS = [
  { id: 'fu', name: '福字', bless: '福到' },
  { id: 'fish', name: '鲤鱼', bless: '年年有余' },
  { id: 'lotus', name: '莲花', bless: '连年如意' },
  { id: 'bat', name: '蝙蝠', bless: '福气临门' },
];

export function buildCutPaperTexture(motif, size = 512) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, size, size);
  c.save();
  c.translate(size / 2, size / 2);
  const S = size / 2;
  c.fillStyle = '#ffffff';

  const ring = (r, n, petal) => {
    for (let i = 0; i < n; i++) {
      c.save();
      c.rotate((i / n) * Math.PI * 2);
      petal(r);
      c.restore();
    }
  };

  if (motif === 'fu') {
    c.font = `bold ${S * 1.15}px "Songti SC","SimSun","Noto Serif SC",serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('福', 0, S * 0.06);
    // 外圈回纹
    c.lineWidth = S * 0.05; c.strokeStyle = '#fff';
    c.beginPath(); c.arc(0, 0, S * 0.86, 0, Math.PI * 2); c.stroke();
    ring(S * 0.86, 12, (r) => { c.beginPath(); c.arc(r, 0, S * 0.045, 0, Math.PI * 2); c.fill(); });
  } else if (motif === 'fish') {
    c.beginPath();
    c.ellipse(-S * 0.08, 0, S * 0.52, S * 0.3, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(S * 0.4, 0); c.lineTo(S * 0.82, -S * 0.34); c.lineTo(S * 0.72, 0);
    c.lineTo(S * 0.82, S * 0.34); c.closePath(); c.fill();
    // 鳞纹镂空
    c.globalCompositeOperation = 'destination-out';
    for (let r = 0; r < 4; r++) for (let k = -2; k <= 2; k++) {
      c.beginPath();
      c.arc(-S * 0.34 + r * S * 0.17, k * S * 0.11, S * 0.075, Math.PI * 0.15, Math.PI * 0.85);
      c.lineWidth = S * 0.02; c.strokeStyle = '#000'; c.stroke();
    }
    c.beginPath(); c.arc(-S * 0.38, -S * 0.09, S * 0.055, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'source-over';
  } else if (motif === 'lotus') {
    ring(0, 8, () => {
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(S * 0.24, -S * 0.3, S * 0.28, -S * 0.72, 0, -S * 0.86);
      c.bezierCurveTo(-S * 0.28, -S * 0.72, -S * 0.24, -S * 0.3, 0, 0);
      c.fill();
    });
    c.globalCompositeOperation = 'destination-out';
    ring(0, 8, () => {
      c.beginPath();
      c.moveTo(0, -S * 0.12);
      c.bezierCurveTo(S * 0.1, -S * 0.34, S * 0.12, -S * 0.6, 0, -S * 0.7);
      c.bezierCurveTo(-S * 0.12, -S * 0.6, -S * 0.1, -S * 0.34, 0, -S * 0.12);
      c.fill();
    });
    c.globalCompositeOperation = 'source-over';
    c.beginPath(); c.arc(0, 0, S * 0.17, 0, Math.PI * 2); c.fill();
  } else { // bat 蝙蝠
    c.beginPath();
    c.moveTo(0, -S * 0.1);
    c.bezierCurveTo(-S * 0.3, -S * 0.5, -S * 0.86, -S * 0.42, -S * 0.9, -S * 0.02);
    c.bezierCurveTo(-S * 0.6, -S * 0.16, -S * 0.5, S * 0.12, -S * 0.34, S * 0.3);
    c.bezierCurveTo(-S * 0.2, S * 0.16, -S * 0.1, S * 0.24, 0, S * 0.3);
    c.bezierCurveTo(S * 0.1, S * 0.24, S * 0.2, S * 0.16, S * 0.34, S * 0.3);
    c.bezierCurveTo(S * 0.5, S * 0.12, S * 0.6, -S * 0.16, S * 0.9, -S * 0.02);
    c.bezierCurveTo(S * 0.86, -S * 0.42, S * 0.3, -S * 0.5, 0, -S * 0.1);
    c.fill();
    c.beginPath(); c.arc(0, -S * 0.2, S * 0.14, 0, Math.PI * 2); c.fill();
    ring(0, 2, () => { c.beginPath(); c.moveTo(0, -S * 0.3); c.lineTo(S * 0.06, -S * 0.44); c.lineTo(-S * 0.02, -S * 0.36); c.fill(); });
  }
  c.restore();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCutPaper(motifId) {
  const w = a(7), h = a(7);
  const tex = buildCutPaperTexture(motifId);
  const mat = makeCutPaperMaterial(tex);
  mat.alphaMap = tex;
  mat.transparent = true;
  mat.alphaTest = 0.42;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.userData = { kind: 'cutpaper', motif: motifId };
  return mesh;
}

/** M2 ≥3 分解锁的「福」字灯挂饰（≤400 tris，挂点在流苏挂点上方 0.5a） */
export function buildFuCharm() {
  const g = new THREE.Group();
  const mat = makeCutPaperMaterial(buildCutPaperTexture('fu', 256));
  mat.alphaMap = mat.map; mat.transparent = true; mat.alphaTest = 0.4;
  mat.emissive = new THREE.Color(PALETTE.CUTPAPER);
  mat.emissiveIntensity = 0.25;
  for (let i = 0; i < 2; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), mat);
    p.rotation.y = (i * Math.PI) / 2;
    g.add(p);
  }
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 10, 5), makeSilkMaterial());
  cord.position.y = 0; cord.position.z = 12; cord.rotation.x = Math.PI / 2;
  g.add(cord);
  g.userData = { id: 'DC-FU-01', kind: 'charm' };
  return g;
}

export { HEAD_TOP };
