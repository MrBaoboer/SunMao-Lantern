/**
 * 特效：木屑 / 涟漪 / 能量环
 *
 * §11.1 粒子预算：单发牡丹 ≤ 800，「福」字 ≈ 600，同屏上限 5,000，
 *       超出时自动淘汰最老的一发。低端机木屑降至 4 粒且不做物理碰撞。
 */

import * as THREE from 'three';

/** 设备档位自动选择（首次进入按性能选，允许手动切换） */
export function detectTier() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  // 只认 UA 会漏掉 iPad —— iPadOS 默认按桌面版上报（UA 里写的是 Macintosh），
  // 于是 iPad 被判成高配档、全屏 bloom 全开，而作者的原意（正则里列了 iPad）是低配。
  // Chromium 系直接问 userAgentData；Safari / Firefox 没有，就按指针类型兜底：
  // 粗指针 + 不能悬停 = 手指操作的设备。最后仍留一道 UA 正则给更老的浏览器。
  const touchOnly = () => matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches;
  const mobile = navigator.userAgentData?.mobile
    ?? (touchOnly() || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
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
