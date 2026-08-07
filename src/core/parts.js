/**
 * §4 BOM + §5 节点定义 —— 13 件木构件的参数化生成
 *
 * 每件构件表述为「毛坯盒 + 若干带工序标签的切除盒」。
 * 传入工序集合即可得到该构件在任意加工阶段的精确几何 ——
 * S15~S24 的加工动画就是逐级把工序加进这个集合。
 *
 * 全部坐标为**最终装配位置的世界坐标**（整数毫米），
 * 这样构件间干涉检测无需任何变换，§13.1 自检可以直接跑。
 */

import { a, M, C, J1, J2, J3, J4, J5, J6, QUADRANTS } from './modulus.js';
import { Solid, box } from './boxcsg.js';

/** 归一化盒（允许任意顺序传入两个角点） */
function bx(xa, ya, za, xb, yb, zb) {
  return box(
    Math.min(xa, xb), Math.min(ya, yb), Math.min(za, zb),
    Math.max(xa, xb), Math.max(ya, yb), Math.max(za, zb),
  );
}

/** 工序标签 —— 与主线加工步骤一一对应 */
export const OP = {
  BEAM_SLOT: 'beam-slot',        // 顺枨中部铣双开口槽（★V-19 自顶面向下）
  TENON: 'tenon',                // 切偏内侧透榫（★V-17）
  PANEL_SLOT: 'panel-slot',      // 开装板槽（★V-21）
  MORTISE: 'mortise',            // 凿透眼（★V-05）
  SOCKET: 'socket',              // 铣柱窝（★V-08 / V-18）
  CORNER_SLOT: 'corner-slot',    // 上枨框底面角牙槽（J-5）
  PRESS_SLOT: 'press-slot',      // 上枨框顶面角花压槽（J-6 / ★V-27）
  SHORTEN: 'shorten',            // 中梁截短至 8a（★V-23）
  FORK: 'fork',                  // 中梁两端开叉形双榫
  BEAR_SHOULDER: 'bear-shoulder',// 中梁端部下半段横切，切出承重肩（★V-26）
  NECK2: 'neck-2',               // 立柱下颈（2a–3a）
  NECK1: 'neck-1',               // 立柱上颈（13a–14a）
  PANEL_SHOULDER: 'panel-shoulder', // 格心板肩（★V-22）
};

/** 一道工序：切除盒 + 标签 */
function op(tag, ...boxes) {
  return boxes.map((b) => ({ tag, b }));
}

// ══════════════════════════════════════════════════════════════
// 顺枨（沿 X 走向，中心线 y = ±4a）
//   LB-A1/A2 —— 下枨框：中部双开口槽 + 两端透榫 + 顶面装板槽
//   UB-A1/A2 —— 上枨框：★中部不加工 + 两端透榫 + 底面装板槽 + 底面角牙槽
// ══════════════════════════════════════════════════════════════
function railA({ sy, z0, z1, upper }) {
  const half = M.SEC / 2;
  const yc = sy * C.RAIL_A_Y;
  const yIn = yc - sy * half;    // 内侧面（朝灯笼中心）
  const yOut = yc + sy * half;   // 外侧面
  const blank = bx(-C.EDGE, yIn, z0, C.EDGE, yOut, z1);
  const cuts = [];

  // ── 两端透榫（★V-17 厚度方向偏内侧）──
  // 榫头：内侧肩 a/6 → 榫 a/3 → 外侧肩 a/2（外侧那 a/2 正是柱窝的让位空间）
  const tenY0 = yIn + sy * J1.SHOULDER_IN;
  const tenY1 = tenY0 + sy * J1.THICK;
  const tenZ0 = z0 + J1.SHOULDER_Z;
  const tenZ1 = z1 - J1.SHOULDER_Z;
  for (const sx of [+1, -1]) {
    const xShoulder = sx * C.INNER_FACE; // 榫肩落在横枨内侧面上 → 肩距 7a
    const xEnd = sx * C.EDGE;
    cuts.push(
      ...op(OP.TENON,
        bx(xShoulder, yIn, z0, xEnd, tenY0, z1),      // 内侧肩 a/6
        bx(xShoulder, tenY1, z0, xEnd, yOut, z1),     // 外侧肩 a/2 ← 留给柱窝
        bx(xShoulder, tenY0, z0, xEnd, tenY1, tenZ0), // 下榫肩 a/6
        bx(xShoulder, tenY0, tenZ1, xEnd, tenY1, z1), // 上榫肩 a/6
      ),
    );
  }

  // ── 中部双开口槽（★V-02：仅下枨框有；★V-19：自顶面向下）──
  if (!upper) {
    const sz1 = z1;                 // 自顶面
    const sz0 = z1 - J2.SLOT_D;     // 向下 a/2
    const sy1 = yIn + sy * J2.SLOT_L; // 自内侧面向外 a/2，盲端
    const t = J2.TONGUE / 2;
    cuts.push(
      ...op(OP.BEAM_SLOT,
        bx(-t - J2.SLOT_W, yIn, sz0, -t, sy1, sz1),
        bx(t, yIn, sz0, t + J2.SLOT_W, sy1, sz1),
      ),
    );
  }

  // ── 装板槽（★V-21：上枨框在底面深 a/2，下枨框在顶面深 a/6）──
  const psOuter = yOut - sy * J4.SLOT_INSET;          // 槽外缘距外侧面 a/12
  const psInner = psOuter - sy * J4.PANEL_T;          // 槽宽 = 板厚 a/3
  const [pz0, pz1] = upper ? [z0, z0 + J4.SLOT_UP_D] : [z1 - J4.SLOT_LOW_D, z1];
  cuts.push(
    ...op(OP.PANEL_SLOT,
      bx(-J4.SLOT_LEN / 2, psInner, pz0, J4.SLOT_LEN / 2, psOuter, pz1),
    ),
  );

  // ── 角牙槽（J-5，仅上枨框底面四角）──
  if (upper) {
    const cy0 = yIn;
    const cy1 = yIn + sy * J5.SLOT_D;
    for (const sx of [+1, -1]) {
      cuts.push(
        ...op(OP.CORNER_SLOT,
          bx(sx * (C.INNER_FACE - J5.TENON_L), cy0, z0, sx * C.INNER_FACE, cy1, z0 + J5.SLOT_D),
        ),
      );
    }
  }

  return { blank, cuts };
}

// ══════════════════════════════════════════════════════════════
// 横枨（沿 Y 走向，中心线 x = ±4a）
//   LB-B1/B2 —— 透眼 ×2 + 柱窝 ×2 + 顶面装板槽
//   UB-B1/B2 —— 同上，装板槽改底面，另加顶面角花压槽 ×2
// ══════════════════════════════════════════════════════════════
function railB({ sx, z0, z1, upper }) {
  const half = M.SEC / 2;
  const xc = sx * C.RAIL_B_X;
  const xIn = xc - sx * half;
  const xOut = xc + sx * half;
  const blank = bx(xIn, -C.EDGE, z0, xOut, C.EDGE, z1);
  const cuts = [];

  // ── 透眼 ×2（★V-05 必须贯穿，位置与顺枨榫头一一对应）──
  const mz0 = z0 + J1.SHOULDER_Z;
  const mz1 = z1 - J1.SHOULDER_Z;
  for (const sy of [+1, -1]) {
    const yIn = sy * C.INNER_FACE;
    const my0 = yIn + sy * J1.SHOULDER_IN;
    const my1 = my0 + sy * J1.THICK;
    cuts.push(...op(OP.MORTISE, bx(xIn, my0, mz0, xOut, my1, mz1)));
  }

  // ── 柱窝 ×2（★V-08 新增工序；★V-18 开口朝横枨外侧面）──
  for (const sy of [+1, -1]) {
    cuts.push(
      ...op(OP.SOCKET,
        bx(xOut, sy * C.COL_AXIS - sy * J3.SOCKET_DY, z0,
           xOut - sx * J3.SOCKET_DX, sy * C.COL_AXIS, z1),
      ),
    );
  }

  // ── 装板槽 ──
  const psOuter = xOut - sx * J4.SLOT_INSET;
  const psInner = psOuter - sx * J4.PANEL_T;
  const [pz0, pz1] = upper ? [z0, z0 + J4.SLOT_UP_D] : [z1 - J4.SLOT_LOW_D, z1];
  cuts.push(
    ...op(OP.PANEL_SLOT,
      bx(psInner, -J4.SLOT_LEN / 2, pz0, psOuter, J4.SLOT_LEN / 2, pz1),
    ),
  );

  // ── 角花压槽（J-6 / ★V-27，仅上枨框顶面四角，位于柱窝内侧）──
  if (upper) {
    for (const sy of [+1, -1]) {
      const gy0 = sy * C.RAIL_A_Y;
      const gy1 = gy0 + sy * J6.TONGUE_T;
      cuts.push(
        ...op(OP.PRESS_SLOT,
          bx(xIn, gy0, z1 - J6.TONGUE_T, xIn + sx * J6.TONGUE_L, gy1, z1),
        ),
      );
    }
  }

  return { blank, cuts };
}

// ══════════════════════════════════════════════════════════════
// 中梁 LB-C1（沿 Y 走向，x = 0）—— 唯一异长构件 8a（★V-23）
// ══════════════════════════════════════════════════════════════
function beamC() {
  const half = M.SEC / 2;
  const z0 = C.LOWER_Z0, z1 = C.LOWER_Z1;
  // 毛坯仍是 10a 短料，截短是一道工序
  const blank = bx(-half, -C.EDGE, z0, half, C.EDGE, z1);
  const cuts = [];

  // ── 截短至 8a：两端各去 a（★V-23）──
  const endY = J2.BEAM_LEN / 2; // 4a
  cuts.push(
    ...op(OP.SHORTEN,
      bx(-half, endY, z0, half, C.EDGE, z1),
      bx(-half, -endY, z0, half, -C.EDGE, z1),
    ),
  );

  const t = J2.TONGUE / 2;
  const zMid = z1 - J2.SLOT_D; // 2.5a：上半段留榫，下半段横切
  for (const sy of [+1, -1]) {
    const yShoulder = sy * C.INNER_FACE; // 肩落在顺枨内侧面 → 肩距 7a
    const yTip = sy * endY;              // 榫端面恰抵顺枨中心线 y = ±4a
    // 端部中间开口 —— 留给顺枨的中央榫舌
    cuts.push(...op(OP.FORK, bx(-t, yShoulder, zMid, t, yTip, z1)));
    // ★V-26 端部下半段横切去除 a/2 高 × a/2 长，切出的水平面即承重肩，
    //        落在顺枨开口槽的槽底余料上 —— 竖向荷载有实打实的承托面。
    cuts.push(...op(OP.BEAR_SHOULDER, bx(-half, yShoulder, z0, half, yTip, zMid)));
  }

  return { blank, cuts };
}

// ══════════════════════════════════════════════════════════════
// 立柱 PL-01~04 —— 三段两颈（★V-07 / V-24），四柱互为镜像
// ══════════════════════════════════════════════════════════════
function column({ sx, sy }) {
  const half = M.SEC / 2;
  const cx = sx * C.COL_AXIS, cy = sy * C.COL_AXIS;
  const xIn = cx - sx * half, xOut = cx + sx * half;   // xOut 与外廓 ±5a 齐平
  const yIn = cy - sy * half, yOut = cy + sy * half;
  const blank = bx(xIn, yIn, 0, xOut, yOut, M.HEIGHT);
  const cuts = [];

  // 颈部：去除四象限中的三个，只保留**朝向灯笼内侧**的那一个
  const xMid = xIn + sx * J3.NECK;  // 保留象限的外边界
  const yMid = yIn + sy * J3.NECK;
  const carveNeck = (tag, [nz0, nz1]) => {
    cuts.push(
      ...op(tag,
        bx(xMid, yIn, nz0, xOut, yOut, nz1),   // 外半（x 向）
        bx(xIn, yMid, nz0, xMid, yOut, nz1),   // 剩余的外半（y 向）
      ),
    );
  };
  carveNeck(OP.NECK2, J3.SEG.NECK2);
  carveNeck(OP.NECK1, J3.SEG.NECK1);

  return { blank, cuts };
}

// ══════════════════════════════════════════════════════════════
// 格心包络体（用于装配动画与干涉检测；可见的镂空棂条见 lattice.js）
//   ★V-22 主体宽 8a，上端向下 3a/4、下端向上 a/2 收窄至 7a
// ══════════════════════════════════════════════════════════════
function panelEnvelope({ axis, s }) {
  // axis: 'y' → 装在顺枨槽内，板面法向 Y；'x' → 装在横枨槽内，板面法向 X
  const nOuter = s * (C.EDGE - M.SEC / 2 - J4.SLOT_INSET); // 槽外缘 = ±(4.5a − a/12)
  const nInner = nOuter - s * J4.PANEL_T;
  const zBot = C.LOWER_Z1 - J4.BITE_LOW;   // 3a − a/6
  const zTop = C.UPPER_Z0 + J4.BITE_UP;    // 13a + a/4
  const w = J4.PANEL_W / 2, ws = J4.PANEL_W_SHOULDER / 2;

  const mk = (u0, u1, z0, z1) =>
    axis === 'y' ? bx(u0, nInner, z0, u1, nOuter, z1) : bx(nInner, u0, z0, nOuter, u1, z1);

  const blank = mk(-w, w, zBot, zTop);
  const cuts = [];
  // 板肩：上下两端各收窄至 7a，以让过 7a 的槽长与内口
  for (const su of [+1, -1]) {
    cuts.push(
      ...op(OP.PANEL_SHOULDER,
        mk(su * ws, su * w, zTop - J4.SHOULDER_TOP, zTop),
        mk(su * ws, su * w, zBot, zBot + J4.SHOULDER_BOT),
      ),
    );
  }
  return { blank, cuts };
}

// ══════════════════════════════════════════════════════════════
// 构件注册表
// ══════════════════════════════════════════════════════════════

/** 全部工序（用于取「完工态」） */
export const ALL_OPS = new Set(Object.values(OP));

const DEFS = {};

function def(id, meta, factory) {
  DEFS[id] = { id, ...meta, factory };
}

// —— 下枨框（5 件）——
def('LB-A1', { name: '下枨框·顺枨', group: 'lower', blankId: 'BLK-S01', budget: 900 },
  () => railA({ sy: +1, z0: C.LOWER_Z0, z1: C.LOWER_Z1, upper: false }));
def('LB-A2', { name: '下枨框·顺枨', group: 'lower', blankId: 'BLK-S02', budget: 900 },
  () => railA({ sy: -1, z0: C.LOWER_Z0, z1: C.LOWER_Z1, upper: false }));
def('LB-C1', { name: '下枨框·中梁', group: 'lower', blankId: 'BLK-S03', budget: 800 }, beamC);
def('LB-B1', { name: '下枨框·横枨', group: 'lower', blankId: 'BLK-S04', budget: 1200 },
  () => railB({ sx: +1, z0: C.LOWER_Z0, z1: C.LOWER_Z1, upper: false }));
def('LB-B2', { name: '下枨框·横枨', group: 'lower', blankId: 'BLK-S05', budget: 1200 },
  () => railB({ sx: -1, z0: C.LOWER_Z0, z1: C.LOWER_Z1, upper: false }));

// —— 上枨框（4 件）——
def('UB-A1', { name: '上枨框·顺枨', group: 'upper', blankId: 'BLK-S06', budget: 900 },
  () => railA({ sy: +1, z0: C.UPPER_Z0, z1: C.UPPER_Z1, upper: true }));
def('UB-A2', { name: '上枨框·顺枨', group: 'upper', blankId: 'BLK-S07', budget: 900 },
  () => railA({ sy: -1, z0: C.UPPER_Z0, z1: C.UPPER_Z1, upper: true }));
def('UB-B1', { name: '上枨框·横枨', group: 'upper', blankId: 'BLK-S08', budget: 1200 },
  () => railB({ sx: +1, z0: C.UPPER_Z0, z1: C.UPPER_Z1, upper: true }));
def('UB-B2', { name: '上枨框·横枨', group: 'upper', blankId: 'BLK-S09', budget: 1200 },
  () => railB({ sx: -1, z0: C.UPPER_Z0, z1: C.UPPER_Z1, upper: true }));

// —— 立柱（4 件，互为镜像）——
QUADRANTS.forEach((q, i) => {
  def(`PL-0${i + 1}`, { name: '立柱', group: 'column', blankId: `BLK-L0${i + 1}`, budget: 1000, quadrant: q },
    () => column(q));
});

// —— 格心包络（4 片）——
const PANEL_AXES = [
  { id: 'LT-01', axis: 'y', s: +1 },
  { id: 'LT-02', axis: 'x', s: +1 },
  { id: 'LT-03', axis: 'y', s: -1 },
  { id: 'LT-04', axis: 'x', s: -1 },
];
PANEL_AXES.forEach((p) => {
  def(p.id, { name: '装饰格心', group: 'panel', budget: 3000, axis: p.axis, side: p.s },
    () => panelEnvelope(p));
});

/** 13 件木构件编号（§4：4 顺枨 + 4 横枨 + 1 中梁 + 4 立柱） */
export const WOOD_IDS = [
  'LB-A1', 'LB-A2', 'LB-C1', 'LB-B1', 'LB-B2',
  'UB-A1', 'UB-A2', 'UB-B1', 'UB-B2',
  'PL-01', 'PL-02', 'PL-03', 'PL-04',
];

export const PANEL_IDS = PANEL_AXES.map((p) => p.id);

export function partMeta(id) {
  const d = DEFS[id];
  if (!d) throw new Error(`未知构件：${id}`);
  return d;
}

const cache = new Map();

const LO = ['x0', 'y0', 'z0'];
const HI = ['x1', 'y1', 'z1'];

/**
 * 正在走的这一刀，从一个切除盒里实际啃掉的那一块。
 *
 * 两件事：
 *
 * **这一刀走过哪儿。** 一道工序常常在构件上removes好几处料 —— 顺枨顶面是两条平行的槽，
 * 横枨两头各一个榫。刀这一趟只经过其中一处，其余的不该跟着一起消失。
 * 判据是刃尖的横截位置：进给轴由走刀方向定、进刀轴由攻角定，剩下的那一个轴上，
 * 刃尖必须落在盒的范围内，这个盒才算「刀正压在上面」。
 *
 * **啃到多深。** 自入刀面向里推进 t —— 一刀一层，这正是凿和铣的实际去料方式。
 *
 * @param {object} b 切除盒（构件本地坐标）
 * @param {{travel:0|1|2, axis:0|1|2, dir:-1|1, lane:number[], t:number}} k
 * @returns {object|null} 这一刀啃掉的那一块；刀没走到这个盒上则为 null
 */
function onLane(b, k, lane) {
  // 既不是进给轴、也不是进刀轴的那一个轴，就是「刀压在哪一条道上」
  const cross = [0, 1, 2].find((i) => i !== k.travel && i !== k.axis);
  if (cross !== undefined) {
    const lo = b[LO[cross]], hi = b[HI[cross]];
    // 容差 1 mm：榫肩线正好压在盒的边界上，差一丝就整条切不着
    if (lane[cross] < lo - 1 || lane[cross] > hi + 1) return false;
  }
  /*
   * 进刀轴上也得认一认。
   *
   * 同一道工序可能在两个**深度**上各去一块 —— 中梁两头各要切一个承重面，
   * 刀在这一头，那一头不该跟着掉料。判据是：刃尖要么就在这个盒的深度范围里，
   * 要么这个盒落在「入刀面到刃尖」之间（刀是穿过它才到这个深度的）。
   */
  const lo = b[LO[k.axis]], hi = b[HI[k.axis]];
  const at = lane[k.axis];
  if (at >= lo - 1 && at <= hi + 1) return true;
  return k.dir < 0 ? lo >= at - 1 : hi <= at + 1;
}

function carveBox(b, k) {
  if (!onLane(b, k, k.lane)) return null;
  const lo = b[LO[k.axis]], hi = b[HI[k.axis]];
  const depth = (hi - lo) * Math.max(0, Math.min(1, k.t));
  if (depth <= 0) return null;
  const out = { ...b };
  if (k.dir < 0) out[LO[k.axis]] = hi - depth;   // 自上（或外）向里啃
  else out[HI[k.axis]] = lo + depth;

  /*
   * 进给轴也得裁。
   *
   * 一根横枨上有两个透眼，隔着大半根料；刀顺着料走一趟，两个眼却同时在变深 ——
   * 刀还在这一头，那一头的料已经没了。所以只啃**刃尖真的扫过**的那一段：
   * 刀走到哪儿，料才少到哪儿。连续的长槽因此是一点点变长再变深，
   * 两个分开的孔则是刀经过谁、谁才开始掉料。
   */
  if (k.swept) {
    const t0 = Math.max(out[LO[k.travel]], k.swept[0]);
    const t1 = Math.min(out[HI[k.travel]], k.swept[1]);
    if (t1 - t0 <= 0) return null;
    out[LO[k.travel]] = t0;
    out[HI[k.travel]] = t1;
  }
  return out;
}

/**
 * 生成构件实体。
 * @param {string} id 构件编号
 * @param {Set<string>|'all'|'blank'} ops 已完成的工序集合
 * @param {{tag:string, travel:0|1|2, axis:0|1|2, dir:-1|1, lane:number[], t:number}} [carve]
 *   正在走的这一刀。该标签的切除盒不从 ops 里取，改由 carveBox() 现算 ——
 *   于是料是跟着刀一点点没的，不是走完三刀之后整块跳出来。
 * @returns {Solid}
 */
export function buildPart(id, ops = 'all', carve = null) {
  const key = `${id}|${ops === 'all' ? '*' : ops === 'blank' ? '0' : [...ops].sort().join(',')}`;
  // 走刀中的形态每帧都不同，不进缓存，也不能污染缓存
  if (!carve && cache.has(key)) return cache.get(key);

  const d = DEFS[id];
  if (!d) throw new Error(`未知构件：${id}`);
  const { blank, cuts } = d.factory();
  let active;
  if (ops === 'all') active = cuts;
  else if (ops === 'blank') active = [];
  else active = cuts.filter((c) => ops.has(c.tag));

  const boxes = active.map((c) => c.b);
  if (carve) {
    for (const c of cuts) {
      if (c.tag !== carve.tag) continue;
      // 之前几趟已经走完的道：整块留着，别让它随着这一趟重新长回去
      if (carve.done?.some((l) => onLane(c.b, carve, l))) { boxes.push(c.b); continue; }
      const b = carveBox(c.b, carve);
      if (b) boxes.push(b);
    }
  }

  const solid = new Solid(blank, boxes);
  solid.partId = id;
  if (!carve) cache.set(key, solid);
  return solid;
}

/** 该构件涉及的全部工序（按定义顺序去重） */
export function partOps(id) {
  const { cuts } = DEFS[id].factory();
  const seen = new Set();
  const out = [];
  for (const c of cuts) if (!seen.has(c.tag)) { seen.add(c.tag); out.push(c.tag); }
  return out;
}

/** 毛坯规格（S13 展示用） */
export function blankOf(id) {
  const { blank } = DEFS[id].factory();
  return blank;
}

/** 构件几何中心（世界坐标），用作 Object3D 的 home position */
export function partCenter(id) {
  const b = blankOf(id);
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: (b.z0 + b.z1) / 2 };
}

export { DEFS as PART_DEFS };
