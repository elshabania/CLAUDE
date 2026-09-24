// Frozen, validated content registry. All gameplay code reads content through `CONTENT`.
import speciesJson from './content/species.json';
import movesJson from './content/moves.json';
import itemsJson from './content/items.json';
import typesJson from './content/types.json';
import familiesJson from './content/families.json';
import traitsJson from './content/traits.json';
import { familiesSchema, itemSchema, moveSchema, speciesSchema, traitSchema, typesSchema } from './schemas';
import type { Content } from '../sim/content';
import type { ItemDef, MoveDef, SpeciesDef } from '../sim/types';
import { z } from 'zod';

function parse<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new Error(`content ${label} invalid: ` + r.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return r.data;
}

const species = parse(z.array(speciesSchema), speciesJson, 'species');
const moves = parse(z.array(moveSchema), movesJson, 'moves');
const items = parse(z.array(itemSchema), itemsJson, 'items');
const types = parse(typesSchema, typesJson, 'types');
const families = parse(familiesSchema, familiesJson, 'families');
const traits = parse(z.array(traitSchema), traitsJson, 'traits');

export const CONTENT: Content = {
  species: Object.fromEntries(species.map((s) => [s.id, s as unknown as SpeciesDef])),
  moves: Object.fromEntries(moves.map((m) => [m.id, m as unknown as MoveDef])),
  items: Object.fromEntries(items.map((i) => [i.id, i as unknown as ItemDef])),
  typeMatrix: types.matrix as Content['typeMatrix'],
  families: families as Content['families'],
};
export const TRAITS = Object.fromEntries(traits.map((t) => [t.id, t]));

/** Cross-reference validation. Returns a list of problems (empty = valid). */
export function validateContent(c: Content = CONTENT): string[] {
  const errs: string[] = [];
  const ids = (o: Record<string, unknown>) => new Set(Object.keys(o));
  const moveIds = ids(c.moves);
  const specIds = ids(c.species);
  if (specIds.size !== 30) errs.push(`expected 30 species, got ${specIds.size}`);
  const fams = new Map<string, string[]>();
  for (const s of Object.values(c.species)) {
    fams.set(s.family, [...(fams.get(s.family) ?? []), s.id]);
    if (!TRAITS[s.trait]) errs.push(`${s.id}: unknown trait ${s.trait}`);
    if (s.evolvesTo && !specIds.has(s.evolvesTo.species)) errs.push(`${s.id}: evolvesTo unknown`);
    if (s.evolvesTo?.move && !moveIds.has(s.evolvesTo.move)) errs.push(`${s.id}: evo move unknown`);
    if (s.evolvesFrom && c.species[s.evolvesFrom]?.evolvesTo?.species !== s.id) errs.push(`${s.id}: evolution chain inconsistent`);
    const bst = Object.values(s.base).reduce((a, b) => a + b, 0);
    const band = s.stage === 1 ? [280, 320] : s.stage === 2 ? [395, 435] : [505, 535];
    if (bst < band[0] || bst > band[1]) errs.push(`${s.id}: BST ${bst} outside band`);
    const expY = s.stage === 1 ? Math.floor(bst / 5) : s.stage === 2 ? Math.floor(bst / 3) : Math.floor((bst * 4) / 9);
    if (s.xpYield !== expY) errs.push(`${s.id}: xpYield ${s.xpYield} != derived ${expY}`);
    if (!s.types.includes(s.types[0])) errs.push('types');
  }
  if (fams.size !== 10) errs.push(`expected 10 families, got ${fams.size}`);
  for (const [f, list] of fams) if (list.length !== 3) errs.push(`${f}: ${list.length} species`);
  const perType = new Map<string, number>();
  for (const m of Object.values(c.moves)) {
    if (m.id !== 'm000') perType.set(m.type, (perType.get(m.type) ?? 0) + 1);
  }
  if (Object.keys(c.moves).length < 81) errs.push('fewer than 80 moves');
  for (const [t, n] of perType) if (n < 7) errs.push(`type ${t} has only ${n} moves`);
  for (const [f, ls] of Object.entries(c.families.learnsets)) {
    for (const e of ls) if (!moveIds.has(e.move)) errs.push(`${f}: learnset move ${e.move} unknown`);
    const byTen = ls.filter((e) => !e.evo && (e.level ?? 99) <= 10).length;
    if (byTen < 3) errs.push(`${f}: only ${byTen} moves by Lv 10`);
  }
  for (const it of Object.values(c.items)) {
    if (it.kind === 'disc' && !moveIds.has((it.params as any).move)) errs.push(`${it.id}: disc move unknown`);
  }
  return errs;
}
