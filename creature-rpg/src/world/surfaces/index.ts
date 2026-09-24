// React glue for the surface library + biome → terrain layer mapping.
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { QUALITY, useSettings } from '../../state/settingsStore';
import type { ZoneSpec } from '../zoneTypes';
import { getSurfaceLib, type SurfaceLib } from './bake';
import { SURF } from './recipes';
import { tintFor, type TerrainLayers } from './material';

export { SURF } from './recipes';
export type { SurfaceLib } from './bake';

/** The baked PBR texture arrays for the current WebGL context (baked on first use, cached). */
export function useSurfaceLib(): SurfaceLib {
  const gl = useThree((s) => s.gl);
  const res = QUALITY[useSettings((s) => s.quality)].surfaceRes;
  return useMemo(() => getSurfaceLib(gl, res), [gl, res]);
}

/** Mount once per canvas: frees the texture arrays when the zone's canvas unmounts. */
export function SurfaceScope() {
  const gl = useThree((s) => s.gl);
  const res = QUALITY[useSettings((s) => s.quality)].surfaceRes;
  useEffect(() => {
    const lib = getSurfaceLib(gl, res);
    return () => lib.dispose();
  }, [gl, res]);
  return null;
}

/** Palette colours are stylised; pull them toward natural saturation/value for the realistic world. */
export function naturalize(c: THREE.ColorRepresentation, sat = 0.78, light = 0.92): THREE.Color {
  const col = new THREE.Color(c);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  return col.setHSL(hsl.h, hsl.s * sat, hsl.l * light);
}

export function terrainLayersFor(zone: ZoneSpec): TerrainLayers {
  const p = zone.palette;
  const b = zone.biome;
  let groundA: number = SURF.grass, groundB: number = SURF.grass, path: number = SURF.dirt, cliff: number = SURF.rock, plaza: number = SURF.cobble, shore: number = SURF.mud;
  let shoreTint = '#a8966f';
  switch (b) {
    case 'forest': groundB = SURF.litter; shoreTint = '#6a5a43'; break;
    case 'fen': groundB = SURF.mud; shoreTint = '#5a4c38'; break;
    case 'ridge': case 'cliff': groundB = SURF.dirt; break;
    case 'volcano': groundA = SURF.ash; groundB = SURF.dirt; shore = SURF.ash; shoreTint = '#3a3432'; break;
    case 'tundra': groundB = SURF.snow; break;
    case 'snow': groundA = SURF.snow; groundB = SURF.snow; shore = SURF.ice; shoreTint = '#bcd8e2'; break;
    case 'cave': groundA = SURF.dirt; groundB = SURF.rock; plaza = SURF.cobble; break;
    case 'spire': groundA = SURF.brick; groundB = SURF.cobble; path = SURF.brick; plaza = SURF.brick; break;
    default: break;
  }
  // indoor forest trial: leaf litter floor
  if (zone.indoor && b === 'forest') groundA = SURF.litter;
  const nat = (c: string, s = 0.78, l = 0.92) => naturalize(c, s, l);
  const g2 = groundB === SURF.snow && b === 'tundra' ? '#dfe7ef' : p.ground2;
  return {
    groundA, groundB, path, cliff, snow: SURF.snow, plaza, shore,
    tints: {
      groundA: tintFor(groundA, nat(p.ground), 0.7),
      groundB: tintFor(groundB, nat(g2), 0.7),
      path: tintFor(path, nat(p.path, 0.7, 0.85), 0.6),
      cliff: tintFor(cliff, nat(p.cliff, 0.6, 0.95), 0.8),
      snow: tintFor(SURF.snow, '#eef3f8', 0.5),
      plaza: tintFor(plaza, nat(p.path, 0.5, 0.9), 0.45),
      shore: tintFor(shore, shoreTint, 0.7),
    },
  };
}
