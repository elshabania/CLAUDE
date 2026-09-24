import { z } from 'zod';
import type { KnownIds } from './saveManager';
import { PARTY_CAP, STORAGE_CAP } from './saveTypes';

const stats = z.object({ hp: z.number().int(), atk: z.number().int(), def: z.number().int(), spa: z.number().int(), spd: z.number().int(), spe: z.number().int() });
const instance = z.object({
  uid: z.string().min(1),
  species: z.string(),
  nickname: z.string().max(24).optional(),
  level: z.number().int().min(1).max(60),
  xp: z.number().int().min(0),
  potential: stats,
  temperament: z.string(),
  moves: z.array(z.object({ id: z.string(), charges: z.number().int().min(0) })).min(1).max(4),
  hp: z.number().int().min(0),
  status: z.enum(['burn', 'poison', 'paralysis', 'sleep', 'frostbite']).nullable(),
  sleepCounter: z.number().int().optional(),
  bond: z.boolean().optional(),
  evolveReady: z.boolean().optional(),
  caughtIn: z.string().optional(),
  metZone: z.string().optional(),
});

export const payloadSchema = z.object({
  player: z.object({
    name: z.string().min(1).max(16),
    pronoun: z.enum(['they', 'she', 'he']),
    look: z.object({ build: z.number().int(), skin: z.number().int(), hair: z.number().int() }),
    money: z.number().int().min(0).max(999_999),
    playtimeSec: z.number().min(0),
    starter: z.string().nullable(),
  }),
  clockMinutes: z.number().min(0),
  rngState: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  zone: z.object({ id: z.string(), spawn: z.string() }),
  lastHearth: z.object({ zone: z.string(), spawn: z.string() }),
  party: z.array(z.string()).max(PARTY_CAP),
  storage: z.array(z.string()).max(STORAGE_CAP),
  instances: z.record(z.string(), instance),
  inventory: z.record(z.string(), z.number().int().min(0)),
  flags: z.record(z.string(), z.union([z.boolean(), z.number()])),
  quests: z.record(z.string(), z.object({ state: z.enum(['active', 'done']), step: z.number().int() })),
  seen: z.array(z.string()),
  caught: z.array(z.string()),
  nodes: z.array(z.string()),
  waystones: z.array(z.string()),
  defeatedTrainers: z.array(z.string()),
  pickups: z.array(z.string()),
  stats: z.object({ battles: z.number(), captures: z.number(), steps: z.number() }),
});

export function validatePayload(p: unknown, known?: KnownIds): { ok: true } | { ok: false; error: string } {
  const r = payloadSchema.safeParse(p);
  if (!r.success) return { ok: false, error: r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  const d = r.data;
  const all = [...d.party, ...d.storage];
  if (new Set(all).size !== all.length) return { ok: false, error: 'duplicate creature in party/storage' };
  for (const id of all) if (!d.instances[id]) return { ok: false, error: `missing instance ${id}` };
  for (const [uid, inst] of Object.entries(d.instances)) if (inst.uid !== uid) return { ok: false, error: `instance key mismatch ${uid}` };
  if (known) {
    for (const inst of Object.values(d.instances)) {
      if (!known.species.has(inst.species)) return { ok: false, error: `unknown species ${inst.species}` };
      for (const m of inst.moves) if (!known.moves.has(m.id)) return { ok: false, error: `unknown move ${m.id}` };
    }
    for (const it of Object.keys(d.inventory)) if (!known.items.has(it)) return { ok: false, error: `unknown item ${it}` };
    if (!known.zones.has(d.zone.id)) return { ok: false, error: `unknown zone ${d.zone.id}` };
  }
  return { ok: true };
}
