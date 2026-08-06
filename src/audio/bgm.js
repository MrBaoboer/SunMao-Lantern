/**
 * 背景音乐
 *
 * 曲目放在 public/audio/bgm/，并在同目录的 manifest.json 里登记：
 *     { "files": ["a-opening", "b-craft", ...] }
 * 缺文件就静默跳过，不影响任何叙事。
 *
 * 两处静默段落靠 setLevel 减编制，而不是切歌：
 * 「榫为阳，卯为阴」减到仅剩铺底；成品巡礼的十二秒再压一档，且不加任何音效。
 */

const BGM_BASE = 'audio/bgm';

export const TRACKS = {
  BGM_A_OPENING:      { file: 'a-opening',   vol: 0.42, loop: true },
  BGM_B_CRAFT:        { file: 'b-craft',     vol: 0.36, loop: true },
  BGM_C_FESTIVE:      { file: 'c-festive',   vol: 0.40, loop: true },
  BGM_C_LANTERN:      { file: 'c-lantern',   vol: 0.34, loop: true },
  BGM_C_FAIR:         { file: 'c-fair',      vol: 0.36, loop: true },
  BGM_C_WISH:         { file: 'c-wish',      vol: 0.30, loop: true },
  BGM_C_FINALE:       { file: 'c-finale',    vol: 0.46, loop: true },
  BGM_C_FESTIVE_LOOP: { file: 'c-hub',       vol: 0.36, loop: true },
};

export class BGM {
  constructor(state, sfx) {
    this.state = state;
    this.sfx = sfx;
    this.current = null;
    this.el = null;
    this.available = new Set();
    this.duckScale = 1;
  }

  async loadManifest() {
    try {
      const r = await fetch(`${BGM_BASE}/manifest.json`, { cache: 'no-cache' });
      if (r.ok) this.available = new Set((await r.json()).files || []);
    } catch { /* 无 BGM：静默降级 */ }
  }

  /**
   * @param {keyof TRACKS} id
   * @param {{fade?:number, level?:number}} o level 用于静默点减编制（0–1）
   */
  play(id, o = {}) {
    const tr = TRACKS[id];
    if (!tr) return;
    if (this.current === id) { this.setLevel(o.level ?? 1); return; }
    if (!this.available.has(tr.file)) { this.current = id; return; }

    const fade = o.fade ?? 1.2;
    const old = this.el;
    if (old) {
      const t0 = performance.now();
      const v0 = old.volume;
      const f = () => {
        const k = Math.min(1, (performance.now() - t0) / (fade * 1000));
        old.volume = v0 * (1 - k);
        if (k < 1) requestAnimationFrame(f); else { old.pause(); old.src = ''; }
      };
      f();
    }

    const a = new Audio(`${BGM_BASE}/${tr.file}.mp3`);
    a.loop = tr.loop;
    a.volume = 0;
    this.el = a;
    this.current = id;
    this.baseVol = tr.vol;
    this.levelScale = o.level ?? 1;
    a.play().then(() => {
      const t0 = performance.now();
      const target = this.targetVolume();
      const f = () => {
        if (this.el !== a) return;
        const k = Math.min(1, (performance.now() - t0) / (fade * 1000));
        a.volume = target * k;
        if (k < 1) requestAnimationFrame(f);
      };
      f();
    }).catch(() => { /* 自动播放被拦 */ });

    // 供 M5 爆炸做 sidechain 让位
    this.sfx.duckTarget = { gain: { setTargetAtTime: () => {}, cancelScheduledValues: () => {} } };
  }

  targetVolume() {
    if (!this.state.sound) return 0;
    return (this.baseVol ?? 0.35) * (this.levelScale ?? 1) * this.duckScale;
  }

  /** 静默点减编制：level 0.35 ≈ 仅剩单音铺底 */
  setLevel(level, fade = 1.0) {
    this.levelScale = level;
    if (!this.el) return;
    const a = this.el, v0 = a.volume, v1 = this.targetVolume(), t0 = performance.now();
    const f = () => {
      if (this.el !== a) return;
      const k = Math.min(1, (performance.now() - t0) / (fade * 1000));
      a.volume = v0 + (v1 - v0) * k;
      if (k < 1) requestAnimationFrame(f);
    };
    f();
  }

  stop(fade = 0.8) { this.setLevel(0, fade); this.current = null; }

  setEnabled(v) {
    this.state.sound = v;
    if (this.el) this.el.volume = this.targetVolume();
  }
}
