// Dev/QA tool: free-walk any zone with the trainer (?tool=zone&id=route_1&x=..&z=..&yaw=..&pitch=..).
// Atmosphere preview: &clock=<minutes 0..1439> &weather=clear|rain|snow|fog|sunlight &quality=high|balanced|mobile &title=1
import { useMemo, useState } from 'react';
import { WorldCanvas } from '../world/World';
import { PlayerController } from '../world/actors/PlayerController';
import { ThirdPersonCamera } from '../world/camera/ThirdPersonCamera';
import { loadZone } from '../data/zones';
import { playerLook } from '../data/looks';
import { runtime } from '../state/runtime';
import { PerfOverlay } from '../ui/PerfOverlay';
import { TouchControls } from '../ui/TouchControls';
import { Follower } from '../world/actors/Follower';
import { compassToRotY } from '../world/yaw';
import { atmo } from '../world/atmosphere/state';
import { useGame } from '../state/game';
import { useSettings, type QualityProfile } from '../state/settingsStore';
import type { WeatherId } from '../sim/types';
import { ZoneTitleCard } from '../ui/ZoneTitleCard';

export function ZoneTool() {
  const p = new URLSearchParams(location.search);
  useState(() => {
    atmo.clockOverride = p.has('clock') ? +p.get('clock')! : null;
    if (p.has('weather')) useGame.setState({ weather: p.get('weather') as WeatherId });
    const q = p.get('quality');
    if (q === 'high' || q === 'balanced' || q === 'mobile') useSettings.setState({ quality: q as QualityProfile, qualityAuto: false });
    return 0;
  });
  const zone = useMemo(() => loadZone(p.get('id') ?? 'route_1'), []);
  const sp = zone.spawns.find((s) => s.id === p.get('spawn')) ?? zone.spawns[0];
  const start = { x: p.has('x') ? +p.get('x')! : sp.at[0], z: p.has('z') ? +p.get('z')! : sp.at[1], yaw: compassToRotY(sp.yaw ?? 0) };
  if (p.has('pitch')) runtime.camPitch = +p.get('pitch')!;
  if (p.has('dist')) runtime.camDist = +p.get('dist')!;
  const look = useMemo(() => { const [b, sk, h] = (p.get('look') ?? '0.0.3').split('.').map(Number); return playerLook(b || 0, sk || 0, h || 0); }, []);
  return (
    <>
      <WorldCanvas zone={zone}>
        <PlayerController look={look} start={start} killY={-30} />
        <ThirdPersonCamera />
        {p.get('follower') !== '0' && <Follower species={p.get('lead') ?? 'c01'} />}
      </WorldCanvas>
      {p.get('title') === '1' && <ZoneTitleCard name={zone.name} />}
      <PerfOverlay force />
      <TouchControls />
    </>
  );
}
