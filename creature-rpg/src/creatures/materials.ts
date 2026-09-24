// Creature/character material presets (creatures.md §2.2) with a shared fresnel rim-light chunk.
import * as THREE from 'three';
import type { Quality } from './primitives';

export type Preset = 'FUR' | 'SCALE' | 'SHELL' | 'STONE' | 'METAL' | 'ICE' | 'MEMBRANE' | 'PAPER' | 'SKIN_WET' | 'GLOW' | 'SKIN' | 'CLOTH' | 'HAIR' | 'CRYSTAL' | 'EYE';

/** Global rim uniforms: the battle/exploration director tweaks strength (0.25 day, 0.45 night, 0.5 battle). */
export const rimUniforms = { uRimStrength: { value: 0.3 } };

const PRESET: Record<Preset, { rough: number; metal: number; clearcoat?: number; opacity?: number; side?: THREE.Side; sheen?: boolean }> = {
  FUR: { rough: 0.85, metal: 0, sheen: true },
  SCALE: { rough: 0.5, metal: 0, clearcoat: 0.2 },
  SHELL: { rough: 0.28, metal: 0, clearcoat: 0.6 },
  STONE: { rough: 0.9, metal: 0.05 },
  METAL: { rough: 0.35, metal: 0.7 },
  ICE: { rough: 0.12, metal: 0, clearcoat: 0.8, opacity: 0.88 },
  MEMBRANE: { rough: 0.6, metal: 0, opacity: 0.92, side: THREE.DoubleSide },
  PAPER: { rough: 1, metal: 0, side: THREE.DoubleSide },
  SKIN_WET: { rough: 0.3, metal: 0, clearcoat: 0.5 },
  GLOW: { rough: 0.4, metal: 0 },
  SKIN: { rough: 0.62, metal: 0 },
  CLOTH: { rough: 0.9, metal: 0, side: THREE.DoubleSide },
  HAIR: { rough: 0.7, metal: 0, sheen: true },
  CRYSTAL: { rough: 0.15, metal: 0.1, clearcoat: 0.8, opacity: 0.9 },
  EYE: { rough: 0.25, metal: 0 },
};

export function injectRim(mat: THREE.Material, rimColor: THREE.Color, rimStrength: number) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimStrength = rimUniforms.uRimStrength;
    shader.uniforms.uRimColor = { value: rimColor };
    shader.uniforms.uRimLocal = { value: rimStrength };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRimStrength;\nuniform vec3 uRimColor;\nuniform float uRimLocal;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 vd = normalize(vViewPosition);
          float fr = pow(1.0 - clamp(dot(normalize(normal), -vd), 0.0, 1.0), 2.5);
          totalEmissiveRadiance += uRimColor * fr * uRimStrength * (0.6 + uRimLocal);
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'rim';
}

export interface MatOpts {
  color: string;
  preset: Preset;
  quality: Quality;
  emissive?: string;
  emissiveIntensity?: number;
  rim?: string;
  rimStrength?: number;
  vertexColors?: boolean;
  opacity?: number;
  map?: THREE.Texture;
  flatShading?: boolean;
}

const cache = new Map<string, THREE.Material>();

export function makeMaterial(o: MatOpts): THREE.MeshStandardMaterial {
  const key = JSON.stringify({ ...o, map: o.map?.uuid });
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const p = PRESET[o.preset];
  const physical = o.quality === 'high' && (p.clearcoat || p.sheen);
  const params: THREE.MeshPhysicalMaterialParameters = {
    color: new THREE.Color(o.color),
    roughness: p.rough,
    metalness: p.metal,
    side: p.side ?? THREE.FrontSide,
    vertexColors: !!o.vertexColors,
    flatShading: !!o.flatShading,
  };
  const opacity = o.opacity ?? p.opacity;
  if (opacity != null && opacity < 1) {
    params.transparent = true;
    params.opacity = opacity;
    params.depthWrite = o.preset !== 'MEMBRANE' && o.preset !== 'ICE' ? true : false;
  }
  if (o.map) params.map = o.map;
  let mat: THREE.MeshStandardMaterial;
  if (physical) {
    const pm = new THREE.MeshPhysicalMaterial(params);
    if (p.clearcoat) {
      pm.clearcoat = p.clearcoat;
      pm.clearcoatRoughness = 0.25;
    }
    if (p.sheen) {
      pm.sheen = 0.6;
      pm.sheenRoughness = 0.5;
      pm.sheenColor = new THREE.Color(o.color).offsetHSL(0, 0, 0.2);
    }
    mat = pm;
  } else {
    mat = new THREE.MeshStandardMaterial(params);
    if (o.quality !== 'mobile' && (p.clearcoat ?? 0) > 0.3) mat.roughness = Math.max(0.2, p.rough * 0.9);
  }
  if (o.emissive) {
    mat.emissive = new THREE.Color(o.emissive);
    mat.emissiveIntensity = (o.emissiveIntensity ?? 1) * (o.quality === 'mobile' ? 0.8 : 1);
    if (o.preset === 'GLOW') mat.toneMapped = true;
  }
  injectRim(mat, new THREE.Color(o.rim ?? '#ffffff'), o.rimStrength ?? 0.3);
  cache.set(key, mat);
  return mat;
}

export function shade(hex: string, dl: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + dl)));
  return '#' + c.getHexString();
}
