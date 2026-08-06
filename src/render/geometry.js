/**
 * CSG 实体 → THREE.BufferGeometry
 *
 * 顶点属性中额外携带 aCut（该面是否为加工新露出的面），
 * 由 materials.js 的木料着色器消费 —— 加工感由几何直接驱动。
 */

import * as THREE from 'three';
import { partCenter } from '../core/parts.js';

/**
 * @param {import('../core/boxcsg.js').Solid} solid
 * @param {{recenter?: boolean}} opts recenter 时把几何原点移到毛坯中心，
 *        便于 Object3D 做自转/摆位动画
 */
export function solidToGeometry(solid, { recenter = true } = {}) {
  const m = solid.mesh();
  const g = new THREE.BufferGeometry();

  let pos = m.positions;
  let origin = new THREE.Vector3(0, 0, 0);
  if (recenter) {
    const b = solid.blank;
    origin = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    pos = new Float32Array(m.positions.length);
    for (let i = 0; i < m.positions.length; i += 3) {
      pos[i] = m.positions[i] - origin.x;
      pos[i + 1] = m.positions[i + 1] - origin.y;
      pos[i + 2] = m.positions[i + 2] - origin.z;
    }
  }

  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
  g.setAttribute('aCut', new THREE.BufferAttribute(m.cut, 1));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  g.userData.origin = origin;
  g.userData.faceCount = m.faceCount;
  return g;
}

/** 顺纹方向：取毛坯最长的那个轴 */
export function grainAxisOf(solid) {
  const b = solid.blank;
  const d = [b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0];
  return d.indexOf(Math.max(...d));
}

/** 构件世界中心（= 几何 recenter 后应放置的位置） */
export function homeOf(partId) {
  const c = partCenter(partId);
  return new THREE.Vector3(c.x, c.y, c.z);
}

/**
 * 出头端面的暖金描边（§5 J-1「这是本灯笼的造型符号，不可省」）。
 * 用线框勾出所有落在毛坯端面之外的面轮廓。
 */
export function edgeLines(geometry, color = 0xc8a063, opacity = 0.5) {
  const edges = new THREE.EdgesGeometry(geometry, 25);
  return new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}
