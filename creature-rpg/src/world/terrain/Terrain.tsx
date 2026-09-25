import { useRapier } from '@react-three/rapier';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ZoneSpec } from '../zoneTypes';
import { distToPath, fbm, type HeightGrid } from './heightfield';
import { safeRemoveCollider } from '../physicsSafe';
import { terrainLayersFor, useSurfaceLib } from '../surfaces';
import { makeSurfaceMaterial } from '../surfaces/material';
import { QUALITY, useSettings } from '../../state/settingsStore';

const sstep = THREE.MathUtils.smoothstep;

/**
 * Builds the render mesh (per-vertex PBR splat weights) and a matching trimesh collider.
 * aSplat  = (ground B, path, cliff/rock, snow)
 * aSplat2 = (plaza/cobble, shore sand-mud, wetness, unused)
 */
export function buildTerrainGeometry(zone: ZoneSpec, g: HeightGrid): THREE.BufferGeometry {
  const { nx, nz, width, depth, heights } = g;
  const pos = new Float32Array(nx * nz * 3);
  const splat = new Float32Array(nx * nz * 4);
  const splat2 = new Float32Array(nx * nz * 4);
  const idx: number[] = [];
  const paths = zone.terrain.paths ?? [];
  const flats = zone.terrain.flats ?? [];
  const water = zone.terrain.water ?? [];
  const seed = zone.terrain.seed;
  const b = zone.biome;
  const snowy = b === 'snow' || b === 'tundra';
  const paved = b === 'town' || b === 'spire';
  const cell = width / (nx - 1);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      const x = -width / 2 + (ix * width) / (nx - 1);
      const z = -depth / 2 + (iz * depth) / (nz - 1);
      const h = heights[i];
      pos[i * 3] = x;
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = z;
      const hx = heights[iz * nx + Math.min(nx - 1, ix + 1)] - heights[iz * nx + Math.max(0, ix - 1)];
      const hz = heights[Math.min(nz - 1, iz + 1) * nx + ix] - heights[Math.max(0, iz - 1) * nx + ix];
      const slope = Math.hypot(hx, hz) / (2 * cell);
      const n = fbm(x / 7, z / 7, seed + 3, 3) * 0.5 + 0.5;
      const edgeN = fbm(x / 2.3, z / 2.3, seed + 17, 2); // −1..1: frays path/plaza/shore edges
      // ground B patches (+ more of it in hollows in forests: leaf litter collects)
      let gB = THREE.MathUtils.clamp(n * 1.5 - 0.35, 0, 1);
      if (b === 'forest') gB = Math.max(gB, THREE.MathUtils.clamp(fbm(x / 13, z / 13, seed + 9, 3) + 0.25, 0, 1));
      // worn paths: noisy edges, centre fully worn
      let pathW = 0;
      for (const p of paths) {
        const d = distToPath([x, z], p.pts) + edgeN * 0.7;
        pathW = Math.max(pathW, 1 - sstep(d, p.w * 0.3, p.w * 0.5 + 0.9));
      }
      let plaza = 0;
      if (paved) {
        for (const f of flats) {
          const d = Math.hypot(x - f.at[0], z - f.at[1]) + edgeN * 1.2;
          plaza = Math.max(plaza, 1 - sstep(d, f.r * 0.55, f.r * 0.85));
        }
      }
      // shoreline band + wet margin around water basins
      let shore = 0, wet = 0;
      for (const w of water) {
        const d = Math.hypot((x - w.at[0]) / w.r, (z - w.at[1]) / (w.rz ?? w.r)) + edgeN * 0.035;
        shore = Math.max(shore, 1 - sstep(d, 1.02, 1.2));
        wet = Math.max(wet, (1 - sstep(d, 1.0, 1.1)) * sstep(d, 0.8, 0.95));
      }
      const cliffW = sstep(slope, 0.5, 0.95);
      let snowW = 0;
      if (b === 'tundra') snowW = sstep(h, zone.terrain.base + 3, zone.terrain.base + 10) * (1 - cliffW * 0.7);
      else if (b === 'snow') snowW = cliffW * sstep(slope, 1.6, 0.8) * 0.9 + sstep(h, zone.terrain.base + 14, zone.terrain.base + 24) * 0.8;
      else if (snowy) snowW = 0;
      splat[i * 4] = gB;
      splat[i * 4 + 1] = pathW * (1 - plaza * 0.6);
      splat[i * 4 + 2] = cliffW;
      splat[i * 4 + 3] = snowW;
      splat2[i * 4] = plaza;
      splat2[i * 4 + 1] = shore * (1 - cliffW);
      splat2[i * 4 + 2] = wet;
      splat2[i * 4 + 3] = 0;
    }
  }
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix;
      const bb = a + 1;
      const c = a + nx;
      const d = c + 1;
      // triangulation matches sampleGrid(): split along b-c anti-diagonal
      idx.push(a, c, bb, bb, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4));
  geo.setAttribute('aSplat2', new THREE.BufferAttribute(splat2, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// one geometry per grid: the grass system reads the same splat weights (paths, cliffs, shore, plaza)
const geoCache = new WeakMap<HeightGrid, THREE.BufferGeometry>();
export function getTerrainGeometry(zone: ZoneSpec, grid: HeightGrid): THREE.BufferGeometry {
  let g = geoCache.get(grid);
  if (!g) {
    g = buildTerrainGeometry(zone, grid);
    geoCache.set(grid, g);
  }
  return g;
}

export function Terrain({ zone, grid }: { zone: ZoneSpec; grid: HeightGrid }) {
  const geo = useMemo(() => getTerrainGeometry(zone, grid), [zone, grid]);
  const lib = useSurfaceLib();
  const cheap = QUALITY[useSettings((s) => s.quality)].cheapSurfaces;
  const mat = useMemo(() => makeSurfaceMaterial({ lib, kind: 'terrain', cheap, terrain: terrainLayersFor(zone) }), [lib, cheap, zone]);
  const { world, rapier } = useRapier();
  useEffect(() => {
    const verts = geo.attributes.position.array as Float32Array;
    const indices = new Uint32Array(geo.index!.array as ArrayLike<number>);
    const desc = rapier.ColliderDesc.trimesh(new Float32Array(verts), indices).setFriction(0.8);
    const col = world.createCollider(desc);
    return () => {
      safeRemoveCollider(world, col);
    };
  }, [geo, world, rapier]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  return <mesh geometry={geo} material={mat} receiveShadow />;
}
