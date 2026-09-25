// Runtime registries for zone-scoped content (dialogue) and generated content (trainers, encounters, shops).
import trainersJson from './content/trainers.json';
import encountersJson from './content/encounters.json';
import shopsJson from './content/shops.json';
import type { EncounterData } from '../sim/world';

export interface Line { s?: string; t: string }
export type Action = Record<string, unknown>;
export interface Variant { if?: string; lines: Line[]; actions?: Action[]; choice?: { prompt?: string; options: { label: string; actions: Action[] }[] } }
export interface Dialogue { variants: Variant[] }

const dfiles = import.meta.glob('./dialogue/*.json', { eager: true, import: 'default' }) as Record<string, Record<string, Dialogue>>;
export const DIALOGUE: Record<string, Dialogue> = {};
for (const d of Object.values(dfiles)) Object.assign(DIALOGUE, d);

export interface TrainerDef {
  id: string;
  zone: string;
  at: [number, number];
  mandatory: boolean;
  name: string;
  title: string;
  look: string;
  classBase: number;
  team: { species: string; level: number }[];
  phases?: { attuned: string | null; team: { species: string; level: number }[] }[];
  ai: 'easy' | 'normal' | 'hard';
  potential: number;
  items: string[];
  lines?: { intro: string; lose: string; win: string };
  sight: number;
  payout: number;
}
export const TRAINERS: Record<string, TrainerDef> = Object.fromEntries((trainersJson as unknown as TrainerDef[]).map((t) => [t.id, t]));
export const ENCOUNTERS = encountersJson as unknown as EncounterData;
export const SHOPS = shopsJson as unknown as Record<string, { name: string; items: { id: string; if?: string }[] }>;
