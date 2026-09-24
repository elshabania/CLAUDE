// Music director: drives zone/battle music and event stingers from store subscriptions,
// so the soundtrack follows the game even where gameplay code never calls the engine directly.
// Every call it makes is idempotent (same song requests are ignored), so explicit engine calls
// from gameplay code and this director can coexist.
import { useGame } from '../state/game';
import { ZONES } from '../data/zones';
import { isNight } from '../sim/world';
import { CANTOR_TYPES } from './songs';

export interface DirectorTarget {
  zone(id: string | null): void;
  battle(kind: string, cantorType?: string): void;
  intensity(high: boolean): void;
  endBattle(stinger: 'victory' | 'capture' | 'none'): void;
  stinger(id: string): void;
}

export function battleKindFor(trainerId: string | undefined, kind: 'wild' | 'trainer'): { kind: string; cantorType?: string } {
  if (kind === 'wild' || !trainerId) return { kind: 'wild' };
  const id = trainerId.toLowerCase();
  if (id.startsWith('t_rival')) return { kind: 'rival' };
  const c = id.match(/^t_cantor_(\d)/);
  if (c) return { kind: 'cantor', cantorType: CANTOR_TYPES[+c[1] - 1] ?? 'verdant' };
  if (id.startsWith('t_odile')) return { kind: 'odile' };
  if (id.startsWith('t_admin')) return { kind: 'admin' };
  if (id.startsWith('t_still')) return { kind: 'stillmark' };
  if (id.startsWith('t_champion') || id.includes('rhea')) return { kind: 'champion' };
  return { kind: 'trainer' };
}

export function zoneMusicFor(zoneId: string, night: boolean): string {
  const music = ZONES[zoneId]?.music ?? zoneId;
  return night ? `${music}@night` : music;
}

export function startDirector(t: DirectorTarget): () => void {
  let inBattle = false;
  let battleEnded = false;
  let intensity = false;
  let lastHealAt = 0;
  const unsubs: (() => void)[] = [];

  const sync = () => {
    const g = useGame.getState();
    const mode = g.mode;
    if (mode === 'battle' && g.battle) {
      if (!inBattle) {
        inBattle = true;
        battleEnded = false;
        intensity = false;
        const k = battleKindFor(g.battle.trainerId, g.battle.kind);
        t.battle(k.kind, k.cantorType);
      }
      return;
    }
    if (inBattle) {
      inBattle = false;
      if (!battleEnded) t.endBattle('none');
    }
    if (mode === 'title' || mode === 'newgame') return t.zone('title');
    if (mode === 'ending') return t.zone('league');
    const night = g.save ? isNight(g.save.clockMinutes) : false;
    t.zone(zoneMusicFor(g.zoneId, night));
  };

  unsubs.push(
    useGame.subscribe((s, p) => {
      try {
        if (s.mode !== p.mode || s.zoneId !== p.zoneId || s.battle !== p.battle || (s.save?.clockMinutes ?? 0) !== (p.save?.clockMinutes ?? 0)) sync();
        if (s.mode === 'evolution' && p.mode !== 'evolution' && s.pendingEvolutions.length) t.stinger('evolution');
        if (s.mode === 'ending' && p.mode !== 'ending') t.stinger('great_chord');
        const a = s.save;
        const b = p.save;
        if (a && b && a !== b) {
          // Keynote earned
          const kn = Object.keys(a.inventory).find((k) => k.startsWith('i_keynote') && (a.inventory[k] ?? 0) > (b.inventory[k] ?? 0));
          if (kn) t.stinger('keynote_' + (kn.match(/(\d)$/)?.[1] ?? '1'));
          else if (s.mode === 'dialogue') {
            // Hearthrest heal: party HP restored / status cleared during a conversation
            const healed = a.party.some((u) => {
              const x = a.instances[u];
              const y = b.instances[u];
              return x && y && (x.hp > y.hp || (!!y.status && !x.status));
            });
            const now = Date.now();
            if (healed && now - lastHealAt > 3000) {
              lastHealAt = now;
              t.stinger('heal');
            } else if (Object.keys(a.inventory).some((k) => (a.inventory[k] ?? 0) > (b.inventory[k] ?? 0))) t.stinger('item');
          }
        }
      } catch {
        /* ignore */
      }
    }),
  );
  sync();

  // Battle presentation (lazy: the battle store is only needed once audio runs)
  let dead = false;
  void import('../battle/battleStore')
    .then(({ useBattle }) => {
      if (dead) return;
      unsubs.push(
        useBattle.subscribe((s, p) => {
          try {
            if (!inBattle) return;
            if (s.phase === 'end' && p.phase !== 'end' && !battleEnded) {
              const o = s.state?.outcome;
              battleEnded = true;
              t.endBattle(o === 'win' ? 'victory' : o === 'captured' ? 'capture' : 'none');
            }
            if (s.current !== p.current && s.current?.kind === 'phase') t.battle('odile_b');
            const pl = s.shown.player;
            if (pl && pl.maxHp > 0) {
              const r = pl.hp / pl.maxHp;
              const want = intensity ? r <= 0.35 : r <= 0.25;
              if (want !== intensity) {
                intensity = want;
                t.intensity(want);
              }
            }
          } catch {
            /* ignore */
          }
        }),
      );
    })
    .catch(() => {});

  return () => {
    dead = true;
    unsubs.forEach((u) => u());
  };
}
