/**
 * 产物体积门槛。
 *
 * README 里写着「产物 xxx kB」这类数字，没人守着就会慢慢变成旧闻；
 * 更实际的用处是拦住「误打包」——把一个本该按需引入的东西塞进了首屏，
 * 或者 three 的 tree-shaking 被一次改动破掉，体积会成倍上去而没有任何报错。
 *
 * 门槛按当前实测值留约两成余量。真的需要更多空间时，改这里的数，
 * 顺手把 README 的那一行也改掉 —— 这就是让两者不失同步的机制。
 *
 *   node tools/size-budget.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import process from 'node:process';

/** kB 一律按 1000 字节算，与 Vite 的输出对齐 */
const kB = (n) => Math.round(n / 100) / 10;

const BUDGET = {
  three: 700,      // three.js 那一块（当前约 619 kB）
  app: 260,        // 其余全部代码 + 样式 + 首页（当前约 216 kB）
  totalGzip: 260,  // 全部 gzip 之后（当前约 228 kB）
};

const DIST = path.resolve('dist');
if (!fs.existsSync(DIST)) {
  console.error('没有 dist/。先跑 npm run build。');
  process.exit(2);
}

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(DIST);

let three = 0, app = 0, gz = 0;
const rows = [];
for (const f of files) {
  const buf = fs.readFileSync(f);
  const g = zlib.gzipSync(buf, { level: 9 }).length;
  gz += g;
  const rel = path.relative(DIST, f).replace(/\\/g, '/');
  if (/three-.*\.js$/.test(rel)) three += buf.length; else app += buf.length;
  rows.push(`  ${rel.padEnd(34)} ${String(kB(buf.length)).padStart(7)} kB   gzip ${String(kB(g)).padStart(6)} kB`);
}

console.log('产物体积');
console.log(rows.sort().join('\n'));
console.log('');

const checks = [
  ['three.js 一块', kB(three), BUDGET.three],
  ['其余全部', kB(app), BUDGET.app],
  ['全部 gzip', kB(gz), BUDGET.totalGzip],
];
let bad = 0;
for (const [name, got, cap] of checks) {
  const ok = got <= cap;
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(12)} ${String(got).padStart(7)} kB / 上限 ${cap} kB`);
}
console.log('');
if (bad) {
  console.error(`产物超出门槛 · ${bad} 项。确认不是误打包之后，改 tools/size-budget.mjs 的 BUDGET，并同步 README。`);
  process.exit(1);
}
console.log('产物体积在门槛内');
