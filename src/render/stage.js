/**
 * 舞台：渲染器 / 相机 / 光照 / 轨道控制 / 后期
 *
 * §1 视角约束：全程可 360° 轨道旋转与缩放；每步有推荐机位。
 * 用户转过之后就停在他放的地方 —— 不自动缓回，见 update()。
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { M } from '../core/modulus.js';

/** 灯笼几何中心（世界坐标）—— 全片镜头的默认目标 */
export const FOCUS = new THREE.Vector3(0, 0, M.HEIGHT / 2);

/**
 * 高光溢出的起点（作者定的下限）。
 *
 * UnrealBloomPass 的高通是 `smoothstep(threshold, threshold + 0.01, luma)` ——
 * 0.01 的过渡宽度等于一刀硬切。背景是一整块**径向渐变**而不是光源，它一旦
 * 从中间越过这条线，高通就会沿等亮度线把渐变裁出一个圆盘，模糊之后正是
 * 画面正中那枚白色光斑。所以真正下发给 pass 的阈值取「这条下限」与
 * 「本档背景最亮处」两者中的高者，见 setMood()。
 */
const BLOOM_FLOOR = 0.86;

/** 背景与阈值之间留的余量：高通自己还有 0.01 的过渡宽度，留双倍 */
const BLOOM_MARGIN = 0.02;

/**
 * 界面高度变多少才值得重新取景（像素）。
 *
 * 字幕一句一行、两行来回换，安全区就跟着差一行的高度。原先每变一次就重算一次机位 ——
 * 于是画面每隔几秒轻轻挪一下：相机在飘，主光的目标点跟着飘，阴影贴图随之整体位移，
 * 纸面上棂条的影子就会持续爬动。看上去正是「东西明明停着，却在轻微颤动」。
 *
 * 那点位移换不来任何取景上的好处：一行字不过占画面高度的百分之三。
 * 门槛取一行半，坞这一级的变化（上百像素）照样重新取景。
 */
const REFRAME_MIN = 48;

/** 手动缩放的下限与上限（毫米）。取景需要退得更远时，上限跟着让 —— 见 setRecommended() */
const MIN_DIST = 90;
const MAX_DIST = 1400;

/** 换基调的过渡时长（秒）—— 与镜头转场同一个量级，两件事看起来是一次动作 */
const MOOD_FADE = 0.8;

const _luma = new THREE.Color();
const _mixA = new THREE.Color();
const _mixB = new THREE.Color();
const _off = new THREE.Vector3();

/**
 * 进场斜坡的长度（秒）。
 *
 * 指数衰减在第一帧就是最快的 —— 起步那一下仍然读作「弹了一下」。
 * 让速度在这段时间里从零涨到满，转场就有了起、有了收。
 */
const EASE_IN = 0.42;

/**
 * 线性工作空间下的亮度 —— 与 LuminosityHighPassShader 里 `luminance()`
 * 用的是同一组系数。传进来的是 sRGB 十六进制，setHex 负责转换。
 */
function linearLuma(hex) {
  _luma.setHex(hex);
  return 0.2126 * _luma.r + 0.7152 * _luma.g + 0.0722 * _luma.b;
}

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
 *
 * bloom 这一列整体减半，为的是抵掉 three r185 的一处上游修正。
 *
 * r185 之前 UnrealBloomPass 的可分离高斯核没有归一化：每趟权重和只有
 * 0.60–0.66（核半径当成了 σ，于是在 1σ 处硬截断）。r185 改成 σ = r/3 并把
 * 核放大一倍，权重和回到 0.996（PR #31528）。五级 mip 是串联的、每级还各走
 * 横竖两趟，于是同一个 strength 在 r185 上明显更亮。
 *
 * 在冻住火焰的点灯画面上实测（对照 r170，同为 strength 0.45）：
 * 整幅平均增亮 2.25 倍、峰值 1.39 倍。取两者之间，整列减半 ——
 * 这是把观感调回这组数原本标定的样子，不是重新调味。
 */
const MOODS = {
  dark: {
    craft:  { env: 0.50, key: 1.85, fill: 0.45, rim: 0.85, amb: 0.30, bg: [0x231d16, 0x0d0a08], bloom: 0.15 },
    studio: { env: 0.62, key: 2.05, fill: 0.55, rim: 0.95, amb: 0.38, bg: [0x2c251c, 0x110d0a], bloom: 0.17 },
    dusk:   { env: 0.28, key: 0.68, fill: 0.24, rim: 0.60, amb: 0.16, bg: [0x241b13, 0x0b0807], bloom: 0.25 },
  },
  /*
   * 浅色两档不要那圈光晕。
   *
   * 「主体背后一圈暖光晕、四周压暗」在暗场里是对的 —— 深色与夜色档的木头靠它
   * 从背景里站出来。可浅色档反过来：实测 A2 主体区 ≈ 186、紧挨着的背景 ≈ 214，
   * **背景本来就比主体亮**，而最亮的那一块恰恰落在灯笼正后方。
   * 于是舞台中央糊着一片白 —— 作者说的「白色高亮蒙版」就是它。
   * 原先中心 #faf6ec 几乎纯白，与糊在灯上的绵纸只差 4 级，四片格心整个融进背景。
   *
   * 所以浅色两档把中心与边缘的落差从二十七级压到六级：不再是光晕，
   * 只剩一层极轻的暖度过渡，主体自己去撑对比。暗场那两档原样保留。
   */
  light: {
    craft:  { env: 0.72, key: 1.30, fill: 0.40, rim: 0.50, amb: 0.34, bg: [0xe2d8c2, 0xdcd2ba], bloom: 0.04 },
    studio: { env: 0.82, key: 1.45, fill: 0.46, rim: 0.55, amb: 0.40, bg: [0xe6dcc6, 0xe0d6be], bloom: 0.05 },
    dusk:   { env: 0.52, key: 0.95, fill: 0.30, rim: 0.62, amb: 0.24, bg: [0xe6d9c1, 0xb8a789], bloom: 0.09 },
  },
  /** 夜色不跟主题走 —— 灯笼只有在暗处才亮得起来 */
  fixed: {
    night: { env: 0.12, key: 0.22, fill: 0.10, rim: 0.28, amb: 0.09, bg: [0x0d1220, 0x03040a], ground: true, bloom: 0.23 },
  },
};

/**
 * 背景：一块贴在远平面上的屏幕空间渐变。
 *
 * 换掉平色背景是这一版画面里最省的一笔 —— 主体背后有一圈光晕，
 * 边缘压暗，木头就从背景里"站"出来了，不必额外加地面或假阴影。
 *
 * 末尾那两个 include 不是装饰。uInner/uOuter 存的是**线性**值（Color.setHex
 * 会把 sRGB 转进工作色空间），所以这段颜色必须过一道色调映射与 sRGB 编码
 * 才是作者标的那个颜色。走 composer 时这两步由 OutputPass 代办，两个 include
 * 因此自动失效（three 只在渲染到画布时才给材质接上色调映射）；而低配档是
 * `renderer.render()` 直出画布，没有 OutputPass —— 少了这两句，线性值被原样
 * 写进 sRGB 帧缓冲，背景整体发暗。实测浅色档边缘 157 / 213（craft）、
 * 101 / 186（dusk，也就是开场与封面那一档），差得一眼看得出来。
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
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    depthTest: false,
    depthWrite: false,
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

/**
 * 三档的画质预算。
 *
 * `low` 走 `renderer.render()` 直出，没有后处理，因此默认帧缓冲的 MSAA
 * （构造器的 antialias）是它唯一的抗锯齿来源，必须留着。
 * `mid`/`high` 走 composer：最终只有 OutputPass 那一个全屏四边形画到默认帧缓冲，
 * 给它开 4× MSAA 是纯浪费 —— 一块 1440×900@2x 的多重采样帧缓冲要上百兆显存，
 * 而抗锯齿本来就由 composer 自己的离屏目标（samples）做。
 */
const TIERS = {
  low:  { antialias: true,  maxPixelRatio: 1.5,  samples: 0, shadow: 0 },
  mid:  { antialias: false, maxPixelRatio: 1.75, samples: 2, shadow: 1024 },
  high: { antialias: false, maxPixelRatio: 2,    samples: 4, shadow: 2048 },
};

export class Stage {
  /** @param {'low'|'mid'|'high'} [tier] */
  constructor(canvas, tier = 'high') {
    this.canvas = canvas;
    this.tier = TIERS[tier] ? tier : 'high';
    const q = TIERS[this.tier];
    this.quality = q;
    // Timer 而非 Clock（Clock 自 r183 起标记废弃）。connect(document) 接上页面可见性：
    // 标签页切走再切回来时计时器自己归零，那一帧不会甩出一个几十秒的 dt ——
    // 主循环虽然把 dt 掐在 0.05，但 elapsedTime 一样会跳，火焰与流苏会瞬移一大截。
    this.timer = new THREE.Timer();
    this.timer.connect(document);

    // ── 渲染器 ──
    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: q.antialias, powerPreference: 'high-performance', stencil: false,
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, q.maxPixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = q.shadow > 0;
    // §11.2 关闭强锐利阴影。r185 起 PCFSoftShadowMap 被并进 PCFShadowMap 并废弃 ——
    // 现在的 PCF 本身就是软的（硬件 sampler2DShadow + 5 抽 Vogel 盘，按 shadow.radius 缩放）。
    // 继续写旧常量的话每次加载都会警告一句，然后被静默换成同一个值。
    renderer.shadowMap.type = THREE.PCFShadowMap;
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
    /*
     * 近裁面 2 而不是 1 —— 深度精度与 near 成正比，翻一倍就是白拿的一倍余量。
     * D4 在窄画幅上要退到一千七之外，那里 near=1 的分辨力只剩约 0.17 mm，
     * 而这盏灯里到处是零点几毫米的贴合面。
     *
     * 不能再往上提：minDistance 量的是相机到**目标**的距离，而灯笼本身有两百毫米宽 ——
     * 拉到最近时相机其实已经探进灯笼里了。实测全片最紧的一处是手机上的 D5，
     * 最近的几何离相机只有 7.2 mm（见 .shots/r14-near.mjs）。2 mm 留着 3.6 倍余量。
     */
    this.camera = new THREE.PerspectiveCamera(38, 1, 2, 4000);
    this.camera.position.set(300, -330, 210);

    // ── 三点布光（§11.2 主线暖调，主光色温 4500K）──
    this.key = new THREE.DirectionalLight(0xfff0dc, 2.1);
    this.key.position.set(220, -300, 380);
    this.key.castShadow = q.shadow > 0;
    this.key.shadow.mapSize.set(q.shadow || 1024, q.shadow || 1024);
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
    controls.minDistance = MIN_DIST;
    controls.maxDistance = MAX_DIST;
    controls.enablePan = false;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 0.9;
    this.controls = controls;

    /** 界面遮住的上下边（像素）—— 取景按剩下的那块画面算，见 setSafeArea() */
    this.safe = { top: 0, bottom: 0 };

    // 每步的推荐机位。userTook 一旦为真，相机就交给用户，不再自己走。
    // 除了终点位置，另存一份**球坐标**：转场按方位角/仰角/距离各自插值，
    // 相机因此始终沿着一条绕着主体的弧走，见 update()
    this.recommend = {
      pos: this.camera.position.clone(), target: FOCUS.clone(), enabled: true,
      az: 0, el: 0, dist: this.camera.position.length(),
    };
    this.userTook = false;
    /** 转场的进场斜坡：0→1，见 update() */
    this._blend = 1;
    controls.addEventListener('start', () => { this.userTook = true; });

    // ── 后期：仅高光溢出（灯焰、辉光），阈值调高以免木料泛白 ──
    this.composer = new EffectComposer(renderer);
    // EffectComposer 自建的离屏目标默认单采样，构造器上的 antialias 只管默认帧缓冲。
    // 不补这一下，开着 bloom 的桌面端全程没有抗锯齿，反倒是关掉 bloom 的低配档有 ——
    // 这盏灯满屏都是 3 mm 的棂条和高对比木棱，镜头又一直在缓慢环绕，锯齿会爬。
    this.composer.renderTarget1.samples = q.samples;
    this.composer.renderTarget2.samples = q.samples;
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // 阈值只是个起点：真正下发的那一档由 setMood() 按本档背景算出来
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.72, BLOOM_FLOOR);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.bloomEnabled = true;

    /*
     * resize 合并到下一帧。
     *
     * 手机上地址栏收起、软键盘进出，resize 会连着来十几次；每一次都要重建
     * composer 那两组离屏目标（还各带 MSAA），正好卡在最需要流畅的那一下。
     */
    this._onResize = () => {
      if (this._resizeRaf) return;
      this._resizeRaf = requestAnimationFrame(() => { this._resizeRaf = 0; this.resize(); });
    };
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
    // 动手的时候一律不重新取景 —— 手上正在对位，画面不能自己飘。
    // 记下新的安全区留给下一步用，这一步的机位保持进来时的样子。
    if (this.held) return;
    // 小变化不动机位（见 REFRAME_MIN）。比的是**上一次真正据以取景的那一组**，
    // 不是上一帧 —— 否则一行一行地慢慢涨，每次都不到门槛，加起来却早过了
    const was = this._framedSafe || { top: 0, bottom: 0 };
    if (Math.abs(top - was.top) < REFRAME_MIN && Math.abs(bottom - was.bottom) < REFRAME_MIN) return;
    if (this._lastFrame) this.setRecommended(this._lastFrame, { keepUser: true });
  }

  /**
   * 画面中真正可用的那一块：高度占比与中心相对整幅的偏移。
   *
   * 下限 0.62：界面再厚也不能把主体挤成一枚邮票。撑到这一档时**上下等量**地撑开，
   * 占比与中心因此同出一带 —— 两者若各算各的（高度设了下限、中心却按未设限的真实
   * 安全区算），多出来的那一截就全部溢向下方，正好压在旁白上。上方只有一条细进度尺，
   * 让它往上溢一半，代价小得多。
   */
  #viewport() {
    const h = this.canvas.clientHeight || innerHeight || 1;
    let { top, bottom } = this.safe;
    const grow = (h * 0.62 - (h - top - bottom)) / 2;
    if (grow > 0) { top = Math.max(0, top - grow); bottom = Math.max(0, bottom - grow); }
    const free = h - top - bottom;
    return { frac: free / h, lift: (bottom - top) / (2 * h) };
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
    this._framedSafe = { ...this.safe };   // 这一次取景据的是哪一组安全区
    const t = target.clone();

    const d = fit ? Math.max(dist, this.fitDistance(fit) * 1.06) : dist;
    // 轨道控制会在 update() 里把相机距离夹进 [minDistance, maxDistance]，
    // 推荐机位也不例外 —— 窄画幅上 D4 那种大跨度需要退到一千七，被 1400 夹住
    // 就等于取景声明作废，两侧当场裁掉。缩放上限因此至少要容得下这一步的取景。
    this.controls.maxDistance = Math.max(MAX_DIST, d * 1.05);

    // 底部的讲述与行动压掉了一截画面 —— 把主体整体抬起来，别让它坐在字上
    t.z -= 2 * d * Math.tan((this.camera.fov * Math.PI) / 360) * this.#viewport().lift;

    const ar = (az * Math.PI) / 180, er = (el * Math.PI) / 180;
    const p = new THREE.Vector3(
      t.x + d * Math.cos(er) * Math.cos(ar),
      t.y + d * Math.cos(er) * Math.sin(ar),
      t.z + d * Math.sin(er),
    );

    /*
     * 这是「一次新的转场」还是「同一个机位挪了一点」？
     *
     * 封面那圈自转每帧都下达一次新机位（每帧才 0.03°）。若每次都把进场斜坡按回零，
     * 速度就永远涨不起来，相机会越落越远 —— 封面的灯于是几乎不转。
     * 所以只有跨度够大才算新转场，小挪动接着原来的速度走。
     */
    const dAz = Math.abs(Math.atan2(Math.sin(ar - this.recommend.az), Math.cos(ar - this.recommend.az)));
    const fresh = dAz > 0.02 || Math.abs(er - this.recommend.el) > 0.02
      || Math.abs(d - this.recommend.dist) > 5 || this.recommend.target.distanceTo(t) > 5;

    this.recommend.pos.copy(p);
    this.recommend.target.copy(t);
    this.recommend.az = ar;
    this.recommend.el = er;
    this.recommend.dist = d;
    if (!keepUser) {
      this.userTook = false;
      // keepUser 那一路（画幅变了、界面高了）每秒都在走，不该当成新转场
      if (fresh) {
        this._blend = 0;
        // 这一次要跨过多少度 —— update() 据此把速率压一档
        const c = this.#spherical();
        this._span = Math.abs(Math.atan2(Math.sin(ar - c.az), Math.cos(ar - c.az))) * 180 / Math.PI;
      }
    }
    this.cameraEase = ease;
    this.key.target.position.copy(t);
  }

  /** 相机此刻相对轨道目标的球坐标（Z 轴向上） */
  #spherical() {
    const o = _off.copy(this.camera.position).sub(this.controls.target);
    const dist = Math.max(1e-4, o.length());
    return { az: Math.atan2(o.y, o.x), el: Math.asin(Math.max(-1, Math.min(1, o.z / dist))), dist };
  }

  /** 相机已经走到位了吗（用户接管时恒为真）—— 冒烟据此判断这一步稳没稳 */
  get camSettled() {
    if (!this.recommend.enabled || this.userTook) return true;
    const c = this.#spherical();
    const daz = Math.atan2(Math.sin(this.recommend.az - c.az), Math.cos(this.recommend.az - c.az));
    return Math.abs(daz) < 0.004 && Math.abs(this.recommend.el - c.el) < 0.004
      && Math.abs(this.recommend.dist - c.dist) < 0.5
      && this.controls.target.distanceTo(this.recommend.target) < 0.5;
  }

  /**
   * 立即站到推荐机位。
   *
   * 主线的翻页**不用**它 —— 那里要的是一次转场，不是一次跳切。
   * 留给三处真正另起一个场的地方：封面摆位、进互动模块、脚本拍图。
   */
  snapToRecommended() {
    this.camera.position.copy(this.recommend.pos);
    this.controls.target.copy(this.recommend.target);
    this._blend = 1;
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
    const r = this.recommend;
    if (r.enabled && !this.userTook) {
      // 起：速度在 EASE_IN 秒里从零涨满（smoothstep）；收：指数衰减本来就自带
      this._blend = Math.min(1, this._blend + dt / EASE_IN);
      const b = this._blend * this._blend * (3 - 2 * this._blend);
      // 摆得越大走得越从容：同一个速率下，绕过一百度和挪过十度都只花一秒 ——
      // 前者读起来是甩镜头。按这一次要跨的角度把速率压一档，短跳仍然干脆
      const k = 1 - Math.pow(0.001, dt * (this.cameraEase ?? 1) * b / (1 + (this._span ?? 0) / 110));

      /*
       * 按球坐标插值，不按位置插值。
       *
       * 两点之间直着插，走的是一条弦：方位角差得多的两步（B3 的 38° 到 C1 的 −84°
       * 差 122°）相机会从主体中间穿过去，近处还会先怼上再退开。
       * 分开插方位角、仰角与距离，相机就始终沿着一条绕着主体的弧走 ——
       * 这也正是「转场」这件事在镜头语言里本来的样子。
       */
      const cur = this.#spherical();
      const daz = Math.atan2(Math.sin(r.az - cur.az), Math.cos(r.az - cur.az));  // 走最短的那一边
      const az = cur.az + daz * k;
      const el = cur.el + (r.el - cur.el) * k;
      const dist = cur.dist + (r.dist - cur.dist) * k;
      this.controls.target.lerp(r.target, k);
      const t = this.controls.target;
      this.camera.position.set(
        t.x + dist * Math.cos(el) * Math.cos(az),
        t.y + dist * Math.cos(el) * Math.sin(az),
        t.z + dist * Math.sin(el),
      );
    }
    this.controls.update();
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      this.timer.update();
      const dt = Math.min(this.timer.getDelta(), 0.05);
      const t = this.timer.getElapsed();
      this.#stepMood(dt);
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

  /**
   * 环境亮度整体调节。
   *
   * **换基调是渐变，不是硬切。** A1 的傍晚（bg 中心 #e6d9c1）到 A2 的工作台
   * （#faf6ec）在浅色下差得一眼看得出来 —— 实测画面四角 197,185,160 → 217,213,203，
   * 蓝通道差了 43。翻页那一下整块背景「啪」地换色，读起来就是接不上。
   * 所以只登记目标值，由主循环每帧往那边走（见 #stepMood），约 0.8 s 到位。
   *
   * 不能用 tween/wait：那一套会被翻页的 cancelAll() 掐断，掐在半路基调就停在中间色。
   * 界面要不要跟着变暗（onMood）仍然立刻通知 —— 字压在正在变暗的画面上更难读。
   */
  setMood(mode) {
    const theme = this.theme || 'light';
    const preset = MOODS.fixed[mode] || MOODS[theme][mode] || MOODS[theme].craft;
    this.mood = preset;
    this.moodName = (MOODS.fixed[mode] || MOODS[theme][mode]) ? mode : 'craft';
    this._moodTo = preset;
    if (!this._moodAt) this._moodAt = { ...preset, bg: [...preset.bg] };  // 第一次：直接站定
    // 地面是有无之分，插不了值 —— 要出现就立刻出现，要消失等走完再消失
    if (preset.ground) this.ground.visible = true;
    this.#applyMood();
    this.onMood?.(this.moodName);
  }

  /** 把当前这一组基调值真正下发到光与背景上 */
  #applyMood() {
    const m = this._moodAt;
    this.scene.environmentIntensity = m.env;
    this.key.intensity = m.key;
    this.fill.intensity = m.fill;
    this.rim.intensity = m.rim;
    this.ambient.intensity = m.amb;
    const u = this.backdrop.material.uniforms;
    u.uInner.value.setHex(m.bg[0]);
    u.uOuter.value.setHex(m.bg[1]);
    this.bloom.strength = m.bloom;
    // 背景永远压在高通门槛以下 —— 否则渐变会被从中间切出一个圆盘，
    // 模糊之后就是画面正中那枚白色光斑。见 BLOOM_FLOOR 的注释。
    // 过渡途中也要守住，所以按**当前**这一组算，不是按目标那一组。
    this.bloom.threshold = Math.max(BLOOM_FLOOR, linearLuma(m.bg[0]) + BLOOM_MARGIN);
  }

  /** 每帧朝目标基调走一步。走完之后才允许地面消失 */
  #stepMood(dt) {
    const to = this._moodTo, at = this._moodAt;
    if (!to || !at) return;
    const k = 1 - Math.pow(0.001, dt / MOOD_FADE);
    let moving = false;
    for (const key of ['env', 'key', 'fill', 'rim', 'amb', 'bloom']) {
      if (Math.abs(to[key] - at[key]) > 1e-4) moving = true;
      at[key] += (to[key] - at[key]) * k;
    }
    for (let i = 0; i < 2; i++) {
      _mixA.setHex(at.bg[i]); _mixB.setHex(to.bg[i]);
      if (_mixA.getHex() !== _mixB.getHex()) moving = true;
      at.bg[i] = _mixA.lerp(_mixB, k).getHex();
    }
    if (moving) this.#applyMood();
    else if (!to.ground && this.ground.visible) this.ground.visible = false;
  }

  dispose() {
    this.stop();
    cancelAnimationFrame(this._resizeRaf);
    removeEventListener('resize', this._onResize);
    this.timer.dispose();   // 摘掉 visibilitychange 监听
    this.controls.dispose();
    this.envRT?.dispose();
    this.renderer.dispose();
  }
}
