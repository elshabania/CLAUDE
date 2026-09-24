// Dev/QA tool: free-walk any zone with the trainer (?tool=zone&id=route_1&x=..&z=..&yaw=..&pitch=..).
import { useMemo } from 'react';
import { WorldCanvas } from '../world/World';
import { PlayerController } from '../world/actors/PlayerController';
import { ThirdPersonCamera } from '../world/camera/ThirdPersonCamera';
import { loadZone } from '../data/zones';
import { humanVisual } from '../creatures/humans';
import { playerLook } from '../data/looks';
import { runtime } from '../state/runtime';
import { PerfOverlay } from '../ui/PerfOverlay';
import { TouchControls } from '../ui/TouchControls';
import { Follower } from '../world/actors/Follower';
void humanVisual;

export function ZoneTool() {
  const p = new URLSearchParams(location.search);
  const zone = useMemo(() => loadZone(p.get('id') ?? 'route_1'), []);
  const sp = zone.spawns.find((s) => s.id === p.get('spawn')) ?? zone.spawns[0];
  const start = { x: p.has('x') ? +p.get('x')! : sp.at[0], z: p.has('z') ? +p.get('z')! : sp.at[1], yaw: ((sp.yaw ?? 0) * Math.PI) / 180 };
  if (p.has('pitch')) runtime.camPitch = +p.get('pitch')!;
  if (p.has('dist')) runtime.camDist = +p.get('dist')!;
  const look = useMemo(() => playerLook(0, 0, 0), []);
  return (
    <>
      <WorldCanvas zone={zone}>
        <PlayerController look={look} start={start} killY={-30} />
        <ThirdPersonCamera />
        {p.get('follower') !== '0' && <Follower species={p.get('lead') ?? 'c01'} />}
      </WorldCanvas>
      <PerfOverlay force />
      <TouchControls />
    </>
  );
}
