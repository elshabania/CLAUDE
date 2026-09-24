import type { RngState } from '../rng';
import type { CreatureInstance, MajorStatus, MoveTypeId, StageStat, Stats, WeatherId, TypeId } from '../types';

export type AiLevel = 'easy' | 'normal' | 'hard';
export type SideId = 'player' | 'foe';

export interface Volatiles {
  dizzy?: number;         // remaining counter
  flinch?: boolean;
  sapped?: boolean;
  shielded?: boolean;
  absorbedFlame?: boolean;
}

export interface Combatant {
  inst: CreatureInstance;   // working copy (hp, status, charges mutate during battle)
  stats: Stats;             // computed (max hp in stats.hp)
  stages: Record<StageStat, number>;
  vol: Volatiles;
  bulwarkChain: number;     // consecutive successful Bulwark count
  usedBulwarkLastTurn: boolean;
  faintAnnounced?: boolean;
}

export interface BattleSide {
  team: Combatant[];
  active: number;
}

export interface BattleSetup {
  kind: 'wild' | 'trainer';
  playerParty: CreatureInstance[];
  foeParty: CreatureInstance[];
  ai: AiLevel;
  aiItems?: string[];              // heal items the trainer holds
  ambientWeather: WeatherId;
  attunedType: TypeId | null;      // zone Resonance (null = neutral / silenced)
  trainerId?: string;
  payout?: number;                 // trainer money on win
  storageFull?: boolean;           // party 6 and storage full -> capture needs confirmation (UI)
}

export type Action =
  | { kind: 'move'; slot: number }   // 0..3, or -1 for the fallback move
  | { kind: 'switch'; to: number }
  | { kind: 'item'; item: string; target: number; moveSlot?: number }
  | { kind: 'capture'; item: string }
  | { kind: 'run' }
  | { kind: 'none' };

export type Outcome = 'win' | 'loss' | 'fled' | 'captured';

export interface PendingLearn { uid: string; move: string }
export interface PendingEvolution { uid: string; to: string }

export interface BattleState {
  kind: 'wild' | 'trainer';
  player: BattleSide;
  foe: BattleSide;
  ai: AiLevel;
  aiItems: string[];
  aiSwitches: number;
  aiSwitchedLastTurn: boolean;
  aiItemUsed: boolean;
  ambientWeather: WeatherId;
  weather: WeatherId;
  weatherTurns: number | null;     // null = ambient, lasts whole battle
  attunedType: TypeId | null;
  turn: number;
  rng: RngState;
  rngAI: RngState;
  runAttempts: number;
  revealedPlayerMoves: string[];
  /** foe uid -> set of player uids that were active while it was on the field */
  participants: Record<string, string[]>;
  outcome: Outcome | null;
  needPlayerReplace: boolean;
  captured: CreatureInstance | null;
  capturedWith: string | null;
  pendingLearn: PendingLearn[];
  pendingEvolutions: PendingEvolution[];
  trainerId?: string;
  payout: number;
  itemsUsed: Record<string, number>; // player bag deltas to apply after battle
  seq: number;
}

export type Effectiveness = 0 | 1 | 2 | 4 | 8 | 16; // in quarters: 4 = neutral

export type BattleEvent =
  | { t: 'turnStart'; turn: number }
  | { t: 'sendOut'; side: SideId; index: number; species: string; name: string }
  | { t: 'recall'; side: SideId; index: number; name: string }
  | { t: 'moveUsed'; side: SideId; move: string; name: string; moveName: string; moveType: MoveTypeId; anim: string }
  | { t: 'moveMissed'; side: SideId; name: string }
  | { t: 'moveFailed'; side: SideId; name: string; reason: string }
  | { t: 'blocked'; side: SideId; name: string }
  | { t: 'noTarget'; side: SideId }
  | { t: 'damage'; side: SideId; amount: number; hpBefore: number; hpAfter: number; maxHp: number; eff: number; crit: boolean; attuned: boolean; source: 'move' | 'status' | 'recoil' | 'trait' | 'weariness' | 'self' | 'sap' }
  | { t: 'heal'; side: SideId; amount: number; hpBefore: number; hpAfter: number; maxHp: number; source: string }
  | { t: 'statusApplied'; side: SideId; status: MajorStatus; name: string }
  | { t: 'statusCured'; side: SideId; status: MajorStatus | 'dizzy'; name: string }
  | { t: 'statusBlocked'; side: SideId; name: string; reason: string }
  | { t: 'cantAct'; side: SideId; name: string; reason: 'sleep' | 'paralysis' | 'flinch' | 'dizzy' }
  | { t: 'wokeUp'; side: SideId; name: string }
  | { t: 'dizzyApplied'; side: SideId; name: string }
  | { t: 'dizzyEnd'; side: SideId; name: string }
  | { t: 'statChange'; side: SideId; stat: StageStat; delta: number; name: string; capped: boolean }
  | { t: 'weatherStart'; weather: WeatherId; byMove: boolean }
  | { t: 'weatherEnd'; weather: WeatherId; revertTo: WeatherId }
  | { t: 'traitTriggered'; side: SideId; trait: string; name: string }
  | { t: 'itemUsed'; side: SideId; item: string; target: number; targetName: string }
  | { t: 'captureAttempt'; item: string; shakes: number; success: boolean; species: string; name: string }
  | { t: 'captureDeflected'; item: string }
  | { t: 'fleeAttempt'; success: boolean }
  | { t: 'faint'; side: SideId; index: number; name: string }
  | { t: 'xpGain'; uid: string; name: string; amount: number }
  | { t: 'levelUp'; uid: string; name: string; level: number }
  | { t: 'moveLearned'; uid: string; name: string; move: string; moveName: string }
  | { t: 'moveLearnPending'; uid: string; name: string; move: string; moveName: string }
  | { t: 'evolutionQueued'; uid: string; to: string }
  | { t: 'needReplace'; side: SideId }
  | { t: 'weary'; }
  | { t: 'message'; text: string }
  | { t: 'battleEnd'; outcome: Outcome };
