/**
 * 舞台：渲染器 / 相机 / 光照 / 轨道控制 / 后期
 *
 * §1 视角约束：全程可 360° 轨道旋转与缩放；每步有推荐机位，
 * 用户偏离后 3 秒无操作自动缓回 —— 这条在这里实现，全片共用。
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { M } from '../core/modulus.js';
import { PALETTE } from './materials.js';

/** 灯笼几何中心（世界坐标）—— 全片镜头的默认目标 */
export const FOCUS = new THREE.Vector3(0, 0, M.HEIGHT / 2);

/**
 * 场景基调预设。
 * craft/studio 为主线工作台（§11.2 主光 4500K 暖调）；
 * ink 为 S08 静默点的宣纸白；night 为 M1/M5 夜色（环境光降至 15%）。
 */
const MOODS = {
  craft:  { env: 0.55, key: 2.1,  fill: 0.55, rim: 0.90, amb: 0.35, bg: 0x1a1611, ground: false, bloom: 0.30 },
  studio: { env: 0.70, key: 2.4,  fill: 0.70, rim: 1.00, amb: 0.45, bg: 0x241f19, ground: false, bloom: 0.34 },
  ink:    { env: 0.95, key: 1.5,  fill: 1.10, rim: 0.50, amb: 0.85, bg: 0xe6e0d4, ground: false, bloom: 0.20 },
  night:  { env: 0.12, key: 0.22, fill: 0.10, rim: 0.28, amb: 0.09, bg: 0x070a12, ground: true,  bloom: 0.45 },
  dark:   { env: 0.22, key: 0.55, fill: 0.20, rim: 0.50, amb: 0.14, bg: 0x14110e, ground: false, bloom: 0.55 },
};

/**
 * §3.2 规定 Z 轴向上，而 Three.js 默认 +Y 向上。
 * 在建任何对象之前改掉默认 up，否则相机、轨道控制、平行光都会按 Y-up 解算。
 */
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();

    // ── 渲染器 ──
    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance', stencil: false,
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // §11.2 关闭强锐利阴影
    this.renderer = renderer;

    // ── 场景 ──
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.BG_DARK);
    this.scene.fog = null;

    // 环境光照（PMREM，无需外部 HDR 文件）
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    // ── 相机 ──
    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 4000);
    this.camera.position.set(300, -330, 210);

    // ── 三点布光（§11.2 主线暖调，主光色温 4500K）──
    this.key = new THREE.DirectionalLight(0xfff0dc, 2.1);
    this.key.position.set(220, -300, 380);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.near = 50;
    this.key.shadow.camera.far = 1200;
    const s = 190;
    Object.assign(this.key.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    this.key.shadow.bias = -0.0009;
    this.key.shadow.normalBias = 0.6;
    this.key.target.position.copy(FOCUS);
    this.scene.add(this.key, this.key.target);

    this.fill = new THREE.DirectionalLight(0xbcd0e0, 0.55);
    this.fill.position.set(-320, -160, 120);
    this.scene.add(this.fill);

    this.rim = new THREE.DirectionalLight(0xffd9a0, 0.9);
    this.rim.position.set(-120, 340, 260);
    this.scene.add(this.rim);

    this.ambient = new THREE.HemisphereLight(0x8c7a5e, 0x241c14, 0.35);
    this.scene.add(this.ambient);

    // ── 地面（接收柔和接触阴影；巡礼/点灯场景用）──
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x14110e, roughness: 0.92, metalness: 0.0,
    });
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(900, 64), groundMat);
    this.ground.position.z = -1;
    this.ground.receiveShadow = true;
    this.ground.visible = false;
    this.scene.add(this.ground);

    // ── 轨道控制 ──
    const controls = new OrbitControls(this.camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.target.copy(FOCUS);
    controls.minDistance = 90;
    controls.maxDistance = 1400;
    controls.enablePan = false;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 0.9;
    this.controls = controls;

    // §1 用户偏离后 3 秒无操作自动缓回推荐机位
    this.recommend = { pos: this.camera.position.clone(), target: FOCUS.clone(), enabled: true };
    this.idleSince = 0;
    this.userTook = false;
    controls.addEventListener('start', () => { this.userTook = true; this.onUserTakeover?.(true); });
    controls.addEventListener('end', () => { this.idleSince = performance.now(); });

    // ── 后期：仅高光溢出（灯焰、辉光、烟花），阈值调高以免木料泛白 ──
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.72, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.bloomEnabled = true;

    this._onResize = () => this.resize();
    addEventListener('resize', this._onResize);
    this.resize();

    /** @type {Set<(dt:number, t:number)=>void>} */
    this.updaters = new Set();
    this.running = false;
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 设定本步推荐机位。dist 为相机到目标的距离，az/el 为方位角/仰角（度） */
  setRecommended({ az = 45, el = 22, dist = 420, target = FOCUS, ease = 1.0 } = {}) {
    const t = target.clone();
    const ar = (az * Math.PI) / 180, er = (el * Math.PI) / 180;
    const p = new THREE.Vector3(
      t.x + dist * Math.cos(er) * Math.cos(ar),
      t.y + dist * Math.cos(er) * Math.sin(ar),
      t.z + dist * Math.sin(er),
    );
    this.recommend.pos.copy(p);
    this.recommend.target.copy(t);
    this.userTook = false;
    this.idleSince = 0;
    this.cameraEase = ease;
    this.key.target.position.copy(t);
  }

  /** 立即跳到推荐机位（转场用） */
  snapToRecommended() {
    this.camera.position.copy(this.recommend.pos);
    this.controls.target.copy(this.recommend.target);
    this.controls.update();
  }

  update(dt) {
    // 相机缓回：用户操作后 3 秒无输入则回到推荐机位
    if (this.recommend.enabled) {
      const idle = this.userTook && this.idleSince && performance.now() - this.idleSince > 3000;
      if (!this.userTook || idle) {
        const k = 1 - Math.pow(0.001, dt * (this.cameraEase ?? 1));
        this.camera.position.lerp(this.recommend.pos, k);
        this.controls.target.lerp(this.recommend.target, k);
        if (idle && this.camera.position.distanceTo(this.recommend.pos) < 1.2) {
          this.userTook = false; this.idleSince = 0;
          this.onUserTakeover?.(false);
        }
      }
    }
    this.controls.update();
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const t = this.clock.elapsedTime;
      this.update(dt);
      for (const u of this.updaters) u(dt, t);
      if (this.bloomEnabled) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop() { this.running = false; cancelAnimationFrame(this._raf); }

  /** 环境亮度整体调节（夜色场景 §11.2：环境光 15%） */
  setMood(mode) {
    const preset = MOODS[mode] || MOODS.craft;
    this.mood = preset;
    this.moodName = MOODS[mode] ? mode : 'craft';
    this.scene.environmentIntensity = preset.env;
    this.key.intensity = preset.key;
    this.fill.intensity = preset.fill;
    this.rim.intensity = preset.rim;
    this.ambient.intensity = preset.amb;
    this.scene.background = new THREE.Color(preset.bg);
    this.ground.visible = preset.ground;
    this.bloom.strength = preset.bloom;
  }

  dispose() {
    this.stop();
    removeEventListener('resize', this._onResize);
    this.controls.dispose();
    this.envRT?.dispose();
    this.renderer.dispose();
  }
}
