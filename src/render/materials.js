/**
 * §11.2 材质与 PBR 参数
 *
 * 木料材质是程序化的：年轮 + 顺纹在着色器里算，无贴图文件。
 * 关键设计 —— CSG 内核给每个顶点标了 `aCut`（该面是否为加工新露出的面），
 * 着色器据此在同一个材质里同时表达 MAT_WOOD_MAIN 与 MAT_WOOD_CUT，
 * 于是「加工感」不是画出来的，是算出来的：切一刀，新切面自动变亮一档。
 */

import * as THREE from 'three';

export const PALETTE = {
  /** §12.4 全局语义色 —— 使用纪律见文档，任何一次误用都会破坏认知 */
  TENON: 0xc8a063,   // 榫色（暖金）：榫头 / 凸 / 阳 / 正确 / 成功
  MORTISE: 0x6e7b7a, // 卯色（青灰）：卯眼 / 凹 / 阴 / 槽 / 装板槽
  SOCKET: 0x7a6e8a,  // 柱窝色（紫灰）：柱窝 / 立柱颈部
  ALERT: 0xc8262b,   // 警示红：★全片唯一使用处（上枨框「✕ 不加工」）
  CUTPAPER: 0xb03a2e,// 窗花红
  PAPER: 0xf3e6ce,   // 纸白
  INK: 0x1c1a17,
  BG_DARK: 0x14110e,
};

const WOOD_COMMON = /* glsl */ `
  float h11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
  float h31(vec3 p){
    p = fract(p*vec3(0.1031,0.1030,0.0973));
    p += dot(p, p.yxz+33.33);
    return fract((p.x+p.y)*p.z);
  }
  float vnoise(vec3 x){
    vec3 i = floor(x), f = fract(x);
    f = f*f*(3.0-2.0*f);
    float n000=h31(i), n100=h31(i+vec3(1,0,0)), n010=h31(i+vec3(0,1,0)), n110=h31(i+vec3(1,1,0));
    float n001=h31(i+vec3(0,0,1)), n101=h31(i+vec3(1,0,1)), n011=h31(i+vec3(0,1,1)), n111=h31(i+vec3(1,1,1));
    return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),
               mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y), f.z);
  }
  float fbm(vec3 p){
    float s = 0.0, amp = 0.5;
    for(int i=0;i<4;i++){ s += amp*vnoise(p); p *= 2.03; amp *= 0.5; }
    return s;
  }
`;

/**
 * 木料材质。
 * @param {object} o
 * @param {0|1|2} o.grainAxis 顺纹方向（0=X,1=Y,2=Z）—— 木纹沿构件长轴
 * @param {THREE.Vector3} o.center 构件中心（世界坐标），年轮以此为心
 */
export function makeWoodMaterial({ grainAxis = 0, center = new THREE.Vector3(), tone = 0 } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xa9743f,     // MAT_WOOD_MAIN 暖木
    roughness: 0.62,
    metalness: 0.0,
  });

  mat.userData.uniforms = {
    uGrainAxis: { value: grainAxis },
    uCenter: { value: center.clone() },
    uCutMix: { value: 1.0 },      // 新切面显现程度（加工动画用 0→1）
    uHighlight: { value: new THREE.Color(0x000000) },
    uHighlightAmt: { value: 0.0 },
    uSectionMode: { value: 0.0 }, // 剖切面暗两级（§11.2 MAT_WOOD_SECTION）
    uTone: { value: tone },       // 每根木料的色差微扰，避免 13 根一模一样
  };

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.uniforms);
    mat.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        attribute float aCut;
        varying float vCut;
        varying vec3 vWPos;
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vCut = aCut;
        vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        ${WOOD_COMMON}
        varying float vCut;
        varying vec3 vWPos;
        uniform int   uGrainAxis;
        uniform vec3  uCenter;
        uniform float uCutMix;
        uniform vec3  uHighlight;
        uniform float uHighlightAmt;
        uniform float uSectionMode;
        uniform float uTone;
      `)
      .replace('#include <color_fragment>', `
        #include <color_fragment>
        {
          vec3 p = vWPos - uCenter;
          // 分离顺纹方向与横纹平面
          float along;
          vec2  cross2;
          if (uGrainAxis == 0)      { along = p.x; cross2 = p.yz; }
          else if (uGrainAxis == 1) { along = p.y; cross2 = p.xz; }
          else                      { along = p.z; cross2 = p.xy; }

          // 年轮：椭圆同心 + 沿长轴缓慢漂移，模拟真实锯切面。
          // 周期约 3 mm —— 12 mm 的方料截面上要能数出四五圈，梨木才「纹理细密」。
          float wobble = fbm(vec3(cross2 * 0.42, along * 0.045)) * 2.4;
          float r = length(cross2 * vec2(1.0, 1.65)) * 1.55 + wobble + uTone * 9.0;
          float rings = 0.5 + 0.5 * sin(r * 1.05);
          rings = pow(rings, 1.5);

          // 顺纹纤维：沿长轴强烈拉伸的细噪声
          float fiber = fbm(vec3(cross2 * 3.0, along * 0.06));
          float pores = smoothstep(0.60, 0.80, fbm(vec3(cross2 * 10.0, along * 0.35)));

          // 年轮只占三成 —— 梨木「纹理细密」，靠的是细腻而非强对比。
          // 对比过强会让 12 mm 的方料看起来像瓦楞纸。
          vec3 light = vec3(0.78, 0.53, 0.30);
          vec3 dark  = vec3(0.52, 0.31, 0.15);
          vec3 wood  = mix(dark, light, rings * 0.32 + fiber * 0.68);
          wood *= 1.0 - pores * 0.14;

          // 新切面：比外表面亮两级、略光洁（MAT_WOOD_CUT #C29055）
          float cut = vCut * uCutMix;
          wood = mix(wood, wood * 1.34 + vec3(0.06, 0.04, 0.02), cut);

          // 剖切面：比主材暗两级（MAT_WOOD_SECTION #7E5227）
          wood = mix(wood, wood * 0.62, uSectionMode);

          diffuseColor.rgb *= wood / vec3(0.66, 0.45, 0.25);
          diffuseColor.rgb = mix(diffuseColor.rgb, uHighlight, uHighlightAmt);
        }
      `)
      .replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.55, vCut * uCutMix);
      `);
  };

  return mat;
}

/**
 * 绵纸 DC-PAPER —— transmission 0.45 是全片光效基准值，勿改。
 *
 * 不透明度不能按「半透明」去调。绵纸在反射光下基本是不透的，透光只发生在
 * 从里面点亮的时候。压到 0.6 一档，没点灯时能一眼看穿到对面那片格心，
 * 整盏灯读出来是个玻璃罩子，不是灯笼 —— 而封面、开场、拆解全是不点灯的画面。
 */
export function makePaperMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: PALETTE.PAPER,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.86,
    emissive: new THREE.Color(0xffb765),
    emissiveIntensity: 0.0, // 点亮时由 M1 抬升 —— 光从纸里透出来
  });
  mat.userData.transmission = 0.45;
  return mat;
}

/** 窗花 DC-CUT —— alpha clip（非 blend，避免排序问题） */
export function makeCutPaperMaterial(map) {
  return new THREE.MeshStandardMaterial({
    color: PALETTE.CUTPAPER,
    map: map || null,
    roughness: 0.75,
    metalness: 0.0,
    alphaTest: 0.5,
    transparent: false,
    side: THREE.DoubleSide,
  });
}

/** 描金 MAT_GOLD_TRIM */
export function makeGoldMaterial() {
  return new THREE.MeshStandardMaterial({
    color: PALETTE.TENON, roughness: 0.35, metalness: 0.85,
  });
}

/** 丝线 MAT_SILK（中国结 / 流苏） */
export function makeSilkMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.55, metalness: 0.0 });
}

/** 灯芯 MAT_METAL_CORE */
export function makeCoreMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x8e7b4f, roughness: 0.4, metalness: 0.75 });
}

/** 语义色描边材质（榫=暖金 / 卯=青灰 / 柱窝=紫灰） */
export function makeOutlineMaterial(color, opacity = 0.9) {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false });
}

/** 幻影提示材质（S18 紫灰柱窝幻影、S19 立柱幻影、S27 格心幻影） */
export function makeGhostMaterial(color = PALETTE.SOCKET) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
  });
}

/** 统一设置一批木材材质的高亮（用于热点、配对提示、语义色标注） */
export function setHighlight(material, colorHex, amount) {
  const u = material.userData?.uniforms;
  if (!u) return;
  u.uHighlight.value.setHex(colorHex);
  u.uHighlightAmt.value = amount;
}

export function setCutReveal(material, v) {
  const u = material.userData?.uniforms;
  if (u) u.uCutMix.value = v;
}

export function setSectionMode(material, v) {
  const u = material.userData?.uniforms;
  if (u) u.uSectionMode.value = v;
}
