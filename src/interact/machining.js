/**
 * 拖动刀具加工（§7 标注为「⚠ 需自定义」，降级为点击自动播放）
 *
 * 加工的视觉真实感来自两处，都不是画出来的：
 *   · 切面颜色 —— CSG 内核标记的 aCut 属性驱动，切一刀新切面自动亮一档（§11.2）
 *   · 走刀音高 —— 随刀数递升（§S15），实时合成才做得到
 *
 * §S15 备注要求「不要用实时布尔」：这里也不做布尔 ——
 * 几何是按工序标签预先解析生成的，走刀只是把工序加入集合并重建网格。
 */

import * as THREE from 'three';
import { tween, Ease, wait } from '../util/tween.js';
import { makeGoldMaterial } from '../render/materials.js';

/**
 * 把一条二维轮廓立起来做成刀身。
 *
 * 轮廓画在「厚度 × 高度」这个剖面上（shape 的 x = 厚，y = 高），挤出方向是刃宽。
 * 转到世界后：X = 刀身厚（顺走刀方向）、Y = 刃宽（横在切口上）、Z = 高，刃口落在 z = 0。
 */
function bladeFromProfile(pts, width) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false });
  g.rotateX(Math.PI / 2);              // shape 的 +Y → 世界 +Z；挤出方向落到 −Y
  g.translate(0, width / 2, 0);        // 刃宽居中
  g.computeVertexNormals();
  return g;
}

/**
 * 锯齿：一条锯齿形轮廓挤出成一个几何，不是二十几个小锥体。
 * 齿尖落在 z = 0，齿背在 +Z —— 与刃口约定一致，直接摆在原点即可。
 * 齿距给小、齿数给足，远看才是一排细齿而不是一圈鲨鱼牙。
 */
function sawTeeth(len, pitch, depth, thick) {
  const s = new THREE.Shape();
  s.moveTo(-len / 2, depth);
  for (let x = -len / 2; x < len / 2 - pitch; x += pitch) {
    // 前角陡、后角缓 —— 纵解锯齿的样子，比等腰三角更像真锯
    s.lineTo(x + pitch * 0.72, 0);
    s.lineTo(x + pitch, depth);
  }
  s.lineTo(len / 2, depth);
  s.lineTo(len / 2, depth + 1.2);
  s.lineTo(-len / 2, depth + 1.2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  g.rotateX(Math.PI / 2);              // shape 的 +Y → 世界 +Z，齿尖因此落在 z = 0
  return g;
}

/**
 * 一段轴向沿 +Z 的回转体（刀具的柄、箍、挡铁都是）。
 *
 * 必须在**几何**上转，不能给 Mesh 同时写 rotation.x 与 rotation.z：
 * three.js 的欧拉角默认按 XYZ 合成，两个轴一起写下去，圆柱的轴向会被带偏 22.5°，
 * 整个柄相对刃口歪着长出来 —— 看上去就是「零件全错位了」。
 * 几何层的 rotateY / rotateX 是顺序明确的两步：先绕自身轴转正八棱，再把轴立起来。
 */
function shaft(rBot, rTop, len, mat, { facets = 8, spin = Math.PI / 8 } = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, facets);
  if (spin) g.rotateY(spin);           // 绕自身轴转，只改棱的朝向
  g.rotateX(Math.PI / 2);              // 轴向 +Y → +Z
  return new THREE.Mesh(g, mat);
}

/**
 * 虚拟刀具 TOOL-*。
 *
 * 统一约定，摆位的 _orientTool() 与 act3 的走刀路径都依赖它：
 *   · **刃口落在 z = 0**，刀体一律向 +Z 生长；
 *   · 走刀方向沿 +X；
 *   · 刀身厚度方向为 Y。
 *
 * 「刃口在 z = 0」这一条是要害：走刀路径上给的坐标就是**刃尖真正走过的线**，
 * 于是步骤脚本里写工件表面的坐标即可，不必再反推一个抵消刀长的偏移量。
 */
export function buildTool(kind) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9bfc4, roughness: 0.3, metalness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3f4247, roughness: 0.5, metalness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a4d28, roughness: 0.66 });

  if (kind === 'saw') {
    // 手锯：齿尖压在 z=0，锯板在其上，背脊再上一档；柄在刀尾、抬到刃线以上。
    // 走刀时刃线没入木料，锯板露在外面 —— 这正是锯留在锯缝里的样子。
    const L = 58;
    const teeth = new THREE.Mesh(sawTeeth(L, 1.5, 1.8, 0.7), steel);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(L, 0.7, 12), steel);
    blade.position.set(0, 0, 7.8);          // z 1.8–13.8，齿尖因此露出 1.8
    const spine = new THREE.Mesh(new THREE.BoxGeometry(L, 2.0, 1.8), steel);
    spine.position.set(0, 0, 14.6);
    // 柄：不再是一根横插的圆棍。锯板向后收窄成颈，接一段前粗后细的握把，
    // 尾端上翘出一个角 —— 这个上翘的尾巴是手锯最认得出来的一笔
    const heel = new THREE.Mesh(bladeFromProfile(
      [[0, 2], [10, 6], [10, 15.5], [0, 15.5]], 0.7,
    ), steel);
    heel.position.set(-L / 2 - 10, 0, 0);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.4, 20, 10), wood);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(-L / 2 - 20, 0, 11.5);
    const horn = new THREE.Mesh(new THREE.SphereGeometry(4.6, 12, 10), wood);
    horn.scale.set(0.75, 0.72, 1.15);
    horn.position.set(-L / 2 - 30, 0, 14);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.0, 1.6, 10), steel);
    collar.rotation.z = Math.PI / 2;
    collar.position.set(-L / 2 - 10.6, 0, 11.5);
    g.add(teeth, blade, spine, heel, collar, grip, horn);
  } else if (kind === 'plane') {
    // 槽刨：木身 + 斜插的刨刀 + 一根横穿的木柄。
    //
    // 这里原先摆的是一把电动铣刀。它有两处不对：一是那么大一个机身杵在
    // 12 mm 见方的料旁边，读出来是台角磨；二是这一课讲的是不用钉子的手作木工，
    // 电动工具在场就把这件事说岔了。锯、凿、刨 —— 这才是这套活儿的三样家伙。
    // 中式刨最认得出来的是那根横柄：双手握着往前推。
    const L = 34, W = 6;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(L, W, 15), wood);
    stock.position.z = 9;                       // 木身自 z = 1.5 起，刃口在其下
    // 刨刀：自木身斜插下来，刃口落在 z = 0
    const iron = new THREE.Mesh(bladeFromProfile(
      [[-1.8, 0], [3.2, 12.5], [5.6, 12.5], [0.6, 0]], W * 0.62,
    ), steel);
    iron.position.set(1, 0, 0);
    const wedge = new THREE.Mesh(new THREE.BoxGeometry(3.2, W * 0.58, 9), dark);
    wedge.position.set(-2.6, 0, 10.5);
    // 横柄：穿过木身，两头各露出一截
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, W + 17, 10), wood);
    bar.position.set(-5, 0, 12.5);
    g.add(stock, iron, wedge, bar);
  } else {
    // 凿：刃宽 4 —— 与它要凿的那道槽同宽，这一条决定了它像不像「能凿出这道槽的凿」。
    // 单面斜磨：凿背是一个平面，正面自 4.5 mm 高处收向刃口。剖面立起来做，
    // 而不是把一个盒子的顶点捏尖 —— 后者两面对称，读出来是把锥子。
    // 全长压到 43：一根 12 见方的料旁边杵一把 62 的凿，取景只能一路后退。
    const EW = 4.0;                          // 刃宽（横在切口上）
    const ET = 6.0;                          // 刃厚（顺走刀方向）
    const tip = new THREE.Mesh(bladeFromProfile([
      [-ET / 2, 0], [-ET / 2, 11], [ET / 2, 11], [ET / 2, 4.5], [-ET / 2 + 0.4, 0],
    ], EW), steel);
    // 颈：自刃向上收细，接到挡铁 —— 打眼凿都有这一段
    const neck = new THREE.Mesh(new THREE.BoxGeometry(ET * 0.7, EW * 0.88, 9), steel);
    neck.position.z = 15;
    const bolster = shaft(3.2, 4.6, 3, steel); bolster.position.z = 21;
    const ferrule = shaft(4.4, 4.2, 2.2, steel); ferrule.position.z = 23.5;
    // 八棱柄：下段鼓起，上段收向柄尾，顶上一道敲击铁箍
    const lower = shaft(4.0, 5.2, 9, wood); lower.position.z = 29;
    const upper = shaft(5.2, 4.3, 8, wood); upper.position.z = 37.4;
    const hoop = shaft(4.6, 4.6, 2, steel); hoop.position.z = 42.4;
    g.add(tip, neck, bolster, ferrule, lower, upper, hoop);
  }

  // 走刀进度环：叠在刀尾上方，永远压在画面最前
  const ringMat = makeGoldMaterial();
  ringMat.transparent = true; ringMat.opacity = 0.9; ringMat.depthTest = false;
  const ring = new THREE.Mesh(new THREE.RingGeometry(7, 8.8, 32, 1, 0, Math.PI * 2), ringMat);
  ring.position.z = kind === 'saw' ? 26 : kind === 'plane' ? 24 : 50;
  ring.renderOrder = 8;
  ring.visible = false;
  g.add(ring);
  g.userData.ring = ring;
  g.userData.kind = kind;
  return g;
}

export class Machining {
  /** @param {{stage:any, lantern:any, hud:any, sfx:any, fx:any}} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.ray = new THREE.Raycaster();
    this.ptr = new THREE.Vector2();
    this.tool = null;
    this.job = null;
    this.dragging = null;
    this._bind();
  }

  _bind() {
    const c = this.ctx.stage.canvas;
    this._down = (e) => this.onDown(e);
    this._move = (e) => this.onMove(e);
    this._up = () => this.onUp();
    c.addEventListener('pointerdown', this._down);
    addEventListener('pointermove', this._move);
    addEventListener('pointerup', this._up);
    addEventListener('pointercancel', this._up);
  }

  /**
   * @param {object} o
   * @param {'chisel'|'saw'|'plane'} o.tool
   * @param {THREE.Vector3} o.from 走刀起点
   * @param {THREE.Vector3} o.to   走刀终点
   * @param {number} o.strokes     需要几刀
   * @param {string} o.sfx         每刀音效
   * @param {Function} o.onStroke  (n, total) 每完成一刀
   * @param {Function} o.onDone
   * @param {THREE.Vector3} [o.chipDir] 木屑迸发方向
   */
  begin(o) {
    this.end();
    const t = buildTool(o.tool);
    this.ctx.stage.scene.add(t);
    this.tool = t;
    const dir = o.to.clone().sub(o.from);
    this.job = {
      ...o,
      dir: dir.clone().normalize(),
      len: dir.length(),
      stroke: 0,
      u: 0,
      lastEnd: 0,      // 上一次到达的端点（0 或 1），用于判定一次往复
      sfxPitch: 0,
    };
    // 这一刀去的是哪块料：进给轴由走刀方向定，进刀轴与方向由攻角定
    if (o.carve) {
      const axisOf = (v) => {
        const a = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)];
        return a.indexOf(Math.max(...a));
      };
      const n = (o.faceNormal || new THREE.Vector3(0, 0, -1)).clone().normalize();
      const axis = axisOf(n);
      this.job.carveKey = {
        parts: o.carve.parts,
        tag: o.carve.tag,
        travel: axisOf(dir),
        axis,
        dir: Math.sign(n.getComponent(axis)) || -1,
        lane: o.from.clone(),
      };
      this.job.carveT = 0;
      this.job.carveQ = -1;
      this._carve();
    }
    t.position.copy(o.from);
    this._orientTool(t, o);
    t.userData.ring.visible = true;
    this._setRing(0);
    // 动手的步骤一开始就把机位钉死，手上对位时画面不会自己漂
    this.ctx.stage.hold(true);
    // 该往哪儿拉：一枚呼吸的小箭头钉在走刀线的另一端
    this.ctx.guides?.set([{
      pos: o.to.clone().addScaledVector(this.job.dir, 10),
      dir: this.job.dir.clone(),
    }]);
    return this.job;
  }

  /**
   * 把料啃到当前进度。
   *
   * 深度按「刀数 + 本刀走过的比例」推进 —— 一刀一层，凿和铣本来就是这么去料的。
   * 只增不减：手往回拖，木头不会长回去。
   */
  _carve() {
    const j = this.job;
    const k = j?.carveKey;
    if (!k) return;
    const partial = j.lastEnd === 1 ? 1 - j.u : j.u;
    const t = Math.min(1, (j.stroke + partial) / j.strokes);
    j.carveT = Math.max(j.carveT, t);

    // 刃尖扫过的那一段（世界坐标，进给轴上的区间）。只增不减 —— 走过就是走过了
    const tv = j.from.getComponent(k.travel) + j.dir.getComponent(k.travel) * j.u * j.len;
    j.sweptLo = j.sweptLo === undefined ? tv : Math.min(j.sweptLo, tv);
    j.sweptHi = j.sweptHi === undefined ? tv : Math.max(j.sweptHi, tv);

    // 重建几何有代价，量化到 1/32 —— 肉眼看不出台阶，又不必每帧重算
    const q = Math.round(j.carveT * 32) / 32;
    const sq = Math.round(j.sweptLo) + ':' + Math.round(j.sweptHi);
    if (q === j.carveQ && sq === j.sweptQ) return;
    j.carveQ = q; j.sweptQ = sq;
    for (const id of k.parts) {
      this.ctx.lantern.carve(id, k.tag, {
        lane: k.lane, travel: k.travel, axis: k.axis, dir: k.dir, t: q,
        swept: [j.sweptLo, j.sweptHi],
      });
    }
  }

  /**
   * 摆正刀具：刃口（模型的 -Z）朝工件，刀身长轴（模型的 +X）顺着走刀方向。
   *
   * 这里不能用 lookAt()：它把物体的 **+Z** 转向目标，正好与刀具的建模约定相反 ——
   * 锯齿朝天、凿柄扎进木头。而且默认 up 是 +Z，「朝下看」恰好是 lookAt 的退化情形，
   * 滚转角由内部的容错分支随手定，刀身会歪。所以直接搭一组正交基。
   */
  _orientTool(t, o) {
    const attack = (o.faceNormal || new THREE.Vector3(0, 0, -1)).clone().normalize();
    const zA = attack.clone().negate();                       // 模型 +Z 背离工件
    const xA = o.to.clone().sub(o.from);                      // 模型 +X 顺走刀方向
    xA.addScaledVector(zA, -xA.dot(zA));
    if (xA.lengthSq() < 1e-6) {
      xA.set(1, 0, 0).addScaledVector(zA, -zA.x);
      if (xA.lengthSq() < 1e-6) xA.set(0, 1, 0).addScaledVector(zA, -zA.y);
    }
    xA.normalize();

    /*
     * 柄朝人。刀身沿 ±X 都能走同一条线，但柄在 −X 那一头 ——
     * 取错方向，柄就伸到工件背面去了，手要从画面深处伸进去够它。
     * 所以看一眼相机在哪：让柄这一端落在离相机近的一侧。
     */
    // 用**推荐机位**而不是相机此刻的位置：分段加工里 setRecommended 刚下达、
    // 相机还在缓过去，拿实时位置会按旧机位判边
    const toCam = this.ctx.stage.recommend.pos.clone().sub(o.from);
    if (xA.dot(toCam) > 0) xA.negate();

    const yA = new THREE.Vector3().crossVectors(zA, xA);
    t.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, zA));
  }

  end() {
    if (this.tool) this.ctx.guides?.clear();
    if (this.tool) {
      this.ctx.stage.scene.remove(this.tool);
      // 刀具每次开工都是新建的 —— 不释放，反复进出加工步会持续泄漏 GPU 资源
      this.tool.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      this.tool = null;
    }
    this.job = null;
    this.dragging = null;
    // 最后一刀走完时手可能还按着 —— 那一下交还轨道控制，剩下半程就成了转镜头
    if (!this.grabbed) this.ctx.stage.controls.enabled = true;
  }

  _setRing(k) {
    if (!this.tool) return;
    const ring = this.tool.userData.ring;
    ring.geometry.dispose();
    ring.geometry = new THREE.RingGeometry(7, 8.8, 32, 1, Math.PI / 2, -Math.PI * 2 * k);
  }

  onDown(e) {
    const j = this.job;
    if (!j || this.ctx.hud.overlayOpen) return;
    const rect = this.ctx.stage.canvas.getBoundingClientRect();
    this.ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.ray.setFromCamera(this.ptr, this.ctx.stage.camera);
    const hits = this.ray.intersectObject(this.tool, true);
    if (!hits.length) return;

    const camDir = new THREE.Vector3();
    this.ctx.stage.camera.getWorldDirection(camDir);
    let n = camDir.clone().addScaledVector(j.dir, -camDir.dot(j.dir));
    if (n.lengthSq() < 1e-4) n.set(0, 0, 1);
    n.normalize();
    this.dragging = {
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, hits[0].point),
      grab: hits[0].point.clone(),
      u0: j.u,
      perp: 0, along: 0, warned: false,
    };
    this.grabbed = true;
    this.ctx.stage.controls.enabled = false;
    e.preventDefault();
  }

  onMove(e) {
    const d = this.dragging;
    const j = this.job;
    if (!d || !j) return;
    const rect = this.ctx.stage.canvas.getBoundingClientRect();
    this.ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.ray.setFromCamera(this.ptr, this.ctx.stage.camera);
    const P = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(d.plane, P)) return;

    const delta = P.clone().sub(d.grab);
    const along = delta.dot(j.dir);
    const perp = delta.clone().addScaledVector(j.dir, -along).length();
    d.along = Math.max(d.along, Math.abs(along));
    d.perp = Math.max(d.perp, perp);

    // 拖出轨迹 → 刀具阻尼回弹 + 明确引导
    if (!d.warned && d.perp > 18 && d.perp > d.along * 2.4) {
      d.warned = true;
      this.ctx.hud.toast(j.wrongHint || '沿着槽的方向来回拉');
      this.dragging = null;   // 手指还按着，轨道控制留到 onUp 再交还
      return;
    }

    const u = Math.max(0, Math.min(1, d.u0 + along / j.len));
    this._setU(u);
  }

  _setU(u) {
    const j = this.job;
    // autoRun 收尾的 tween 可能在 end() 之后再 tick 到几次 —— 静默忽略
    if (!j || !this.tool) return;
    j.u = u;
    this.tool.position.copy(j.from).addScaledVector(j.dir, u * j.len);
    this._carve();
    // 一次往复（走到一端再回到另一端）算一刀
    const atEnd = u > 0.94 ? 1 : u < 0.06 ? 0 : null;
    if (atEnd !== null && atEnd !== j.lastEnd) {
      j.lastEnd = atEnd;
      this._completeStroke();
    }
  }

  async _completeStroke() {
    const j = this.job;
    if (!j || j.stroke >= j.strokes) return;
    j.stroke++;
    this._setRing(j.stroke / j.strokes);
    this._carve();

    // 音高随刀数升高
    this.ctx.sfx.play(j.sfx || 'CHISEL_STROKE', { pitch: (j.stroke - 1) * 1.5 });
    // 木屑
    const p = this.tool.position.clone();
    this.ctx.fx.chips.emit(p, j.chipDir || new THREE.Vector3(0, 0, 1));
    this.ctx.sfx.play('CHIP_FALL', { gain: 0.6 });

    j.onStroke?.(j.stroke, j.strokes);

    if (j.stroke >= j.strokes) {
      const done = j.onDone;
      // 这一趟走完了：记在构件上。同一道工序还要再走别的道时（顺枨顶面两条槽），
      // 这一条才不会随着下一趟重新长回去
      const k = j.carveKey;
      if (k) for (const id of k.parts) this.ctx.lantern.carveFinish(id, k.tag, k.lane);
      await wait(0.24);
      this.end();
      done?.();
    }
  }

  onUp() {
    this.dragging = null;
    this.grabbed = false;
    this.ctx.stage.controls.enabled = true;
  }

  /** §7 降级路径：点击「开始加工」自动播放 —— 内容 100% 完整 */
  async autoRun() {
    const j = this.job;
    if (!j) return;
    // 每一轮都确认当前 job 还是进来时那一个 —— job 被 end() 或换掉后立即收手
    while (this.job === j && j.stroke < j.strokes) {
      const target = j.lastEnd === 1 ? 0 : 1;
      const from = j.u;
      await tween(0.5, (k) => this._setU(from + (target - from) * k), { ease: Ease.inOutQuad });
      await wait(0.08);
    }
  }
}
