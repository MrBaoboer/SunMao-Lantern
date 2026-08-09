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
 * patternId 是这一遍里唯一的个性化选择：格心 → 爆炸图 → 地面投影 → 海报。
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
  patternId: 'wanzi',    // 万字纹（默认）/ 麻叶纹
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
const PREF_KEYS = new Set(Object.keys(PREFS));

/**
 * 只有偏好落盘。
 *
 * 进度本来就「下次打开一律不再读取」，写它没有任何用处，却让愿望这类内容
 * 无谓地留在本机上 —— 隐私上收得越紧越好。顺带解决一个实际问题：亮度滑杆
 * 每动一格都要 JSON.stringify 整个状态再写一次盘。
 */
let queued = false;
export const state = new Proxy(load(), {
  set(t, k, v) {
    if (t[k] === v) return true;
    t[k] = v;
    for (const fn of listeners) fn(k, v, t);
    if (!PREF_KEYS.has(k) || queued) return true;
    queued = true;                     // 合并同一批里的多次写入
    queueMicrotask(() => {
      queued = false;
      const prefs = {};
      for (const key of PREF_KEYS) prefs[key] = t[key];
      try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* 隐私模式下静默 */ }
    });
    return true;
  },
});

export function onStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 从头再来：这一遍的进度归零，偏好一概不动 */
export function resetRun() {
  for (const [k, v] of Object.entries(RUN)) {
    state[k] = (v && typeof v === 'object') ? { ...v } : v;
  }
}

/**
 * ★M3 隐私红线：编号为**本地生成的随机码**，不含任何用户标识、不可反查，
 * 不上传、不请求姓名手机号、不登录。海报以文字呈现编号，不做二维码
 * （接真 QR 需引入唯一的外部依赖，留待产品定稿 URL 后加，见 DESIGN.md 差异表）。
 */
export function makePosterNo(year = new Date().getFullYear()) {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  const code = [...buf].map((b) => chars[b % chars.length]).join('');
  return `${year}-SM-${code}`;
}
