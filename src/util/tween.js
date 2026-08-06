/** 极简补间与缓动 —— 全片动画的统一时基 */

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
  outElastic: (t) => (t === 0 || t === 1 ? t
    : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  /** M1 引火：指数曲线 —— 前 0.9 s 只到 30%，最后 0.3 s 冲到 100%。
   *  线性曲线会让点亮显得平淡，这是「点亮感」的关键。 */
  ignite: (t) => Math.pow(t, 3.6),
};

const running = new Set();

export function tick(dt) {
  for (const tw of [...running]) tw._step(dt);
}

class Tween {
  constructor(dur, onUpdate, { ease = Ease.inOutCubic, delay = 0, onDone } = {}) {
    this.dur = Math.max(1e-4, dur);
    this.onUpdate = onUpdate;
    this.ease = ease;
    this.delay = delay;
    this.onDone = onDone;
    this.t = 0;
    this.done = false;
    running.add(this);
  }
  _step(dt) {
    if (this.done) return;
    if (this.delay > 0) { this.delay -= dt; return; }
    this.t = Math.min(this.dur, this.t + dt);
    const k = this.ease(this.t / this.dur);
    this.onUpdate(k, this.t / this.dur);
    if (this.t >= this.dur) this.finish();
  }
  finish() {
    if (this.done) return;
    this.done = true;
    running.delete(this);
    this.onDone?.();
  }
  cancel() { this.done = true; running.delete(this); }
}

/** @returns {Promise<void>} */
export function tween(dur, onUpdate, opts = {}) {
  return new Promise((resolve) => {
    new Tween(dur, onUpdate, { ...opts, onDone: () => { opts.onDone?.(); resolve(); } });
  });
}

export function cancelAll() {
  for (const t of [...running]) t.cancel();
}

export const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

/** 数值弹簧（用于拖拽阻尼与回弹） */
export class Spring {
  constructor(value = 0, { stiffness = 170, damping = 22 } = {}) {
    this.value = value; this.target = value; this.v = 0;
    this.k = stiffness; this.d = damping;
  }
  step(dt) {
    const a = this.k * (this.target - this.value) - this.d * this.v;
    this.v += a * dt;
    this.value += this.v * dt;
    return this.value;
  }
}
