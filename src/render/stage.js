/**
 * 舞台：渲染器 / 相机 / 光照 / 轨道控制 / 后期
 *
 * §1 视角约束：全程可 360° 轨道旋转与缩放；每步有推荐机位。
 * 用户转过之后就停在他放的地方 —— 不自动缓回，见 update()。
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { M } from '../core/modulus.js';

/** 灯笼几何中心（世界坐标）—— 全片镜头的默认目标 */
export const FOCUS = new THREE.Vector3(0, 0, M.HEIGHT / 2);

/**
 * 场景基调预设。
 *
 * craft / studio 是工作台，跟随界面主题：浅色模式下是明亮的宣纸桌面，
 * 深色模式下是暖调的暗房。dusk / night 是傍晚与夜色 —— 这两个不跟主题走，
 * 因为灯笼只有在暗处才亮得起来。
 *
 * 曝光纪律：木料的漫反射本身就亮（#a9743f 再乘一层年轮），四盏灯加环境光
 * 一旦超过约 2.6 的总辐照，ACES 会把它推成一片奶白，木纹随之消失。
 * 浅色模式尤其危险 —— 背景也是浅的，主体一旦泛白就与背景糊在一起。
 * 下面这组数值是照着「木头要看得出是木头」调的，不要整体上调。
 *
 * bg 是一对：[中心, 边缘]。背景不是一块平色，而是一圈落在主体背后的光晕。
 */
const MOODS = {
  dark: {
    craft:  { env: 0.50, key: 1.85, fill: 0.45, rim: 0.85, amb: 0.30, bg: [0x231d16, 0x0d0a08], bloom: 0.30 },
    studio: { env: 0.62, key: 2.05, fill: 0.55, rim: 0.95, amb: 0.38, bg: [0x2c251c, 0x110d0a], bloom: 0.34 },
    dusk:   { env: 0.28, key: 0.68, fill: 0.24, rim: 0.60, amb: 0.16, bg: [0x241b13, 0x0b0807], bloom: 0.50 },
  },
  light: {
    craft:  { env: 0.72, key: 1.30, fill: 0.40, rim: 0.50, amb: 0.34, bg: [0xf6f1e6, 0xd8cdb6], bloom: 0.08 },
    studio: { env: 0.82, key: 1.45, fill: 0.46, rim: 0.55, amb: 0.40, bg: [0xfaf6ec, 0xdfd5bf], bloom: 0.10 },
    dusk:   { env: 0.52, key: 0.95, fill: 0.30, rim: 0.62, amb: 0.24, bg: [0xe6d9c1, 0xb8a789], bloom: 0.18 },
  },
  /** 夜色不跟主题走 —— 灯笼只有在暗处才亮得起来 */
  fixed: {
    night: { env: 0.12, key: 0.22, fill: 0.10, rim: 0.28, amb: 0.09, bg: [0x0d1220, 0x03040a], ground: true, bloom: 0.45 },
  },
};

/**
 * 背景：一块贴在远平面上的屏幕空间渐变。
 *
 * 换掉平色背景是这一版画面里最省的一笔 —— 主体背后有一圈光晕，
 * 边缘压暗，木头就从背景里"站"出来了，不必额外加地面或假阴影。
 */
function makeBackdrop() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uInner: { value: new THREE.Color(0xf6f1e6) },
      uOuter: { value: new THREE.Color(0xd8cdb6) },
      uAspect: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform vec3 uInner;
      uniform vec3 uOuter;
      uniform float uAspect;
      void main() {
        vec2 p = (vUv - 0.5) * vec2(max(uAspect, 1.0), max(1.0 / uAspect, 1.0));
        // 光晕中心略高于画面正中 —— 主体本来就摆在偏上的位置
        p.y -= 0.06;
        float d = length(p) * 1.42;
        float k = smoothstep(0.0, 1.0, clamp(d, 0.0, 1.0));
        gl_FragColor = vec4(mix(uInner, uOuter, k), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

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
    this.scene.background = null;   // 背景由 backdrop 画，见 makeBackdrop()
    this.scene.fog = null;
    this.backdrop = makeBackdrop();
    this.scene.add(this.backdrop);

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
    // 沉在灯脚之下：灯笼是挂着的，穗子要有地方垂（见 decor.js 的 buildTassel）。
    // 顺带让地面纹样光斑的投射距离长一点，花纹摊得开
    this.ground.position.z = -30;
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

    /** 界面遮住的上下边（像素）—— 取景按剩下的那块画面算，见 setSafeArea() */
    this.safe = { top: 0, bottom: 0 };

    // 每步的推荐机位。userTook 一旦为真，相机就交给用户，不再自己走
    this.recommend = { pos: this.camera.position.clone(), target: FOCUS.clone(), enabled: true };
    this.userTook = false;
    controls.addEventListener('start', () => { this.userTook = true; });

    // ── 后期：仅高光溢出（灯焰、辉光），阈值调高以免木料泛白 ──
    this.composer = new EffectComposer(renderer);
    // EffectComposer 自建的离屏目标默认单采样，构造器上的 antialias 只管默认帧缓冲。
    // 不补这一下，开着 bloom 的桌面端全程没有抗锯齿，反倒是关掉 bloom 的低配档有 ——
    // 这盏灯满屏都是 3 mm 的棂条和高对比木棱，镜头又一直在缓慢环绕，锯齿会爬。
    this.composer.renderTarget1.samples = 4;
    this.composer.renderTarget2.samples = 4;
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
    this.backdrop.material.uniforms.uAspect.value = w / h;
    // 画幅一变，取景距离也得跟着重算，否则竖屏上主体会被裁掉
    if (this._lastFrame) this.setRecommended(this._lastFrame, { keepUser: true });
  }

  /**
   * 界面遮住了多少画面。取景与构图都按剩下的那块算 ——
   * 底部摊开一排卡片时，灯笼自己会往上让，并退远到卡片上方仍看得全。
   * @param {{top?:number, bottom?:number}} px
   */
  setSafeArea({ top = 0, bottom = 0 }) {
    if (this.safe.top === top && this.safe.bottom === bottom) return;
    this.safe = { top, bottom };
    // 动手的时候不重新取景。字幕一句句换，每句行数不同，安全区跟着变 ——
    // 于是推荐机位每隔几秒挪一点，手上正在对位的画面就一直在缓慢地飘。
    // 记下新的安全区留给下一步用，这一步的机位保持进来时的样子。
    if (this.held) return;
    if (this._lastFrame) this.setRecommended(this._lastFrame, { keepUser: true });
  }

  /** 画面中真正可用的那一块：高度占比与中心相对整幅的偏移 */
  #viewport() {
    const h = this.canvas.clientHeight || innerHeight || 1;
    // 下限 0.62：界面再厚也不能把主体挤成一枚邮票；但保底放得太低，
    // 主体会大面积压进底部旁白与卡片的文字区，字和木纹叠在一起谁都读不清
    const free = Math.max(h * 0.62, h - this.safe.top - this.safe.bottom);
    return { frac: free / h, lift: (this.safe.bottom - this.safe.top) / (2.4 * h) };
  }

  /**
   * 装下一个包围盒需要多远。
   *
   * 竖屏手机的水平视场只有十来度 —— 按垂直视场调好的距离，横过来一定裁边。
   * 所以两个方向各算一次，取远的那个。
   * @param {{r:number, h?:number}} box r = 水平半径，h = 垂直半高（毫米）
   */
  fitDistance({ r = 0, h = r }) {
    const vHalf = (this.camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const vFree = Math.atan(Math.tan(vHalf) * this.#viewport().frac);
    return Math.max(h / Math.tan(vFree), r / Math.tan(hHalf));
  }

  /**
   * 设定本步推荐机位。
   * @param {object} o
   * @param {number} [o.az]   方位角（度）
   * @param {number} [o.el]   仰角（度）
   * @param {number} [o.dist] 相机到目标的距离（毫米），宽画幅下的取景意图
   * @param {{r:number,h?:number}} [o.fit] 这一步必须完整看到的范围。
   *   画幅装不下时把相机往后拉 —— 只会拉远，不会拉近，宽屏上的取景意图原样保留。
   */
  /**
   * @param {{keepUser?:boolean}} [mode] keepUser：只是拿旧声明重算一遍距离
   *   （画幅变了、界面高度变了），不是一次新的取景意图。这种重算**不能清掉
   *   userTook** —— 否则用户刚把画面转到顺手的角度，随便哪一行提示换个字数，
   *   ResizeObserver 就会绕到这里，把「用户接管过」这件事抹掉，镜头立刻自己溜回去。
   *   动手的步骤里这条路径每秒都在走，锁因此形同虚设。
   */
  setRecommended(o = {}, { keepUser = false } = {}) {
    const { az = 45, el = 22, dist = 420, target = FOCUS, ease = 1.0, fit } = o;
    this._lastFrame = { ...o, target };
    const t = target.clone();

    const d = fit ? Math.max(dist, this.fitDistance(fit) * 1.06) : dist;

    // 底部的讲述与行动压掉了一截画面 —— 把主体整体抬起来，别让它坐在字上
    t.z -= 2 * d * Math.tan((this.camera.fov * Math.PI) / 360) * this.#viewport().lift;

    const ar = (az * Math.PI) / 180, er = (el * Math.PI) / 180;
    const p = new THREE.Vector3(
      t.x + d * Math.cos(er) * Math.cos(ar),
      t.y + d * Math.cos(er) * Math.sin(ar),
      t.z + d * Math.sin(er),
    );
    this.recommend.pos.copy(p);
    this.recommend.target.copy(t);
    if (!keepUser) this.userTook = false;
    this.cameraEase = ease;
    this.key.target.position.copy(t);
  }

  /** 立即跳到推荐机位（转场用） */
  snapToRecommended() {
    this.camera.position.copy(this.recommend.pos);
    this.controls.target.copy(this.recommend.target);
    this.controls.update();
  }

  /**
   * 动手的步骤里，连「界面高度变了重新取景」也一并冻住。
   *
   * 字幕一句句换，每句行数不同，安全区跟着变 —— 推荐机位于是每隔几秒挪一点，
   * 手上正在对位的画面就一直在缓慢地飘。这一条与用户有没有转过画面无关，
   * 所以单独一个开关。引擎每翻一步解开一次。
   */
  hold(on) { this.held = !!on; }

  /**
   * 相机只在**用户没碰过**的时候走向推荐机位。
   *
   * 原先还有一条「松手三秒自动缓回」。它的本意是别让人迷路，实际效果是
   * 你刚把画面转到看得清的角度，三秒后它自己溜回去 —— 尤其在动手的步骤里，
   * 手上正在对位，画面在漂。整条去掉：**转到哪儿就停在哪儿**，
   * 画面只在翻页或步骤内换工件时才动，那是作者下达的转场。
   *
   * 想回到推荐机位，翻一步再翻回来即可（`setRecommended` 会清掉接管标记）。
   */
  update(dt) {
    if (this.recommend.enabled && !this.userTook) {
      const k = 1 - Math.pow(0.001, dt * (this.cameraEase ?? 1));
      this.camera.position.lerp(this.recommend.pos, k);
      this.controls.target.lerp(this.recommend.target, k);
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
      // 单个 updater 抛错不能连坐这一帧剩下的所有更新 —— 记录，继续走
      for (const u of this.updaters) {
        try { u(dt, t); } catch (e) { console.error('[updater]', e); }
      }
      if (this.bloomEnabled) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop() { this.running = false; cancelAnimationFrame(this._raf); }

  /** 切换界面主题时，工作台的光跟着换一套 */
  setTheme(theme) {
    this.theme = theme === 'dark' ? 'dark' : 'light';
    this.setMood(this.moodName || 'craft');
  }

  /** 环境亮度整体调节 */
  setMood(mode) {
    const theme = this.theme || 'light';
    const preset = MOODS.fixed[mode] || MOODS[theme][mode] || MOODS[theme].craft;
    this.mood = preset;
    this.moodName = (MOODS.fixed[mode] || MOODS[theme][mode]) ? mode : 'craft';
    this.scene.environmentIntensity = preset.env;
    this.key.intensity = preset.key;
    this.fill.intensity = preset.fill;
    this.rim.intensity = preset.rim;
    this.ambient.intensity = preset.amb;
    const u = this.backdrop.material.uniforms;
    u.uInner.value.setHex(preset.bg[0]);
    u.uOuter.value.setHex(preset.bg[1]);
    this.ground.visible = !!preset.ground;
    this.bloom.strength = preset.bloom;
    this.onMood?.(this.moodName);
  }

  dispose() {
    this.stop();
    removeEventListener('resize', this._onResize);
    this.controls.dispose();
    this.envRT?.dispose();
    this.renderer.dispose();
  }
}
