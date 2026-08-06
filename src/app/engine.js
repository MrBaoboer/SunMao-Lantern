/**
 * 分步引擎
 *
 * V3.0 重构后主线为 24 步（原 33 步）。合并的全部是纯过场与重复劳动，
 * §13.4 的导演红线一条未动：
 *   静默点① S08 ｜ 静默点② S30 巡礼 ｜ S21 对比动画 ｜
 *   S27 三段式装板 ｜ S29 首个角花手动安装 ｜ S30 灯芯不提前点亮 ｜
 *   M5 片尾卡三行文字 ｜ S01 开场钩子与 M5 片尾闭环 ｜ 语义色纪律
 */

import * as THREE from 'three';
import { cancelAll } from '../util/tween.js';

export class Engine {
  constructor(ctx) {
    this.ctx = ctx;
    ctx.engine = this;
    this.steps = [];
    this.index = -1;
    this.busy = false;

    ctx.hud.onNext = () => this.next();
    ctx.hud.onBack = () => this.back();
    addEventListener('keydown', (e) => {
      if (ctx.hud.overlayVisible) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); this.next(); }
      if (e.key === 'ArrowLeft') this.back();
    });
  }

  setSteps(list) {
    this.steps = list;
    this.byId = new Map(list.map((s, i) => [s.id, i]));
  }

  get current() { return this.steps[this.index]; }

  /** §S31 构件详情卡的深链接入口 */
  goToStep(id) {
    const i = this.byId.get(id);
    if (i !== undefined) this.go(i);
  }

  async next() { if (this.index < this.steps.length - 1) await this.go(this.index + 1); }
  async back() { if (this.index > 0) await this.go(this.index - 1); }

  async go(i) {
    if (this.busy || i < 0 || i >= this.steps.length) return;
    this.busy = true;
    const { ctx } = this;
    const prev = this.current;

    try {
      // ── 收尾 ──
      cancelAll();
      ctx.voice.stop();
      await prev?.exit?.(ctx);
      ctx.drag.cancel();
      ctx.mach.end();
      ctx.guides.clear();
      ctx.hud.clearHotspots();
      ctx.hud.setCards([]);
      ctx.hud.setCounter('');
      ctx.hud.setActions([]);
      ctx.hud.setHint('');
      ctx.hud.setSubtitle('');
      ctx.hud.quiet(false);
      ctx.lantern.clearHighlights();
      ctx.lantern.setSection(null, false);

      // ── 进入 ──
      this.index = i;
      const s = this.current;
      if (i > ctx.state.maxStep) ctx.state.maxStep = i;

      ctx.hud.setTitle(s.id, s.title);
      ctx.hud.setPhase(s.phase ?? 0, s.phaseRatio ?? 1);
      ctx.hud.setNext({ label: s.nextLabel || '继续 ▸', enabled: !s.gate, hidden: !!s.hideNext });
      ctx.hud.setBack({ enabled: i > 0 });
      if (s.mood) ctx.stage.setMood(s.mood);
      if (s.bgm) ctx.bgm.play(s.bgm, { level: s.bgmLevel ?? 1 });
      if (s.cam) {
        ctx.stage.setRecommended({
          az: s.cam.az ?? 50, el: s.cam.el ?? 18, dist: s.cam.dist ?? 420,
          target: s.cam.target ? new THREE.Vector3(...s.cam.target) : undefined,
          ease: s.cam.ease ?? 1,
        });
        if (s.cam.snap) ctx.stage.snapToRecommended();
      }
      if (s.cards) ctx.hud.setCards(s.cards);
      if (s.hint) ctx.hud.setHint(s.hint, { pulse: !!s.hintPulse });

      // enter 里有大量动画 await。万一某个动画因故不解析（例如页面长时间不可见
      // 导致 rAF 停摆），不能让导航永久锁死 —— 超时后放行，步骤自身会继续跑完。
      if (s.enter) {
        let bail;
        const guard = new Promise((r) => { bail = setTimeout(r, 20000); });
        await Promise.race([Promise.resolve(s.enter(ctx, this)), guard]);
        clearTimeout(bail);
      }

      if (s.narration) {
        ctx.voice.play(s.id, s.narration, {
          cps: s.cps ?? 4.0,
          lyric: !!s.lyric,
          onDone: () => s.onNarrationDone?.(ctx, this),
        });
      }
    } catch (e) {
      console.error(`[step ${this.steps[i]?.id}]`, e);
    } finally {
      this.busy = false;
    }
  }

  /** 任务完成 → 解锁「继续」 */
  unlock(label) {
    this.ctx.hud.setNext({ label: label || this.current?.nextLabel || '继续 ▸', enabled: true });
  }

  lock() {
    this.ctx.hud.setNext({ enabled: false });
  }
}
