// The in-game shell: one zone canvas (remounted per zone via zoneEpoch) with player, camera, follower,
// zone actors and the in-place battle stage; UI overlays driven by the game mode machine.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { WorldCanvas } from '../world/World';
import { PlayerController } from '../world/actors/PlayerController';
import { ThirdPersonCamera } from '../world/camera/ThirdPersonCamera';
import { Follower } from '../world/actors/Follower';
import { ZoneActors } from '../world/actors/ZoneActors';
import { BattleScene } from '../battle/BattleScene';
import { useBattle } from '../battle/battleStore';
import { useGame } from '../state/game';
import { runtime } from '../state/runtime';
import { loadZone } from '../data/zones';
import { playerLook } from '../data/looks';
import { compassToRotY } from '../world/yaw';
import { Hud, Toasts, DialogueBox } from '../ui/Hud';
import { BattleUI } from '../ui/BattleUI';
import { GameMenu } from '../ui/GameMenu';
import { StarterScreen } from '../ui/TitleScreens';
import { ShopScreen, EvolutionScreen, EndingScreen } from '../ui/Screens';
import { TouchControls } from '../ui/TouchControls';
import { PerfOverlay } from '../ui/PerfOverlay';
import { ZoneTitleCard } from '../ui/ZoneTitleCard';
import { input } from '../ui/input/input';
import { setZoneMusic, setBattleMusic, endBattleMusic } from '../audio/engine';
import { TRAINERS } from '../data/registry';

function Clock() {
  useFrame((_, dt) => useGame.getState().tick(Math.min(dt, 0.1)));
  return null;
}

function battleKind(tid?: string): string {
  if (!tid) return 'wild';
  if (tid.startsWith('t_rival')) return 'rival';
  if (tid.startsWith('t_cantor')) return 'cantor';
  if (tid.startsWith('t_admin')) return 'admin';
  if (tid === 't_odile') return 'odile';
  if (tid === 't_champion') return 'champion';
  return 'trainer';
}

export function Game() {
  const zoneId = useGame((s) => s.zoneId);
  const spawnId = useGame((s) => s.spawnId);
  const epoch = useGame((s) => s.zoneEpoch);
  const mode = useGame((s) => s.mode);
  const fade = useGame((s) => s.fade);
  const battleReq = useGame((s) => s.battle);
  const hint = useGame((s) => s.interactHint);
  const lookSpec = useGame((s) => s.save?.player.look);
  const lead = useGame((s) => {
    const sv = s.save;
    if (!sv) return null;
    const u = sv.party.find((id) => sv.instances[id].hp > 0) ?? sv.party[0];
    return u ? sv.instances[u].species : null;
  });
  const bReq = useBattle((s) => s.req);
  const zone = useMemo(() => loadZone(zoneId), [zoneId]);
  const look = useMemo(() => playerLook(lookSpec?.build ?? 0, lookSpec?.skin ?? 0, lookSpec?.hair ?? 0), [lookSpec?.build, lookSpec?.skin, lookSpec?.hair]);
  const start = useMemo(() => {
    const sp = zone.spawns.find((s) => s.id === spawnId) ?? zone.spawns[0];
    return { x: sp.at[0], z: sp.at[1], yaw: compassToRotY(sp.yaw ?? 0) };
    // epoch forces a fresh start object on every (re)entry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone, spawnId, epoch]);

  // battle hand-off: game store -> battle store
  useEffect(() => {
    if (mode === 'battle' && battleReq && !useBattle.getState().req) {
      useBattle.getState().begin(battleReq);
      const t = battleReq.trainerId ? TRAINERS[battleReq.trainerId] : null;
      setBattleMusic(battleKind(battleReq.trainerId), t ? (battleReq.attuned ?? undefined) : undefined);
    }
  }, [mode, battleReq]);

  useEffect(() => {
    if (mode !== 'battle' && mode !== 'transition') setZoneMusic(zone.music);
  }, [zone.music, mode === 'battle']); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === 'explore' && !bReq) endBattleMusic('none');
  }, [mode, bReq]);

  // global menu shortcuts
  useEffect(() => {
    const off = input.on((a) => {
      const g = useGame.getState();
      if (g.mode === 'explore' && (a === 'menu' || a === 'map' || a === 'journal')) {
        runtime.frozen = true;
        useGame.setState({ mode: 'menu', menuTab: a === 'menu' ? (g.menuTab === 'fosterage' || g.menuTab === 'recall' || g.menuTab === 'travel' ? 'troupe' : g.menuTab) : a });
      } else if (g.mode === 'menu' && (a === 'menu' || a === 'back')) {
        runtime.frozen = false;
        useGame.setState({ mode: 'explore' });
      }
    });
    return () => {
      off();
    };
  }, []);

  const inBattle = mode === 'battle' || !!bReq;
  return (
    <>
      <WorldCanvas key={`${zoneId}:${epoch}`} zone={zone}>
        <PlayerController look={look} start={start} killY={zone.terrain.base - 40} hidden={inBattle} />
        <ThirdPersonCamera enabled={!inBattle} />
        {lead && !inBattle && <Follower key={lead} species={lead} />}
        <ZoneActors zone={zone} />
        {bReq && <BattleScene />}
        <Clock />
      </WorldCanvas>
      <Hud />
      <ZoneTitleCard key={`title:${zoneId}:${epoch}`} name={zone.name} ready={!inBattle && (mode === 'explore' || mode === 'dialogue')} hidden={inBattle} />
      {mode === 'dialogue' && <DialogueBox />}
      {bReq && <BattleUI />}
      {mode === 'menu' && <GameMenu />}
      {mode === 'shop' && <ShopScreen />}
      {(mode === 'evolution' || mode === 'learn') && <EvolutionScreen />}
      {mode === 'starter' && <StarterScreen />}
      {mode === 'ending' && <EndingScreen />}
      <TouchControls
        hidden={mode !== 'explore'}
        interactLabel={hint}
        onInteract={() => input.emit('interact')}
        onMenu={() => input.emit('menu')}
      />
      <Toasts />
      <PerfOverlay />
      <div className="fade" style={{ opacity: fade }} aria-hidden />
    </>
  );
}
