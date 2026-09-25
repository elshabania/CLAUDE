// Per-frame atmosphere values shared by the lighting rig, weather and ambient particle systems.
// Mutable module state (never React state): written once per frame by <Atmosphere/>, read by the others.
import * as THREE from 'three';
import { useGame } from '../../state/game';

export const atmo = {
  /** 0 day … 1 full night (interiors: 0). */
  night: 0,
  /** Lamp / glow boost 0..1 (night outdoors, always partly on indoors). */
  glow: 0,
  /** Smoothed weather weights (crossfaded when the weather changes mid-zone). */
  rain: 0,
  snow: 0,
  fog: 0,
  sunlight: 0,
  /** Rough ambient light colour for tinting unlit particles so they sit in the scene at night. */
  ambient: new THREE.Color(1, 1, 1),
  /** QA/tool override of the clock (minutes); null → the save clock. */
  clockOverride: null as number | null,
};

/** Current game clock in minutes (no React re-render: read inside useFrame). */
export function currentClock(): number {
  if (atmo.clockOverride != null) return atmo.clockOverride;
  return useGame.getState().save?.clockMinutes ?? 720;
}
