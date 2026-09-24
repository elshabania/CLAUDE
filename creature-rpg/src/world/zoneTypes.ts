// Data-driven zone specification. Zones are authored in src/data/content/zones/*.json.
import type { TypeId, WeatherId } from '../sim/types';

export type V2 = [number, number];

export type Biome = 'meadow' | 'forest' | 'ridge' | 'town' | 'cave' | 'fen' | 'lake' | 'cliff' | 'volcano' | 'tundra' | 'snow' | 'spire';

export interface TerrainSpec {
  seed: number;
  size: [number, number];          // width (x), depth (z) in metres; origin at centre
  base: number;                    // base height
  amp: number;                     // noise amplitude
  scale: number;                   // noise feature size (m)
  rim: number;                     // boundary wall height
  rimWidth: number;
  hills?: { at: V2; r: number; h: number }[];
  flats?: { at: V2; r: number; h?: number }[];          // flattened clearings (h default: local base)
  paths?: { pts: V2[]; w: number }[];                    // flattened walkable strips
  water?: { at: V2; r: number; depth: number; level: number; shape?: 'circle' | 'ellipse'; rz?: number }[];
  ceiling?: number;                                      // caves: height of rock ceiling
}

export interface ExitSpec {
  id: string;
  at: V2;
  r: number;
  to: string;           // zone id
  spawn: string;        // spawn id in target zone
  label: string;
  gate?: { flag?: string; register?: string; message: string };
}

export interface SpawnSpec { id: string; at: V2; yaw?: number }

export interface PropSpec {
  kind: string;          // house, tree, rock, fence, lamp, sign, chordstone, hall, hearth, etc.
  at: V2;
  yaw?: number;
  s?: number;            // scale
  color?: string;
  roof?: string;
  label?: string;
  solid?: boolean;
  w?: number;
  d?: number;
  h?: number;
}

export interface NpcSpec {
  id: string;
  at: V2;
  yaw?: number;
  look: string;          // human look id (see creatures/trainers)
  name: string;
  dialogue: string;      // dialogue id
  role?: 'hearth' | 'shop' | 'steward' | 'mentor' | 'quest' | 'villager' | 'cantor' | 'rival' | 'admin';
  shop?: string;         // shop inventory id
  showIf?: string;       // flag expression
  hideIf?: string;
}

export interface TrainerSpawn {
  id: string;            // trainer id
  at: V2;
  yaw?: number;
  sight?: number;        // metres; 0 = must talk
  showIf?: string;
  hideIf?: string;
}

export interface NodeSpec {
  id: string;            // rn_<zone>_<nn>
  type: TypeId;
  at: V2;
  yaw?: number;
  kind: 'vine' | 'lode' | 'thorn' | 'current' | 'boulder' | 'grate' | 'vent' | 'veil' | 'falls' | 'beacon';
  mandatory?: boolean;
  reward?: { item?: string; count?: number; money?: number };
  opens?: string;        // exit id this node gates
  blocker?: { at: V2; w: number; d: number; yaw?: number };
}

export interface PickupSpec { id: string; at: V2; item: string; count?: number; hidden?: boolean; showIf?: string }

export interface ZoneSpec {
  id: string;
  name: string;
  biome: Biome;
  attuned: TypeId | null;
  music: string;
  indoor?: boolean;
  terrain: TerrainSpec;
  palette: { ground: string; ground2: string; path: string; cliff: string; accent: string; sky: string; fog: string };
  fogDensity: number;
  weather: Partial<Record<WeatherId, number>>;   // ambient weather weights
  spawns: SpawnSpec[];
  exits: ExitSpec[];
  props: PropSpec[];
  scatter: { kind: string; density: number; minDist?: number; avoidPaths?: boolean }[];
  npcs: NpcSpec[];
  trainers: TrainerSpawn[];
  nodes: NodeSpec[];
  pickups: PickupSpec[];
  wildRegions: { at: V2; r: number }[];
  maxWild: number;
  encounters?: string;   // encounter table id
  battleStages: { at: V2; yaw: number }[];
  hearthSpawn?: string;  // spawn used after wipe if this zone has a Hearthrest
  waystone?: V2;
}
