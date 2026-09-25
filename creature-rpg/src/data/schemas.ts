// zod schemas for all content JSON (validated at startup and in tests).
import { z } from 'zod';

export const typeId = z.enum(['fire', 'water', 'electric', 'verdant', 'stone', 'frost', 'gale', 'toxin', 'shade', 'lumen']);
const stats = z.object({ hp: z.number().int().min(10).max(160), atk: z.number().int(), def: z.number().int(), spa: z.number().int(), spd: z.number().int(), spe: z.number().int() });
const weather = z.enum(['clear', 'rain', 'snow', 'fog', 'sunlight']);

export const speciesSchema = z.object({
  id: z.string().regex(/^c\d\d$/),
  name: z.string().min(2).max(14),
  family: z.string().regex(/^f\d\d$/),
  stage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  types: z.array(typeId).min(1).max(2),
  heightM: z.number().positive(),
  bodyPlan: z.string(),
  silhouette: z.string(),
  base: stats,
  catchRate: z.number().int().min(1).max(255),
  xpYield: z.number().int().positive(),
  growth: z.enum(['fast', 'medium', 'slow']),
  trait: z.string().startsWith('tr_'),
  temperament: z.enum(['skittish', 'curious', 'territorial', 'wander']),
  attackStyle: z.string(),
  sideYaw: z.number(),
  blurb: z.string(),
  colors: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).min(2).max(3),
  cry: z.object({ voice: z.enum(['fm', 'am', 'saw_formant', 'noise_formant']), basePitchHz: z.number(), contour: z.array(z.tuple([z.number(), z.number()])), durationMs: z.number(), harmonicity: z.number().optional(), modIndex: z.number().optional(), vibrato: z.number().optional(), noiseMix: z.number().optional() }),
  evolvesTo: z.object({ species: z.string(), level: z.number().int().optional(), item: z.string().optional(), move: z.string().optional() }).optional(),
  evolvesFrom: z.string().optional(),
});

const effect = z.object({ kind: z.string() }).passthrough();
export const moveSchema = z.object({
  id: z.string().regex(/^m\d{3}$/),
  name: z.string(),
  type: z.union([typeId, z.literal('none')]),
  category: z.enum(['physical', 'special', 'status']),
  power: z.number().nullable(),
  accuracy: z.number().nullable(),
  charges: z.number().nullable(),
  priority: z.number().int(),
  target: z.enum(['foe', 'self', 'field']),
  effects: z.array(effect),
  anim: z.string(),
});

export const itemSchema = z.object({
  id: z.string().startsWith('i_'),
  name: z.string(),
  kind: z.enum(['heal', 'cure', 'revive', 'charge', 'repel', 'escape', 'orb', 'disc', 'key', 'evo']),
  price: z.number().nullable(),
  sell: z.number().nullable(),
  desc: z.string(),
  params: z.record(z.string(), z.unknown()),
});

export const traitSchema = z.object({ id: z.string().startsWith('tr_'), name: z.string(), desc: z.string() });

export const typesSchema = z.object({ ids: z.array(typeId).length(10), matrix: z.record(typeId, z.record(typeId, z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(4)]))) });

export const familiesSchema = z.object({
  learnsets: z.record(z.string(), z.array(z.object({ level: z.number().nullable(), move: z.string(), evo: z.boolean().optional() }))),
  evolution: z.record(z.string(), z.object({ level2: z.number(), level3: z.number(), item3: z.string().nullable(), move2: z.string(), move3: z.string() })),
  discCoverage: z.record(z.string(), z.array(typeId)),
  growth: z.record(z.string(), z.enum(['fast', 'medium', 'slow'])),
});

export { weather };
