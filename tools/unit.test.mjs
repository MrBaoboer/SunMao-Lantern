/**
 * 单元断言 —— 用 Node 自带的 node:test，不引任何依赖。
 *
 * `npm run verify` 验的是**这盏灯的几何**闭不闭合；这里验的是它底下那几个
 * 纯函数的**行为边界**：模数守卫会不会真的抛错、CSG 内核在退化输入下算什么、
 * 补间的取消语义是不是「不兑现」。三个都是别处默默依赖、出错却很隐蔽的地方。
 *
 *   npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { a, av, dim, M, C } from '../src/core/modulus.js';
import { box, boxVolume, boxesOverlap, boxIntersection, Solid, interferenceVolume } from '../src/core/boxcsg.js';
import { tween, wait, cancelAll, tick, Ease } from '../src/util/tween.js';

// ── 模数 ────────────────────────────────────────────────
test('a() 只接受 a/12 的整数倍，越界当场抛错', () => {
  assert.equal(a(1), 12);
  assert.equal(a(1 / 12), 1);
  assert.equal(a(3.5), 42);
  // 这道守卫是「全部坐标都是整数毫米」这个前提的唯一执行者
  assert.throws(() => a(1 / 5), /模数越界/);
  assert.throws(() => a(0.01), /模数越界/);
});

test('av() 不做栅格断言，只用于陈列位这类非结构尺寸', () => {
  assert.equal(av(3.2), 38);          // 3.2 × 12 = 38.4 → 四舍五入
  assert.doesNotThrow(() => av(1 / 7));
});

test('dim() 双写「模数倍数（毫米）」', () => {
  assert.equal(dim(8), '8a（96 mm）');
  assert.equal(dim(1 / 2), '1/2a（6 mm）');
  assert.equal(dim(1.5), '1+1/2a（18 mm）');
});

test('体系里的关键关系成立', () => {
  assert.equal(C.INNER_FACE * 2, M.SHOULDER_SPAN);       // 肩距 = 两内侧面间距
  assert.equal(M.SHOULDER_SPAN + 2 * a(1.5), M.LEN_SHORT); // 顺枨全长
});

// ── CSG 内核 ────────────────────────────────────────────
test('切除盒完全落在毛坯之外时被丢掉，实体不变', () => {
  const blank = box(0, 0, 0, 10, 10, 10);
  const s = new Solid(blank, [box(100, 100, 100, 110, 110, 110)]);
  assert.equal(s.cuts.length, 0);
  assert.equal(s.volume(), 1000);
});

test('只挨着一个面的切除盒不算相交（接触不去料）', () => {
  const blank = box(0, 0, 0, 10, 10, 10);
  const s = new Solid(blank, [box(10, 0, 0, 20, 10, 10)]);
  assert.equal(s.volume(), 1000);
  assert.equal(boxesOverlap(box(0, 0, 0, 1, 1, 1), box(1, 0, 0, 2, 1, 1)), false);
});

test('穿透孔的体积与面数都对：贪心合并不该把一个孔拆碎', () => {
  const blank = box(0, 0, 0, 12, 12, 12);
  const s = new Solid(blank, [box(0, 4, 4, 12, 8, 8)]);   // 4×4 的通孔
  assert.equal(s.volume(), 12 * 12 * 12 - 12 * 4 * 4);
  const m = s.mesh();
  // 外表面 6 面（其中两面各被孔挖掉中间一块 → 各拆成 4 块）+ 孔壁 4 面
  // = 4 + 4×2 + 4 = 16 个四边形 = 32 个三角形
  assert.equal(m.faceCount, 32);
  // 孔壁是新切面，外表面不是 —— 加工感全靠这一位属性
  assert.ok([...m.cut].some((v) => v === 1), '孔壁应标为新切面');
  assert.ok([...m.cut].some((v) => v === 0), '外表面不应标为新切面');
});

test('两个实体的干涉体积可精确求出（互不相碰时为 0）', () => {
  const p = new Solid(box(0, 0, 0, 10, 10, 10)).toBoxes();
  const q = new Solid(box(10, 0, 0, 20, 10, 10)).toBoxes();
  assert.equal(interferenceVolume(p, q), 0);
  const r = new Solid(box(8, 0, 0, 18, 10, 10)).toBoxes();
  assert.equal(interferenceVolume(p, r), 2 * 10 * 10);
});

test('boxIntersection 允许零体积结果，不会算成负数', () => {
  const i = boxIntersection(box(0, 0, 0, 1, 1, 1), box(5, 5, 5, 6, 6, 6));
  assert.equal(boxVolume(i), 0);
});

// ── 补间 ────────────────────────────────────────────────
test('缓动曲线两端落在 0 与 1（浮点误差以内）', () => {
  for (const [name, fn] of Object.entries(Ease)) {
    assert.ok(Math.abs(fn(0)) < 1e-9, `${name}(0) = ${fn(0)}`);
    assert.ok(Math.abs(fn(1) - 1) < 1e-9, `${name}(1) = ${fn(1)}`);
  }
});

test('tween 走满时兑现，且最后一帧一定是 1', async () => {
  let last = -1;
  const p = tween(0.1, (k) => { last = k; });
  tick(0.05);
  tick(0.05);
  await p;
  assert.equal(last, 1);
});

test('cancelAll 之后 tween 与 wait 都不兑现 —— 上一步的后续代码就此打住', async () => {
  let ran = false;
  tween(1, () => {}).then(() => { ran = true; });
  wait(0.01).then(() => { ran = true; });
  cancelAll();
  tick(2);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(ran, false);
});

test('回调抛错不会让 tween 变成不死 tween', async () => {
  const errs = [];
  const real = console.error;
  console.error = (...a2) => errs.push(a2);
  try {
    const p = tween(0.1, () => { throw new Error('boom'); });
    tick(0.2);
    await p;                     // 抛错也必须兑现，否则整条链卡死
  } finally {
    console.error = real;
  }
  assert.ok(errs.length > 0, '错误应被记录');
  // 再 tick 一次不应再抛（tween 已经从队列里摘掉）
  assert.doesNotThrow(() => tick(0.2));
});
