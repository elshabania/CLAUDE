// Mutable per-frame runtime values shared between world systems (not React state; never saved).
import * as THREE from 'three';
import type { HeightGrid } from '../world/terrain/heightfield';

export const runtime = {
  playerPos: new THREE.Vector3(),
  playerVel: new THREE.Vector3(),
  playerYaw: 0,
  playerSpeed: 0,
  camYaw: 0,
  camPitch: 0.35,
  camDist: 6,
  grid: null as HeightGrid | null,
  waterLevel: -999,
  teleport: null as null | { x: number; y: number; z: number; yaw?: number },
  lastGrounded: new THREE.Vector3(),
  distSinceBattle: 999,
  metersWalked: 0,
  encounterLock: false,
  encounterCooldownUntil: 0,
  frozen: false, // gameplay input blocked (dialogue, menus, transitions)
  battleStage: null as null | { x: number; z: number; yaw: number; y: number },
  perf: { fps: 0, frameMs: 0, p95: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0 },
};

export function heightAt(x: number, z: number): number {
  const g = runtime.grid;
  if (!g) return 0;
  const fx = ((x + g.width / 2) / g.width) * (g.nx - 1);
  const fz = ((z + g.depth / 2) / g.depth) * (g.nz - 1);
  const ix = Math.max(0, Math.min(g.nx - 2, Math.floor(fx)));
  const iz = Math.max(0, Math.min(g.nz - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - ix));
  const tz = Math.max(0, Math.min(1, fz - iz));
  const h00 = g.heights[iz * g.nx + ix];
  const h10 = g.heights[iz * g.nx + ix + 1];
  const h01 = g.heights[(iz + 1) * g.nx + ix];
  const h11 = g.heights[(iz + 1) * g.nx + ix + 1];
  if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
  return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
}
