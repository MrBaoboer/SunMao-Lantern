/**
 * 音效引擎 —— 实时模态合成
 *
 * 不用音频文件，是因为这里的声音需要可参数化：同一记咬合音要能升高两个半音，
 * 十三次落料要能随机浮动，四根立柱到位要依次上行。固定采样做不到。
 *
 * 合成方法是物理导向的：敲击 = 一个宽带瞬态 + 一组指数衰减的共振模态；
 * 锯、凿、铣是带通噪声加包络。这不是「像」，这就是这些声音的产生方式。
 *
 * 声音只有三类来源：木头、纸、火。界面本身几乎不出声 ——
 * 一屏一记提示音已经足够，多了就成了噪音。
 */

const A4 = 440;
/** 半音 → 频率倍率 */
export const semi = (n) => Math.pow(2, n / 12);

class SFXEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.masterGain = null;
    this.noiseBuf = null;
    this._loops = new Map();
  }

  /** 首次用户手势后才能创建 AudioContext */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;

    // 主总线：限幅 + 总音量。爆炸密集时不至于糊成一团。
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;
    const master = ctx.createGain();
    master.gain.value = 0.85;
    comp.connect(master).connect(ctx.destination);
    this.bus = comp;
    this.masterGain = master;

    // 预留：BGM 若改走 WebAudio（MediaElementSource → GainNode），
    // HTMLAudio 的 volume 不是 AudioParam，接不进来 —— 现阶段 duck() 是空转
    this.duckTarget = null;

    // 白噪声缓冲（2 s，循环取用）
    const n = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    return ctx;
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(v ? 0.85 : 0, this.ctx.currentTime, 0.05);
    }
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  // ── 基元 ──────────────────────────────────────────

  /** 噪声源（可指定起止与增益包络） */
  _noise(t, dur, gain = 1) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return { src, out: g };
  }

  /** 带通滤过的噪声（凿、锯、铣、摩擦都用它） */
  bandNoise(t, {
    f = 1200, q = 2.4, dur = 0.12, gain = 0.3,
    attack = 0.004, sweepTo = null, type = 'bandpass', decayShape = 2.2,
  } = {}) {
    const ctx = this.ctx;
    const { out } = this._noise(t, dur, 1);
    const bp = ctx.createBiquadFilter();
    bp.type = type;
    bp.frequency.setValueAtTime(f, t);
    bp.Q.value = q;
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * decayShape);
    out.connect(bp).connect(g).connect(this.bus);
    return g;
  }

  /**
   * 模态组：一组指数衰减的正弦。
   * @param {number[]} ratios 相对基频的模态比（木条自由-自由弯曲近似 1 : 2.76 : 5.4 : 8.9）
   * @param {number[]} decays 各模态衰减时间（秒）
   */
  modes(t, {
    f0 = 700, ratios = [1, 2.76, 5.4], decays = [0.18, 0.1, 0.06],
    amps = [1, 0.5, 0.25], gain = 0.3, detune = 0, wave = 'sine',
  } = {}) {
    const ctx = this.ctx;
    ratios.forEach((r, i) => {
      const osc = ctx.createOscillator();
      osc.type = wave;
      const f = f0 * r * (1 + (Math.random() - 0.5) * detune);
      osc.frequency.setValueAtTime(f, t);
      const g = ctx.createGain();
      const amp = gain * (amps[i] ?? 0.3);
      const dec = decays[i] ?? decays[decays.length - 1];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      osc.connect(g).connect(this.bus);
      osc.start(t);
      osc.stop(t + dec + 0.05);
    });
  }

  /** 低频冲击（大鼓、坐实、沉降） */
  thump(t, { f = 92, drop = 40, dur = 0.42, gain = 0.5 } = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, drop), t + dur * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.bus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  // ── 音效库 ────────────────────────────────────────

  /**
   * @param {string} id 音效编号
   * @param {object} o  { pitch: 半音偏移, gain, delay: 秒 }
   */
  play(id, o = {}) {
    if (!this.enabled || MUTED.has(id)) return;
    const ctx = this.ensure();
    if (!ctx) return;
    let name = id, scale = 1;
    if (!RECIPES[name] && ALIASES[name]) [name, scale] = ALIASES[name];
    const fn = RECIPES[name];
    if (!fn) { console.warn('[sfx] 未定义音效', id); return; }
    const t = ctx.currentTime + (o.delay || 0) + 0.001;
    fn(this, t, semi(o.pitch || 0), (o.gain ?? 1) * scale, o);
  }

  /** 双记咬合：两声极短促、间隔 60 ms —— 夹榫专属，须与单记明确可听辨 */
  playDouble(id = 'SNAP_IN', o = {}) {
    this.play(id, { ...o, pitch: (o.pitch || 0) - 1 });
    this.play(id, { ...o, delay: (o.delay || 0) + 0.06, pitch: (o.pitch || 0) + 2 });
  }

  /** 循环音（走刀、火焰、扫描），返回停止函数 */
  loop(id, o = {}) {
    const ctx = this.ensure();
    if (!ctx || !this.enabled) return () => {};
    const fn = LOOPS[id];
    if (!fn) return () => {};
    if (this._loops.has(id)) this._loops.get(id)();
    const stop = fn(this, o);
    this._loops.set(id, stop);
    return () => { stop(); this._loops.delete(id); };
  }

  stopLoop(id) {
    const s = this._loops.get(id);
    if (s) { s(); this._loops.delete(id); }
  }

}

// ══════════════════════════════════════════════════════════
// 音效表
//
// 只保留有物理来由的声音：木头、纸、火，外加一记极轻的点击。
// 界面不该有「叮」「嘀」「唰」—— 那是提示音，不是这盏灯该发出的声音。
// ══════════════════════════════════════════════════════════

const RECIPES = {
  // ── 木作 ──────────────────────────────────────────

  /** 咬合到位：全片复用的招牌音。短促、干、有木头的实感 */
  SNAP_IN: (S, t, p, g) => {
    S.bandNoise(t, { f: 2400 * p, q: 1.6, dur: 0.02, gain: 0.16 * g });
    S.modes(t, {
      f0: 620 * p, ratios: [1, 2.76, 5.4], decays: [0.1, 0.06, 0.035],
      amps: [1, 0.4, 0.16], gain: 0.2 * g,
    });
    S.thump(t, { f: 150 * p, drop: 78, dur: 0.1, gain: 0.14 * g });
  },

  /** 楔紧锁死：比 SNAP_IN 更闷、更沉，听得出「推到底了」 */
  SNAP_LOCK: (S, t, p, g) => {
    S.bandNoise(t, { f: 1500 * p, q: 1.2, dur: 0.05, gain: 0.13 * g, sweepTo: 500 * p });
    S.modes(t, {
      f0: 400 * p, ratios: [1, 2.4, 4.6], decays: [0.16, 0.09, 0.05],
      amps: [1, 0.4, 0.15], gain: 0.2 * g,
    });
    S.thump(t, { f: 110 * p, drop: 52, dur: 0.2, gain: 0.2 * g });
  },

  /** 轻敲一下木头 */
  WOOD_TAP: (S, t, p, g) => {
    S.modes(t, {
      f0: 900 * p, ratios: [1, 2.76, 5.4], decays: [0.07, 0.04, 0.025],
      amps: [1, 0.35, 0.12], gain: 0.16 * g,
    });
  },

  /** 一根料落到台面上 */
  WOOD_DROP: (S, t, p, g) => {
    S.bandNoise(t, { f: 1700 * p, q: 1.1, dur: 0.02, gain: 0.1 * g });
    S.modes(t, {
      f0: 500 * p, ratios: [1, 2.76, 5.4, 8.9], decays: [0.15, 0.08, 0.05, 0.03],
      amps: [1, 0.42, 0.18, 0.08], gain: 0.19 * g,
    });
    S.thump(t, { f: 120 * p, drop: 60, dur: 0.16, gain: 0.13 * g });
  },

  /** 整体沉一下、坐实了 */
  WOOD_SETTLE: (S, t, p, g) => {
    S.thump(t, { f: 88 * p, drop: 42, dur: 0.42, gain: 0.3 * g });
    S.modes(t, { f0: 260 * p, ratios: [1, 2.4], decays: [0.24, 0.14], amps: [1, 0.3], gain: 0.1 * g });
  },

  /** 木头贴着木头滑动 */
  WOOD_SLIDE: (S, t, p, g, o = {}) => {
    S.bandNoise(t, {
      f: 900 * p, q: 0.9, dur: o.dur ?? 0.3, gain: 0.075 * g,
      sweepTo: 520 * p, attack: 0.06, decayShape: 1.1,
    });
  },

  /** 格心落进槽：滑动 + 一记轻扣 */
  PANEL_SEAT: (S, t, p, g) => {
    RECIPES.WOOD_SLIDE(S, t, p, g * 0.7, { dur: 0.18 });
    RECIPES.WOOD_TAP(S, t + 0.16, p * 0.9, g * 0.6);
  },

  // ── 刀具 ──────────────────────────────────────────

  /** 锯：带齿的宽带噪声，一来一回 */
  SAW: (S, t, p, g) => {
    S.bandNoise(t, {
      f: 2000 * p, q: 0.9, dur: 0.2, gain: 0.11 * g,
      sweepTo: 1200 * p, attack: 0.03, decayShape: 1.2,
    });
  },

  /** 凿：一记闷响加木纤维断裂 */
  CHISEL: (S, t, p, g) => {
    S.bandNoise(t, { f: 2600 * p, q: 2.0, dur: 0.05, gain: 0.1 * g, sweepTo: 900 * p });
    S.modes(t, { f0: 700 * p, ratios: [1, 2.76], decays: [0.07, 0.04], amps: [1, 0.3], gain: 0.1 * g });
  },

  /** 铣：连续的高频切削 */
  ROUTER: (S, t, p, g) => {
    S.bandNoise(t, { f: 3000 * p, q: 1.4, dur: 0.26, gain: 0.075 * g, attack: 0.05, decayShape: 1.15 });
  },

  /** 木屑落下 */
  CHIP_FALL: (S, t, p, g) => {
    for (let i = 0; i < 3; i++) {
      S.bandNoise(t + i * 0.035 + Math.random() * 0.02, {
        f: (2600 + Math.random() * 1600) * p, q: 3.4, dur: 0.02, gain: 0.03 * g,
      });
    }
  },

  // ── 纸与装饰 ──────────────────────────────────────

  /** 纸：抚平、粘贴、展开，都是这一记 */
  PAPER: (S, t, p, g) => {
    S.bandNoise(t, {
      f: 4200 * p, q: 0.7, dur: 0.22, gain: 0.055 * g,
      sweepTo: 2400 * p, attack: 0.05, decayShape: 1.1,
    });
  },

  /** 笔锋走过纸面 */
  BRUSH: (S, t, p, g) => {
    S.bandNoise(t, {
      f: 3000 * p, q: 0.8, dur: 0.14, gain: 0.05 * g,
      sweepTo: 1500 * p, attack: 0.04, decayShape: 1.2,
    });
  },

  /** 结与流苏摆动 */
  KNOT_SWING: (S, t, p, g) => {
    S.bandNoise(t, {
      f: 1500 * p, q: 0.8, dur: 0.4, gain: 0.045 * g,
      sweepTo: 800 * p, attack: 0.12, decayShape: 1.1,
    });
  },

  // ── 火与光 ────────────────────────────────────────

  /** 点亮的那一下：一团气流被点着，不是「叮」 */
  LIGHT_BLOOM: (S, t, p, g) => {
    S.bandNoise(t, {
      f: 420 * p, q: 0.7, dur: 0.7, gain: 0.14 * g,
      sweepTo: 180 * p, attack: 0.04, decayShape: 1.2,
    });
    S.thump(t, { f: 70 * p, drop: 34, dur: 0.5, gain: 0.12 * g });
  },

  // ── 界面：只有三记 ────────────────────────────────

  /** 极轻的一点，用于选中 */
  UI_TAP: (S, t, p, g) => {
    S.modes(t, {
      f0: 1150 * p, ratios: [1, 2.76], decays: [0.045, 0.028],
      amps: [1, 0.25], gain: 0.075 * g,
    });
  },

  /** 做完一件事：两个音，暖，不喧宾夺主 */
  SUCCESS: (S, t, p, g) => {
    S.modes(t, { f0: 523 * p, ratios: [1, 2], decays: [0.3, 0.18], amps: [1, 0.24], gain: 0.1 * g });
    S.modes(t + 0.1, { f0: 784 * p, ratios: [1, 2], decays: [0.42, 0.24], amps: [1, 0.24], gain: 0.09 * g });
  },

  /** 快门 */
  SHUTTER: (S, t, p, g) => {
    S.bandNoise(t, { f: 3600 * p, q: 3.2, dur: 0.014, gain: 0.1 * g });
    S.bandNoise(t + 0.05, { f: 2600 * p, q: 3.2, dur: 0.02, gain: 0.08 * g });
  },
};

/**
 * 旧名字的去处。
 * 有物理来由的并到新音上；纯提示性的（各种「叮」「唰」「嗡」）一律静音 ——
 * 名字留在这里，是为了让人一眼看出它是被有意去掉的，而不是漏了。
 */
const ALIASES = {
  SNAP_LOCK_SOFT: ['SNAP_LOCK', 0.55],
  WEDGE_TIGHT: ['SNAP_LOCK', 1],
  FRAME_COMPLETE: ['WOOD_SETTLE', 1],
  LANTERN_PLACE: ['WOOD_TAP', 0.8],
  WOOD_SLIDE_LONG: ['WOOD_SLIDE', 1],
  WOOD_PICK: ['WOOD_TAP', 0.6],
  WOOD_FLIP: ['WOOD_TAP', 0.6],
  CHISEL_STRIKE: ['CHISEL', 1],
  CHISEL_STROKE: ['CHISEL', 1],
  SAW_CUT_SHORT: ['SAW', 1],
  SAW_CUT_LONG: ['SAW', 1],
  ROUTER_MILL: ['ROUTER', 1],
  ROUTER_LONG: ['ROUTER', 1],
  ROUTER_FINE: ['ROUTER', 0.7],
  PLANE_SHAVE: ['ROUTER', 0.6],
  PAPER_SMOOTH: ['PAPER', 1],
  PAPER_STICK: ['PAPER', 0.9],
  PAPER_UNROLL: ['PAPER', 1],
  BRUSH_STROKE: ['BRUSH', 1],
  TASSEL_SWAY: ['KNOT_SWING', 0.8],
  UI_TAP_WOOD: ['UI_TAP', 1],
  RIDDLE_CORRECT: ['SUCCESS', 1],
  SUCCESS_SOFT: ['SUCCESS', 0.8],
  SUCCESS_MID: ['SUCCESS', 1],
  SUCCESS_HIGH: ['SUCCESS', 1],
  ACHIEVEMENT_MID: ['SUCCESS', 1],
  ACHIEVEMENT_FULL: ['SUCCESS', 1],
};

/** 有意静音：名字留着，免得日后以为是漏了 */
const MUTED = new Set([
  'CHIME_WOOD', 'INK_DIP', 'RIDDLE_SOFT', 'STAMP', 'PORTAL_ENTER',
  'LIGHT_PIERCE', 'LIGHT_ABSORB', 'LIGHT_SOFT', 'LIGHT_RISE',
  'SHIMMER_WARM', 'SHIMMER_RISE', 'SHIMMER_SHORT',
  'SLICE_SOFT', 'LAYER_SEPARATE', 'TRANSFORM_WOOD', 'TIME_SCRUB', 'WOOD_SWOOSH',
  'UI_TICK', 'UI_TICK_OK', 'UI_SLIDE', 'UI_DRAW', 'UI_CARD', 'UI_CONFIRM',
  'UI_REJECT', 'UI_HINT', 'UI_ALERT_SOFT', 'UI_SWITCH_HARD', 'UI_APPEAR',
  'UI_HOVER_SOFT', 'UI_FLIP', 'UI_GROUP',
]);

// ── 循环音 ──
const LOOPS = {
  /** 引火：火苗声随进度渐强 */
  FLAME_IGNITE: (S, o = {}) => {
    const ctx = S.ctx, t = ctx.currentTime;
    const { out } = S._noise(t, o.dur ?? 2.0, 1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + (o.dur ?? 1.2));
    out.connect(lp).connect(g).connect(S.bus);
    return () => { try { g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12); } catch { /* 已停止 */ } };
  },

  /** 稳定燃烧：极轻，只在安静时才听得见 */
  FLAME_LOOP: (S) => {
    const ctx = S.ctx, t = ctx.currentTime;
    const { out, src } = S._noise(t, 3600, 1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 480;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.022, t + 0.5);
    // 缓慢的不规则扰动，周期约 1.8 s
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.55;
    const lg = ctx.createGain(); lg.gain.value = 0.01;
    lfo.connect(lg).connect(g.gain);
    lfo.start(t);
    out.connect(lp).connect(g).connect(S.bus);
    return () => {
      try {
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
        src.stop(ctx.currentTime + 1); lfo.stop(ctx.currentTime + 1);
      } catch { /* 已停止 */ }
    };
  },
};

export const SFX = new SFXEngine();

/** 首个用户手势时解锁音频（浏览器自动播放策略） */
export function unlockAudio() {
  const go = () => {
    SFX.ensure();
    removeEventListener('pointerdown', go);
    removeEventListener('keydown', go);
  };
  addEventListener('pointerdown', go, { once: false });
  addEventListener('keydown', go, { once: false });
}
