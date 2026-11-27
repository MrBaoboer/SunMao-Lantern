/**
 * 1 自由度指针投影与触觉微反馈共用工具
 *
 * 装配拖拽、拖刀加工与教学件拖拽原先各自复制了同一套 NDC 换算、
 * 视向对齐拖拽平面构造与指针守卫。收口到这里之后，多指隔离、主按键守卫
 * 与移动端微触觉全片一次生效。
 */

import * as THREE from 'three';

const _camDir = new THREE.Vector3();

/** 仅响应主指针（鼠标左键或触控/触控笔），避免右键或中键误触交互 */
export function isPrimaryPointer(e) {
  return e.pointerType !== 'mouse' || e.button === 0;
}

/** 将指针屏幕坐标写入 NDC 并更新射线 */
export function setRayFromEvent(ray, ptr, e, canvas, camera) {
  const rect = canvas.getBoundingClientRect();
  ptr.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  ray.setFromCamera(ptr, camera);
}

/** 构造包含合法运动轴 axisDir、且尽量正对相机的拖拽投影平面 */
export function makeDragPlane(camera, axisDir, point) {
  camera.getWorldDirection(_camDir);
  const n = _camDir.clone().addScaledVector(axisDir, -_camDir.dot(axisDir));
  if (n.lengthSq() < 1e-4) {
    n.set(0, 0, 1).addScaledVector(axisDir, -axisDir.z);
    if (n.lengthSq() < 1e-4) n.set(1, 0, 0);
  }
  n.normalize();
  return new THREE.Plane().setFromNormalAndCoplanarPoint(n, point);
}

/** 渐进增强的移动端触觉微脉冲（静音、桌面或不支持时静默跳过） */
export function haptic(ms, state) {
  if (state && !state.sound) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch { /* 不支持或被浏览器策略拦截时静默 */ }
}
