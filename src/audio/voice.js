/**
 * 旁白与字幕
 *
 * 旁白音频放在 public/audio/vo/{步骤号}.mp3，并在同目录的 manifest.json 里登记：
 *     { "ids": ["A1", "A2", "B1", ...] }
 * 用什么工具生成都行，这一层不关心。
 *
 * 没有音频时，字幕按语速模型独立走完同一套内容 —— 信息一句不少。
 * 语速：基准 4.0 字/秒，抒情段落放慢到 3.3–3.5。
 * 「（气口）」留 0.5 秒，「（停顿 n s）」按标注严格执行。
 */

const BASE_CPS = 4.0;
const VO_BASE = 'audio/vo';

/** 解析一段旁白脚本 → 字幕行 + 时长 */
export function parseNarration(text, cps = BASE_CPS) {
  const lines = [];
  for (let raw of String(text).split('\n')) {
    raw = raw.trim();
    if (!raw) continue;
    // （停顿 1.5 s） / （气口） 作为独立的静默行
    const holdM = raw.match(/^（停顿\s*([\d.]+)\s*s?）$/);
    if (holdM) { lines.push({ text: '', dur: parseFloat(holdM[1]), silent: true }); continue; }
    if (/^（气口）$/.test(raw)) { lines.push({ text: '', dur: 0.5, silent: true }); continue; }
    // 行内括注不进字幕，也不计时长
    const clean = raw.replace(/（[^）]*）/g, '').trim();
    if (!clean) continue;
    const n = [...clean].length;
    lines.push({ text: clean, dur: Math.max(0.9, n / cps + 0.35) });
  }
  return lines;
}

export class VoiceTrack {
  constructor(state, ui) {
    this.state = state;
    this.ui = ui;
    this.audio = null;
    this.timer = null;
    this.available = new Set();
    this.checked = false;
  }

  /** 读取生成清单，得知哪些步骤已有配音 */
  async loadManifest() {
    try {
      const r = await fetch(`${VO_BASE}/manifest.json`, { cache: 'no-cache' });
      if (r.ok) {
        const m = await r.json();
        this.available = new Set(m.ids || []);
      }
    } catch { /* 无配音：字幕独立走完 */ }
    this.checked = true;
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.audio) { this.audio.pause(); this.audio.src = ''; this.audio = null; }
    this.ui.setNarration('');
  }

  /**
   * 播放某步旁白。
   * @param {string} stepId
   * @param {string} text 旁白脚本
   * @param {{cps?:number, lyric?:boolean, onDone?:Function}} o
   */
  play(stepId, text, o = {}) {
    this.stop();
    const lines = parseNarration(text, o.cps ?? BASE_CPS);
    if (!lines.length) { o.onDone?.(); return; }
    const total = lines.reduce((s, l) => s + l.dur, 0);

    const runCaptions = (scale = 1) => {
      let i = 0;
      const step = () => {
        if (i >= lines.length) {
          this.ui.setNarration('');
          o.onDone?.();
          return;
        }
        const l = lines[i++];
        if (this.state.captions) this.ui.setNarration(l.text, { lyric: o.lyric });
        this.timer = setTimeout(step, l.dur * scale * 1000);
      };
      step();
    };

    if (this.state.voice && this.available.has(stepId)) {
      const a = new Audio(`${VO_BASE}/${stepId}.mp3`);
      a.preload = 'auto';
      this.audio = a;
      a.addEventListener('loadedmetadata', () => {
        // 用真实音频时长校准字幕节奏，逐句对齐
        const scale = a.duration && isFinite(a.duration) ? a.duration / total : 1;
        runCaptions(scale);
      }, { once: true });
      a.addEventListener('error', () => runCaptions(1), { once: true });
      a.play().catch(() => { /* 自动播放被拦，字幕照走 */ });
    } else {
      runCaptions(1);
    }
  }

  /** 仅走字幕（静默点：S30 巡礼段严禁补录任何旁白） */
  captionsOnly(text, o = {}) {
    this.play('__none__', text, o);
  }
}
