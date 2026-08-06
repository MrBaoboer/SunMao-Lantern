/** 步骤脚本共用工具 */

import * as THREE from 'three';
import { a, av, dim, M, C, J1, J2, J3, J4 } from '../core/modulus.js';
import { PALETTE } from '../render/materials.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export { a, av, dim, M, C, J1, J2, J3, J4, PALETTE };

/** 工作台陈列位（构件离位加工时的摆放高度） */
export const BENCH_Z = a(8);

/** 参数卡的标准行（一律「模数倍数（毫米）」双写，§12.5 排版纪律） */
export const row = (k, n) => [k, dim(n)];

/**
 * 「灯河」氛围：12 盏形制各异的灯笼剪影依次点亮，主角始终不亮。
 * 原稿 S01 的老街是一次性写实资产；此处改为抽象灯河 ——
 * 成本低得多，且天然不会与主角灯笼同形制（原稿备注要求「禁止剧透」）。
 */
export function buildLanternRiver(scene) {
  const g = new THREE.Group();
  const rnd = (s) => { let x = Math.sin(s * 127.1) * 43758.5453; return x - Math.floor(x); };
  const lamps = [];
  for (let i = 0; i < 12; i++) {
    // 推到主角灯笼之外足够远，才读得出「远处的一片灯」而不是几块贴片
    const r = 900 + rnd(i) * 900;
    const th = (i / 12) * Math.PI * 2 + rnd(i + 9) * 0.7;
    const h = 160 + rnd(i + 3) * 420;
    const w = 34 + rnd(i + 5) * 30;
    const shape = i % 3;
    const geo = shape === 0
      ? new THREE.CylinderGeometry(w, w, w * 1.5, 10)
      : shape === 1
        ? new THREE.SphereGeometry(w * 0.8, 12, 8)
        : new THREE.BoxGeometry(w * 1.4, w * 1.4, w * 1.7);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc0392b, transparent: true, opacity: 0.16,
    });
    const m = new THREE.Mesh(geo, mat);
    if (shape === 0) m.rotation.x = Math.PI / 2;
    m.position.set(Math.cos(th) * r, Math.sin(th) * r, h);
    // 悬绳
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 320, 4),
      new THREE.MeshBasicMaterial({ color: 0x3a2a1e, transparent: true, opacity: 0.28 }),
    );
    cord.rotation.x = Math.PI / 2;
    cord.position.set(m.position.x, m.position.y, h + 160 + w);
    g.add(m, cord);
    lamps.push({ m, mat, delay: i * 0.25 });
  }
  scene.add(g);
  return {
    group: g, lamps,
    /** 点灯波：自远及近依次点亮，间隔 0.25 s */
    async wave(sfx) {
      for (const l of lamps) {
        setTimeout(() => {
          l.mat.opacity = 0.95;
          l.mat.color.setHex(0xff8a4c);
          sfx?.play('LIGHT_SOFT', { gain: 0.35, pitch: (Math.random() - 0.5) * 6 });
        }, l.delay * 1000);
      }
    },
    dispose() { scene.remove(g); },
  };
}

/** 夜空（M1 / M5 复用） */
export function buildNightSky(scene) {
  const g = new THREE.Group();
  const N = 420;
  const pos = new Float32Array(N * 3);
  const alp = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 0.85);
    const r = 1800;
    pos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
    pos[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * r;
    pos[i * 3 + 2] = Math.cos(ph) * r + 400;
    alp[i] = 0.2 + Math.random() * 0.7;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alp, 1));
  const mat = new THREE.PointsMaterial({ color: 0xdce6ff, size: 3.2, transparent: true, opacity: 0.55, depthWrite: false });
  const stars = new THREE.Points(geo, mat);
  stars.frustumCulled = false;
  g.add(stars);
  scene.add(g);
  return { group: g, dispose() { scene.remove(g); geo.dispose(); mat.dispose(); } };
}

/** 幻影提示体（S18 柱窝预留、S19 立柱与格心示意） */
export function ghostBox(scene, { size, pos, color = PALETTE.SOCKET, opacity = 0.3 }) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  m.position.set(...pos);
  m.renderOrder = 4;
  scene.add(m);
  return m;
}

/** 虚线轮廓预示位（本项目引导系统的核心组件，S18–S29 大量使用） */
export function outlineBox(scene, { size, pos, color = PALETTE.MORTISE }) {
  const g = new THREE.BoxGeometry(...size);
  const e = new THREE.EdgesGeometry(g);
  const m = new THREE.LineSegments(e, new THREE.LineDashedMaterial({
    color, dashSize: 4, gapSize: 3, transparent: true, opacity: 0.45, depthTest: false,
  }));
  m.computeLineDistances();
  m.position.set(...pos);
  m.renderOrder = 3;
  scene.add(m);
  g.dispose();
  return m;
}

/**
 * 教学件的轻量 1 自由度拖拽（DEMO-* 不入 BOM，不必走完整的 DragAssembly）。
 * 约束原则与 §6 一致：只允许沿唯一合法方向移动，错误方向阻尼回弹。
 */
export function makeSimpleDrag(ctx) {
  return function simpleDrag(obj, dir, distance, _planeZ, onSeat, onWrong, junk, opt = {}) {
    const ray = new THREE.Raycaster();
    const p2 = new THREE.Vector2();
    const d = dir.clone().normalize();
    const start = obj.position.clone();
    let drag = null;
    let seated = false;

    const pointer = (e) => {
      const r = ctx.stage.canvas.getBoundingClientRect();
      p2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(p2, ctx.stage.camera);
    };

    const onDown = (e) => {
      if (seated || ctx.hud.overlayOpen) return;
      pointer(e);
      if (!ray.intersectObject(obj, true).length) return;
      const camDir = new THREE.Vector3();
      ctx.stage.camera.getWorldDirection(camDir);
      let n = camDir.clone().addScaledVector(d, -camDir.dot(d));
      if (n.lengthSq() < 1e-4) n.set(0, 0, 1);
      n.normalize();
      const pt = new THREE.Vector3();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, obj.position);
      if (!ray.ray.intersectPlane(plane, pt)) return;
      drag = { plane, grab: pt.clone(), u0: obj.position.clone().sub(start).dot(d) / distance, perp: 0, along: 0, warned: false };
      ctx.stage.controls.enabled = false;
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!drag || seated) return;
      pointer(e);
      const pt = new THREE.Vector3();
      if (!ray.ray.intersectPlane(drag.plane, pt)) return;
      const delta = pt.clone().sub(drag.grab);
      const along = delta.dot(d);
      const perp = delta.clone().addScaledVector(d, -along).length();
      drag.along = Math.max(drag.along, Math.abs(along));
      drag.perp = Math.max(drag.perp, perp);
      if (!drag.warned && drag.perp > 12 && drag.perp > drag.along * 2.2) {
        drag.warned = true;
        drag = null;
        ctx.stage.controls.enabled = true;
        obj.position.copy(start);
        onWrong?.();
        return;
      }
      const u = Math.max(0, Math.min(1, drag.u0 + along / distance));
      obj.position.copy(start).addScaledVector(d, u * distance);
      if (u > 0.88) { drag = null; seated = true; ctx.stage.controls.enabled = true; onSeat?.(); }
    };

    const onUp = () => {
      if (drag && !seated) obj.position.copy(start);
      drag = null;
      ctx.stage.controls.enabled = true;
    };

    ctx.stage.canvas.addEventListener('pointerdown', onDown);
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    junk?.add({ dispose: () => {
      ctx.stage.canvas.removeEventListener('pointerdown', onDown);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
    } });
    void opt;
  };
}

/** 一次性场景挂件的清理器 */
export class Junk {
  constructor(scene) { this.scene = scene; this.items = []; }
  add(...o) { this.items.push(...o); return o[0]; }
  clear() {
    for (const o of this.items) {
      if (o.dispose) o.dispose();
      else { this.scene.remove(o); o.geometry?.dispose?.(); o.material?.dispose?.(); }
    }
    this.items = [];
  }
}
