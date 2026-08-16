/** 步骤脚本共用工具 */

import * as THREE from 'three';
import { a, av, dim, M, C, J1, J2, J3, J4 } from '../core/modulus.js';
import { PALETTE, makeWoodMaterial } from '../render/materials.js';
import { Solid, box } from '../core/boxcsg.js';
import { solidToGeometry, grainAxisOf, edgeLines } from '../render/geometry.js';
import { tween } from '../util/tween.js';

export { box, edgeLines };

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export { a, av, dim, M, C, J1, J2, J3, J4, PALETTE };

/** 工作台陈列位（构件离位加工时的摆放高度） */
export const BENCH_Z = a(8);
/**
 * 陈列在工作台上的枨料，其顶面高度。
 *
 * 离位陈列时 detach 把构件中心摆到 BENCH_Z，而枨料截面是 a 见方，
 * 所以顶面就在中心之上半个截面。走刀路径的高度一律从这里推 ——
 * 刀具约定「刃口落在 z = 0」，路径给的就是刃尖走过的线。
 */
export const BENCH_TOP = BENCH_Z + M.SEC / 2;

/**
 * 取景范围（相对该步的镜头目标，毫米）。
 *
 * 每一步都得声明"这一步必须完整看到多大一块" —— 画幅装不下时相机自己后退。
 * 不声明的后果在竖屏上立刻可见：水平视场只有十几度，主体直接被裁掉两边。
 */
/** 整盏灯的取景目标：木作本体的中心 */
export const AIM_LANTERN = [0, 0, M.HEIGHT / 2];

/**
 * 整盏灯：木作本体加柱头角花。
 * 流苏那截红线故意不算进来 —— 为了一根穗子把灯笼缩掉三成，不值。
 */
export const FIT_LANTERN = { r: 98, h: 110 };
/** 只有木作骨架：十三根木条，无装饰无流苏 */
export const FIT_FRAME = { r: 98, h: 100 };
/** 一个枨框：五件或四件，摊平的一层 */
export const FIT_RING = { r: 104, h: 52 };
/**
 * 工作台上的单件加工镜头。
 *
 * 取景必须把**刀也算进去**。凿自刃口向上还有 43 mm 刀身，
 * 而工件本身只有 12 mm 见方 —— 只按工件取景，柄就会顶穿画面上沿，
 * 压在顶部的章节栏上。底部界面比顶部厚，安全区的抬升又把主体再往上推一档，
 * 于是目标点要跟着抬起来，让「刀 + 工件」整体落在画面中间。
 */
export const AIM_BENCH = [0, 0, BENCH_Z + 16];
export const FIT_BENCH = { r: 52, h: 32 };

/** 参数卡的标准行（一律「模数倍数（毫米）」双写，§12.5 排版纪律） */
export const row = (k, n) => [k, dim(n)];

/** 一枚软边光点。远处的灯只该是一团光，不该是一块贴片 */
let glowTex = null;
function lampGlow() {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.28, 'rgba(255,214,150,0.85)');
  grd.addColorStop(0.62, 'rgba(255,140,70,0.28)');
  grd.addColorStop(1, 'rgba(255,120,60,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(cv);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/**
 * 「灯河」氛围：远处一片灯依次点亮，主角始终不亮。
 *
 * 这些灯只负责"远处还有别人家的灯"这一个意思，所以做成软边光点：
 * 有形状的剪影一旦飘到画面里，就变成一块糊在界面上的橙色方块，
 * 既不像灯，也压过了主角。全部压在地平线一带、推到主角之外很远的地方。
 */
export function buildLanternRiver(scene) {
  const g = new THREE.Group();
  const rnd = (s) => { const x = Math.sin(s * 127.1) * 43758.5453; return x - Math.floor(x); };
  const lamps = [];
  const tex = lampGlow();
  for (let i = 0; i < 16; i++) {
    const r = 1500 + rnd(i) * 1400;
    const th = (i / 16) * Math.PI * 2 + rnd(i + 9) * 0.35;
    const h = -40 + rnd(i + 3) * 260;          // 压在地平线一带，不飘到画面上方
    const w = 60 + rnd(i + 5) * 70;
    const mat = new THREE.SpriteMaterial({
      map: tex, color: 0xff8a4c, transparent: true, opacity: 0.10,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Sprite(mat);
    m.scale.set(w, w, 1);
    m.position.set(Math.cos(th) * r, Math.sin(th) * r, h);
    g.add(m);
    lamps.push({ m, mat, delay: i * 0.18 });
  }
  scene.add(g);
  return {
    group: g, lamps,
    /** 点灯波：自远及近依次点亮 */
    wave(sfx) {
      for (const l of lamps) {
        setTimeout(() => {
          tween(0.7, (k) => { l.mat.opacity = 0.10 + 0.62 * k; });
          sfx?.play('LIGHT_SOFT', { gain: 0.35, pitch: (rnd(l.delay * 31) - 0.5) * 6 });
        }, l.delay * 1000);
      }
    },
    dispose() {
      scene.remove(g);
      for (const l of lamps) l.mat.dispose();
    },
  };
}

/** 夜空（M1 / M3 复用） */
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

/**
 * 教学件：走的是真构件那条几何管线 —— 毛坯减去若干切除盒。
 *
 * 意义不只是"更真"。凹进去的地方必须是**真的没有料**：
 * 内壁由 CSG 生成、照常受光，切面还会按全片统一的规矩亮一档。
 * 拿一块深色面片贴在木料表面上假装凹槽，得到的一定是相反的读数 ——
 * 不透光的实体压在表面上，眼睛读出来是凸起。
 *
 * @param {{blank:object, cuts?:object[], at?:number[], tone?:number,
 *          edge?:number, edgeOpacity?:number}} o edge 给一个语义色即描边
 * @returns {THREE.Group} 组内网格已抵消 recenter，声明时的坐标即组内坐标
 */
export function demoSolid({ blank, cuts = [], at = [0, 0, 0], tone = 0, edge, edgeOpacity = 0.5 }) {
  const solid = new Solid(blank, cuts);
  const geo = solidToGeometry(solid);
  const mat = makeWoodMaterial({
    grainAxis: grainAxisOf(solid),
    seed: new THREE.Vector3(...at),   // 只做纹理种子：教学件是要被拖着走的
    tone,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // solidToGeometry 把几何挪到了毛坯中心，这里加回去，声明时的坐标才作数。
  // 描边必须挂在网格下面 —— 挂到组上就会整体错位一个毛坯半长。
  mesh.position.copy(geo.userData.origin);
  if (edge !== undefined) mesh.add(edgeLines(geo, edge, edgeOpacity));
  const g = new THREE.Group();
  g.add(mesh);
  g.position.set(...at);
  g.userData = { geo, mat, mesh };
  return g;
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
    // 手指还按着的时候，绝不能把轨道控制交回去（见 onUp 的注释）
    let grabbed = false;

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
      grabbed = true;
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
        obj.position.copy(start);
        onWrong?.();
        return;
      }
      const u = Math.max(0, Math.min(1, drag.u0 + along / distance));
      obj.position.copy(start).addScaledVector(d, u * distance);
      if (u > 0.88) {
        drag = null; seated = true;
        ctx.guides.clear();
        onSeat?.();
      }
    };

    /*
     * 轨道控制只在**松手**时交还。
     *
     * OrbitControls 是在 Stage 里先建的，它的 pointerdown 比这里先跑 ——
     * 那一下它已经把 pointermove/pointerup 挂上了。之后设 enabled = false
     * 只是让那些回调空转；手指还按着就把它设回 true，回调立刻复活，
     * 剩下的这半程就变成了转镜头 —— 「拖完之后画面顺着拖的方向歪了」正是这么来的。
     * 所以拖歪了、装到位了，都只收手不交权。
     */
    const onUp = () => {
      if (drag && !seated) obj.position.copy(start);
      drag = null;
      if (grabbed) { grabbed = false; ctx.stage.controls.enabled = true; }
    };

    ctx.stage.canvas.addEventListener('pointerdown', onDown);
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);

    // 该往哪儿拖：一枚呼吸的小箭头。默认钉在构件后方，
    // 步骤可以自己给一组位置（夹榫那一步要在槽的两侧各来一枚）
    const spots = opt.arrows || [obj.position.clone().addScaledVector(d, -14)];
    ctx.guides.set(spots.map((p) => ({ pos: p.clone(), dir: d.clone() })));
    // 动手的步骤一开始就把机位钉死，手上对位时画面不会自己漂
    ctx.stage.hold(true);

    // 直接按「下一步」时由引擎代劳：走的就是拖到底那一刻的 onSeat，没有第二套演法。
    // seated 一并置真 —— 已经咬合的料不该还能被拖回来
    ctx.engine?.assist(async () => {
      if (seated) return;
      seated = true;
      await onSeat?.();
    });

    junk?.add({ dispose: () => {
      ctx.stage.canvas.removeEventListener('pointerdown', onDown);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
    } });
  };
}

/** 一次性场景挂件的清理器 */
export class Junk {
  constructor(scene) { this.scene = scene; this.items = []; }
  add(...o) { this.items.push(...o); return o[0]; }
  clear() {
    for (const o of this.items) {
      if (o.dispose) { o.dispose(); continue; }
      this.scene.remove(o);
      // 必须递归：教学件是 Group，网格挂在组下、描边又挂在网格下，
      // 只看传进来这一层等于一件都没释放。
      // 共用真灯笼几何的克隆体（M4 的挂灯）不能走这条路，它们自带 dispose。
      o.traverse?.((n) => {
        n.geometry?.dispose?.();
        const ms = Array.isArray(n.material) ? n.material : n.material ? [n.material] : [];
        // material.dispose() 不会连带释放贴图 —— M4 的全景天球每次 8MB，不能漏
        for (const m of ms) { m.map?.dispose?.(); m.alphaMap?.dispose?.(); m.dispose(); }
      });
    }
    this.items = [];
  }
}
