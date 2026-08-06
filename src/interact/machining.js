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
import { makeCoreMaterial, makeGoldMaterial } from '../render/materials.js';

/**
 * 一段收成薄刃的料：拿一个盒子，把 -Z 那一端的厚度收掉。
 * 盒的顶点本来就按面拆开，改完位置重算法线即可得到规整的斜刃。
 */
function bevelled(w, t, len, tipRatio = 0.14) {
  const g = new THREE.BoxGeometry(w, t, len);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) < 0) p.setY(i, p.getY(i) * tipRatio);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** 锯齿：一条锯齿形轮廓挤出成一个几何，不是二十几个小锥体 */
function sawTeeth(len, pitch, depth, thick) {
  const s = new THREE.Shape();
  s.moveTo(-len / 2, depth);
  for (let x = -len / 2; x < len / 2 - pitch; x += pitch) {
    s.lineTo(x + pitch * 0.5, 0);      // 齿尖朝下（shape 的 -Y，稍后转到世界 -Z）
    s.lineTo(x + pitch, depth);
  }
  s.lineTo(len / 2, depth);
  s.lineTo(len / 2, depth + 1.2);
  s.lineTo(-len / 2, depth + 1.2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  g.rotateX(Math.PI / 2);              // shape 的 +Y → 世界 +Z，齿尖因此朝 -Z
  return g;
}

/**
 * 虚拟刀具 TOOL-*。
 *
 * 全部按同一个约定建模：**刃口朝 -Z，柄在 +Z，走刀方向沿 +X**。
 * 摆位的 _orientTool() 依赖这个约定，改模型时别把朝向调头。
 */
export function buildTool(kind) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9bfc4, roughness: 0.32, metalness: 0.9 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6f4a28, roughness: 0.7 });

  if (kind === 'saw') {
    // 刃在下沿（-Z），齿尖朝下；背脊在上，手柄在 -X 一端
    const blade = new THREE.Mesh(new THREE.BoxGeometry(58, 1.0, 13), steel);
    blade.position.set(3, 0, -8.5);
    const teeth = new THREE.Mesh(sawTeeth(58, 2.6, 2.4, 1.0), steel);
    teeth.position.set(3, 0, -15);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(58, 2.2, 2.2), steel);
    spine.position.set(3, 0, -1.2);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(13, 5.5, 15), wood);
    grip.position.set(-32, 0, -8);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 6.4, 8), steel);
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(-32, 0, -8);
    g.add(blade, teeth, spine, grip, bolt);
  } else if (kind === 'router') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 24, 16), makeCoreMaterial());
    body.rotation.x = Math.PI / 2; body.position.z = 8;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 5, 12), steel);
    collar.rotation.x = Math.PI / 2; collar.position.z = -6;
    const bit = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 13, 12), steel);
    bit.rotation.x = Math.PI / 2; bit.position.z = -14;
    g.add(body, collar, bit);
    g.userData.bit = bit;
  } else { // chisel 凿刀：木柄 · 铁箍 · 扁身 · 斜刃
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 6.0, 26, 14), wood);
    handle.rotation.x = Math.PI / 2; handle.position.z = 25;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 2.4, 14), steel);
    cap.rotation.x = Math.PI / 2; cap.position.z = 38;
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, 4, 14), steel);
    ferrule.rotation.x = Math.PI / 2; ferrule.position.z = 11;
    const shank = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 20), steel);
    shank.position.z = -1;
    const tip = new THREE.Mesh(bevelled(7, 3, 8), steel);
    tip.position.z = -15;
    g.add(handle, cap, ferrule, shank, tip);
  }

  // 走刀进度环（3 段式，叠在刀具上方）
  const ringGeo = new THREE.RingGeometry(9, 11, 32, 1, 0, Math.PI * 2);
  const ringMat = makeGoldMaterial();
  ringMat.transparent = true; ringMat.opacity = 0.9; ringMat.depthTest = false;
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.z = 46;
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
    if (this.tool) { this.ctx.stage.scene.remove(this.tool); this.tool = null; }
    this.job = null;
    this.dragging = null;
    this.ctx.stage.controls.enabled = true;
  }

  _setRing(k) {
    if (!this.tool) return;
    const ring = this.tool.userData.ring;
    ring.geometry.dispose();
    ring.geometry = new THREE.RingGeometry(9, 11, 32, 1, Math.PI / 2, -Math.PI * 2 * k);
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
    while (j.stroke < j.strokes) {
      const target = j.lastEnd === 1 ? 0 : 1;
      const from = j.u;
      await tween(0.5, (k) => this._setU(from + (target - from) * k), { ease: Ease.inOutQuad });
      await wait(0.08);
      if (!this.job) return;
    }
  }
}
