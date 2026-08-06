/**
 * §13.3 全局状态 —— 必须贯穿主线与五大互动模块，中途退出不丢失。
 *
 * state.patternId 是全片唯一的个性化选择（§S26 备注：丢失即前功尽弃），
 * 它作用于：格心 → 爆炸图 → M1 地面投影 → M3 海报边框 → M4 AR → M5。
 */

const KEY = 'sunmou.v3.state';

const DEFAULTS = {
  patternId: 'mayo',     // 麻叶纹 / 冰裂纹 / 万字纹
  lit: false,            // M1 是否已点亮
  litLevel: 0,           // 当前亮度（含 M2 加亮）
  riddleScore: 0,        // M2 得分 0–5
  riddleDone: false,
  wishText: '',          // M3 愿望
  wishCombo: null,
  posterNo: '',
  motifs: ['fu', 'fish', 'lotus', 'bat'], // 四面窗花
  modulesDone: {},       // { M1: true, ... }
  fallbackMode: false,   // §7 降级开关：降级后知识点零损失
  sound: true,
  captions: true,
  voice: true,
  autoSection: true,     // 自动播放结构复看（S17 备注可关）
  maxStep: 0,            // 已解锁的最远步骤
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULTS }; }
}

const listeners = new Set();

export const state = new Proxy(load(), {
  set(t, k, v) {
    if (t[k] === v) return true;
    t[k] = v;
    queueMicrotask(() => {
      try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* 隐私模式下静默 */ }
      for (const fn of listeners) fn(k, v, t);
    });
    return true;
  },
});

export function onStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetState() {
  for (const k of Object.keys(DEFAULTS)) state[k] = DEFAULTS[k];
}

/**
 * ★M3 隐私红线：编号为**本地生成的随机码**，不含任何用户标识、不可反查，
 * 不上传、不请求姓名手机号、不登录。二维码指向产品通用介绍页（静态 URL）。
 */
export function makePosterNo(year = new Date().getFullYear()) {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  const code = [...buf].map((b) => chars[b % chars.length]).join('');
  return `${year}-SM-${code}`;
}
