/**
 * 灯笼装配体 —— 全片唯一的模型状态中枢
 *
 * 管理三件事：
 *   1. 每件构件的**加工阶段**（工序集合 → 几何实时重建）
 *   2. 每件构件的**装配状态**（就位 / 待装偏移，方向严格按 §6 自由度表）
 *   3. 两套**互不复用**的爆炸数据（§14 #10）：
 *      · S02 统一爆炸 —— 追求视觉冲击：快、散、统一径向
 *      · S31 分层爆炸 —— 追求结构可读：慢、分层、严格沿各自装配反方向
 */

import * as THREE from 'three';
import { a, M, C, J4, QUADRANTS } from '../core/modulus.js';
import { buildPart, partMeta, WOOD_IDS, PANEL_IDS, ALL_OPS, OP } from '../core/parts.js';
import { solidToGeometry, grainAxisOf, homeOf } from './geometry.js';
import { makeWoodMaterial, setHighlight, setCutReveal, setSectionMode, PALETTE } from './materials.js';
import { buildLatticeGeometry, panelPlacements, buildPatternTexture } from './lattice.js';
import { reducedMotion } from '../util/tween.js';
import {
  buildCornerBracket, buildCornerPlate, buildKnot, buildTassel,
  buildLampCore, buildPaper, buildCutPaper, CUTOUT_MOTIFS,
} from './decor.js';

/** §6 装配序列：每件构件唯一的合法运动方向（单位向量）与待装距离 */
const ASSEMBLY = {
  'LB-A1': { dir: [0, 0, -1], gap: 0, seq: 0 },
  'LB-A2': { dir: [0, 0, -1], gap: 0, seq: 0 },
  'LB-C1': { dir: [0, 0, -1], gap: a(2), seq: 1 },   // S17 −Z 竖直下落
  'LB-B1': { dir: [-1, 0, 0], gap: a(2.5), seq: 2 }, // S20 ±X 水平直插
  'LB-B2': { dir: [+1, 0, 0], gap: a(2.5), seq: 2 },
  'UB-A1': { dir: [0, 0, -1], gap: 0, seq: 3 },
  'UB-A2': { dir: [0, 0, -1], gap: 0, seq: 3 },
  'UB-B1': { dir: [-1, 0, 0], gap: a(2.5), seq: 3 }, // S22 ±X
  'UB-B2': { dir: [+1, 0, 0], gap: a(2.5), seq: 3 },
  'PL-01': { dir: [-1, 0, 0], gap: a(3), seq: 4 },   // S25 ±X 水平推入，严禁竖直下落
  'PL-02': { dir: [+1, 0, 0], gap: a(3), seq: 4 },
  'PL-03': { dir: [+1, 0, 0], gap: a(3), seq: 4 },
  'PL-04': { dir: [-1, 0, 0], gap: a(3), seq: 4 },
};

/** §S31 分层爆炸：五层 + 每层各自的分离方向（层名沿用主线里的叫法） */
export const EXPLODE_LAYERS = [
  { id: 1, name: '底盘', count: 5, ids: ['LB-A1', 'LB-A2', 'LB-C1', 'LB-B1', 'LB-B2'] },
  { id: 2, name: '上面的框', count: 4, ids: ['UB-A1', 'UB-A2', 'UB-B1', 'UB-B2'] },
  { id: 3, name: '立柱', count: 4, ids: ['PL-01', 'PL-02', 'PL-03', 'PL-04'] },
  { id: 4, name: '格心与纸', count: 12, ids: [...PANEL_IDS] },
  { id: 5, name: '装饰与灯芯', count: 11, ids: [] },
];

/**
 * 内光基准强度。setLit 与每帧的火焰跳动共用同一个基准 ——
 * 两处各写一个数，跳动那份会悄悄覆盖实测调好的这份，整盏灯就过曝了。
 */
const INNER_BASE = 5200;

export class Lantern {
  /** @param {import('./stage.js').Stage} stage */
  constructor(stage, state) {
    this.stage = stage;
    this.state = state;
    this.root = new THREE.Group();
    stage.scene.add(this.root);

    /** @type {Map<string, Part>} */
    this.parts = new Map();
    this.explodeT = 0;
    this.explodeMode = 'layered';
    this.layerFocus = null;

    this.#buildWood();
    this.#buildPanels();
    this.#buildDecor();
    this.#buildLight();
    this.applyAssembly();
  }

  // ── 13 件木构件 ──
  #buildWood() {
    WOOD_IDS.forEach((id, i) => {
      const solid = buildPart(id, ALL_OPS);
      const geo = solidToGeometry(solid);
      const home = homeOf(id);
      const mat = makeWoodMaterial({
        grainAxis: grainAxisOf(solid),
        seed: home,                    // 基准位只当纹理种子用，构件搬走了纹也不跟着跑
        tone: ((i * 0.137) % 1) - 0.5, // 每根随机色差，避免 13 根纹理完全一致
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.copy(home);
      mesh.userData = { partId: id, kind: 'wood' };
      this.root.add(mesh);

      this.parts.set(id, {
        id, mesh, material: mat, home,
        meta: partMeta(id),
        ops: new Set(ALL_OPS),
        installed: true,
        assembly: ASSEMBLY[id],
        layer: id.startsWith('LB') ? 1 : id.startsWith('UB') ? 2 : 3,
      });
    });
  }

  // ── 4 片格心（真实镂空棂条）──
  #buildPanels() {
    this.panelGroup = new THREE.Group();
    this.root.add(this.panelGroup);
    const places = panelPlacements();
    this.panelPlacements = places;
    this.panels = places.map((pl, i) => {
      const g = new THREE.Group();
      g.position.set(...pl.pos);
      g.rotation.z = pl.rotZ;
      const geo = buildLatticeGeometry(this.state.patternId);
      const mat = makeWoodMaterial({
        grainAxis: 0, seed: new THREE.Vector3(...pl.pos), tone: 0.32,
      });
      mat.color.setHex(0xc09456); // 格心用浅一档的榉木（§2 V-14）
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.userData = { partId: pl.id, kind: 'panel' };
      g.add(mesh);
      g.userData = { partId: pl.id, kind: 'panel', mesh, material: mat, placement: pl };
      g.visible = false;
      this.panelGroup.add(g);
      this.parts.set(pl.id, {
        id: pl.id, mesh: g, material: mat, home: new THREE.Vector3(...pl.pos),
        meta: partMeta(pl.id), ops: new Set(ALL_OPS), installed: false,
        assembly: { dir: [...pl.outward], gap: a(2), seq: 5 }, layer: 4, isPanel: true,
        baseRot: pl.rotZ, latticeMesh: mesh, placement: pl, index: i,
      });
      return g;
    });
  }

  // ── 装饰件 ──
  #buildDecor() {
    this.decor = { brackets: [], plates: [], papers: [], cutpapers: [] };

    // 绵纸（内）+ 窗花（外）—— ★V-12 内外顺序不可颠倒
    this.panelPlacements.forEach((pl, i) => {
      const n = new THREE.Vector3(...pl.outward);
      // 纸与窗花的可读正面在局部 −Y（decor.js 里 rotation.x = π/2 的结果）。
      // 摆放角必须由 outward 求出、令正面朝外 —— 沿用格心的 rotZ 会让 ±Y 两面
      // 的正面朝内，福字从外面看就是反字。
      const faceOut = Math.atan2(n.x, -n.y);
      const paper = buildPaper();
      const paperGrp = new THREE.Group();
      paperGrp.position.set(...pl.pos);
      paperGrp.position.addScaledVector(n, -(J4.PANEL_T / 2 + 1.2)); // 内侧
      paperGrp.rotation.z = faceOut;
      paperGrp.add(paper);
      paperGrp.visible = false;
      paperGrp.userData = { kind: 'paper', index: i, normal: n };
      this.root.add(paperGrp);
      this.decor.papers.push(paperGrp);

      const cut = buildCutPaper(CUTOUT_MOTIFS[i % 4].id);
      const cutGrp = new THREE.Group();
      cutGrp.position.set(...pl.pos);
      cutGrp.position.addScaledVector(n, J4.PANEL_T / 2 + 0.9); // 外侧
      cutGrp.rotation.z = faceOut;
      cutGrp.add(cut);
      cutGrp.visible = false;
      cutGrp.userData = { kind: 'cutpaper', index: i, normal: n, motif: CUTOUT_MOTIFS[i % 4].id };
      this.root.add(cutGrp);
      this.decor.cutpapers.push(cutGrp);
    });

    // 祥云牙子 ×4（J-5 角牙）+ 龙纹角花 ×4（J-6 柱头压片）
    QUADRANTS.forEach((q) => {
      const b = buildCornerBracket(q);
      b.visible = false;
      this.root.add(b);
      this.decor.brackets.push(b);

      const p = buildCornerPlate(q);
      p.visible = false;
      this.root.add(p);
      this.decor.plates.push(p);
    });

    // 中国结（挂在中梁底面中心）+ 红流苏（接在结的下方）。
    // 结压在中梁下沿那一小段里，穗头紧跟其下 —— 地面已经沉到灯脚之下（stage.js），
    // 穗子因此有地方垂，不必再为了不穿地板而剪短
    this.knot = buildKnot();
    this.knot.position.set(0, 0, C.LOWER_Z0 - 0.5);
    this.knot.visible = false;
    this.root.add(this.knot);

    this.tassel = buildTassel();
    this.tassel.position.set(0, 0, 16);
    this.tassel.visible = false;
    this.root.add(this.tassel);

    // 灯芯（中梁顶面中心）—— S30 装入但不点亮，点亮是 M1 的专属高潮
    this.core = buildLampCore();
    this.core.position.set(0, 0, C.LOWER_Z1);
    this.core.visible = false;
    this.root.add(this.core);

    EXPLODE_LAYERS[4].ids = [
      ...this.decor.brackets.map((o) => o.userData.id),
      ...this.decor.plates.map((o) => o.userData.id),
      'DC-KNOT-01', 'DC-TASSEL-01', 'LG-CORE-01',
    ];
  }

  // ── 灯光（M1 点亮；地面纹样光斑用带 cookie 的聚光灯）──
  #buildLight() {
    this.innerLight = new THREE.PointLight(0xffa54f, 0, 900, 1.6);
    this.innerLight.position.set(0, 0, C.LOWER_Z1 + 30);
    this.root.add(this.innerLight);

    this.patternSpot = new THREE.SpotLight(0xffb066, 0, 900, Math.PI / 3.1, 0.55, 1.2);
    this.patternSpot.position.set(0, 0, C.LOWER_Z1 + 30);
    this.patternSpot.target.position.set(0, 0, -1);
    this.patternSpot.map = buildPatternTexture(this.state.patternId, 512);
    this.root.add(this.patternSpot, this.patternSpot.target);
  }

  // ══════════════════════════════════════════════
  // 加工
  // ══════════════════════════════════════════════

  /** 设定某构件已完成的工序集合，几何随之重建 */
  setOps(partId, ops) {
    const p = this.parts.get(partId);
    if (!p || p.isPanel) return;
    p.ops = ops === 'all' ? new Set(ALL_OPS) : ops === 'blank' ? new Set() : new Set(ops);
    p.carved = null;                 // 工序整套换掉了，半截的走刀记录随之作废
    const solid = buildPart(partId, p.ops.size ? p.ops : 'blank');
    p.mesh.geometry.dispose();
    p.mesh.geometry = solidToGeometry(solid);
  }

  // ══════════════════════════════════════════════
  // 走刀去料
  //
  // 料要跟着刀一点点没，而不是走完几刀之后整块跳出来 —— 后者正是
  //「动作和加工结果对不上」的根源：刀在这道槽上来回，另一道槽却同时也开好了。
  // ══════════════════════════════════════════════

  /**
   * 刀走到 t 时的形态。
   * @param {string} partId
   * @param {string} tag 这一刀在做的工序
   * @param {{lane:THREE.Vector3, travel:number, axis:number, dir:number, t:number}} k
   *   lane 是刃尖的**世界**坐标；构件可能正被搬在工作台上，这里换回它自己的坐标系
   */
  carve(partId, tag, k) {
    const p = this.parts.get(partId);
    if (!p || p.isPanel) return;
    const lane = k.lane.clone().sub(p.mesh.position).add(p.home);
    // 刃尖扫过的那一段也要换算到构件坐标系。构件在工作台上只是平移，
    // 所以进给轴上加同一个偏移量即可
    const shift = p.home.getComponent(k.travel) - p.mesh.position.getComponent(k.travel);
    const ops = new Set(p.ops);
    ops.delete(tag);
    const solid = buildPart(partId, ops, {
      tag,
      travel: k.travel, axis: k.axis, dir: k.dir,
      lane: [lane.x, lane.y, lane.z],
      swept: k.swept ? [k.swept[0] + shift, k.swept[1] + shift] : null,
      t: k.t,
      // 同一道工序常常要走好几趟（顺枨顶面两条槽）。走完的那几趟整块留着，
      // 否则开第二条槽时第一条会长回去
      done: p.carved?.tag === tag ? p.carved.lanes : null,
    });
    p.mesh.geometry.dispose();
    p.mesh.geometry = solidToGeometry(solid);
  }

  /**
   * 这一趟走完了：记下它，后面几趟不再把它当成没加工过。
   *
   * 光记刃尖的横截位置不够 —— 一道工序的两处料可能正是沿走刀方向分开的
   * （横枨两头各一个透眼）。连**这一趟扫过哪一段**一起记下，
   * 下一趟才不会把另一头也当成「已经凿好了」。
   *
   * @param {number} travel 进给轴（0/1/2）
   * @param {number[]} [sweptWorld] 这一趟刃尖扫过的区间（世界坐标，进给轴上）
   */
  carveFinish(partId, tag, laneWorld, travel, sweptWorld) {
    const p = this.parts.get(partId);
    if (!p || p.isPanel) return;
    const lane = laneWorld.clone().sub(p.mesh.position).add(p.home);
    if (p.carved?.tag !== tag) p.carved = { tag, lanes: [] };
    const shift = travel === undefined ? 0
      : p.home.getComponent(travel) - p.mesh.position.getComponent(travel);
    p.carved.lanes.push({
      lane: [lane.x, lane.y, lane.z],
      swept: sweptWorld ? [sweptWorld[0] + shift, sweptWorld[1] + shift] : null,
    });
  }

  /** 追加一道工序（加工动画逐级调用） */
  addOp(partId, tag) {
    const p = this.parts.get(partId);
    if (!p) return;
    const next = new Set(p.ops); next.add(tag);
    this.setOps(partId, next);
  }

  /** 全部构件回到毛坯态（S13 木料展示） */
  allBlank() {
    for (const id of WOOD_IDS) this.setOps(id, 'blank');
  }

  allFinished() {
    for (const id of WOOD_IDS) this.setOps(id, 'all');
  }

  // ══════════════════════════════════════════════
  // 装配
  // ══════════════════════════════════════════════

  setInstalled(partId, v) {
    const p = this.parts.get(partId);
    if (!p) return;
    p.installed = v;
    this.applyAssembly();
  }

  /**
   * 按 installed 状态摆位：未装的构件沿其唯一合法方向退到待装位。
   *
   * 姿态要**复位到构件自己的基准角**，不是一律清零。
   * 十三根木构件的几何本来就建在最终装配位上，基准角确实是 0；
   * 但四片格心共用同一份棂格几何（建在 XZ 平面、厚度沿 Y），
   * 靠 rotZ 转到各自的面上 —— 清零会把 ±X 那两片放平到错误的平面里，
   * 整片横穿灯笼内腔、从两侧戳出去。
   */
  applyAssembly() {
    for (const p of this.parts.values()) {
      if (!p.assembly || p.detached) continue;
      const d = new THREE.Vector3(...p.assembly.dir);
      const off = p.installed ? 0 : p.assembly.gap;
      p.mesh.position.copy(p.home).addScaledVector(d, -off);
      p.mesh.rotation.set(0, 0, p.baseRot ?? 0);
      p.mesh.scale.setScalar(1);
    }
  }

  /**
   * 离位陈列：把构件搬到工作台上单独展示（S13 木料阵列、S15–S24 加工镜头）。
   * 被离位的构件不受 applyAssembly 影响，直到 attachAll()。
   */
  detach(id, { pos, rot, scale } = {}) {
    const p = this.parts.get(id);
    if (!p) return null;
    p.detached = true;
    if (pos) p.mesh.position.set(...pos);
    if (rot) p.mesh.rotation.set(...rot);
    if (scale !== undefined) p.mesh.scale.setScalar(scale);
    return p;
  }

  /** 全部归位 */
  attachAll() {
    for (const p of this.parts.values()) p.detached = false;
    this.applyAssembly();
  }

  /** 只显示给定构件（其余隐藏），传 null 显示全部 */
  showOnly(ids) {
    const set = ids ? new Set(ids) : null;
    for (const p of this.parts.values()) p.mesh.visible = !set || set.has(p.id);
    if (set) {
      this.showDecor(false);
      this.core.visible = false;
    }
  }

  /** 某构件沿其装配轴的当前进度（0=待装位，1=就位） */
  setAssemblyProgress(partId, t) {
    const p = this.parts.get(partId);
    if (!p?.assembly) return;
    const d = new THREE.Vector3(...p.assembly.dir);
    p.mesh.position.copy(p.home).addScaledVector(d, -(1 - t) * p.assembly.gap);
  }

  showPanels(v) { this.panels.forEach((g) => { g.visible = v; }); }

  /** 换纹样 —— state.patternId 贯穿 S26→S31→M1 地面投影→M3 海报→M4 */
  setPattern(patternId) {
    this.state.patternId = patternId;
    for (const p of this.panels) {
      const mesh = p.userData.mesh;
      mesh.geometry.dispose();
      mesh.geometry = buildLatticeGeometry(patternId);
    }
    this.patternSpot.map?.dispose();
    this.patternSpot.map = buildPatternTexture(patternId, 512);
  }

  // ══════════════════════════════════════════════
  // 爆炸 —— 两套独立数据，禁止互相替代（§14 #10）
  // ══════════════════════════════════════════════

  /**
   * @param {number} t 0–1
   * @param {'unified'|'layered'} mode
   */
  setExplode(t, mode = this.explodeMode) {
    this.explodeT = t;
    this.explodeMode = mode;
    const center = new THREE.Vector3(0, 0, M.HEIGHT / 2);

    const move = (obj, home, vec, k, spin = 0) => {
      obj.position.copy(home).addScaledVector(vec, k * t);
      if (spin) obj.rotation.z = (obj.userData.baseRotZ ?? obj.rotation.z) + spin * t;
    };

    for (const p of this.parts.values()) {
      if (mode === 'unified') {
        // S02：统一爆炸中心 = 灯笼几何中心，间距系数 1.8，带轻微旋转错开
        const v = p.home.clone().sub(center);
        if (v.lengthSq() < 1) v.set(0, 0, 1);
        v.normalize();
        move(p.mesh, p.home, v, 0.8 * p.home.distanceTo(center) + 40);
      } else {
        // S31：严格沿各自装配方向的反方向移出（非径向外扩）
        const v = this.#layeredVector(p);
        const dim = this.layerFocus && this.layerFocus !== p.layer ? 0.55 : 1;
        move(p.mesh, p.home, v, dim * this.#layeredDistance(p));
      }
    }

    // 纸与窗花：跟随各自格心，但错开距离，使「内纸—格心—外窗花」三层可读
    const panelDist = (i) => this.#layeredDistance(this.parts.get(PANEL_IDS[i]));
    this.decor.papers.forEach((g, i) => {
      const n = g.userData.normal;
      const base = this.panelPlacements[i];
      const home = new THREE.Vector3(...base.pos).addScaledVector(n, -(J4.PANEL_T / 2 + 1.2));
      const v = mode === 'unified' ? n.clone() : n.clone();
      g.position.copy(home).addScaledVector(v, (mode === 'unified' ? 120 : panelDist(i) * 0.72) * t);
    });
    this.decor.cutpapers.forEach((g, i) => {
      const n = g.userData.normal;
      const base = this.panelPlacements[i];
      const home = new THREE.Vector3(...base.pos).addScaledVector(n, J4.PANEL_T / 2 + 0.9);
      g.position.copy(home).addScaledVector(n, (mode === 'unified' ? 200 : panelDist(i) * 1.35) * t);
    });

    // 装饰件
    this.decor.plates.forEach((g, i) => {
      if (!g.userData.home) g.userData.home = g.position.clone();
      g.position.copy(g.userData.home).addScaledVector(new THREE.Vector3(0, 0, 1), (mode === 'unified' ? 150 : 92) * t);
      void i;
    });
    this.decor.brackets.forEach((g) => {
      if (!g.userData.home) g.userData.home = g.position.clone();
      const q = g.userData.slideIn.clone().normalize().multiplyScalar(-1);
      g.position.copy(g.userData.home).addScaledVector(q, (mode === 'unified' ? 130 : 66) * t);
    });
    // 穗子向下别太贪：拆到底时它是全场最低的一件，推远了就掉出画幅
    for (const [obj, vec, d] of [
      [this.knot, new THREE.Vector3(0, 0, -1), 62],
      [this.tassel, new THREE.Vector3(0, 0, -1), 58],
      [this.core, new THREE.Vector3(0, 0, 1), 60],
    ]) {
      if (!obj.userData.home) obj.userData.home = obj.position.clone();
      obj.position.copy(obj.userData.home).addScaledVector(vec, d * t);
    }
  }

  #layeredVector(p) {
    if (p.isPanel) {
      // 格心：先上提再斜出（其装配是三段式，反向亦然）
      const n = new THREE.Vector3(...p.placement.outward);
      return n.clone().setZ(0.55).normalize();
    }
    if (p.assembly && (p.assembly.dir[0] !== 0)) {
      return new THREE.Vector3(...p.assembly.dir).multiplyScalar(-1); // 水平构件沿装配反向抽出
    }
    if (p.id === 'LB-C1') return new THREE.Vector3(0, 0, 1);          // 中梁向上抬起
    if (p.id.startsWith('UB')) return new THREE.Vector3(0, 0, 1);
    return new THREE.Vector3(0, 0, -1);
  }

  #layeredDistance(p) {
    const byLayer = { 1: 46, 2: 74, 3: 108, 4: 150 };
    return byLayer[p.layer] ?? 90;
  }

  /** 点亮某一层、其余降透明（S31 分层查看） */
  focusLayer(layerId) {
    this.layerFocus = layerId;
    for (const p of this.parts.values()) {
      const on = !layerId || p.layer === layerId;
      p.material.transparent = !on;
      p.material.opacity = on ? 1 : 0.25;
      p.material.depthWrite = on;
      p.material.needsUpdate = true;
    }
  }

  // ══════════════════════════════════════════════
  // 语义色高亮 / 剖切
  // ══════════════════════════════════════════════

  highlight(partId, colorHex, amount = 0.75) {
    const p = this.parts.get(partId);
    if (p) setHighlight(p.material, colorHex, amount);
  }

  clearHighlights() {
    for (const p of this.parts.values()) setHighlight(p.material, 0x000000, 0);
  }

  /** 半透剖切：外壳淡出至 25% 不透明度（§7 剖切的降级方案，此处作为常态实现） */
  setSection(partIds, on) {
    const set = new Set(partIds ?? []);
    for (const p of this.parts.values()) {
      const s = on && set.has(p.id);
      setSectionMode(p.material, s ? 1 : 0);
      p.material.transparent = on && !s;
      p.material.opacity = on && !s ? 0.25 : 1;
      p.material.depthWrite = !(on && !s);
      p.material.needsUpdate = true;
    }
  }

  setCutReveal(partId, v) {
    const p = this.parts.get(partId);
    if (p) setCutReveal(p.material, v);
  }

  // ══════════════════════════════════════════════
  // 点灯（M1）
  // ══════════════════════════════════════════════

  /**
   * @param {number} k 0–1 亮度
   *
   * 这组数值是实测调出来的。世界单位是毫米，点光源按平方反比衰减，
   * 灯芯到纸面只有约 60 mm —— 强度稍高一点整盏灯就全白。
   * §M1 验收要求「亮度累加须可见但不过曝」，且 M2 答对加亮会在此基础上叠加，
   * 因此这里留了余量，上限钳制在 setLit 的调用方（baseLevel 封顶 1.4）。
   */
  setLit(k) {
    this.litLevel = k;
    this.innerLight.intensity = k * INNER_BASE;
    this.patternSpot.intensity = k * 9000;   // 地面纹样光斑
    const flameOpacity = Math.min(1, k * 1.25);
    this.core.userData.flameMat.opacity = flameOpacity;
    this.core.userData.glowMat.opacity = flameOpacity * 0.55;
    for (const g of this.decor.papers) {
      g.children[0].material.emissiveIntensity = k * 0.85;
      // 纸本来就不该透 —— 亮起来时略再实一点，棂条的剪影因此更清楚
      g.children[0].material.opacity = 0.86 + k * 0.1;
    }
  }

  /** 每帧：火焰跳动、流苏与中国结摆动 */
  update(dt, t) {
    const core = this.core.userData;
    // 要求减少动效时，这些一直不停的晃动整体压到两成 —— 完全不动会让点亮
    // 那一刻失去「活着」的读数，所以是压幅度，不是关掉
    const amp = reducedMotion() ? 0.2 : 1;
    if (this.core.visible && this.litLevel > 0) {
      // 不规则扰动，周期 1.8 s
      const f = 1 + (Math.sin(t * 3.4) * 0.06 + Math.sin(t * 8.9) * 0.03 + Math.sin(t * 1.7) * 0.04) * amp;
      core.flame.scale.set(1, f, 1);
      core.flame.position.z = core.wickHeight + (f - 1) * 6;
      const flick = 0.9 + (Math.sin(t * 5.1) * 0.06 + Math.sin(t * 11.3) * 0.04) * amp;
      this.innerLight.intensity = this.litLevel * INNER_BASE * flick;
      // billboard
      core.flame.quaternion.copy(this.stage.camera.quaternion);
      core.glow.quaternion.copy(this.stage.camera.quaternion);
    }
    if (this.tassel.visible) {
      const s = this.tassel.userData.strands;
      s.rotation.x = Math.sin(t * 0.9) * 0.05 * amp;
      s.rotation.y = Math.cos(t * 0.72) * 0.045 * amp;
    }
    if (this.knot.visible) this.knot.rotation.y = Math.sin(t * 0.5) * 0.1 * amp;
    void dt;
  }

  /** 全部构件可见性开关（分幕切换用） */
  setVisible(filter, v) {
    for (const p of this.parts.values()) {
      if (filter(p)) p.mesh.visible = v;
    }
  }

  showAllWood(v) { this.setVisible((p) => !p.isPanel, v); }

  showDecor(v) {
    [...this.decor.brackets, ...this.decor.plates, ...this.decor.papers, ...this.decor.cutpapers]
      .forEach((o) => { o.visible = v; });
    this.knot.visible = v;
    this.tassel.visible = v;
  }
}

export { ASSEMBLY, OP, PALETTE };
