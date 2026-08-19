/**
 * 音效引擎 —— 实时物理导向合成
 *
 * 不用音频文件，是因为这里的声音需要可参数化：同一记咬合音要能升高两个半音，
 * 十三次落料要能随机浮动，四根立柱到位要依次上行。固定采样做不到。
 *
 * 合成分四类基元，每一类都对应一种真实的发声方式：
 *   击励共振 strike —— 一记宽带冲击打进一组高 Q 带通滤波器，滤波器自己振铃衰减。
 *     这就是敲木头：敲的那一下是冲击，「木头味」是料在响。比直接播正弦簇多出
 *     相位起伏与非稳态泛音 —— 正弦簇听起来是电子琴，振铃听起来是木头。
 *   拨弦 pluck —— Karplus-Strong 弦模型离线渲进缓冲。给「成了」这类时刻
 *     一记古琴式的余韵，而不是门铃的两声正弦。
 *   颗粒 crackle —— 一撮微小冲击散布在几十毫秒里：木纤维断裂、纸的窸窣、火星。
 *   气流 whoosh —— 带通噪声扫频加包络：锯、刨、纸、火焰的连续成分。
 *
 * 所有事件过同一个小空间（生成的短混响）再进限幅总线 ——
 * 干信号直出的合成音是「贴在耳朵上的电子声」，过一间小房间才落到桌面上。
 *
 * 声音只有三类来源：木头、纸、火。界面本身几乎不出声 ——
 * 一屏一记提示音已经足够，多了就成了噪音。
 */

/** 半音 → 频率倍率（基频由每个音自己给，这里只出倍率） */
export const semi = (n) => Math.pow(2, n / 12);

/** 切后台停掉、回来要接着放的环境音。其余循环都跟着手势走，停了就算 */
const AMBIENT_LOOPS = new Set(['FLAME_LOOP']);

/**
 * 木条的弯曲模态比（自由-自由梁 1 : 2.76 : 5.40 : 8.93）。
 * 全片的「木头味」都从这一组比值来，各音只挑基频、衰减与配比。
 */
const BAR = [1, 2.76, 5.40, 8.93];

/** 每次敲击的随机活口：音高 ±1.2%、幅度 ±18% —— 连击不像机器 */
const jitterF = () => 1 + (Math.random() - 0.5) * 0.024;
const jitterA = () => 1 + (Math.random() - 0.5) * 0.36;
const rndPan = (w = 0.22) => (Math.random() - 0.5) * w;

export class SFXEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.masterGain = null;
    this.noiseBuf = null;
    this._loops = new Map();
    this._plucks = new Map();
  }

  /** 首次用户手势后才能创建 AudioContext */
  ensure() {
    if (this.ctx) {
      // OfflineAudioContext（试听渲染）没有 resume，rejection 静默掉
      if (this.ctx.state === 'suspended') this.ctx.resume?.()?.catch?.(() => {});
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this._setup(new AC());
    return this.ctx;
  }

  /**
   * 在给定上下文上搭总线。单独一个方法，是让试听工具能把整套配方
   * 渲进 OfflineAudioContext 里量化检查（tools 与 .shots 的探针用）。
   */
  _setup(ctx) {
    this.ctx = ctx;

    // 主总线：限幅 + 总音量。密集敲击时不糊成一团
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;
    // 高频削一档：合成噪声的 6 kHz 以上只剩「电」，木头和纸都不在那儿
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 6200;
    shelf.gain.value = -4;
    const master = ctx.createGain();
    master.gain.value = 0.85;
    comp.connect(shelf).connect(master).connect(ctx.destination);
    this.bus = comp;
    this.masterGain = master;

    // 一间小房间：0.35 s 的生成混响，湿量极低 —— 只为让声音「落在桌上」
    const sr = ctx.sampleRate;
    const irN = Math.floor(sr * 0.35);
    const ir = ctx.createBuffer(2, irN, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irN; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.exp(-6.9 * (i / irN) / 0.9);
      }
    }
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    const verbLp = ctx.createBiquadFilter();
    verbLp.type = 'lowpass';
    verbLp.frequency.value = 3600;
    verb.connect(verbLp).connect(comp);
    this.verb = verb;

    // 白噪声缓冲（2 s，循环取用）
    const n = sr * 2;
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(v ? 0.85 : 0, this.ctx.currentTime, 0.05);
    }
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  // ── 基元 ──────────────────────────────────────────

  /** 事件的出口：定位 + 干湿两路。同一记声音的各层传同一个 out，声像才不散 */
  _mix(pan = 0, wet = 0.14) {
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    p.connect(this.bus);
    if (this.verb && wet > 0) {
      const w = this.ctx.createGain();
      w.gain.value = wet;
      p.connect(w).connect(this.verb);
    }
    return g;
  }

  /** 噪声源。停在包络之后，不许截掉自己的尾巴 */
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
    src.stop(t + dur + 0.12);
    return { src, out: g };
  }

  /**
   * 击励共振：一记短冲击打进一组高 Q 带通，各模态自己振铃到无声。
   * 衰减时间决定 Q（T60 ≈ 6.9·Q / (π·f)），不另做包络 —— 料自己会停。
   * @param {object} o f0 基频；decays 各模态 T60（秒）；amps 配比
   */
  strike(t, {
    f0 = 900, ratios = BAR, decays = [0.16, 0.09, 0.055, 0.035],
    amps = [1, 0.45, 0.2, 0.09], gain = 0.25, pan = 0, wet = 0.14,
    click = 0.35, body = 1,
  } = {}) {
    const ctx = this.ctx;
    const out = this._mix(pan, wet);
    out.gain.value = gain;
    // 冲击本体：3 ms 噪声，一半直接漏出去当「接触感」，一半去打共振
    const { out: imp } = this._noise(t, 0.004, 1);
    const ig = ctx.createGain();
    ig.gain.setValueAtTime(1, t);
    ig.gain.exponentialRampToValueAtTime(0.0008, t + 0.004);
    imp.connect(ig);
    if (click > 0) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1800;
      const cg = ctx.createGain();
      cg.gain.value = click * 0.5;
      ig.connect(hp).connect(cg).connect(out);
    }
    ratios.forEach((r, i) => {
      const f = f0 * r * jitterF();
      if (f > 9000) return;
      const dec = (decays[i] ?? decays[decays.length - 1]);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = Math.max(8, (dec * Math.PI * f) / 6.9);
      const mg = ctx.createGain();
      mg.gain.value = (amps[i] ?? 0.2) * body * 2.4 * jitterA();
      ig.connect(bp).connect(mg).connect(out);
    });
  }

  /** 低频冲击（落台、坐实、沉降的「身体感」） */
  thump(t, { f = 92, drop = 40, dur = 0.42, gain = 0.5, pan = 0 } = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, drop), t + dur * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    const out = this._mix(pan, 0.08);
    osc.connect(g).connect(out);
    osc.start(t); osc.stop(t + dur + 0.1);
  }

  /**
   * 带通气流：锯、刨、纸、火焰的连续成分。
   * am 给一个频率就叠上颗粒感（锯齿的「齿」、刨花的「卷」）。
   */
  whoosh(t, {
    f = 1200, q = 2.4, dur = 0.12, gain = 0.3,
    attack = 0.004, sweepTo = null, type = 'bandpass', release = null,
    am = 0, amDepth = 0.5, pan = 0, wet = 0.1,
  } = {}) {
    const ctx = this.ctx;
    const rel = release ?? dur * 1.2;
    const { out } = this._noise(t, rel + 0.1, 1);
    const bp = ctx.createBiquadFilter();
    bp.type = type;
    bp.frequency.setValueAtTime(f, t);
    bp.Q.value = q;
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + rel);
    g.gain.linearRampToValueAtTime(0, t + rel + 0.02);
    let head = out.connect(bp);
    if (am > 0) {
      // 颗粒：低频振荡去咬增益，深度压在中段 —— 全深会变成蜂鸣
      const amG = ctx.createGain();
      amG.gain.value = 1 - amDepth * 0.5;
      const lfo = ctx.createOscillator();
      lfo.type = 'triangle';
      lfo.frequency.value = am * (1 + (Math.random() - 0.5) * 0.2);
      const lg = ctx.createGain();
      lg.gain.value = amDepth * 0.5;
      lfo.connect(lg).connect(amG.gain);
      lfo.start(t); lfo.stop(t + rel + 0.1);
      head = head.connect(amG);
    }
    const mix = this._mix(pan, wet);
    head.connect(g).connect(mix);
    return g;
  }

  /** 颗粒簇：几十毫秒里的一撮微小冲击（纤维断裂、纸窸窣、火星） */
  crackle(t, {
    n = 5, spread = 0.06, f = 3200, fSpread = 1600, gain = 0.05,
    dense = 2.2, pan = 0, wide = 0, wet = 0.1,
  } = {}) {
    for (let i = 0; i < n; i++) {
      // 前密后疏 —— 断裂都发生在受力那一下
      const at = t + Math.pow(Math.random(), dense) * spread;
      const fq = f + (Math.random() - 0.5) * fSpread;
      this.whoosh(at, {
        f: fq, q: 5 + Math.random() * 4, dur: 0.008 + Math.random() * 0.01,
        gain: gain * (0.5 + Math.random() * 0.8),
        pan: pan + rndPan(wide), wet,
      });
    }
  }

  /**
   * 拨弦（Karplus-Strong），离线渲进缓冲后按需变速取用。
   * 「成了」的余韵：一根被拨响的弦，短促、温和，绝不是门铃。
   */
  _pluckBuf(f, damp = 0.994) {
    const key = `${Math.round(f)}:${damp}`;
    let buf = this._plucks.get(key);
    if (buf) return buf;
    const sr = this.ctx.sampleRate;
    const N = Math.max(2, Math.round(sr / f));
    const len = Math.floor(sr * 1.6);
    buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    // 激励用低通过的噪声 —— 全带宽激励是钢丝，闷一点是丝弦
    let prev = 0;
    for (let i = 0; i < N; i++) {
      const w = Math.random() * 2 - 1;
      d[i] = prev = 0.55 * w + 0.45 * prev;
    }
    // i = N 时 i-N-1 是 -1 —— 越界读出 undefined，一粒 NaN 会顺着总线
    // 毒翻整段渲染（压缩器之后全静音），首样本单独兜住
    for (let i = N; i < len; i++) {
      const b = i - N - 1 >= 0 ? d[i - N - 1] : d[0];
      d[i] = damp * 0.5 * (d[i - N] + b);
    }
    this._plucks.set(key, buf);
    return buf;
  }

  pluck(t, { f = 440, gain = 0.2, dur = 1.4, pan = 0, wet = 0.22 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._pluckBuf(880, 0.9945);
    src.playbackRate.value = f / 880;      // 一份缓冲，全音域取用
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.setValueAtTime(gain, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const out = this._mix(pan, wet);
    src.connect(g).connect(out);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // ── 播放入口 ──────────────────────────────────────

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

  /** 循环音（引火、火焰），返回停止函数 */
  loop(id, o = {}) {
    const ctx = this.ensure();
    if (!ctx || !this.enabled) return () => {};
    const fn = LOOPS[id];
    if (!fn) return () => {};
    this.stopLoop(id);
    const stop = fn(this, o);
    this._loops.set(id, { stop, o });
    return () => { stop(); this._loops.delete(id); };
  }

  stopLoop(id) {
    const r = this._loops.get(id);
    if (r) { r.stop(); this._loops.delete(id); }
  }

  /**
   * 切后台：循环音全停。
   *
   * 回来时只把**环境音**接上（点亮之后那一团火，它本该一直烧着）；
   * 引火那一记是跟着手指走的，人早松手了，接回来就成了一段停不下来的噪音。
   */
  suspendLoops() {
    this._held = [...this._loops.entries()].filter(([id]) => AMBIENT_LOOPS.has(id));
    for (const [, r] of this._loops) r.stop();
    this._loops.clear();
  }

  resumeLoops() {
    const held = this._held || [];
    this._held = null;
    for (const [id, r] of held) this.loop(id, r.o);
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
    const pan = rndPan();
    S.strike(t, {
      f0: 640 * p, decays: [0.14, 0.08, 0.05, 0.03],
      amps: [1, 0.5, 0.22, 0.1], gain: 0.36 * g, pan, click: 0.5,
    });
    S.thump(t, { f: 150 * p, drop: 78, dur: 0.1, gain: 0.17 * g, pan });
  },

  /** 楔紧锁死：比 SNAP_IN 更闷、更沉，听得出「推到底了」 */
  SNAP_LOCK: (S, t, p, g) => {
    const pan = rndPan();
    // 到位前最后一寸的挤紧感
    S.whoosh(t - 0.001, { f: 900 * p, q: 1.4, dur: 0.05, gain: 0.05 * g, sweepTo: 420 * p, pan });
    S.strike(t + 0.03, {
      f0: 420 * p, decays: [0.2, 0.12, 0.07, 0.04],
      amps: [1, 0.42, 0.16, 0.06], gain: 0.26 * g, pan, click: 0.3,
    });
    S.thump(t + 0.03, { f: 105 * p, drop: 50, dur: 0.22, gain: 0.22 * g, pan });
  },

  /** 轻敲一下木头 */
  WOOD_TAP: (S, t, p, g) => {
    S.strike(t, {
      f0: 1050 * p, decays: [0.08, 0.05, 0.03], amps: [1, 0.4, 0.14],
      gain: 0.2 * g, pan: rndPan(), click: 0.4,
    });
  },

  /** 一根料落到台面上：主击 + 一次微弹跳 —— 硬物落桌从来不止响一下 */
  WOOD_DROP: (S, t, p, g) => {
    const pan = rndPan(0.3);
    S.strike(t, {
      f0: 560 * p, decays: [0.15, 0.09, 0.055, 0.035],
      amps: [1, 0.48, 0.2, 0.08], gain: 0.24 * g, pan, click: 0.45,
    });
    S.thump(t, { f: 118 * p, drop: 58, dur: 0.15, gain: 0.13 * g, pan });
    S.strike(t + 0.045 + Math.random() * 0.02, {
      f0: 600 * p, decays: [0.07, 0.04], amps: [1, 0.3],
      gain: 0.08 * g, pan, click: 0.25,
    });
  },

  /** 整体沉一下、坐实了 */
  WOOD_SETTLE: (S, t, p, g) => {
    S.thump(t, { f: 86 * p, drop: 42, dur: 0.42, gain: 0.3 * g });
    S.strike(t, {
      f0: 230 * p, decays: [0.26, 0.15], amps: [1, 0.3],
      gain: 0.12 * g, click: 0.1,
    });
    // 各接头跟着微微一响
    S.strike(t + 0.05, { f0: 700 * p, decays: [0.05, 0.03], amps: [1, 0.3], gain: 0.05 * g, pan: -0.18, click: 0.2 });
    S.strike(t + 0.09, { f0: 840 * p, decays: [0.05, 0.03], amps: [1, 0.3], gain: 0.04 * g, pan: 0.2, click: 0.2 });
  },

  /** 木头贴着木头滑动：摩擦的噪声底下有一层料的闷响 */
  WOOD_SLIDE: (S, t, p, g, o = {}) => {
    const pan = rndPan();
    const dur = o.dur ?? 0.3;
    S.whoosh(t, {
      f: 820 * p, q: 1.0, dur, gain: 0.12 * g,
      sweepTo: 500 * p, attack: 0.06, am: 16, amDepth: 0.4, pan,
    });
    S.whoosh(t, {
      f: 260 * p, q: 0.8, dur, gain: 0.085 * g,
      attack: 0.08, type: 'lowpass', pan,
    });
  },

  /** 格心落进槽：滑动 + 一记轻扣 */
  PANEL_SEAT: (S, t, p, g) => {
    RECIPES.WOOD_SLIDE(S, t, p, g, { dur: 0.18 });
    RECIPES.WOOD_TAP(S, t + 0.16, p * 0.9, g * 0.9);
  },

  // ── 刀具 ──────────────────────────────────────────

  /**
   * 锯：齿咬进木纤维。齿感来自 60 Hz 上下的粗颗粒调制，
   * 底下垫一层料的体腔共鸣 —— 光有高频齿声是锯铁皮，有了腔才是锯木头
   */
  SAW: (S, t, p, g) => {
    const pan = rndPan();
    S.whoosh(t, {
      f: 2300 * p, q: 1.1, dur: 0.24, gain: 0.17 * g,
      sweepTo: 1250 * p, attack: 0.035, am: 58 * p, amDepth: 0.75, pan,
    });
    S.whoosh(t, {
      f: 420 * p, q: 1.6, dur: 0.22, gain: 0.085 * g,
      sweepTo: 330 * p, attack: 0.04, am: 58 * p, amDepth: 0.4, pan, wet: 0.06,
    });
  },

  /** 凿：先咬住（钝击），随即一串纤维断裂，木屑挤出来 */
  CHISEL: (S, t, p, g) => {
    const pan = rndPan();
    S.strike(t, {
      f0: 460 * p, decays: [0.06, 0.04, 0.025], amps: [1, 0.5, 0.2],
      gain: 0.3 * g, pan, click: 0.6,
    });
    S.crackle(t + 0.004, { n: 5, spread: 0.05, f: 2800 * p, gain: 0.08 * g, pan });
    S.whoosh(t + 0.01, { f: 1500 * p, q: 1.8, dur: 0.06, gain: 0.11 * g, sweepTo: 700 * p, pan });
  },

  /** 刨：一层薄花卷出来 —— 丝滑的高频推送，带一点卷屑的颗粒 */
  ROUTER: (S, t, p, g) => {
    const pan = rndPan();
    S.whoosh(t, {
      f: 2500 * p, q: 1.2, dur: 0.28, gain: 0.13 * g,
      sweepTo: 1350 * p, attack: 0.05, am: 34, amDepth: 0.35, pan,
    });
    S.whoosh(t, {
      f: 480 * p, q: 1.2, dur: 0.24, gain: 0.055 * g, attack: 0.06, pan, wet: 0.06,
    });
  },

  /** 木屑落下 */
  CHIP_FALL: (S, t, p, g) => {
    S.crackle(t, {
      n: 5, spread: 0.1, dense: 1.6, f: 2400 * p, fSpread: 2200,
      gain: 0.06 * g, wide: 0.5,
    });
  },

  // ── 纸与装饰 ──────────────────────────────────────

  /** 纸：抚平、粘贴、展开 —— 窸窣是许多次微小的折与放 */
  PAPER: (S, t, p, g) => {
    const pan = rndPan();
    S.whoosh(t, {
      f: 3800 * p, q: 0.8, dur: 0.2, gain: 0.07 * g,
      sweepTo: 2200 * p, attack: 0.05, am: 26, amDepth: 0.5, pan,
    });
    S.crackle(t, { n: 6, spread: 0.16, dense: 1.3, f: 4600 * p, fSpread: 2600, gain: 0.035 * g, pan, wide: 0.2 });
  },

  /** 笔锋走过纸面：比纸更闷、更匀 */
  BRUSH: (S, t, p, g) => {
    S.whoosh(t, {
      f: 2200 * p, q: 0.7, dur: 0.15, gain: 0.065 * g,
      sweepTo: 1200 * p, attack: 0.05, am: 9, amDepth: 0.3, pan: rndPan(0.1),
    });
  },

  /** 结与流苏摆动：一段布料的低语 */
  KNOT_SWING: (S, t, p, g) => {
    S.whoosh(t, {
      f: 1100 * p, q: 0.8, dur: 0.42, gain: 0.055 * g,
      sweepTo: 620 * p, attack: 0.14, am: 6, amDepth: 0.25, pan: rndPan(0.1),
    });
  },

  // ── 火与光 ────────────────────────────────────────

  /** 点亮的那一下：一团气流被点着、火星散开 —— 不是「叮」 */
  LIGHT_BLOOM: (S, t, p, g) => {
    S.whoosh(t, {
      f: 380 * p, q: 0.8, dur: 0.7, gain: 0.14 * g,
      sweepTo: 170 * p, attack: 0.05, am: 13, amDepth: 0.3,
    });
    S.thump(t, { f: 68 * p, drop: 34, dur: 0.55, gain: 0.13 * g });
    S.crackle(t + 0.08, { n: 7, spread: 0.5, dense: 1.4, f: 2600, fSpread: 2400, gain: 0.02 * g, wide: 0.6, wet: 0.2 });
  },

  // ── 界面：只有三记 ────────────────────────────────

  /** 极轻的一点，用于选中 */
  UI_TAP: (S, t, p, g) => {
    S.strike(t, {
      f0: 1350 * p, decays: [0.045, 0.028], amps: [1, 0.25],
      gain: 0.11 * g, click: 0.3, wet: 0.08,
    });
  },

  /** 做完一件事：一记拨弦、一记轻叩 —— 琴与木，不是门铃 */
  SUCCESS: (S, t, p, g) => {
    S.pluck(t, { f: 392 * p, gain: 0.11 * g, dur: 1.1, pan: -0.06 });
    S.pluck(t + 0.09, { f: 587.3 * p, gain: 0.085 * g, dur: 1.3, pan: 0.08 });
    S.strike(t, { f0: 380 * p, decays: [0.1, 0.06], amps: [1, 0.3], gain: 0.06 * g, click: 0.1 });
  },

  /** 快门 */
  SHUTTER: (S, t, p, g) => {
    S.strike(t, { f0: 2600 * p, ratios: [1, 1.9], decays: [0.02, 0.012], amps: [1, 0.4], gain: 0.16 * g, click: 0.8, wet: 0.05 });
    S.strike(t + 0.055, { f0: 1900 * p, ratios: [1, 1.9], decays: [0.025, 0.014], amps: [1, 0.4], gain: 0.14 * g, click: 0.7, wet: 0.05 });
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
  /** 引火：火苗声随进度渐强，火星越来越密 */
  FLAME_IGNITE: (S, o = {}) => {
    const ctx = S.ctx, t = ctx.currentTime;
    const dur = o.dur ?? 1.2;
    const { out } = S._noise(t, dur + 3, 1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + dur);
    out.connect(lp).connect(g).connect(S.bus);
    // 火星渐密：间隔从 240 ms 收到 90 ms
    let alive = true;
    let wait = 240;
    const tick = () => {
      if (!alive || !S.enabled) return;
      S.crackle(ctx.currentTime + 0.01, { n: 1, spread: 0.01, f: 2400, fSpread: 1800, gain: 0.02 });
      wait = Math.max(90, wait * 0.9);
      timer = setTimeout(tick, wait * (0.7 + Math.random() * 0.6));
    };
    let timer = setTimeout(tick, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
      try { g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12); } catch { /* 已停止 */ }
    };
  },

  /**
   * 稳定燃烧：极轻，只在安静时才听得见。
   * 火焰不匀 —— 两个互不成倍的慢波叠着晃，另有偶发的一粒火星。
   */
  FLAME_LOOP: (S) => {
    const ctx = S.ctx, t = ctx.currentTime;
    const { out, src } = S._noise(t, 3600, 1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 460;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.022, t + 0.5);
    const lfos = [[0.37, 0.007], [1.31, 0.005]].map(([f, depth]) => {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = f;
      const lg = ctx.createGain(); lg.gain.value = depth;
      lfo.connect(lg).connect(g.gain);
      lfo.start(t);
      return lfo;
    });
    out.connect(lp).connect(g).connect(S.bus);
    let alive = true;
    let timer = 0;
    const spark = () => {
      if (!alive || !S.enabled) return;
      S.crackle(ctx.currentTime + 0.01, { n: 1, spread: 0.01, f: 2200, fSpread: 1600, gain: 0.012 });
      timer = setTimeout(spark, 1400 + Math.random() * 2200);
    };
    timer = setTimeout(spark, 1200);
    return () => {
      alive = false;
      clearTimeout(timer);
      try {
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
        src.stop(ctx.currentTime + 1);
        for (const l of lfos) l.stop(ctx.currentTime + 1);
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
