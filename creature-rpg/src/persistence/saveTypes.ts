import type { RngState } from '../sim/rng';
import type { CreatureInstance } from '../sim/types';

export const SAVE_SCHEMA_VERSION = 2;

/** Committed game state — the only thing ever written to a save. */
export interface SavePayload {
  player: {
    name: string;
    pronoun: 'they' | 'she' | 'he';
    look: { build: number; skin: number; hair: number };
    money: number;
    playtimeSec: number;
    starter: string | null;
  };
  clockMinutes: number;              // in-game minutes since start (drives day/night)
  rngState: RngState;
  zone: { id: string; spawn: string };
  lastHearth: { zone: string; spawn: string };
  party: string[];                   // instance uids (1..6)
  storage: string[];                 // instance uids (<= 300)
  instances: Record<string, CreatureInstance>;
  inventory: Record<string, number>;
  flags: Record<string, boolean | number>;
  quests: Record<string, { state: 'active' | 'done'; step: number }>;
  seen: string[];
  caught: string[];
  nodes: string[];                   // solved resonance nodes
  waystones: string[];               // registered fast-travel points
  defeatedTrainers: string[];
  pickups: string[];                 // collected overworld items
  stats: { battles: number; captures: number; steps: number };
}

export interface SaveEnvelope {
  format: 'crpg-save';
  schemaVersion: number;
  gameVersion: string;
  savedAt: string;
  checksum: string;
  payload: SavePayload;
}

export const STORAGE_CAP = 300;
export const PARTY_CAP = 6;
