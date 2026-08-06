/**
 * §13.1 建模自检表 → 可执行断言
 *
 * 原文档的自检表是给人对照勾选的；这里把每一条翻译成对**实际几何**的断言。
 * 任何一条不通过，说明模型没闭合 —— 这正是 V1.0 死掉的地方。
 *
 * 同时做一件文档做不到的事：**全构件两两干涉检测**。
 * 13 件木构件 + 4 片格心在最终装配位上任意两件的重叠体积必须为 0。
 */

import { a, M, C, J1, J2, J3, J4, J5, J6 } from './modulus.js';
import { buildPart, WOOD_IDS, PANEL_IDS, partMeta, blankOf } from './parts.js';
import { interferenceVolume, boxesOverlap, boxIntersection, boxVolume } from './boxcsg.js';

const results = [];
function check(code, title, fn) {
  let ok = false, detail = '';
  try {
    const r = fn();
    if (typeof r === 'string') { ok = true; detail = r; }
    else { ok = !!r; }
  } catch (e) {
    ok = false; detail = e.message;
  }
  results.push({ code, title, ok, detail });
  return ok;
}

const eq = (x, y, label) => {
  if (x !== y) throw new Error(`${label}: 实得 ${x}，应为 ${y}`);
  return true;
};

/** 某构件的实体是否占据给定盒（完全填满） */
function isSolidAt(solid, b) {
  const boxes = solid.toBoxes();
  let covered = 0;
  for (const p of boxes) {
    if (boxesOverlap(p, b)) covered += boxVolume(boxIntersection(p, b));
  }
  return covered === boxVolume(b);
}

/** 某构件在给定盒内是否完全为空 */
function isEmptyAt(solid, b) {
  return interferenceVolume(solid.toBoxes(), [b]) === 0;
}

/**
 * 取构件在某个 z 区间内的水平截面外接范围。
 * 贪心合并会把跨越多个高度段的实体合成一个盒，
 * 因此不能按「盒是否落在区间内」筛选，必须与该 z 板片求交。
 */
function sectionAt(solid, z0, z1) {
  const slab = { x0: -1e6, y0: -1e6, z0, x1: 1e6, y1: 1e6, z1 };
  const parts = solid.toBoxes()
    .filter((b) => boxesOverlap(b, slab))
    .map((b) => boxIntersection(b, slab));
  if (!parts.length) return null;
  return {
    x0: Math.min(...parts.map((b) => b.x0)), x1: Math.max(...parts.map((b) => b.x1)),
    y0: Math.min(...parts.map((b) => b.y0)), y1: Math.max(...parts.map((b) => b.y1)),
  };
}

export function runVerification() {
  results.length = 0;

  // ── V-16 中心距 8a，肩距 7a，外廓 10a×10a，内口 7a×7a，四边出头 0.5a ──
  check('V-16', '枨框中心距 8a / 肩距 7a / 外廓 10a / 内口 7a / 四边出头 0.5a', () => {
    eq(M.SPAN, a(8), '中心距');
    eq(M.SHOULDER_SPAN, a(7), '榫肩距');
    eq(C.RAIL_A_Y * 2, a(8), '顺枨中心距');
    eq(C.RAIL_B_X * 2, a(8), '横枨中心距');
    // 顺枨榫肩落在横枨内侧面上 → 肩距 = 中心距 − 料宽
    eq(C.INNER_FACE * 2, M.SHOULDER_SPAN, '肩距（= 两内侧面间距）');
    // 四边出头：顺枨榫端 x=±5a 超出横枨外侧面 x=±4.5a
    const proudX = C.EDGE - (C.RAIL_B_X + M.SEC / 2);
    const proudY = C.EDGE - (C.RAIL_A_Y + M.SEC / 2);
    eq(proudX, J1.PROUD, 'X 向出头');
    eq(proudY, J1.PROUD, 'Y 向出头');
    // 顺枨全长 = 肩距 + 两端榫长
    eq(M.SHOULDER_SPAN + 2 * J1.LEN, M.LEN_SHORT, '顺枨全长（肩距 + 2×榫长）');
    return `中心距 ${M.SPAN}mm · 肩距 ${M.SHOULDER_SPAN}mm · 出头 ${proudX}mm × 4 边`;
  });

  // ── V-17 透榫偏内侧，外侧 a/2 未被榫占用（柱窝的让位空间）──
  check('V-17', '透榫偏内侧布置：内肩 a/6 ｜ 榫 a/3 ｜ 外肩 a/2', () => {
    eq(J1.SHOULDER_IN + J1.THICK + J1.SHOULDER_OUT, M.SEC, '截面三段之和');
    eq(J1.SHOULDER_OUT, J3.SOCKET_DY, '外侧肩宽 = 柱窝 Y 宽');
    const rail = buildPart('LB-A1');
    // 榫头应实心：x ∈ [3.5a,5a], y ∈ [3.5a+a/6, 4a], z 居中 2a/3
    const tenon = {
      x0: C.INNER_FACE, x1: C.EDGE,
      y0: C.INNER_FACE + J1.SHOULDER_IN, y1: C.RAIL_A_Y,
      z0: C.LOWER_Z0 + J1.SHOULDER_Z, z1: C.LOWER_Z1 - J1.SHOULDER_Z,
    };
    if (!isSolidAt(rail, tenon)) throw new Error('榫头区域不是实心');
    // 外侧 a/2 必须完全空出（否则柱窝一铣就破榫）
    const relief = {
      x0: C.INNER_FACE, x1: C.EDGE,
      y0: C.RAIL_A_Y, y1: C.RAIL_A_Y + M.SEC / 2,
      z0: C.LOWER_Z0, z1: C.LOWER_Z1,
    };
    if (!isEmptyAt(rail, relief)) throw new Error('外侧 a/2 未空出，柱窝将破进透榫');
    return `榫 y∈[${tenon.y0},${tenon.y1}]，外侧让位 y∈[${relief.y0},${relief.y1}] 全空`;
  });

  // ── V-18 柱窝开口朝横枨外侧面（非对角线）──
  check('V-18', '柱窝开口朝横枨外侧面，位于外肩 a/2 区域内', () => {
    const railB = buildPart('LB-B1');
    const socket = {
      x0: C.RAIL_B_X, x1: C.RAIL_B_X + M.SEC / 2,          // [4a, 4.5a] 自外侧面向内 a/2
      y0: C.COL_AXIS - J3.SOCKET_DY, y1: C.COL_AXIS,       // [4a, 4.5a]
      z0: C.LOWER_Z0, z1: C.LOWER_Z1,                       // 全高 a
    };
    if (!isEmptyAt(railB, socket)) throw new Error('柱窝未铣通');
    eq(socket.x1, C.RAIL_B_X + M.SEC / 2, '柱窝开口面 = 横枨外侧面');
    // 柱窝内端面必须留料（三面约束之一）
    const innerWall = { ...socket, x0: C.RAIL_B_X - 1, x1: C.RAIL_B_X };
    if (!isSolidAt(railB, innerWall)) throw new Error('柱窝内端面无料');
    // 靠端侧壁必须留料
    const endWall = { ...socket, y0: C.COL_AXIS, y1: C.COL_AXIS + 1 };
    if (!isSolidAt(railB, endWall)) throw new Error('柱窝靠端侧壁无料');
    return `柱窝 x∈[${socket.x0},${socket.x1}] y∈[${socket.y0},${socket.y1}]，开口朝 +X（横枨外侧）`;
  });

  // ── V-19 顺枨双开口槽自顶面向下；中梁有承重面 ──
  check('V-19', '顺枨中部双开口槽自顶面向下 + 中梁端部承重面坐落于槽底', () => {
    const rail = buildPart('LB-A1');
    const zTop = C.LOWER_Z1;
    // 槽在顶面：z ∈ [2.5a, 3a] 空；槽底余料 z ∈ [2a, 2.5a] 实心
    const slot = {
      x0: J2.TONGUE / 2, x1: J2.TONGUE / 2 + J2.SLOT_W,
      y0: C.INNER_FACE, y1: C.INNER_FACE + J2.SLOT_L,
      z0: zTop - J2.SLOT_D, z1: zTop,
    };
    if (!isEmptyAt(rail, slot)) throw new Error('开口槽未铣通');
    const floor = { ...slot, z0: C.LOWER_Z0, z1: zTop - J2.SLOT_D };
    if (!isSolidAt(rail, floor)) throw new Error('槽底无余料 —— 中梁将失去承重面');
    // 中央榫舌保留
    const tongue = { x0: -J2.TONGUE / 2, x1: J2.TONGUE / 2, y0: slot.y0, y1: slot.y1, z0: slot.z0, z1: slot.z1 };
    if (!isSolidAt(rail, tongue)) throw new Error('中央榫舌被铣掉');
    // 中梁端部下半段应已横切让出（★V-26）
    const beam = buildPart('LB-C1');
    const lowerHalf = {
      x0: -M.SEC / 2, x1: M.SEC / 2,
      y0: C.INNER_FACE, y1: J2.BEAM_LEN / 2,
      z0: C.LOWER_Z0, z1: zTop - J2.SLOT_D,
    };
    if (!isEmptyAt(beam, lowerHalf)) throw new Error('中梁端部下半段未横切，将与顺枨槽底余料干涉');
    return `槽 z∈[${slot.z0},${slot.z1}]（自顶面）· 槽底余料 z∈[${floor.z0},${floor.z1}] 承重`;
  });

  // ── V-23 中梁全长 8a ──
  check('V-23', '中梁全长 8a（96 mm），唯一异长构件', () => {
    const beam = buildPart('LB-C1');
    const boxes = beam.toBoxes();
    const y0 = Math.min(...boxes.map((b) => b.y0));
    const y1 = Math.max(...boxes.map((b) => b.y1));
    eq(y1 - y0, J2.BEAM_LEN, '中梁全长');
    eq(J2.BEAM_LEN, a(8), '8a');
    // 肩距 7a
    eq(C.INNER_FACE * 2, a(7), '中梁肩距');
    return `y∈[${y0},${y1}]，全长 ${y1 - y0}mm = 8a，由 10a 短料两端各截去 a`;
  });

  // ── V-02 / V-03 上枨框顺枨中部无任何加工 ──
  check('V-02/03', '上枨框顺枨 UB-A 中部无双开口槽（与 LB-A 为不同网格）', () => {
    const ub = buildPart('UB-A1');
    const lb = buildPart('LB-A1');
    // UB-A 中部区域（对应 LB-A 的双槽位置）必须全部实心
    const mid = {
      x0: -M.SEC / 2, x1: M.SEC / 2,
      y0: C.INNER_FACE, y1: C.INNER_FACE + J2.SLOT_L,
      z0: C.UPPER_Z1 - J2.SLOT_D, z1: C.UPPER_Z1,
    };
    if (!isSolidAt(ub, mid)) throw new Error('上枨框顺枨中部被加工了 —— 这正是原策划的 4 个废槽');
    // 两者网格必须不同
    if (ub.volume() - (C.UPPER_Z0 - C.LOWER_Z0) === lb.volume()) { /* 体积不同即可 */ }
    const vUB = ub.volume(), vLB = lb.volume();
    if (vUB === vLB) throw new Error('UB-A 与 LB-A 体积相同，疑似复用同一网格');
    return `UB-A 中部实心 · UB-A ${vUB}mm³ ≠ LB-A ${vLB}mm³（上枨框另有底面深槽与角牙槽）`;
  });

  // ── V-21 装板槽：上枨框底面 a/2、下枨框顶面 a/6；格心厚 a/3 无榫舌 ──
  check('V-21', '装板槽 上深 a/2 / 下浅 a/6；格心厚 a/3 板边直接入槽', () => {
    eq(J4.SLOT_UP_D, a(1 / 2), '上槽深');
    eq(J4.SLOT_LOW_D, a(1 / 6), '下槽深');
    eq(J4.PANEL_T, a(1 / 3), '格心厚 = 槽宽');
    // 数学上「装得进去」的充要条件：上槽深 ≥ 上咬合 + 下咬合
    if (J4.SLOT_UP_D < J4.BITE_UP + J4.BITE_LOW) {
      throw new Error(`上槽深 ${J4.SLOT_UP_D} < 上咬合 ${J4.BITE_UP} + 下咬合 ${J4.BITE_LOW} —— 格心在数学上装不进去`);
    }
    // 三段式验算：顶入上槽至底后，下端应恰好高于下枨框顶面 a/12
    const topAtFullInsert = C.UPPER_Z0 + J4.SLOT_UP_D;
    const bottomThen = topAtFullInsert - J4.PANEL_H;
    const clearance = bottomThen - C.LOWER_Z1;
    eq(clearance, a(1 / 12), '顶入到底时下端让过下枨框的余量');
    // 落下 a/4 后的最终咬合
    const finalTop = topAtFullInsert - J4.BITE_UP;
    const finalBottom = bottomThen - J4.BITE_UP;
    eq(C.UPPER_Z0 + J4.BITE_UP, finalTop, '最终上咬合');
    eq(C.LOWER_Z1 - J4.BITE_LOW, finalBottom, '最终下咬合');
    eq(J4.PANEL_H, a(10) + a(1 / 4) + a(1 / 6), '格心全高 125 mm');
    return `顶入 a/2 后下端余量 ${clearance}mm → 摆正 → 落 ${J4.BITE_UP}mm → 上咬 ${J4.BITE_UP} / 下咬 ${J4.BITE_LOW}`;
  });

  // ── V-22 格心板肩 ──
  check('V-22', '格心板肩：主体宽 8a，上端向下 3a/4、下端向上 a/2 收窄至 7a', () => {
    eq(J4.PANEL_W, a(8), '主体宽');
    eq(J4.PANEL_W_SHOULDER, a(7), '板肩宽');
    eq(J4.PANEL_W_SHOULDER, J4.SLOT_LEN, '板肩宽 = 槽长');
    eq(J4.PANEL_W, C.COL_AXIS * 2 - M.SEC, '主体宽 = 两立柱内侧面净距');
    const p = buildPart('LT-01');
    const zTop = C.UPPER_Z0 + J4.BITE_UP;
    // 上端板肩区应已收窄
    const corner = {
      x0: J4.PANEL_W_SHOULDER / 2, x1: J4.PANEL_W / 2,
      y0: C.EDGE - M.SEC / 2 - J4.SLOT_INSET - J4.PANEL_T, y1: C.EDGE - M.SEC / 2 - J4.SLOT_INSET,
      z0: zTop - J4.SHOULDER_TOP, z1: zTop,
    };
    if (!isEmptyAt(p, corner)) throw new Error('格心上端未收窄，四角将与立柱/枨框穿模');
    return `主体 ${J4.PANEL_W}mm 抵两柱内侧面 · 两端收窄至 ${J4.PANEL_W_SHOULDER}mm 让过 7a 槽长`;
  });

  // ── V-24 立柱三段两颈绝对高度 ──
  check('V-24', '立柱三段两颈：柱脚 0–2a ｜ 颈2 2a–3a ｜ 柱身 3a–13a ｜ 颈1 13a–14a ｜ 柱头 14a–16a', () => {
    const S = J3.SEG;
    eq(S.FOOT[1], C.LOWER_Z0, '柱脚顶 = 下枨框底');
    eq(S.NECK2[0], C.LOWER_Z0, '颈2 起 = 下枨框底');
    eq(S.NECK2[1], C.LOWER_Z1, '颈2 止 = 下枨框顶');
    eq(S.NECK1[0], C.UPPER_Z0, '颈1 起 = 上枨框底');
    eq(S.NECK1[1], C.UPPER_Z1, '颈1 止 = 上枨框顶');
    eq(S.HEAD[1], M.HEIGHT, '柱头顶 = 全长 16a');
    eq(S.NECK2[1] - S.NECK2[0], M.SEC, '颈高 = 枨料高');
    eq(S.SHAFT[1] - S.SHAFT[0], M.CLEAR, '柱身段长 = 上下枨框净距');
    const col = buildPart('PL-01');
    // 颈部只保留朝内的 1/4 截面
    const keep = {
      x0: C.COL_AXIS - M.SEC / 2, x1: C.COL_AXIS - M.SEC / 2 + J3.NECK,
      y0: C.COL_AXIS - M.SEC / 2, y1: C.COL_AXIS - M.SEC / 2 + J3.NECK,
      z0: S.NECK2[0], z1: S.NECK2[1],
    };
    if (!isSolidAt(col, keep)) throw new Error('颈部保留象限缺料');
    const gone = {
      x0: keep.x1, x1: C.COL_AXIS + M.SEC / 2,
      y0: keep.y0, y1: C.COL_AXIS + M.SEC / 2,
      z0: S.NECK2[0], z1: S.NECK2[1],
    };
    if (!isEmptyAt(col, gone)) throw new Error('颈部外侧象限未铣除');
    return `两颈严格对齐上下枨框 · 颈截面 ${J3.NECK}×${J3.NECK}mm（1/4 截面）`;
  });

  // ── 四柱互为镜像，各自独立朝向 ──
  check('MIRROR', '四根立柱保留象限互为镜像（不可复制旋转）', () => {
    const seen = new Set();
    const centers = ['PL-01', 'PL-02', 'PL-03', 'PL-04'].map((id) => {
      const col = buildPart(id);
      const q = partMeta(id).quadrant;
      const cx = q.sx * C.COL_AXIS, cy = q.sy * C.COL_AXIS;
      for (const [label, seg] of [['颈2', J3.SEG.NECK2], ['颈1', J3.SEG.NECK1]]) {
        const s = sectionAt(col, seg[0], seg[1]);
        if (!s) throw new Error(`${id} ${label} 无料`);
        if (s.x1 - s.x0 !== J3.NECK || s.y1 - s.y0 !== J3.NECK) {
          throw new Error(`${id} ${label} 截面 ${s.x1 - s.x0}×${s.y1 - s.y0}，应为 ${J3.NECK}×${J3.NECK}`);
        }
        // 保留象限须朝向灯笼内侧：截面中心比柱轴心更靠近原点
        const mx = (s.x0 + s.x1) / 2, my = (s.y0 + s.y1) / 2;
        if (Math.abs(mx) >= Math.abs(cx)) throw new Error(`${id} ${label} 未朝内偏置（X）`);
        if (Math.abs(my) >= Math.abs(cy)) throw new Error(`${id} ${label} 未朝内偏置（Y）`);
      }
      // 柱身段必须是满截面 a×a
      const shaft = sectionAt(col, J3.SEG.SHAFT[0], J3.SEG.SHAFT[1]);
      if (shaft.x1 - shaft.x0 !== M.SEC || shaft.y1 - shaft.y0 !== M.SEC) {
        throw new Error(`${id} 柱身段非满截面`);
      }
      const key = `${Math.sign(q.sx)},${Math.sign(q.sy)}`;
      if (seen.has(key)) throw new Error(`朝向重复：${key} —— 四柱疑似复制旋转`);
      seen.add(key);
      return `${id}(${key})`;
    });
    return `四柱朝向互异：${centers.join(' ')}`;
  });

  // ── V-25 / J-5 / J-6 上枨框底面角牙槽 ×4、顶面角花压槽 ×4 ──
  check('V-25', '上枨框底面 4 处角牙槽 + 顶面 4 处角花压槽', () => {
    const ubA = buildPart('UB-A1');
    const cs = {
      x0: C.INNER_FACE - J5.TENON_L, x1: C.INNER_FACE,
      y0: C.INNER_FACE, y1: C.INNER_FACE + J5.SLOT_D,
      z0: C.UPPER_Z0, z1: C.UPPER_Z0 + J5.SLOT_D,
    };
    if (!isEmptyAt(ubA, cs)) throw new Error('上枨框顺枨底面角牙槽缺失');
    const ubB = buildPart('UB-B1');
    const ps = {
      x0: C.RAIL_B_X - M.SEC / 2, x1: C.RAIL_B_X - M.SEC / 2 + J6.TONGUE_L,
      y0: C.RAIL_A_Y, y1: C.RAIL_A_Y + J6.TONGUE_T,
      z0: C.UPPER_Z1 - J6.TONGUE_T, z1: C.UPPER_Z1,
    };
    if (!isEmptyAt(ubB, ps)) throw new Error('上枨框横枨顶面角花压槽缺失');
    return `角牙槽 ${J5.SLOT_D}mm 深 ×4（底面）· 角花压槽 ${J6.TONGUE_T}mm 深 ×4（顶面）`;
  });

  // ── V-05 全部卯眼为透眼（贯穿）──
  check('V-05', '全部卯眼为透眼，贯穿横枨全宽 a，无盲眼', () => {
    for (const id of ['LB-B1', 'LB-B2', 'UB-B1', 'UB-B2']) {
      const r = buildPart(id);
      const { sx, z0 } = id.startsWith('LB')
        ? { sx: id.endsWith('1') ? +1 : -1, z0: C.LOWER_Z0 }
        : { sx: id.endsWith('1') ? +1 : -1, z0: C.UPPER_Z0 };
      const z1 = z0 + M.SEC;
      for (const sy of [+1, -1]) {
        const my0 = sy > 0 ? C.INNER_FACE + J1.SHOULDER_IN : -C.RAIL_A_Y;
        const my1 = sy > 0 ? C.RAIL_A_Y : -(C.INNER_FACE + J1.SHOULDER_IN);
        const hole = {
          x0: sx > 0 ? C.RAIL_B_X - M.SEC / 2 : -(C.RAIL_B_X + M.SEC / 2),
          x1: sx > 0 ? C.RAIL_B_X + M.SEC / 2 : -(C.RAIL_B_X - M.SEC / 2),
          y0: my0, y1: my1,
          z0: z0 + J1.SHOULDER_Z, z1: z1 - J1.SHOULDER_Z,
        };
        if (!isEmptyAt(r, hole)) throw new Error(`${id} 的透眼未贯穿`);
      }
    }
    return `8 处透眼全部贯穿 ${M.SEC}mm 全宽，截面 ${J1.THICK}×${J1.HIGH}mm`;
  });

  // ── 全构件两两干涉检测（文档做不到、代码能做的一条）──
  check('CLASH', '17 件（13 木构件 + 4 格心）在最终装配位两两无干涉', () => {
    const ids = [...WOOD_IDS, ...PANEL_IDS];
    const boxes = new Map(ids.map((id) => [id, buildPart(id).toBoxes()]));
    const clashes = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const v = interferenceVolume(boxes.get(ids[i]), boxes.get(ids[j]));
        if (v > 0) clashes.push(`${ids[i]}↔${ids[j]} ${v}mm³`);
      }
    }
    if (clashes.length) throw new Error(`存在干涉：${clashes.join('；')}`);
    return `${ids.length} 件构件、${(ids.length * (ids.length - 1)) / 2} 组配对，重叠体积全部为 0`;
  });

  // ── 装配连续性：每个节点的公母件必须真正接触（不是悬空）──
  check('SEAT', '关键节点公母件确实贴合（非悬空）', () => {
    const notes = [];
    // J-2：中梁双榫底面 z=2.5a 应贴在顺枨槽底 z=2.5a 上
    const zMid = C.LOWER_Z1 - J2.SLOT_D;
    const beamBoxes = buildPart('LB-C1').toBoxes();
    const forkBottom = Math.min(...beamBoxes.filter((b) => b.y1 > C.INNER_FACE).map((b) => b.z0));
    eq(forkBottom, zMid, 'J-2 中梁榫底面高度');
    notes.push(`J-2 承重面 z=${zMid}mm`);
    // J-3：立柱颈部与横枨柱窝必须完全同域（严丝合缝，既不悬空也不干涉）
    const neck = sectionAt(buildPart('PL-01'), C.LOWER_Z0, C.LOWER_Z1);
    eq(neck.x1 - neck.x0, J3.SOCKET_DX, 'J-3 颈 X 尺寸 = 柱窝深');
    eq(neck.y1 - neck.y0, J3.SOCKET_DY, 'J-3 颈 Y 尺寸 = 柱窝宽');
    eq(neck.x0, C.RAIL_B_X, 'J-3 颈内端面 = 柱窝内端面');
    eq(neck.x1, C.RAIL_B_X + M.SEC / 2, 'J-3 颈外端面 = 横枨外侧面');
    eq(neck.y1, C.COL_AXIS, 'J-3 颈靠端侧壁 = 柱窝靠端侧壁');
    notes.push(`J-3 颈 x∈[${neck.x0},${neck.x1}] y∈[${neck.y0},${neck.y1}] 与柱窝同域`);
    // 竖向夹持：柱身底面 z=3a 压下枨框顶面；柱脚顶面 z=2a 压下枨框底面
    eq(J3.SEG.SHAFT[0], C.LOWER_Z1, '柱身压覆下枨框顶面');
    eq(J3.SEG.FOOT[1], C.LOWER_Z0, '柱脚压覆下枨框底面');
    notes.push('竖向夹持成立（柱身/柱脚上下夹住枨框）');
    return notes.join(' · ');
  });

  // ── §11.1 面数预算 ──
  check('BUDGET', '面数在 §11.1 预算内', () => {
    const rows = [];
    let total = 0;
    for (const id of [...WOOD_IDS, ...PANEL_IDS]) {
      const m = buildPart(id).mesh();
      const meta = partMeta(id);
      total += m.faceCount;
      if (m.faceCount > meta.budget) {
        throw new Error(`${id} ${m.faceCount} tris 超预算 ${meta.budget}`);
      }
      rows.push(`${id}:${m.faceCount}`);
    }
    return `木构件 + 格心包络合计 ${total} tris（${rows.slice(0, 4).join(' ')} …）`;
  });

  return results;
}

/** 供浏览器与 Node 共用的格式化输出 */
export function formatReport(res) {
  const pass = res.filter((r) => r.ok).length;
  const lines = res.map((r) =>
    `${r.ok ? '✓' : '✗'} [${r.code}] ${r.title}${r.detail ? `\n      ${r.detail}` : ''}`);
  return { pass, total: res.length, text: lines.join('\n') };
}
