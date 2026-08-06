/**
 * 全局状态。
 *
 * 分两类，界线很清楚：
 *
 *   偏好 PREFS —— 深色、声音、字幕这些「这台设备上我习惯怎么用」，跨会话留着；
 *   进度 RUN   —— 做到哪一步、灯亮没亮、猜对几题，**每次打开都从头开始**。
 *
 * 一盏灯做一遍只要八分钟。半截存档换来的是一次「你上次停在……」的提问，
 * 而这个问题在你刚打开页面、还没想好要不要玩的时候，是纯粹的干扰。
 *
 * patternId 是这一遍里唯一的个性化选择：格心 → 爆炸图 → 地面投影 → 海报 → 烟花。
 */

const KEY = 'sunmao.v3.state';

/** 跨会话保留 */
const PREFS = {
  theme: 'light',        // 浅色 / 深色
  sound: true,
  captions: true,
  voice: true,
  primed: false,         // 是否看过「怎么操作」—— 看过就不再打扰
};

/** 这一遍的进度，刷新即归零 */
const RUN = {
  patternId: 'mayo',     // 麻叶纹 / 万字纹
  lit: false,            // M1 是否已点亮
  litLevel: 0,           // 当前亮度（含 M2 加亮）
  riddleScore: 0,        // M2 得分 0–5
  wishText: '',          // M3 愿望
  posterNo: '',          // M3 海报编号（本地随机码）
  modulesDone: {},       // { M1: true, ... }
};

const DEFAULTS = { ...PREFS, ...RUN };

function load() {
  const s = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // 只收偏好。进度一律用默认值 —— 存档里若还留着旧版本的进度，忽略即可
      for (const k of Object.keys(PREFS)) {
        if (saved[k] !== undefined) s[k] = saved[k];
      }
    }
  } catch { /* 隐私模式：用默认值 */ }
  if (s.theme !== 'dark') s.theme = 'light';
  return s;
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
