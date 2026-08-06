/**
 * 开发期视觉校验辅助：在控制台调用 __shot('名字', {w,h,az,el,dist}) 即可
 * 强制渲染一帧并把 PNG 写到项目的 .shots/ 目录。
 * 生产构建里 import.meta.env.DEV 为 false，整段会被摇树移除。
 */
export function installDevShot(stage) {
  if (!import.meta.env.DEV) return;
  window.__shot = async (name = 'shot', opt = {}) => {
    const { w = 1000, h = 640, az, el, dist, target } = opt;
    const prevW = stage.renderer.domElement.width;
    const prevH = stage.renderer.domElement.height;
    if (az !== undefined || dist !== undefined) {
      stage.setRecommended({
        az: az ?? 52, el: el ?? 20, dist: dist ?? 430, target: target ?? undefined,
      });
      stage.snapToRecommended();
    }
    stage.renderer.setSize(w, h, false);
    stage.camera.aspect = w / h;
    stage.camera.updateProjectionMatrix();
    stage.composer.setSize(w, h);
    stage.composer.render();
    const data = stage.renderer.domElement.toDataURL('image/png');
    const r = await fetch('/__shot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, data }),
    }).then((x) => x.json());
    stage.renderer.setSize(prevW, prevH, false);
    stage.composer.setSize(prevW, prevH);
    stage.resize();
    return r.file;
  };
}
