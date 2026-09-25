// GPU baker for the procedural surface library (recipes.ts). Renders every layer once into two
// WebGLArrayRenderTargets (A: sRGB albedo + height, B: normal.xy + roughness + AO) with mipmaps and
// anisotropic filtering. One library per WebGL context (each zone mounts its own <Canvas>); it is
// disposed with the zone. Cost: 2 full-screen passes per layer (16 layers) at 256–512² — a few ms on
// a real GPU, no network, no CPU pixel loops.
import * as THREE from 'three';
import { NOISE_GLSL, RECIPES_GLSL, SURF_BUMP, SURF_COUNT } from './recipes';

export interface SurfaceLib {
  albedo: THREE.Texture;   // sampler2DArray: rgb albedo (sRGB), a height
  normal: THREE.Texture;   // sampler2DArray: xy tangent normal, z roughness, w AO
  size: number;
  dispose(): void;
}

const VERT = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2DArray;
uniform int uLayer;
uniform int uPass;
uniform float uRes;
uniform float uBump;
uniform sampler2DArray uPrev;
out vec4 outColor;
${NOISE_GLSL}
${RECIPES_GLSL}
void main() {
  vec2 uv = (floor(gl_FragCoord.xy) + 0.5) / uRes;
  vec3 col; float h; float r; float ao;
  surfEval(uLayer, uv, col, h, r, ao);
  if (uPass == 0) {
    outColor = vec4(clamp(col, 0.0, 1.0), clamp(h, 0.0, 1.0));
  } else {
    ivec2 px = ivec2(gl_FragCoord.xy); int R = int(uRes);
    float hl = texelFetch(uPrev, ivec3((px.x + R - 1) % R, px.y, uLayer), 0).a;
    float hr = texelFetch(uPrev, ivec3((px.x + 1) % R, px.y, uLayer), 0).a;
    float hd = texelFetch(uPrev, ivec3(px.x, (px.y + R - 1) % R, uLayer), 0).a;
    float hu = texelFetch(uPrev, ivec3(px.x, (px.y + 1) % R, uLayer), 0).a;
    vec2 g = vec2(hr - hl, hu - hd) * uBump * uRes / 128.0;
    vec3 n = normalize(vec3(-g, 1.0));
    outColor = vec4(n.xy * 0.5 + 0.5, clamp(r, 0.03, 1.0), clamp(ao, 0.0, 1.0));
  }
}
`;

const libs = new WeakMap<THREE.WebGLRenderer, SurfaceLib>();

function makeTarget(size: number, srgb: boolean, aniso: number) {
  const rt = new THREE.WebGLArrayRenderTarget(size, size, SURF_COUNT, {
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    anisotropy: aniso,
    colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
  });
  rt.texture.wrapS = rt.texture.wrapT = THREE.RepeatWrapping;
  return rt;
}

/** Bake (or fetch the cached) surface library for this renderer. */
export function getSurfaceLib(gl: THREE.WebGLRenderer, size: number): SurfaceLib {
  const cached = libs.get(gl);
  if (cached && cached.size === size) return cached;
  cached?.dispose();
  const t0 = performance.now();
  const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
  const rtA = makeTarget(size, true, aniso);
  const rtB = makeTarget(size, false, aniso);
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uLayer: { value: 0 }, uPass: { value: 0 }, uRes: { value: size }, uBump: { value: 1 }, uPrev: { value: null as THREE.Texture | null } },
    depthTest: false,
    depthWrite: false,
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const quad = new THREE.Mesh(geo, mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const prevRT = gl.getRenderTarget();
  const prevAuto = gl.autoClear;
  const prevXr = gl.xr.enabled;
  gl.xr.enabled = false;
  gl.autoClear = false;
  for (const [pass, rt] of [[0, rtA], [1, rtB]] as const) {
    mat.uniforms.uPass.value = pass;
    // pass 0 writes A (must not have it bound for sampling: feedback loop); pass 1 reads A's heights
    mat.uniforms.uPrev.value = pass === 1 ? rtA.texture : null;
    for (let L = 0; L < SURF_COUNT; L++) {
      // storage (with its mip chain) is allocated on the first bind; regenerate mips only after the last layer
      rt.texture.generateMipmaps = L === 0 || L === SURF_COUNT - 1;
      mat.uniforms.uLayer.value = L;
      mat.uniforms.uBump.value = SURF_BUMP[L];
      gl.setRenderTarget(rt, L);
      if (L === 0) rt.texture.generateMipmaps = false;
      if (L === SURF_COUNT - 1) rt.texture.generateMipmaps = true;
      gl.render(scene, cam);
    }
  }
  gl.setRenderTarget(prevRT);
  gl.autoClear = prevAuto;
  gl.xr.enabled = prevXr;
  geo.dispose();
  mat.dispose();
  const lib: SurfaceLib = {
    albedo: rtA.texture,
    normal: rtB.texture,
    size,
    dispose() {
      rtA.dispose();
      rtB.dispose();
      if (libs.get(gl) === lib) libs.delete(gl);
    },
  };
  libs.set(gl, lib);
  if (import.meta.env?.DEV) console.info(`[surfaces] baked ${SURF_COUNT} layers @${size}² in ${(performance.now() - t0).toFixed(0)} ms (GPU submit)`);
  return lib;
}
