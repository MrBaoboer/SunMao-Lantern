/**
 * 分步引擎
 *
 * 一步 = 一份声明：机位、氛围、旁白、笔记、进入与退出。
 * 引擎负责把上一步收干净，再把下一步铺开 —— 步骤本身不必操心清场。
 *
 * 旁白没念完随时可以往前走。**需要动手的步骤例外**：「下一步」先用来做活儿 ——
 * 一下按键做一段，两条槽就是两下，四根柱子就是四下，做完最后一段才轮到翻页。
 * 手上没做过的那一段，至少得让他一段一段看着它发生。
 *
 * 想一次跳过整步：顶上的格子点一下就到，或者用步骤自己的「帮我加工」「帮我装上」。
 */

import * as THREE from 'three';
import { cancelAll, wait } from '../util/tween.js';

export class Engine {
  constructor(ctx) {
    this.ctx = ctx;
    ctx.engine = this;
    this.steps = [];
    this.index = -1;
    this.busy = false;
    /** 这一步的动手环节做完了没有。done() 置真，置真之后「下一步」就只管翻页 */
    this.taskDone = false;
    /** 这一步动过手 —— 段与段之间的空当里也不算做完 */
    this.hands = false;
    /** 正在做其中一段 */
    this.helping = false;
    this._assist = null;

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

  /**
   * 步骤登记：这一步的下一段活儿可以这样代劳。
   *
   * 一段一次，做完后步骤自己登记下一段 —— B1 先是「把榫推进卯」，
   * 推完换成「点开一个部位」，一下点开一个。
   * 拖拽装配与走刀不必登记：引擎直接问 ctx.drag / ctx.mach 手上有没有活儿，
   * 那两处的进度是现成的，登记反而会留下过期的副本。
   */
  assist(fn) { this._assist = fn; this.hands = true; }

  /** 这一步还有没有没做完的动手环节 */
  get pending() {
    if (this.taskDone) return false;
    // 段与段之间有空当（上一段的收尾演示还在放）。动过手就一路算到这一步喊停为止 ——
    // 空当里按下的那一下不该把整步跳过去
    if (this.#leg()) this.hands = true;
    return this.hands;
  }

  async next() {
    // 需要动手的一步：这一下用来做其中一段，不翻页
    if (this.pending) { if (!this.helping) await this.help(); return; }
    if (this.index < this.steps.length - 1) await this.go(this.index + 1);
  }
  async back() { if (this.index > 0) await this.go(this.index - 1); }

  /**
   * 手上现在这一段活儿：走刀一趟、装一件、步骤登记的那一下、底部那个任务按钮。
   * 都是既有的降级路径 —— 与「帮我加工」「帮我装上」按下去是同一条路，没有第二套演法。
   */
  #leg() {
    const c = this.ctx;
    // 走完最后一刀的那一趟还要挂 0.24 s 才收（见 machining 的 _completeStroke）——
    // 这段空当里按下的那一下不能派给它，autoRun 会当场返回，等于白按一次
    if (c.mach.job && c.mach.job.stroke < c.mach.job.strokes) return () => c.mach.autoRun();
    const part = c.drag.session?.pending.values().next().value;
    if (part) return () => c.drag.seat(part);
    if (this._assist) return async () => { const fn = this._assist; this._assist = null; await fn(); };
    if (c.hud.onTask) return () => c.hud.onTask();
    return null;
  }

  /** 替他做一段，就一段。做的时候再按不叠第二段，等这一段落地 */
  async help() {
    const at = this.index;
    this.helping = true;
    try {
      const leg = this.#leg() || await this.#waitLeg(at);
      if (this.index !== at) return;
      if (!leg) {
        // 已经没有下一段了（收尾演示放完就是做完）—— 那这一下按的就是翻页，不空落
        this.taskDone = true;
        this.helping = false;
        await this.next();
        return;
      }
      await leg();
    } catch (e) {
      console.error(`[assist ${this.steps[at]?.id}]`, e);
      this.taskDone = true;
    }
    if (this.index !== at) return;
    this.helping = false;
    if (this.taskDone) this.ctx.hud.readyNext();
  }

  /**
   * 等这一步的下一段起来。
   *
   * 段与段之间隔着提示、演示与镜头转场（C4 锯完四个榫头到横枨那三道，中间将近三秒）。
   * 这段空当里按下的那一下不作废：等它起来，就做那一段。
   */
  async #waitLeg(at) {
    for (let i = 0; i < 34; i++) {
      await wait(0.15);
      if (this.index !== at || this.taskDone) return null;
      const leg = this.#leg();
      if (leg) return leg;
    }
    return null;
  }

  async go(i) {
    if (i < 0 || i >= this.steps.length || i === this.index) return;
    // 上一步的动画还没跑完也照样翻 —— 取消它，别让用户等
    cancelAll();
    // 代劳那一串 await 全靠 cancelAll 掐断，掐断之后不会兑现 —— 四个标志在这里收
    this.helping = false;
    this.taskDone = false;
    this.hands = false;
    this._assist = null;
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
      ctx.hud.closeOverlays();        // 两层一起收 —— 上一步的坞不留给下一步
      ctx.exitInspect?.();            // 「拆开看看」开着就翻页，灯笼会永久停在半透的爆炸态
      ctx.lantern.clearHighlights();
      ctx.lantern.setSection(null, false);
      // 点过灯之后再往回翻，工作台上的半成品不该还亮着 —— 要亮的那一步自己会点
      ctx.lantern.setLit(0);
      ctx.stage.hold(false);          // 上一步锁住的机位，翻页时解开

      // ── 进入 ──
      this.index = i;
      const s = this.current;

      ctx.hud.setStep(i, this.steps.length, s.title);
      if (s.task) ctx.hud.setTask(s.task.label, () => s.task.onClick(ctx, this));
      if (s.mood) ctx.stage.setMood(s.mood);
      if (s.bgm) ctx.bgm.play(s.bgm, { level: s.bgmLevel ?? 1 });
      // 翻页一律是**转场**，不是跳切：只下达新机位，相机自己绕过去。
      // 真要另起一个场（互动模块、封面、脚本拍图）的地方直接叫 stage.snapToRecommended()
      if (s.cam) {
        ctx.stage.setRecommended({
          az: s.cam.az ?? 50, el: s.cam.el ?? 18, dist: s.cam.dist ?? 420,
          target: s.cam.target ? new THREE.Vector3(...s.cam.target) : undefined,
          ease: s.cam.ease ?? 1,
          fit: s.cam.fit,
        });
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
      /*
       * 铺到一半断掉的话，屏幕上是一个自己不会说话的半成品。两件事要做：
       * 先解除拦截 —— 否则「下一步」会一直去按一个铺不完的任务按钮，人就卡在这儿了
       * （翻页与顶上的格子本身不经过 enter()，解除之后一定走得通）；
       * 再说一句发生了什么，并指出还走得通的那条路。按钮留着，它未必坏。
       */
      this.taskDone = true;
      ctx.hud.toast('这一步没能完全铺开，往下走或点顶上的格子换一步', { dur: 4000 });
    } finally {
      this.busy = false;
    }
  }

  /** 任务做完了：收起任务按钮，让右边那枚箭头亮一下 —— 这之后「下一步」就直接翻页 */
  done() {
    this.taskDone = true;
    this.ctx.hud.setTask(null);
    this.ctx.hud.setAlts([]);
    this.ctx.hud.readyNext();
  }
}
