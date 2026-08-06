/**
 * §6 引导式拖拽装配 —— **一律做成 1 自由度约束，禁止自由 6DoF**
 *
 * 这是全片所有装配交互的统一原则。每一次装配只有一个合法运动方向；
 * 错误方向必须给出阻尼回弹与明确引导，而不是让构件飞到不该去的地方。
 *
 * ★S25 立柱的「末段 2 mm 楔紧」在这里实现：
 *   最后一段拖拽阻力显著加大、速度曲线压至 40%，未推到底则回弹 2 mm。
 *   这条把一个抽象的工程锁定原理，变成了可被手指感知的体验。
 */

import * as THREE from 'three';
import { tween, Ease, wait } from '../util/tween.js';
import { J3 } from '../core/modulus.js';

export class DragAssembly {
  /** @param {{stage:any, lantern:any, hud:any, sfx:any}} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.ray = new THREE.Raycaster();
    this.ptr = new THREE.Vector2();
    this.active = null;
    this.session = null;
    this._bind();
  }

  _bind() {
    const c = this.ctx.stage.canvas;
    this._down = (e) => this.onDown(e);
    this._move = (e) => this.onMove(e);
    this._up = (e) => this.onUp(e);
    c.addEventListener('pointerdown', this._down);
    addEventListener('pointermove', this._move);
    addEventListener('pointerup', this._up);
    addEventListener('pointercancel', this._up);
  }

  dispose() {
    const c = this.ctx.stage.canvas;
    c.removeEventListener('pointerdown', this._down);
    removeEventListener('pointermove', this._move);
    removeEventListener('pointerup', this._up);
    removeEventListener('pointercancel', this._up);
  }

  /**
   * 开始一次装配任务。
   * @param {object} o
   * @param {string[]} o.parts     待装构件（可多件，任意顺序）
   * @param {number}  [o.snap]     吸附阈值（毫米）。S05 首次放宽至 0.8a，S10 起收紧至 0.5a
   * @param {boolean} [o.wedge]    是否有楔紧段（S25 立柱）
   * @param {string}  [o.wrongHint] 错误方向提示文案
   * @param {Function}[o.onSeat]   单件到位
   * @param {Function}[o.onAll]    全部到位
   * @param {number}  [o.pitchBase] 到位音的起始音高（半音）
   * @param {string}  [o.seatSfx]  到位音效
   */
  begin(o) {
    this.cancel();
    const pending = new Set(o.parts);
    this.session = {
      ...o,
      snap: o.snap ?? 6,
      pending,
      seated: 0,
      total: o.parts.length,
      failCount: 0,
      seatSfx: o.seatSfx || 'SNAP_IN',
    };
    for (const id of o.parts) {
      const p = this.ctx.lantern.parts.get(id);
      if (p) { p.installed = false; }
    }
    this.ctx.lantern.applyAssembly();
    this._pulseTargets();
    return this.session;
  }

  cancel() {
    this.active = null;
    this.session = null;
    this.ctx.stage.controls.enabled = true;
  }

  /** 待装构件的呼吸提示 */
  _pulseTargets() {
    const s = this.session;
    if (!s) return;
    this.ctx.lantern.clearHighlights();
    for (const id of s.pending) {
      this.ctx.lantern.highlight(id, 0xc8a063, 0.14);
    }
  }

  _pick(e) {
    const rect = this.ctx.stage.canvas.getBoundingClientRect();
    this.ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.ray.setFromCamera(this.ptr, this.ctx.stage.camera);
    const s = this.session;
    const meshes = [...s.pending].map((id) => {
      const p = this.ctx.lantern.parts.get(id);
      return p?.isPanel ? p.latticeMesh : p?.mesh;
    }).filter(Boolean);
    const hits = this.ray.intersectObjects(meshes, true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && !o.userData.partId) o = o.parent;
    return o ? { partId: o.userData.partId, point: hits[0].point } : null;
  }

  onDown(e) {
    const s = this.session;
    if (!s || this.ctx.hud.overlayOpen) return;
    const hit = this._pick(e);
    if (!hit) return;

    const part = this.ctx.lantern.parts.get(hit.partId);
    const dir = new THREE.Vector3(...part.assembly.dir).normalize();
    const gap = part.assembly.gap;

    // 拖拽平面：包含运动轴、且尽量正对相机
    const camDir = new THREE.Vector3();
    this.ctx.stage.camera.getWorldDirection(camDir);
    let n = camDir.clone().addScaledVector(dir, -camDir.dot(dir));
    if (n.lengthSq() < 1e-4) n.set(0, 0, 1).addScaledVector(dir, -dir.z);
    n.normalize();

    this.active = {
      partId: hit.partId, part, dir, gap,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, hit.point),
      grab: hit.point.clone(),
      u0: 0, u: 0,
      perpAccum: 0, alongAccum: 0,
      warned: false,
      moved: false,
    };
    this.ctx.stage.controls.enabled = false;
    e.preventDefault();
  }

  onMove(e) {
    const a = this.active;
    if (!a) return;
    const rect = this.ctx.stage.canvas.getBoundingClientRect();
    this.ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.ray.setFromCamera(this.ptr, this.ctx.stage.camera);
    const P = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(a.plane, P)) return;

    const delta = P.clone().sub(a.grab);
    const along = delta.dot(a.dir);
    const perp = delta.clone().addScaledVector(a.dir, -along).length();
    a.alongAccum = Math.max(a.alongAccum, Math.abs(along));
    a.perpAccum = Math.max(a.perpAccum, perp);
    a.moved = a.moved || delta.length() > 2;

    let u = a.u0 + along / a.gap;

    // ★楔紧段：末段 2 mm 阻力显著加大（速度曲线压至 40%）
    const s = this.session;
    if (s.wedge) {
      const wedgeU = 1 - J3.WEDGE_LEN / a.gap;
      if (u > wedgeU) u = wedgeU + (u - wedgeU) * 0.4;
    }
    u = Math.max(-0.25, Math.min(1, u));

    // 错误方向：垂直分量显著压过轴向分量 → 阻尼回弹 + 明确引导
    if (!a.warned && a.perpAccum > 14 && a.perpAccum > a.alongAccum * 2.2) {
      a.warned = true;
      this._wrongDirection();
      return;
    }

    a.u = u;
    this.ctx.lantern.setAssemblyProgress(a.partId, Math.max(0, u));

    // 进入吸附范围：卯眼/槽口呼吸光 + 轻触觉代偿
    const near = (1 - u) * a.gap <= s.snap;
    if (near && !a.nearFired) {
      a.nearFired = true;
      this.ctx.lantern.highlight(a.partId, 0xc8a063, 0.4);
    } else if (!near && a.nearFired) {
      a.nearFired = false;
      this.ctx.lantern.highlight(a.partId, 0xc8a063, 0.14);
    }

    // 楔紧段的听觉与提示
    if (s.wedge && u > 1 - J3.WEDGE_LEN / a.gap && !a.wedgeFired) {
      a.wedgeFired = true;
      this.ctx.sfx.play('WEDGE_TIGHT', { gain: 0.7 });
      this.ctx.hud.setCue('最后一点会紧，推到底');
    }
  }

  async onUp() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.ctx.stage.controls.enabled = true;
    const s = this.session;
    if (!s) return;

    if (!a.moved) return; // 单纯点击 → 交给点击装配（降级路径）

    const remain = (1 - a.u) * a.gap;
    if (a.u >= 1 || remain <= s.snap) {
      await this.seat(a.partId);
    } else if (s.wedge && a.u > 1 - (J3.WEDGE_LEN + 1) / a.gap) {
      // 停在末段没推到底 —— 回弹 2 mm，提示再用力
      const u1 = a.u - J3.WEDGE_LEN / a.gap;
      await tween(0.22, (k) => this.ctx.lantern.setAssemblyProgress(a.partId, a.u + (u1 - a.u) * k), { ease: Ease.outQuad });
      this.ctx.hud.toast('再用点力，推到底才会咬住');
    } else {
      // 推进不足 —— 缓慢滑回原位
      const u0 = a.u;
      await tween(0.42, (k) => this.ctx.lantern.setAssemblyProgress(a.partId, u0 * (1 - k)), { ease: Ease.inOutQuad });
      s.failCount++;
      this.ctx.hud.toast('再推近一点');
      // 连续 3 次未成功 → 放宽吸附并主动提供帮助（隐性辅助）
      if (s.failCount >= 3) {
        s.snap = Math.max(s.snap, 12);
        this.ctx.hud.setAlts([{ label: '要我帮你吗', onClick: () => this.autoSeatAll() }]);
      }
    }
  }

  async _wrongDirection() {
    const a = this.active;
    this.active = null;
    this.ctx.stage.controls.enabled = true;
    const s = this.session;
    const u0 = a.u;
    await tween(0.3, (k) => this.ctx.lantern.setAssemblyProgress(a.partId, u0 * (1 - Ease.outQuad(k))), { ease: Ease.linear });
    this.ctx.hud.toast(s.wrongHint || '沿着木条的方向推进去');
  }

  /** 把某件送到位（含到位反馈） */
  async seat(partId, { silent = false } = {}) {
    const s = this.session;
    if (!s || !s.pending.has(partId)) return;
    const cur = this.ctx.lantern.parts.get(partId);
    const from = 1 - (cur.home.distanceTo(cur.mesh.position) / (cur.assembly.gap || 1));

    // 吸附后自动完成插入，末端回弹 —— 全片统一的到位手感
    await tween(0.36, (k) => {
      this.ctx.lantern.setAssemblyProgress(partId, from + (1 - from) * k);
    }, { ease: Ease.outCubic });
    await tween(0.09, (k) => {
      const back = Math.sin(k * Math.PI) * 0.006;
      this.ctx.lantern.setAssemblyProgress(partId, 1 - back);
    }, { ease: Ease.linear });

    cur.installed = true;
    this.ctx.lantern.setAssemblyProgress(partId, 1);
    s.pending.delete(partId);
    s.seated++;
    this.ctx.lantern.highlight(partId, 0xc8a063, 0);

    if (!silent) {
      // 音高依次上行 —— 多件装配时形成节奏（S20 第二记 +2 半音、S25 四柱上行）
      const pitch = (s.pitchBase ?? 0) + (s.seated - 1) * 2;
      if (s.double) this.ctx.sfx.playDouble(s.seatSfx, { pitch });
      else this.ctx.sfx.play(s.seatSfx, { pitch });
    }
    s.onSeat?.(partId, s.seated, s.total);

    if (!s.pending.size) {
      const done = s.onAll;
      this._pulseTargets();
      await wait(0.12);
      done?.();
    } else {
      this._pulseTargets();
    }
  }

  /** §7 降级路径：点击构件 → 自动播放装配动画（内容 100% 完整，仅损失手感） */
  async autoSeatAll() {
    const s = this.session;
    if (!s) return;
    for (const id of [...s.pending]) {
      await this.seat(id);
      await wait(0.22);
    }
  }

  /** 点击（未拖动）即自动装配 —— 降级模式与移动端的兜底 */
  bindClickFallback() {
    const c = this.ctx.stage.canvas;
    c.addEventListener('click', (e) => {
      const s = this.session;
      if (!s || !this.ctx.state?.fallbackMode) return;
      const hit = this._pick(e);
      if (hit) this.seat(hit.partId);
    });
  }
}
