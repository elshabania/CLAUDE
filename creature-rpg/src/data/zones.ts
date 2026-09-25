// Zone registry: validated JSON zone specs (world.md v2).
import { z } from 'zod';
import type { ZoneSpec } from '../world/zoneTypes';
import { typeId } from './schemas';

const v2 = z.tuple([z.number(), z.number()]);
export const zoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  biome: z.enum(['meadow', 'forest', 'ridge', 'town', 'cave', 'fen', 'lake', 'cliff', 'volcano', 'tundra', 'snow', 'spire']),
  attuned: typeId.nullable(),
  music: z.string(),
  indoor: z.boolean().optional(),
  terrain: z.object({
    seed: z.number(), size: v2, base: z.number(), amp: z.number(), scale: z.number(), rim: z.number(), rimWidth: z.number(),
    hills: z.array(z.object({ at: v2, r: z.number(), h: z.number() })).optional(),
    flats: z.array(z.object({ at: v2, r: z.number(), h: z.number().optional() })).optional(),
    paths: z.array(z.object({ pts: z.array(v2), w: z.number() })).optional(),
    water: z.array(z.object({ at: v2, r: z.number(), depth: z.number(), level: z.number(), rz: z.number().optional() })).optional(),
    ceiling: z.number().optional(),
  }),
  palette: z.object({ ground: z.string(), ground2: z.string(), path: z.string(), cliff: z.string(), accent: z.string(), sky: z.string(), fog: z.string() }),
  fogDensity: z.number(),
  weather: z.record(z.string(), z.number()),
  spawns: z.array(z.object({ id: z.string(), at: v2, yaw: z.number().optional() })).min(1),
  exits: z.array(z.object({ id: z.string(), at: v2, r: z.number(), to: z.string(), spawn: z.string(), label: z.string(), gate: z.object({ flag: z.string().optional(), register: z.string().optional(), message: z.string() }).optional() })),
  props: z.array(z.object({ kind: z.string(), at: v2 }).passthrough()),
  scatter: z.array(z.object({ kind: z.string(), density: z.number(), minDist: z.number().optional(), avoidPaths: z.boolean().optional() })),
  npcs: z.array(z.object({ id: z.string(), at: v2, look: z.string(), name: z.string(), dialogue: z.string() }).passthrough()),
  trainers: z.array(z.object({ id: z.string(), at: v2 }).passthrough()),
  nodes: z.array(z.object({ id: z.string(), type: typeId, at: v2, kind: z.string() }).passthrough()),
  pickups: z.array(z.object({ id: z.string(), at: v2, item: z.string() }).passthrough()),
  wildRegions: z.array(z.object({ at: v2, r: z.number() })),
  maxWild: z.number().int().max(6),
  encounters: z.string().optional(),
  battleStages: z.array(z.object({ at: v2, yaw: z.number() })).min(1),
  hearthSpawn: z.string().optional(),
  waystone: v2.optional(),
}).passthrough();

const files = import.meta.glob('./zones/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
export const ZONES: Record<string, ZoneSpec> = {};
export const ZONE_ERRORS: string[] = [];
for (const [path, data] of Object.entries(files)) {
  const r = zoneSchema.safeParse(data);
  const id = path.match(/([\w_]+)\.json$/)![1];
  if (!r.success) {
    ZONE_ERRORS.push(`${id}: ` + r.error.issues.slice(0, 4).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    continue;
  }
  ZONES[id] = r.data as unknown as ZoneSpec;
}

export function loadZone(id: string): ZoneSpec {
  const z = ZONES[id];
  if (!z) throw new Error(`zone ${id} missing or invalid: ${ZONE_ERRORS.join(' | ')}`);
  return z;
}
