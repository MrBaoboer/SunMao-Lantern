/**
 * 分步引擎
 *
 * 一步 = 一份声明：机位、氛围、旁白、笔记、进入与退出。
 * 引擎负责把上一步收干净，再把下一步铺开 —— 步骤本身不必操心清场。
 *
 * 翻页永远不被拦住：旁白没念完、任务没做完，都可以往前走。
 * 需要动手的步骤把动作放在底部那一个任务按钮上，与导航互不相干。
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
    ctx.hud.onPrev = () => this.back();
    ctx.hud.onJump = (i) => this.go(i);

    // 互动模块把主界面收起来了，盖住画面的卷也一样 —— 这时方向键不该在背后翻页
    addEventListener('keydown', (e) => {
      if (!ctx.hud.navVisible || ctx.hud.modalOpen) return;
      // 焦点落在任何控件上时不接管：空格是按钮的激活键，不是翻页键
      if (e.target instanceof Element
        && e.target.closest('button, a, input, select, textarea, [role="menu"]')) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); this.next(); }
      if (e.key === 'ArrowLeft') this.back();
    });
  }

  setSteps(list) {
    this.steps = list;
    this.byId = new Map(list.map((s, i) => [s.id, i]));
    this.ctx.hud.setChapters(list);
  }

  get current() { return this.steps[this.index]; }

  goToStep(id) {
    const i = this.byId.get(id);
    if (i !== undefined) return this.go(i);
    return undefined;
  }

  async next() { if (this.index < this.steps.length - 1) await this.go(this.index + 1); }
  async back() { if (this.index > 0) await this.go(this.index - 1); }

  async go(i) {
    if (i < 0 || i >= this.steps.length || i === this.index) return;
    // 上一步的动画还没跑完也照样翻 —— 取消它，别让用户等
    cancelAll();
    this.busy = true;
    const { ctx } = this;
    const prev = this.current;

    try {
      // ── 收尾 ──
      ctx.voice.stop();
      await prev?.exit?.(ctx);
      ctx.drag.cancel();
      ctx.mach.end();
      ctx.guides.clear();
      ctx.hud.clearSpots();
      ctx.hud.setNote(null);
      ctx.hud.setAlts([]);
      ctx.hud.setTask(null);
      ctx.hud.setCue('');
      ctx.hud.setNarration('');
      ctx.hud.quiet(false);
      ctx.hud.hideOverlay();
      ctx.lantern.clearHighlights();
      ctx.lantern.setSection(null, false);

      // ── 进入 ──
      this.index = i;
      const s = this.current;

      ctx.hud.setStep(i, this.steps.length, s.title);
      if (s.task) ctx.hud.setTask(s.task.label, () => s.task.onClick(ctx, this));
      if (s.mood) ctx.stage.setMood(s.mood);
      if (s.bgm) ctx.bgm.play(s.bgm, { level: s.bgmLevel ?? 1 });
      if (s.cam) {
        ctx.stage.setRecommended({
          az: s.cam.az ?? 50, el: s.cam.el ?? 18, dist: s.cam.dist ?? 420,
          target: s.cam.target ? new THREE.Vector3(...s.cam.target) : undefined,
          ease: s.cam.ease ?? 1,
          fit: s.cam.fit,
        });
        if (s.cam.snap) ctx.stage.snapToRecommended();
      }
      if (s.note) ctx.hud.setNote(s.note);
      if (s.cue) ctx.hud.setCue(s.cue.text, s.cue.ico);

      // 旁白与画面同时开始，谁也不等谁
      if (s.narration) {
        ctx.voice.play(s.id, s.narration, { cps: s.cps ?? 4.0, lyric: !!s.lyric });
      }
      if (s.enter) await s.enter(ctx, this);
    } catch (e) {
      console.error(`[step ${this.steps[i]?.id}]`, e);
    } finally {
      this.busy = false;
    }
  }

  /** 任务做完了：收起任务按钮，让右边那枚箭头亮一下 */
  done() {
    this.ctx.hud.setTask(null);
    this.ctx.hud.setAlts([]);
    this.ctx.hud.readyNext();
  }
}
