/**
 * §12.2 音效引擎 —— 实时模态合成
 *
 * 为什么不用音频文件：脚本本身要求音效是**参数化**的 ——
 *   · S02 后续 12 次装配复用 SFX_SNAP_IN
 *   · S20 第二记 SFX_SNAP_IN「音高高 2 个半音」
 *   · S13 十三次落料「音高随机 ±2 半音」
 *   · S25 四根立柱到位音「音高依次上行」
 *   · S15 走刀音「音高随刀数升高」
 * 固定采样做不到这些，实时合成天然做得到。
 *
 * 合成方法是物理导向的：敲击类声音 = 一个宽带瞬态 + 一组指数衰减的共振模态。
 * 木料模态阻尼大、余韵短（≤0.3 s）；铜磬模态非谐、余韵长（≥2 s）；
 * 锯/凿/铣是带通噪声加包络。这不是「像」，这就是这些声音的产生方式。
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

    // 供 BGM 做 sidechain 让位（M5 爆炸时 BGM 短暂 −4 dB）
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

  /** 带通滤过的噪声（凿、锯、铣、摩擦、烟花尾焰都用它） */
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
   * @param {string} id 音效编号（不含 SFX_ 前缀）
   * @param {object} o  { pitch: 半音偏移, gain, delay: 秒 }
   */
  play(id, o = {}) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + (o.delay || 0) + 0.001;
    const p = semi(o.pitch || 0);
    const g = o.gain ?? 1;
    const fn = RECIPES[id];
    if (!fn) { console.warn('[sfx] 未定义音效', id); return; }
    fn(this, t, p, g, o);
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

  /** M5：爆炸时让 BGM 短暂让位 −4 dB */
  duck(amount = 0.63, hold = 0.18) {
    if (!this.duckTarget || !this.ctx) return;
    const t = this.ctx.currentTime;
    const gp = this.duckTarget.gain;
    gp.cancelScheduledValues(t);
    gp.setTargetAtTime(this.duckBase * amount, t, 0.02);
    gp.setTargetAtTime(this.duckBase, t + hold, 0.18);
  }
}

// ══════════════════════════════════════════════════════════
// 配方表
// ══════════════════════════════════════════════════════════

const RECIPES = {
  // ★★★ 全片的听觉签名：木质、干脆、有一点点闷，余韵 ≤ 0.3 s
  SNAP_IN: (S, t, p, g) => {
    S.bandNoise(t, { f: 2600 * p, q: 1.1, dur: 0.014, gain: 0.30 * g, decayShape: 1.6 });
    S.modes(t, {
      f0: 760 * p, ratios: [1, 2.76, 5.4, 8.9], decays: [0.16, 0.1, 0.06, 0.04],
      amps: [1, 0.42, 0.2, 0.1], gain: 0.30 * g, detune: 0.01,
    });
    S.thump(t, { f: 170 * p, drop: 90, dur: 0.1, gain: 0.14 * g });
  },

  // ★★ 比 SNAP_IN 更沉、更「锁死」（S25 立柱到位）
  SNAP_LOCK: (S, t, p, g) => {
    S.bandNoise(t, { f: 1500 * p, q: 1.4, dur: 0.022, gain: 0.26 * g });
    S.modes(t, {
      f0: 430 * p, ratios: [1, 2.6, 4.9, 7.8], decays: [0.3, 0.2, 0.12, 0.07],
      amps: [1, 0.5, 0.24, 0.1], gain: 0.34 * g, detune: 0.012,
    });
    S.thump(t, { f: 128 * p, drop: 58, dur: 0.26, gain: 0.30 * g });
  },

  // S29 角花压落：SNAP_LOCK 的柔化版，形成呼应
  SNAP_LOCK_SOFT: (S, t, p, g) => RECIPES.SNAP_LOCK(S, t, p, g * 0.5),

  // ★★ S25 楔紧段：摩擦音「突然收紧」的一记
  WEDGE_TIGHT: (S, t, p, g) => {
    S.bandNoise(t, {
      f: 900 * p, q: 5.5, dur: 0.3, gain: 0.2 * g,
      sweepTo: 2600 * p, attack: 0.09, decayShape: 1.1,
    });
    S.bandNoise(t + 0.24, { f: 3200 * p, q: 2.2, dur: 0.05, gain: 0.16 * g });
  },

  // ★★★ S25 框架合龙：全片最重的一击。大鼓 + 铜磬长余韵 ≥ 2 s
  FRAME_COMPLETE: (S, t, p, g) => {
    S.thump(t, { f: 68 * p, drop: 32, dur: 1.1, gain: 0.62 * g });
    S.bandNoise(t, { f: 1800, q: 0.8, dur: 0.05, gain: 0.3 * g });
    // 铜磬：非谐模态，长余韵
    S.modes(t + 0.02, {
      f0: 392 * p, ratios: [1, 2.41, 3.83, 5.17, 7.02, 9.6],
      decays: [2.6, 2.1, 1.7, 1.3, 0.9, 0.6],
      amps: [1, 0.62, 0.44, 0.3, 0.18, 0.1], gain: 0.26 * g, detune: 0.004,
    });
  },

  // ★★★ M1 点亮瞬间：温暖的泛音爆发 + 长余韵 2 s，不刺耳
  LIGHT_BLOOM: (S, t, p, g) => {
    S.modes(t, {
      f0: 261.6 * p, ratios: [1, 1.5, 2, 3, 4, 5, 6],
      decays: [2.2, 2.0, 1.8, 1.5, 1.1, 0.8, 0.5],
      amps: [1, 0.5, 0.6, 0.3, 0.2, 0.12, 0.07], gain: 0.2 * g, detune: 0.003,
    });
    S.bandNoise(t, { f: 900, q: 0.7, dur: 0.5, gain: 0.09 * g, attack: 0.12, decayShape: 1.6 });
  },

  // ★★ M5 烟花爆炸（5 变体）—— 须支持 0.25 s 延迟播放
  FIREWORK_BURST: (S, t, p, g, o) => {
    const v = o.variant || 0;
    const f = [420, 300, 560, 380, 240][v % 5];
    S.thump(t, { f: f * 0.24 * p, drop: 34, dur: 0.5 + v * 0.06, gain: 0.5 * g });
    S.bandNoise(t, {
      f: f * p, q: 0.55, dur: 0.34 + v * 0.05, gain: 0.42 * g,
      sweepTo: 130, attack: 0.006, decayShape: 1.5,
    });
    S.bandNoise(t + 0.02, { f: 3400, q: 0.6, dur: 0.16, gain: 0.2 * g, sweepTo: 800 });
    S.duck();
  },
  FIREWORK_FU: (S, t, p, g) => {
    RECIPES.FIREWORK_BURST(S, t, p * 0.72, g * 1.15, { variant: 4 });
    S.modes(t + 0.05, {
      f0: 330 * p, ratios: [1, 2.41, 3.83, 5.17], decays: [2.4, 1.9, 1.4, 1.0],
      amps: [1, 0.6, 0.4, 0.25], gain: 0.2 * g,
    });
  },
  FIREWORK_LAUNCH: (S, t, p, g) => {
    S.bandNoise(t, {
      f: 380 * p, q: 3.2, dur: 0.7, gain: 0.16 * g,
      sweepTo: 2400 * p, attack: 0.05, decayShape: 1.05,
    });
  },
  FIREWORK_CRACKLE: (S, t, p, g) => {
    for (let i = 0; i < 16; i++) {
      S.bandNoise(t + Math.random() * 1.4, {
        f: (2600 + Math.random() * 3200) * p, q: 7, dur: 0.02,
        gain: 0.07 * g * (1 - i / 20),
      });
    }
  },

  // ── 加工 ──
  CHISEL_STRIKE: (S, t, p, g, o) => {
    S.bandNoise(t, { f: 2100 * p, q: 1.6, dur: 0.03, gain: 0.26 * g });
    S.modes(t, {
      f0: 620 * p, ratios: [1, 2.9, 5.1], decays: [0.11, 0.07, 0.04],
      amps: [1, 0.4, 0.18], gain: 0.22 * g,
    });
    // 第三记「凿穿」：带透空余韵，与前两记明确不同
    if (o.through) {
      S.modes(t + 0.03, {
        f0: 1560 * p, ratios: [1, 2.02, 3.1], decays: [0.55, 0.4, 0.28],
        amps: [1, 0.5, 0.25], gain: 0.14 * g,
      });
    }
  },
  CHISEL_STROKE: (S, t, p, g) => {
    S.bandNoise(t, {
      f: 1500 * p, q: 2.0, dur: 0.28, gain: 0.2 * g,
      sweepTo: 800 * p, attack: 0.05, decayShape: 1.15,
    });
  },
  SAW_CUT_SHORT: (S, t, p, g) => {
    for (let i = 0; i < 5; i++) {
      S.bandNoise(t + i * 0.055, {
        f: (1700 + i * 120) * p, q: 1.6, dur: 0.05, gain: 0.15 * g, attack: 0.012,
      });
    }
  },
  SAW_CUT_LONG: (S, t, p, g) => {
    for (let i = 0; i < 11; i++) {
      S.bandNoise(t + i * 0.062, {
        f: (1500 + i * 90) * p, q: 1.7, dur: 0.055, gain: 0.14 * g, attack: 0.014,
      });
    }
    // 末尾断裂脆响
    S.bandNoise(t + 0.72, { f: 3000 * p, q: 1.0, dur: 0.03, gain: 0.24 * g });
    S.modes(t + 0.72, { f0: 900 * p, ratios: [1, 2.7], decays: [0.12, 0.07], amps: [1, 0.4], gain: 0.16 * g });
  },
  ROUTER_MILL: (S, t, p, g) => {
    S.bandNoise(t, {
      f: 2400 * p, q: 3.0, dur: 0.36, gain: 0.16 * g, attack: 0.03, decayShape: 1.1,
    });
    S.bandNoise(t, { f: 620 * p, q: 2.0, dur: 0.36, gain: 0.09 * g, attack: 0.03, decayShape: 1.1 });
  },
  ROUTER_LONG: (S, t, p, g) => {
    S.bandNoise(t, {
      f: 2200 * p, q: 3.2, dur: 0.9, gain: 0.15 * g, attack: 0.06, decayShape: 1.05,
    });
  },
  ROUTER_FINE: (S, t, p, g) => {
    S.bandNoise(t, { f: 4200 * p, q: 5.0, dur: 0.14, gain: 0.11 * g, attack: 0.02 });
  },
  CHIP_FALL: (S, t, p, g) => {
    for (let i = 0; i < 5; i++) {
      S.bandNoise(t + Math.random() * 0.35, {
        f: (900 + Math.random() * 1800) * p, q: 4, dur: 0.02, gain: 0.05 * g,
      });
    }
  },

  // ── 木料 ──
  WOOD_DROP: (S, t, p, g) => {
    S.bandNoise(t, { f: 1400 * p, q: 1.3, dur: 0.02, gain: 0.16 * g });
    S.modes(t, {
      f0: 340 * p, ratios: [1, 2.76, 5.4], decays: [0.12, 0.08, 0.05],
      amps: [1, 0.35, 0.15], gain: 0.2 * g, detune: 0.02,
    });
  },
  WOOD_PICK: (S, t, p, g) => {
    S.bandNoise(t, { f: 3000 * p, q: 2.2, dur: 0.02, gain: 0.11 * g });
    S.modes(t, { f0: 980 * p, ratios: [1, 2.8], decays: [0.07, 0.04], amps: [1, 0.3], gain: 0.12 * g });
  },
  WOOD_TAP: (S, t, p, g) => {
    S.modes(t, { f0: 880 * p, ratios: [1, 2.76, 5.4], decays: [0.09, 0.05, 0.03], amps: [1, 0.4, 0.2], gain: 0.17 * g });
  },
  WOOD_SETTLE: (S, t, p, g) => {
    S.thump(t, { f: 110 * p, drop: 52, dur: 0.3, gain: 0.28 * g });
    S.bandNoise(t, { f: 700 * p, q: 1.6, dur: 0.09, gain: 0.09 * g, attack: 0.02 });
  },
  WOOD_SLIDE: (S, t, p, g, o) => {
    S.bandNoise(t, {
      f: 1100 * p, q: 2.6, dur: o.dur ?? 0.2, gain: 0.1 * g,
      sweepTo: 1700 * p, attack: 0.04, decayShape: 1.1,
    });
  },
  WOOD_SLIDE_LONG: (S, t, p, g) => RECIPES.WOOD_SLIDE(S, t, p, g, { dur: 0.55 }),
  WOOD_FLIP: (S, t, p, g) => {
    S.bandNoise(t, { f: 800 * p, q: 1.8, dur: 0.12, gain: 0.1 * g, sweepTo: 400 * p, attack: 0.03 });
    S.modes(t + 0.12, { f0: 420 * p, ratios: [1, 2.7], decays: [0.1, 0.06], amps: [1, 0.35], gain: 0.14 * g });
  },
  PANEL_SEAT: (S, t, p, g) => {
    S.bandNoise(t, { f: 2200 * p, q: 1.5, dur: 0.012, gain: 0.14 * g });
    S.modes(t, { f0: 640 * p, ratios: [1, 2.76, 5.4], decays: [0.1, 0.06, 0.04], amps: [1, 0.36, 0.16], gain: 0.19 * g });
  },
  WOOD_SWOOSH: (S, t, p, g) => {
    S.bandNoise(t, { f: 500 * p, q: 1.1, dur: 0.3, gain: 0.1 * g, sweepTo: 2200 * p, attack: 0.1, decayShape: 1.1 });
  },

  // ── 纸 / 丝 ──
  PAPER_SMOOTH: (S, t, p, g) => {
    S.bandNoise(t, { f: 5200 * p, q: 0.9, dur: 0.42, gain: 0.075 * g, attack: 0.1, decayShape: 1.1, sweepTo: 2600 });
  },
  PAPER_STICK: (S, t, p, g) => {
    S.bandNoise(t, { f: 3400 * p, q: 1.3, dur: 0.2, gain: 0.09 * g, attack: 0.04 });
  },
  PAPER_UNROLL: (S, t, p, g) => {
    for (let i = 0; i < 7; i++) {
      S.bandNoise(t + i * 0.07, { f: (3600 + Math.random() * 2400) * p, q: 1.6, dur: 0.07, gain: 0.055 * g, attack: 0.02 });
    }
  },
  KNOT_SWING: (S, t, p, g) => {
    S.bandNoise(t, { f: 2400 * p, q: 3.4, dur: 0.3, gain: 0.05 * g, attack: 0.09, sweepTo: 1400 });
  },
  TASSEL_SWAY: (S, t, p, g) => RECIPES.KNOT_SWING(S, t, p * 0.8, g * 0.8),
  BRUSH_STROKE: (S, t, p, g) => {
    const v = 0.85 + Math.random() * 0.3;
    S.bandNoise(t, {
      f: 2800 * p * v, q: 1.5, dur: 0.16 + Math.random() * 0.1, gain: 0.09 * g,
      attack: 0.02, sweepTo: 1300 * p, decayShape: 1.2,
    });
  },
  INK_DIP: (S, t, p, g) => {
    S.bandNoise(t, { f: 1200 * p, q: 4.0, dur: 0.14, gain: 0.07 * g, attack: 0.03, sweepTo: 600 });
  },

  // ── 光 / 磬 / 铃 ──
  CHIME_WOOD: (S, t, p, g) => {
    S.modes(t, {
      f0: 1320 * p, ratios: [1, 2.02, 3.05, 4.2], decays: [0.7, 0.5, 0.35, 0.22],
      amps: [1, 0.45, 0.22, 0.1], gain: 0.14 * g,
    });
  },
  LIGHT_PIERCE: (S, t, p, g) => {
    S.modes(t, {
      f0: 1760 * p, ratios: [1, 2.0, 3.01, 4.02], decays: [0.85, 0.6, 0.4, 0.25],
      amps: [1, 0.4, 0.2, 0.1], gain: 0.13 * g,
    });
    S.bandNoise(t, { f: 6000, q: 1.2, dur: 0.06, gain: 0.06 * g });
  },
  SHIMMER_WARM: (S, t, p, g) => {
    for (let i = 0; i < 5; i++) {
      S.modes(t + i * 0.045, {
        f0: 660 * p * semi(i * 4), ratios: [1, 2], decays: [0.7, 0.45], amps: [1, 0.3], gain: 0.07 * g,
      });
    }
  },
  SHIMMER_RISE: (S, t, p, g) => {
    for (let i = 0; i < 8; i++) {
      S.modes(t + i * 0.07, {
        f0: 440 * p * semi(i * 3), ratios: [1, 2.01], decays: [0.9, 0.6], amps: [1, 0.28], gain: 0.06 * g,
      });
    }
  },
  SHIMMER_SHORT: (S, t, p, g) => {
    S.modes(t, { f0: 1980 * p, ratios: [1, 2.01, 3.2], decays: [0.4, 0.28, 0.18], amps: [1, 0.4, 0.2], gain: 0.09 * g });
  },
  LIGHT_ABSORB: (S, t, p, g) => {
    S.bandNoise(t, { f: 3000 * p, q: 4, dur: 0.5, gain: 0.07 * g, attack: 0.04, sweepTo: 700, decayShape: 1.1 });
    S.modes(t + 0.4, { f0: 880 * p, ratios: [1, 2], decays: [0.5, 0.3], amps: [1, 0.3], gain: 0.08 * g });
  },
  LIGHT_SOFT: (S, t, p, g) => {
    S.bandNoise(t, { f: 1800 * p, q: 2.0, dur: 0.1, gain: 0.05 * g, attack: 0.035 });
  },
  LIGHT_RISE: (S, t, p, g) => {
    for (let i = 0; i < 6; i++) {
      S.modes(t + i * 0.09, { f0: 523 * p * semi(i * 2), ratios: [1], decays: [1.0], amps: [1], gain: 0.05 * g });
    }
  },

  // ── UI ──
  UI_TAP: (S, t, p, g) => {
    S.modes(t, { f0: 1180 * p, ratios: [1, 3.2], decays: [0.05, 0.03], amps: [1, 0.3], gain: 0.1 * g });
  },
  UI_TAP_WOOD: (S, t, p, g) => RECIPES.WOOD_TAP(S, t, p * 1.2, g * 0.7),
  UI_TICK: (S, t, p, g) => {
    S.modes(t, { f0: 2100 * p, ratios: [1], decays: [0.035], amps: [1], gain: 0.07 * g });
  },
  UI_TICK_OK: (S, t, p, g) => {
    S.modes(t, { f0: 1568 * p, ratios: [1], decays: [0.08], amps: [1], gain: 0.09 * g });
    S.modes(t + 0.06, { f0: 2093 * p, ratios: [1], decays: [0.12], amps: [1], gain: 0.08 * g });
  },
  UI_SLIDE: (S, t, p, g) => {
    S.bandNoise(t, { f: 4200 * p, q: 1.2, dur: 0.1, gain: 0.045 * g, attack: 0.02, sweepTo: 2200 });
  },
  UI_DRAW: (S, t, p, g) => {
    S.bandNoise(t, { f: 5600 * p, q: 1.0, dur: 0.22, gain: 0.035 * g, attack: 0.06, decayShape: 1.15 });
  },
  UI_CARD: (S, t, p, g) => {
    S.bandNoise(t, { f: 2600 * p, q: 1.4, dur: 0.09, gain: 0.06 * g, attack: 0.02, sweepTo: 1400 });
  },
  UI_CONFIRM: (S, t, p, g) => {
    S.modes(t, { f0: 880 * p, ratios: [1, 1.5], decays: [0.16, 0.12], amps: [1, 0.4], gain: 0.11 * g });
    S.modes(t + 0.07, { f0: 1318 * p, ratios: [1, 1.5], decays: [0.24, 0.16], amps: [1, 0.35], gain: 0.1 * g });
  },
  UI_REJECT: (S, t, p, g) => {
    // 低沉短促木闷响，刻意不刺耳
    S.modes(t, { f0: 210 * p, ratios: [1, 2.3], decays: [0.14, 0.09], amps: [1, 0.3], gain: 0.16 * g });
    S.bandNoise(t, { f: 420 * p, q: 2.4, dur: 0.05, gain: 0.09 * g });
  },
  UI_HINT: (S, t, p, g) => {
    S.modes(t, { f0: 2640 * p, ratios: [1], decays: [0.09], amps: [1], gain: 0.045 * g });
  },
  UI_ALERT_SOFT: (S, t, p, g) => {
    // 一记短促木鱼，非刺耳警报
    S.bandNoise(t, { f: 1100 * p, q: 3.0, dur: 0.03, gain: 0.18 * g });
    S.modes(t, { f0: 430 * p, ratios: [1, 3.1], decays: [0.13, 0.07], amps: [1, 0.3], gain: 0.16 * g });
  },
  UI_SWITCH_HARD: (S, t, p, g) => {
    S.bandNoise(t, { f: 1700 * p, q: 1.2, dur: 0.03, gain: 0.16 * g });
    S.modes(t, { f0: 560 * p, ratios: [1, 2.6], decays: [0.09, 0.05], amps: [1, 0.35], gain: 0.14 * g });
  },
  UI_APPEAR: (S, t, p, g) => {
    S.modes(t, { f0: 1046 * p, ratios: [1, 2], decays: [0.3, 0.2], amps: [1, 0.3], gain: 0.07 * g });
  },
  UI_HOVER_SOFT: (S, t, p, g) => {
    S.modes(t, { f0: 1760 * p, ratios: [1], decays: [0.05], amps: [1], gain: 0.035 * g });
  },
  UI_FLIP: (S, t, p, g) => {
    S.bandNoise(t, { f: 3000 * p, q: 1.6, dur: 0.07, gain: 0.07 * g, attack: 0.015, sweepTo: 1500 });
  },
  UI_GROUP: (S, t, p, g) => {
    S.modes(t, { f0: 700 * p, ratios: [1, 1.5, 2], decays: [0.2, 0.16, 0.12], amps: [1, 0.4, 0.25], gain: 0.08 * g });
  },
  PORTAL_ENTER: (S, t, p, g) => {
    S.bandNoise(t, { f: 400 * p, q: 1.0, dur: 0.5, gain: 0.12 * g, attack: 0.1, sweepTo: 3600, decayShape: 1.1 });
    S.modes(t + 0.16, { f0: 660 * p, ratios: [1, 1.5, 2], decays: [0.9, 0.7, 0.5], amps: [1, 0.4, 0.25], gain: 0.1 * g });
  },
  STAMP: (S, t, p, g) => {
    S.thump(t, { f: 150 * p, drop: 70, dur: 0.14, gain: 0.3 * g });
    S.bandNoise(t, { f: 900 * p, q: 1.1, dur: 0.05, gain: 0.16 * g });
  },
  SHUTTER: (S, t, p, g) => {
    S.bandNoise(t, { f: 3600 * p, q: 1.0, dur: 0.02, gain: 0.2 * g });
    S.bandNoise(t + 0.05, { f: 2400 * p, q: 1.2, dur: 0.02, gain: 0.14 * g });
  },
  TIME_SCRUB: (S, t, p, g) => {
    for (let i = 0; i < 14; i++) {
      S.modes(t + i * 0.055, { f0: 1400 * p * semi(-i * 0.7), ratios: [1], decays: [0.05], amps: [1], gain: 0.035 * g });
    }
  },
  TRANSFORM_WOOD: (S, t, p, g) => {
    S.bandNoise(t, { f: 700 * p, q: 1.4, dur: 0.9, gain: 0.11 * g, attack: 0.2, sweepTo: 4200, decayShape: 1.05 });
    S.modes(t + 0.6, { f0: 880 * p, ratios: [1, 1.5, 2], decays: [1.0, 0.8, 0.6], amps: [1, 0.4, 0.25], gain: 0.09 * g });
  },
  SLICE_SOFT: (S, t, p, g) => {
    S.bandNoise(t, { f: 5000 * p, q: 2.2, dur: 0.3, gain: 0.06 * g, attack: 0.05, sweepTo: 1800, decayShape: 1.1 });
  },
  LAYER_SEPARATE: (S, t, p, g) => {
    S.bandNoise(t, { f: 240 * p, q: 1.8, dur: 0.5, gain: 0.11 * g, attack: 0.12, sweepTo: 700, decayShape: 1.1 });
  },
  PLANE_SHAVE: (S, t, p, g) => {
    S.bandNoise(t, { f: 2400 * p, q: 1.3, dur: 0.6, gain: 0.11 * g, attack: 0.12, sweepTo: 900, decayShape: 1.1 });
  },
  LANTERN_PLACE: (S, t, p, g) => {
    RECIPES.WOOD_TAP(S, t, p * 0.9, g);
    RECIPES.CHIME_WOOD(S, t + 0.04, p * 1.3, g * 0.5);
  },

  // ── 成功音（三档）──
  SUCCESS_SOFT: (S, t, p, g) => {
    [0, 4, 7].forEach((n, i) => S.modes(t + i * 0.075, {
      f0: 880 * p * semi(n), ratios: [1, 2.01], decays: [0.34, 0.2], amps: [1, 0.28], gain: 0.08 * g,
    }));
  },
  SUCCESS_MID: (S, t, p, g) => {
    [0, 4, 7, 12].forEach((n, i) => S.modes(t + i * 0.08, {
      f0: 880 * p * semi(n), ratios: [1, 2.01, 3.02], decays: [0.42, 0.3, 0.2], amps: [1, 0.35, 0.16], gain: 0.09 * g,
    }));
  },
  SUCCESS_HIGH: (S, t, p, g) => {
    [0, 4, 7, 12, 16].forEach((n, i) => S.modes(t + i * 0.075, {
      f0: 880 * p * semi(n), ratios: [1, 2.01, 3.02], decays: [0.5, 0.34, 0.22], amps: [1, 0.38, 0.18], gain: 0.09 * g,
    }));
    // 一记铜磬余韵
    S.modes(t + 0.4, {
      f0: 523 * p, ratios: [1, 2.41, 3.83, 5.17], decays: [2.2, 1.7, 1.3, 0.9],
      amps: [1, 0.5, 0.3, 0.18], gain: 0.14 * g,
    });
  },
  ACHIEVEMENT_MID: (S, t, p, g) => RECIPES.SUCCESS_MID(S, t, p, g),
  ACHIEVEMENT_FULL: (S, t, p, g) => {
    RECIPES.SUCCESS_HIGH(S, t, p, g);
    S.thump(t, { f: 82 * p, drop: 40, dur: 0.8, gain: 0.35 * g });
  },

  // ── M2 灯谜（★答错绝不使用任何下行/失败音型）──
  RIDDLE_CORRECT: (S, t, p, g) => {
    S.modes(t, {
      f0: 1046 * p, ratios: [1, 2.41, 3.83], decays: [1.4, 1.0, 0.7],
      amps: [1, 0.45, 0.25], gain: 0.13 * g,
    });
    for (let i = 0; i < 6; i++) {
      S.modes(t + 0.12 + i * 0.05, { f0: 660 * p * semi(i * 2.5), ratios: [1], decays: [0.3], amps: [1], gain: 0.045 * g });
    }
  },
  RIDDLE_SOFT: (S, t, p, g) => {
    // 一记温和木鱼，同音高、无下行
    S.bandNoise(t, { f: 900 * p, q: 3.2, dur: 0.028, gain: 0.11 * g });
    S.modes(t, { f0: 392 * p, ratios: [1, 3.0], decays: [0.16, 0.09], amps: [1, 0.28], gain: 0.11 * g });
  },
};

// ── 循环音 ──
const LOOPS = {
  /** M1 引火：火苗声随进度渐强（1.2 s） */
  FLAME_IGNITE: (S, o = {}) => {
    const ctx = S.ctx, t = ctx.currentTime;
    const { out } = S._noise(t, o.dur ?? 2.0, 1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + (o.dur ?? 1.2));
    out.connect(lp).connect(g).connect(S.bus);
    return () => { try { g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12); } catch { /* 已停止 */ } };
  },
  /** M1 稳定燃烧（极轻，−18 dB） */
  FLAME_LOOP: (S) => {
    const ctx = S.ctx, t = ctx.currentTime;
    const { out, src } = S._noise(t, 3600, 1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 480;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.026, t + 0.5);
    // 缓慢的不规则扰动，周期 1.8 s
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.55;
    const lg = ctx.createGain(); lg.gain.value = 0.012;
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
  /** M4 平面扫描提示音 */
  AR_SCAN: (S) => {
    const ctx = S.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 1200;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.8;
    const lg = ctx.createGain(); lg.gain.value = 0.014;
    lfo.connect(lg).connect(g.gain);
    osc.connect(g).connect(S.bus);
    osc.start(t); lfo.start(t);
    return () => { try { osc.stop(); lfo.stop(); } catch { /* 已停止 */ } };
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
