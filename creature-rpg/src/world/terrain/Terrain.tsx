import { useRapier } from '@react-three/rapier';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ZoneSpec } from '../zoneTypes';
import { distToPath, fbm, type HeightGrid } from './heightfield';

/** Builds the render mesh (vertex-coloured blend of ground/path/cliff) and a matching trimesh collider. */
export function buildTerrainGeometry(zone: ZoneSpec, g: HeightGrid): THREE.BufferGeometry {
  const { nx, nz, width, depth, heights } = g;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const idx: number[] = [];
  const pal = zone.palette;
  const cG = new THREE.Color(pal.ground);
  const cG2 = new THREE.Color(pal.ground2);
  const cP = new THREE.Color(pal.path);
  const cC = new THREE.Color(pal.cliff);
  const tmp = new THREE.Color();
  const paths = zone.terrain.paths ?? [];
  const flats = zone.terrain.flats ?? [];
  const snowy = zone.biome === 'snow' || zone.biome === 'tundra';
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      const x = -width / 2 + (ix * width) / (nx - 1);
      const z = -depth / 2 + (iz * depth) / (nz - 1);
      const h = heights[i];
      pos[i * 3] = x;
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = z;
      // slope from neighbours
      const hx = heights[iz * nx + Math.min(nx - 1, ix + 1)] - heights[iz * nx + Math.max(0, ix - 1)];
      const hz = heights[Math.min(nz - 1, iz + 1) * nx + ix] - heights[Math.max(0, iz - 1) * nx + ix];
      const cell = width / (nx - 1);
      const slope = Math.hypot(hx, hz) / (2 * cell);
      const n = fbm(x / 7, z / 7, zone.terrain.seed + 3, 3) * 0.5 + 0.5;
      tmp.copy(cG).lerp(cG2, THREE.MathUtils.clamp(n * 1.3 - 0.15, 0, 1));
      let pathW = 0;
      for (const p of paths) {
        const d = distToPath([x, z], p.pts);
        pathW = Math.max(pathW, 1 - THREE.MathUtils.smoothstep(d, p.w * 0.35, p.w * 0.5 + 0.6));
      }
      for (const f of flats) {
        if (zone.biome !== 'town' && zone.biome !== 'spire') continue;
        const d = Math.hypot(x - f.at[0], z - f.at[1]);
        pathW = Math.max(pathW, (1 - THREE.MathUtils.smoothstep(d, f.r * 0.6, f.r)) * 0.55);
      }
      if (pathW > 0) tmp.lerp(cP, pathW * (0.85 + 0.15 * n));
      const cliffW = THREE.MathUtils.smoothstep(slope, 0.55, 1.1);
      if (cliffW > 0) tmp.lerp(cC, cliffW);
      if (snowy) tmp.lerp(new THREE.Color('#F4F8FB'), THREE.MathUtils.smoothstep(h, zone.terrain.base + 4, zone.terrain.base + 12) * (1 - cliffW * 0.7));
      // subtle AO in hollows
      const shade = 0.92 + 0.08 * n;
      col[i * 3] = tmp.r * shade;
      col[i * 3 + 1] = tmp.g * shade;
      col[i * 3 + 2] = tmp.b * shade;
    }
  }
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      // triangulation matches sampleGrid(): split along b-c anti-diagonal
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export function Terrain({ zone, grid }: { zone: ZoneSpec; grid: HeightGrid }) {
  const geo = useMemo(() => buildTerrainGeometry(zone, grid), [zone, grid]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), []);
  const { world, rapier } = useRapier();
  useEffect(() => {
    const verts = geo.attributes.position.array as Float32Array;
    const indices = new Uint32Array(geo.index!.array as ArrayLike<number>);
    const desc = rapier.ColliderDesc.trimesh(new Float32Array(verts), indices, rapier.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(0.8);
    const col = world.createCollider(desc);
    return () => {
      world.removeCollider(col, false);
    };
  }, [geo, world, rapier]);
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);
  return <mesh geometry={geo} material={mat} receiveShadow />;
}
