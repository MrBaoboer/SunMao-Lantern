/**
 * 拖动刀具加工（§7 标注为「⚠ 需自定义」，降级为点击自动播放）
 *
 * 加工的视觉真实感来自两处，都不是画出来的：
 *   · 切面颜色 —— CSG 内核标记的 aCut 属性驱动，铣一刀新切面自动亮一档（§11.2）
 *   · 走刀音高 —— 随刀数递升（§S15），实时合成才做得到
 *
 * §S15 备注要求「不要用实时布尔」：这里也不做布尔 ——
 * 几何是按工序标签预先解析生成的，走刀只是把工序加入集合并重建网格。
 */

import * as THREE from 'three';
import { tween, Ease, wait } from '../util/tween.js';
import { makeGoldMaterial } from '../render/materials.js';

/**
 * 一段收成薄刃的料：拿一个盒子，把 -Z 那一端的厚度收掉。
 * 盒的顶点本来就按面拆开，改完位置重算法线即可得到规整的斜刃。
 */
function bevelled(w, t, len, tipRatio = 0.12) {
  const g = new THREE.BoxGeometry(w, t, len);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) < 0) p.setY(i, p.getY(i) * tipRatio);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/**
 * 锯齿：一条锯齿形轮廓挤出成一个几何，不是二十几个小锥体。
 * 齿尖落在 z = 0，齿背在 +Z —— 与刃口约定一致，直接摆在原点即可。
 */
function sawTeeth(len, pitch, depth, thick) {
  const s = new THREE.Shape();
  s.moveTo(-len / 2, depth);
  for (let x = -len / 2; x < len / 2 - pitch; x += pitch) {
    s.lineTo(x + pitch * 0.5, 0);      // 齿尖朝下（shape 的 -Y，稍后转到世界 -Z）
    s.lineTo(x + pitch, depth);
  }
  s.lineTo(len / 2, depth);
  s.lineTo(len / 2, depth + 1.4);
  s.lineTo(-len / 2, depth + 1.4);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  g.rotateX(Math.PI / 2);              // shape 的 +Y → 世界 +Z，齿尖因此落在 z = 0
  return g;
}

/** 绕 Z 均布若干片薄刃，给铣刀一圈能看出来的切削刃 */
function flutes(n, r, len, mat) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.8, r * 2.05, len), mat);
    f.rotation.z = (i / n) * Math.PI;
    g.add(f);
  }
  return g;
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
    const L = 54;
    const teeth = new THREE.Mesh(sawTeeth(L, 2.6, 2.6, 0.9), steel);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(L, 0.9, 11), steel);
    blade.position.set(0, 0, 7.5);          // z 2–13，齿尖因此露出 2.6
    const spine = new THREE.Mesh(new THREE.BoxGeometry(L, 2.4, 2.2), steel);
    spine.position.set(0, 0, 14);
    // 柄：与锯板同轴向后接出，抬到背脊一线 —— 半没入木料时柄不会跟着埋进去
    const neck = new THREE.Mesh(new THREE.BoxGeometry(8, 3.2, 9), steel);
    neck.position.set(-L / 2 - 3, 0, 12);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.8, 21, 12), wood);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(-L / 2 - 17, 0, 13);
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 2.6, 12), wood);
    butt.rotation.z = Math.PI / 2;
    butt.position.set(-L / 2 - 28, 0, 13);
    g.add(teeth, blade, spine, neck, grip, butt);
  } else if (kind === 'router') {
    // 铣刀：刃在最下，往上依次是夹头、滚花箍、机身。
    // 机身是深色金属 —— 用灯芯那套暖金材质会读成一段黄铜管，不像刀具。
    const bit = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 12, 14), steel);
    bit.rotation.x = Math.PI / 2; bit.position.z = 6;
    const edges = flutes(3, 2.8, 11.4, dark);
    edges.position.z = 6;
    const collet = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5.6, 8, 14), steel);
    collet.rotation.x = Math.PI / 2; collet.position.z = 16;
    const knurl = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 5, 20), dark);
    knurl.rotation.x = Math.PI / 2; knurl.position.z = 22.5;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(9.2, 8.0, 26, 18), dark);
    body.rotation.x = Math.PI / 2; body.position.z = 38;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(9.2, 9.2, 3, 18), steel);
    cap.rotation.x = Math.PI / 2; cap.position.z = 52.5;
    g.add(bit, edges, collet, knurl, body, cap);
    g.userData.bit = bit;
  } else { // chisel 凿刀：斜刃 · 扁身 · 铁箍 · 木柄 · 顶箍
    const tip = new THREE.Mesh(bevelled(7, 3.2, 12), steel);
    tip.position.z = 6;                     // z 0–12，下半段收成斜刃
    const shank = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 16), steel);
    shank.position.z = 19;
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.0, 4, 14), steel);
    ferrule.rotation.x = Math.PI / 2; ferrule.position.z = 29;
    // 柄身两段：自铁箍向上先鼓起、再收向柄尾，这才是手握得住的形
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 4.6, 14, 14), wood);
    lower.rotation.x = Math.PI / 2; lower.position.z = 38;
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 6.2, 12, 14), wood);
    upper.rotation.x = Math.PI / 2; upper.position.z = 51;
    const hoop = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 2.4, 14), steel);
    hoop.rotation.x = Math.PI / 2; hoop.position.z = 58;
    g.add(tip, shank, ferrule, lower, upper, hoop);
  }

  // 走刀进度环：叠在刀尾上方，永远压在画面最前
  const ringMat = makeGoldMaterial();
  ringMat.transparent = true; ringMat.opacity = 0.9; ringMat.depthTest = false;
  const ring = new THREE.Mesh(new THREE.RingGeometry(10, 12.4, 32, 1, 0, Math.PI * 2), ringMat);
  ring.position.z = kind === 'saw' ? 30 : 68;
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
   * @param {'chisel'|'saw'|'router'} o.tool
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
    t.position.copy(o.from);
    this._orientTool(t, o);
    t.userData.ring.visible = true;
    this._setRing(0);
    return this.job;
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
    const yA = new THREE.Vector3().crossVectors(zA, xA);
    t.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, zA));
  }

  end() {
    if (this.tool) {
      this.ctx.stage.scene.remove(this.tool);
      // 刀具每次开工都是新建的 —— 不释放，反复进出加工步会持续泄漏 GPU 资源
      this.tool.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      this.tool = null;
    }
    this.job = null;
    this.dragging = null;
    this.ctx.stage.controls.enabled = true;
  }

  _setRing(k) {
    if (!this.tool) return;
    const ring = this.tool.userData.ring;
    ring.geometry.dispose();
    ring.geometry = new THREE.RingGeometry(10, 12.4, 32, 1, Math.PI / 2, -Math.PI * 2 * k);
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
      this.dragging = null;
      this.ctx.stage.controls.enabled = true;
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

    // 音高随刀数升高
    this.ctx.sfx.play(j.sfx || 'CHISEL_STROKE', { pitch: (j.stroke - 1) * 1.5 });
    // 木屑
    const p = this.tool.position.clone();
    this.ctx.fx.chips.emit(p, j.chipDir || new THREE.Vector3(0, 0, 1));
    this.ctx.sfx.play('CHIP_FALL', { gain: 0.6 });

    j.onStroke?.(j.stroke, j.strokes);

    if (j.stroke >= j.strokes) {
      const done = j.onDone;
      await wait(0.24);
      this.end();
      done?.();
    }
  }

  onUp() {
    this.dragging = null;
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
