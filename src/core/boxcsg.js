/**
 * 轴对齐盒体 CSG 内核
 *
 * 本项目全部木作加工（铣槽 / 凿透眼 / 铣柱窝 / 切榫 / 开颈 / 开装板槽）
 * 都是「从方料上减去若干个轴对齐长方体」。因此不需要通用 CSG 库，
 * 用非均匀体素栅格 + 贪心面网格化即可得到精确解：
 *
 *   1. 收集全部切割平面 → 把毛坯切成非均匀栅格
 *   2. 标记每个栅格单元是实体还是空腔
 *   3. 仅在「实体 ↔ 空腔」的界面上生成面（内部面天然不存在）
 *   4. 对每个方向的面做 2D 贪心合并 → 最少三角形
 *
 * 三个直接收益：
 *   · 零内部面、零 z-fighting、面数极低（一根开满槽的横枨约 200 tris）
 *   · 面是否落在毛坯表面上 → 自动区分「外表面」与「新切面」(§11.2 MAT_WOOD_CUT)
 *   · 实体单元集合可直接做构件间干涉检测 (§13.1 自检)
 *
 * 全部坐标为整数毫米，无浮点误差。
 */

/** @typedef {{x0:number,y0:number,z0:number,x1:number,y1:number,z1:number}} Box */

export function box(x0, y0, z0, x1, y1, z1) {
  return { x0, y0, z0, x1, y1, z1 };
}

/** 以中心 + 尺寸构造盒 */
export function boxAt(cx, cy, cz, dx, dy, dz) {
  return box(cx - dx / 2, cy - dy / 2, cz - dz / 2, cx + dx / 2, cy + dy / 2, cz + dz / 2);
}

export function boxVolume(b) {
  return Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0) * Math.max(0, b.z1 - b.z0);
}

/** 两盒是否有正体积交集（接触不算） */
export function boxesOverlap(p, q) {
  return (
    Math.min(p.x1, q.x1) > Math.max(p.x0, q.x0) &&
    Math.min(p.y1, q.y1) > Math.max(p.y0, q.y0) &&
    Math.min(p.z1, q.z1) > Math.max(p.z0, q.z0)
  );
}

/** 交集盒（可能为零体积） */
export function boxIntersection(p, q) {
  return box(
    Math.max(p.x0, q.x0), Math.max(p.y0, q.y0), Math.max(p.z0, q.z0),
    Math.min(p.x1, q.x1), Math.min(p.y1, q.y1), Math.min(p.z1, q.z1),
  );
}

/**
 * 实体：一个毛坯盒减去若干切除盒。
 * 保存栅格以便后续网格化、干涉检测与体积统计。
 */
export class Solid {
  /**
   * @param {Box} blank 毛坯
   * @param {Box[]} cuts 切除体
   */
  constructor(blank, cuts = []) {
    this.blank = blank;
    this.cuts = cuts.map((c) => boxIntersection(c, blank)).filter((c) => boxVolume(c) > 0);
    this.#buildGrid();
  }

  #buildGrid() {
    const { blank, cuts } = this;
    const axis = (lo, hi, get0, get1) => {
      const s = new Set([lo, hi]);
      for (const c of cuts) {
        const v0 = get0(c);
        const v1 = get1(c);
        if (v0 > lo && v0 < hi) s.add(v0);
        if (v1 > lo && v1 < hi) s.add(v1);
      }
      return [...s].sort((p, q) => p - q);
    };
    this.xs = axis(blank.x0, blank.x1, (c) => c.x0, (c) => c.x1);
    this.ys = axis(blank.y0, blank.y1, (c) => c.y0, (c) => c.y1);
    this.zs = axis(blank.z0, blank.z1, (c) => c.z0, (c) => c.z1);

    const nx = this.xs.length - 1;
    const ny = this.ys.length - 1;
    const nz = this.zs.length - 1;
    this.nx = nx; this.ny = ny; this.nz = nz;

    // solid[i + nx*(j + ny*k)]
    const solid = new Uint8Array(nx * ny * nz).fill(1);
    for (const c of cuts) {
      const i0 = lowerBound(this.xs, c.x0), i1 = lowerBound(this.xs, c.x1);
      const j0 = lowerBound(this.ys, c.y0), j1 = lowerBound(this.ys, c.y1);
      const k0 = lowerBound(this.zs, c.z0), k1 = lowerBound(this.zs, c.z1);
      for (let k = k0; k < k1; k++)
        for (let j = j0; j < j1; j++)
          for (let i = i0; i < i1; i++) solid[i + nx * (j + ny * k)] = 0;
    }
    this.solid = solid;
  }

  at(i, j, k) {
    if (i < 0 || j < 0 || k < 0 || i >= this.nx || j >= this.ny || k >= this.nz) return 0;
    return this.solid[i + this.nx * (j + this.ny * k)];
  }

  /** 实体体积（立方毫米） */
  volume() {
    let v = 0;
    for (let k = 0; k < this.nz; k++) {
      const dz = this.zs[k + 1] - this.zs[k];
      for (let j = 0; j < this.ny; j++) {
        const dy = this.ys[j + 1] - this.ys[j];
        for (let i = 0; i < this.nx; i++) {
          if (this.at(i, j, k)) v += (this.xs[i + 1] - this.xs[i]) * dy * dz;
        }
      }
    }
    return v;
  }

  /** 实体单元展开为不重叠盒体列表（贪心合并后），用于干涉检测 */
  toBoxes() {
    const claimed = new Uint8Array(this.nx * this.ny * this.nz);
    const idx = (i, j, k) => i + this.nx * (j + this.ny * k);
    const out = [];
    for (let k = 0; k < this.nz; k++) {
      for (let j = 0; j < this.ny; j++) {
        for (let i = 0; i < this.nx; i++) {
          if (!this.at(i, j, k) || claimed[idx(i, j, k)]) continue;
          let ei = i + 1;
          while (ei < this.nx && this.at(ei, j, k) && !claimed[idx(ei, j, k)]) ei++;
          let ej = j + 1;
          outerJ: while (ej < this.ny) {
            for (let x = i; x < ei; x++) {
              if (!this.at(x, ej, k) || claimed[idx(x, ej, k)]) break outerJ;
            }
            ej++;
          }
          let ek = k + 1;
          outerK: while (ek < this.nz) {
            for (let y = j; y < ej; y++)
              for (let x = i; x < ei; x++) {
                if (!this.at(x, y, ek) || claimed[idx(x, y, ek)]) break outerK;
              }
            ek++;
          }
          for (let z = k; z < ek; z++)
            for (let y = j; y < ej; y++)
              for (let x = i; x < ei; x++) claimed[idx(x, y, z)] = 1;
          out.push(box(this.xs[i], this.ys[j], this.zs[k], this.xs[ei], this.ys[ej], this.zs[ek]));
        }
      }
    }
    return out;
  }

  /**
   * 贪心面网格化。
   * @returns {{positions:Float32Array, normals:Float32Array, uvs:Float32Array,
   *            cut:Float32Array, indices:Uint32Array, faceCount:number}}
   */
  mesh() {
    const P = [], N = [], UV = [], CUT = [], IDX = [];
    const push = (quad) => {
      const { p, n, isCut } = quad;
      const base = P.length / 3;
      for (const v of p) { P.push(v[0], v[1], v[2]); N.push(n[0], n[1], n[2]); CUT.push(isCut ? 1 : 0); }
      // UV 取自世界坐标在该面主平面上的投影（毫米），供程序化木纹使用
      const [ax, ay] = uvAxes(n);
      for (const v of p) UV.push(v[ax], v[ay]);
      IDX.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    // 六个方向：dir = 轴(0=x,1=y,2=z)，sign = +1/-1
    for (let axisI = 0; axisI < 3; axisI++) {
      for (const sign of [+1, -1]) {
        this.#meshDirection(axisI, sign, push);
      }
    }

    return {
      positions: new Float32Array(P),
      normals: new Float32Array(N),
      uvs: new Float32Array(UV),
      cut: new Float32Array(CUT),
      indices: new Uint32Array(IDX),
      faceCount: IDX.length / 3,
    };
  }

  #meshDirection(axisI, sign, push) {
    // u,v 为该切片平面内的两个轴
    const [uI, vI] = axisI === 0 ? [1, 2] : axisI === 1 ? [0, 2] : [0, 1];
    const coords = [this.xs, this.ys, this.zs];
    const counts = [this.nx, this.ny, this.nz];
    const nA = counts[axisI], nU = counts[uI], nV = counts[vI];
    const A = coords[axisI], U = coords[uI], V = coords[vI];

    const cell = (ai, ui, vi) => {
      const c = [0, 0, 0];
      c[axisI] = ai; c[uI] = ui; c[vI] = vi;
      return this.at(c[0], c[1], c[2]);
    };

    const normal = [0, 0, 0];
    normal[axisI] = sign;

    for (let ai = 0; ai < nA; ai++) {
      // 该切片上需要出面的单元：自身实体且沿 sign 方向的邻居为空
      const mask = new Uint8Array(nU * nV);
      let any = false;
      for (let vi = 0; vi < nV; vi++) {
        for (let ui = 0; ui < nU; ui++) {
          if (!cell(ai, ui, vi)) continue;
          if (cell(ai + sign, ui, vi)) continue;
          mask[ui + nU * vi] = 1;
          any = true;
        }
      }
      if (!any) continue;

      // 面所在的平面坐标
      const planeCoord = sign > 0 ? A[ai + 1] : A[ai];
      // 是否落在毛坯表面上 → 否则为「新切面」
      const blankLo = [this.blank.x0, this.blank.y0, this.blank.z0][axisI];
      const blankHi = [this.blank.x1, this.blank.y1, this.blank.z1][axisI];
      const onBlankSurface = planeCoord === blankLo || planeCoord === blankHi;

      // 2D 贪心合并
      for (let vi = 0; vi < nV; vi++) {
        for (let ui = 0; ui < nU; ui++) {
          if (!mask[ui + nU * vi]) continue;
          let eu = ui + 1;
          while (eu < nU && mask[eu + nU * vi]) eu++;
          let ev = vi + 1;
          outer: while (ev < nV) {
            for (let x = ui; x < eu; x++) if (!mask[x + nU * ev]) break outer;
            ev++;
          }
          for (let y = vi; y < ev; y++) for (let x = ui; x < eu; x++) mask[x + nU * y] = 0;

          const u0 = U[ui], u1 = U[eu], v0 = V[vi], v1 = V[ev];
          const mk = (uu, vv) => {
            const p = [0, 0, 0];
            p[axisI] = planeCoord; p[uI] = uu; p[vI] = vv;
            return p;
          };
          // 绕序：以 (v1−v0)×(v2−v0) 等于外法线为准。
          // (u,v) 取轴对 (y,z)/(x,z)/(x,y)，其中 (x,z) 这一对是左手序，
          // 故 axisI===1（y 轴切片）需整体反绕。
          let p = [mk(u0, v0), mk(u1, v0), mk(u1, v1), mk(u0, v1)];
          const flip = (sign < 0) !== (axisI === 1);
          if (flip) p = [p[0], p[3], p[2], p[1]];
          push({ p, n: normal, isCut: !onBlankSurface });
        }
      }
    }
  }
}

function uvAxes(n) {
  if (Math.abs(n[0]) > 0.5) return [1, 2];
  if (Math.abs(n[1]) > 0.5) return [0, 2];
  return [0, 1];
}

function lowerBound(arr, v) {
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** 平移一个实体的全部盒体（用于把构件放到世界位置后做干涉检测） */
export function translateBoxes(boxes, dx, dy, dz) {
  return boxes.map((b) => box(b.x0 + dx, b.y0 + dy, b.z0 + dz, b.x1 + dx, b.y1 + dy, b.z1 + dz));
}

/** 两组盒体之间的最大重叠体积（0 表示无干涉） */
export function interferenceVolume(as, bs) {
  let total = 0;
  for (const p of as) for (const q of bs) {
    if (boxesOverlap(p, q)) total += boxVolume(boxIntersection(p, q));
  }
  return total;
}
