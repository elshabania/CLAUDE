// Core domain types shared by the pure simulation, content data and persistence.
export const TYPE_IDS = ['fire', 'water', 'electric', 'verdant', 'stone', 'frost', 'gale', 'toxin', 'shade', 'lumen'] as const;
export type TypeId = (typeof TYPE_IDS)[number];
export type MoveTypeId = TypeId | 'none';

export type StatId = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type StageStat = 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'acc' | 'eva';
export const STAT_IDS: StatId[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export type Stats = Record<StatId, number>;

export type MajorStatus = 'burn' | 'poison' | 'paralysis' | 'sleep' | 'frostbite';
export type WeatherId = 'clear' | 'rain' | 'snow' | 'fog' | 'sunlight';
export type Growth = 'fast' | 'medium' | 'slow';

export type MoveEffect =
  | { kind: 'status'; status: MajorStatus; chance: number }
  | { kind: 'stat'; target: 'self' | 'foe'; stat: StageStat; delta: number; chance: number }
  | { kind: 'flinch'; chance: number }
  | { kind: 'dizzy'; chance: number }
  | { kind: 'recoil'; num: number; den: number }
  | { kind: 'recoilMaxHp'; num: number; den: number }
  | { kind: 'drain'; num: number; den: number }
  | { kind: 'heal'; num: number; den: number; weather: Partial<Record<WeatherId, [number, number]>> }
  | { kind: 'weather'; weather: WeatherId }
  | { kind: 'critStage'; delta: number }
  | { kind: 'hits'; count: number }
  | { kind: 'shield' }
  | { kind: 'sap' }
  | { kind: 'cleanse' }
  | { kind: 'clearAll' }
  | { kind: 'powerIfTargetStatus'; status: MajorStatus; mult: number }
  | { kind: 'neverMissIn'; weather: WeatherId }
  | { kind: 'accIn'; weather: WeatherId; accuracy: number };

export type AnimId =
  | 'melee_lunge' | 'melee_sweep' | 'charge_rush' | 'dash_through' | 'projectile_bolt' | 'projectile_arc'
  | 'beam' | 'burst_area' | 'rain_down' | 'ground_wave' | 'multi_hit_flurry' | 'debuff_cloud'
  | 'aura_self' | 'shield' | 'heal_glow' | 'weather_call';

export interface MoveDef {
  id: string;
  name: string;
  type: MoveTypeId;
  category: 'physical' | 'special' | 'status';
  power: number | null;
  accuracy: number | null;
  charges: number | null;
  priority: number;
  target: 'foe' | 'self' | 'field';
  effects: MoveEffect[];
  anim: AnimId;
}

export interface LearnEntry { level: number | null; move: string; evo?: boolean }

export interface SpeciesDef {
  id: string;           // c01..c30
  name: string;
  family: string;       // f01..f10
  stage: 1 | 2 | 3;
  types: TypeId[];      // 1 or 2
  base: Stats;
  trait: string;
  catchRate: number;
  xpYield: number;
  growth: Growth;
  heightM: number;
  evolvesTo?: { species: string; level?: number; item?: string; move?: string };
  evolvesFrom?: string;
  habitat?: string[];
  blurb?: string;
  colors: string[];
  cry: CryParams;
}

export interface CryParams {
  voice: 'fm' | 'am' | 'saw_formant' | 'noise_formant';
  basePitchHz: number;
  contour: [number, number][];
  durationMs: number;
  harmonicity?: number;
  modIndex?: number;
  vibrato?: number;
  noiseMix?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: 'heal' | 'cure' | 'revive' | 'charge' | 'repel' | 'escape' | 'orb' | 'disc' | 'key' | 'evo';
  price: number | null;
  sell: number | null;
  desc: string;
  params: Record<string, unknown>;
}

/** An individual creature owned by someone. Species data is referenced, never copied. */
export interface CreatureInstance {
  uid: string;
  species: string;
  nickname?: string;
  level: number;
  xp: number;
  potential: Stats;
  temperament: string;
  moves: { id: string; charges: number }[];
  hp: number;           // current hp
  status: MajorStatus | null;
  sleepCounter?: number;
  bond?: boolean;       // starter: cannot be released
  evolveReady?: boolean;
  caughtIn?: string;
  metZone?: string;
}
