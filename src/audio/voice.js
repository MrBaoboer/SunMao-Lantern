/**
 * §12.3 旁白与字幕
 *
 * 旁白音频由 MiniMax T2A 生成（见 tools/gen-voice.mjs），放在 /audio/vo/{stepId}.mp3。
 * 音频缺失时字幕仍按 §12.3 的语速模型走完全同一套内容 ——
 * 这是 §7「降级后叙事与知识点零损失」的兑现方式。
 *
 * 语速：基准 4.0 字/秒；情绪段落 3.3–3.5 字/秒（各步单独标注）。
 * 「（气口）」处实留 0.4–0.6 s；「（停顿 n s）」严格执行。
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
    this.ui.setSubtitle('');
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
          this.ui.setSubtitle('');
          o.onDone?.();
          return;
        }
        const l = lines[i++];
        if (this.state.captions) this.ui.setSubtitle(l.text, { lyric: o.lyric });
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
