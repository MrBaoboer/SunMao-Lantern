/**
 * 特效：木屑 / 涟漪 / 能量环 / 烟花粒子
 *
 * §11.1 粒子预算：单发牡丹 ≤ 800，「福」字 ≈ 600，同屏上限 5,000，
 *       超出时自动淘汰最老的一发。低端机木屑降至 4 粒且不做物理碰撞。
 */

import * as THREE from 'three';

/** 设备档位自动选择（首次进入按性能选，允许手动切换） */
export function detectTier() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mobile || mem <= 2 || cores <= 2) return 'low';
  if (mem <= 4 || cores <= 4) return 'mid';
  return 'high';
}

const CHIP_COUNT = { low: 4, mid: 8, high: 12 };

/** 木屑迸发：带重力、落台 0.6 s 后消失 */
export class ChipBurst {
  constructor(scene, tier = 'high') {
    this.scene = scene;
    this.tier = tier;
    this.pool = [];
    this.live = [];
    const geo = new THREE.BoxGeometry(1.6, 0.9, 0.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0xd8a86a, roughness: 0.8 });
    this.geo = geo; this.mat = mat;
  }

  emit(pos, dir = new THREE.Vector3(0, 0, 1), spread = 0.9) {
    const n = CHIP_COUNT[this.tier];
    for (let i = 0; i < n; i++) {
      let m = this.pool.pop();
      if (!m) { m = new THREE.Mesh(this.geo, this.mat); this.scene.add(m); }
      m.visible = true;
      m.position.copy(pos);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const v = dir.clone()
        .add(new THREE.Vector3(
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread,
        )).normalize().multiplyScalar(28 + Math.random() * 46);
      this.live.push({
        m, v,
        w: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9),
        life: 0.6 + Math.random() * 0.35,
        age: 0,
      });
    }
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const c = this.live[i];
      c.age += dt;
      c.v.z -= 620 * dt;                     // 重力
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.w.x * dt;
      c.m.rotation.y += c.w.y * dt;
      if (c.m.position.z < 0) { c.m.position.z = 0; c.v.multiplyScalar(0.24); c.v.z = Math.abs(c.v.z) * 0.2; }
      if (c.age > c.life) {
        c.m.visible = false;
        this.pool.push(c.m);
        this.live.splice(i, 1);
      }
    }
  }
}

/** 接缝金色涟漪（装配成功的视觉签名） */
export class Ripples {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.RingGeometry(1, 1.6, 32);
  }
  emit(pos, normal = new THREE.Vector3(0, 0, 1), { color = 0xc8a063, size = 26, dur = 0.55 } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
    });
    const m = new THREE.Mesh(this.geo, mat);
    m.position.copy(pos);
    m.lookAt(pos.clone().add(normal));
    m.renderOrder = 6;
    this.scene.add(m);
    this.items.push({ m, mat, age: 0, dur, size });
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const r = this.items[i];
      r.age += dt;
      const k = r.age / r.dur;
      const s = 1 + k * r.size;
      r.m.scale.set(s, s, s);
      r.mat.opacity = 0.85 * (1 - k);
      if (k >= 1) { this.scene.remove(r.m); r.mat.dispose(); this.items.splice(i, 1); }
    }
  }
}

/** S25 合龙：一圈暖金能量环自下而上扫过整个框架 */
export class EnergyRing {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.RingGeometry(60, 96, 64);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0xc8a063, transparent: true, opacity: 0, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.active = null;
  }
  sweep({ z0 = 0, z1 = 192, dur = 1.2 } = {}) {
    this.active = { age: 0, dur, z0, z1 };
    this.mesh.visible = true;
  }
  update(dt) {
    if (!this.active) return;
    const a = this.active;
    a.age += dt;
    const k = Math.min(1, a.age / a.dur);
    this.mesh.position.z = a.z0 + (a.z1 - a.z0) * k;
    this.mat.opacity = Math.sin(k * Math.PI) * 0.7;
    if (k >= 1) { this.active = null; this.mesh.visible = false; }
  }
}

/**
 * 烟花粒子系统（M5）
 * §M5：单发牡丹 ≤ 800 粒子，「福」字 ≈ 600，同屏上限 5,000，超出淘汰最老一发。
 */
export class Fireworks {
  constructor(scene, tier = 'high') {
    this.scene = scene;
    this.tier = tier;
    this.max = { low: 1500, mid: 3000, high: 5000 }[tier];
    this.shells = [];
    this.count = 0;

    const g = new THREE.BufferGeometry();
    this.cap = this.max;
    this.pos = new Float32Array(this.cap * 3);
    this.col = new Float32Array(this.cap * 3);
    this.alp = new Float32Array(this.cap);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alp, 1));
    g.setDrawRange(0, 0);
    this.geo = g;

    const mat = new THREE.PointsMaterial({
      size: 5.5, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float alpha;\nvarying float vA;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = alpha;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vA;')
        .replace('#include <premultiplied_alpha_fragment>',
          `float d = length(gl_PointCoord - vec2(0.5));
           if (d > 0.5) discard;
           gl_FragColor.a *= vA * smoothstep(0.5, 0.05, d);
           #include <premultiplied_alpha_fragment>`);
    };
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.parts = []; // {x,y,z,vx,vy,vz,r,g,b,life,age,drag,fixed}
  }

  /**
   * @param {'peony'|'double'|'willow'|'ring'|'fu'} type
   * @param {THREE.Vector3} at
   * @param {THREE.Color} color
   */
  burst(type, at, color, opts = {}) {
    const budget = { low: 260, mid: 520, high: 800 }[this.tier];
    let n = budget;
    const P = [];
    const push = (vx, vy, vz, life, drag = 0.62, fixed = null) => {
      P.push({
        x: at.x, y: at.y, z: at.z, vx, vy, vz,
        r: color.r, g: color.g, b: color.b,
        life, age: 0, drag, fixed,
      });
    };

    if (type === 'fu') {
      // 「福」字点阵 —— 美术手工排布，不用字体轮廓自动采样（自动采样的点阵不好看）
      const pts = fuLattice();
      n = pts.length;
      const S = opts.scale ?? 2.4;
      for (const [px, py] of pts) {
        push(0, 0, 0, 2.6, 0.9, {
          x: at.x + px * S, y: at.y, z: at.z + py * S,
        });
      }
    } else if (type === 'ring') {
      n = Math.min(n, 420);
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2;
        const sp = 150 + Math.random() * 20;
        push(Math.cos(th) * sp, (Math.random() - 0.5) * 12, Math.sin(th) * sp, 1.8 + Math.random() * 0.7);
      }
    } else if (type === 'willow') {
      n = Math.min(n, 520);
      for (let i = 0; i < n; i++) {
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const sp = 60 + Math.random() * 90;
        push(
          Math.sin(ph) * Math.cos(th) * sp,
          Math.sin(ph) * Math.sin(th) * sp,
          Math.cos(ph) * sp * 0.7 + 40,
          2.4 + Math.random() * 0.8, 0.3,
        );
      }
    } else {
      // 牡丹：球状对称炸开
      const shells = type === 'double' ? 2 : 1;
      for (let s = 0; s < shells; s++) {
        for (let i = 0; i < n / shells; i++) {
          const th = Math.random() * Math.PI * 2;
          const ph = Math.acos(2 * Math.random() - 1);
          const sp = (110 + Math.random() * 60) * (s ? 0.7 : 1);
          push(
            Math.sin(ph) * Math.cos(th) * sp,
            Math.sin(ph) * Math.sin(th) * sp,
            Math.cos(ph) * sp,
            1.5 + Math.random() * 0.9,
          );
        }
      }
    }

    this.parts.push(...P);
    // 超出上限时淘汰最老的
    while (this.parts.length > this.max) this.parts.splice(0, this.parts.length - this.max);
    return P.length;
  }

  update(dt) {
    const P = this.parts;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.age += dt;
      if (p.age > p.life) continue;
      if (p.fixed) {
        // 「福」字：爆开后 0.3 s 内归位，停留 1.2 s（期间轻微抖动，避免死板）
        const k = Math.min(1, p.age / 0.3);
        p.x += (p.fixed.x - p.x) * k * 0.35 + (Math.random() - 0.5) * 0.5;
        p.y += (p.fixed.y - p.y) * k * 0.35;
        p.z += (p.fixed.z - p.z) * k * 0.35 + (Math.random() - 0.5) * 0.5;
        if (p.age > 1.5) p.z -= 70 * dt * (p.age - 1.5);
      } else {
        p.vz -= 46 * dt;                      // 重力
        const d = Math.pow(p.drag, dt * 60);  // 空气阻力
        p.vx *= d; p.vy *= d; p.vz *= d;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      }
      const t = p.age / p.life;
      const a = t < 0.08 ? t / 0.08 : Math.pow(1 - t, 1.6);
      // 余烬闪烁
      const flick = 0.75 + Math.random() * 0.5;
      if (w < this.cap) {
        this.pos[w * 3] = p.x; this.pos[w * 3 + 1] = p.y; this.pos[w * 3 + 2] = p.z;
        this.col[w * 3] = p.r * flick; this.col[w * 3 + 1] = p.g * flick; this.col[w * 3 + 2] = p.b * flick;
        this.alp[w] = a;
        w++;
      }
    }
    // 清理死亡粒子
    if (P.length && P[0].age > P[0].life) {
      this.parts = P.filter((p) => p.age <= p.life);
    }
    this.count = w;
    this.geo.setDrawRange(0, w);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }

  clear() { this.parts = []; this.geo.setDrawRange(0, 0); }
}

/** 「福」字点阵（手工排布，约 600 点）—— 归一化到 ±20 */
function fuLattice() {
  // 以笔画为单位铺点：礻旁 + 一 + 口 + 田
  const strokes = [
    // 礻（示字旁）
    [[-14, 14], [-11, 17]], [[-12, 12], [-12, -14]],
    [[-17, 6], [-12, 9]], [[-12, 9], [-7, 6]],
    [[-16, -2], [-8, -2]],
    // 一（宀 上横）
    [[-4, 17], [17, 17]],
    // 口
    [[-1, 12], [13, 12]], [[-1, 12], [-1, 4]], [[13, 12], [13, 4]], [[-1, 4], [13, 4]],
    // 田 外框
    [[-4, 1], [16, 1]], [[-4, 1], [-4, -16]], [[16, 1], [16, -16]], [[-4, -16], [16, -16]],
    // 田 内十字
    [[6, 1], [6, -16]], [[-4, -7.5], [16, -7.5]],
  ];
  const pts = [];
  for (const [p0, p1] of strokes) {
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const n = Math.max(4, Math.round(len * 1.9));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([
        p0[0] + (p1[0] - p0[0]) * t + (Math.random() - 0.5) * 0.5,
        p0[1] + (p1[1] - p0[1]) * t + (Math.random() - 0.5) * 0.5,
      ]);
    }
  }
  return pts;
}
