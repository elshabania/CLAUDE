import types from '../../src/data/content/types.json';
import moves from '../../src/data/content/moves.json';
import items from '../../src/data/content/items.json';
import families from '../../src/data/content/families.json';
import type { Content } from '../../src/sim/content';
import type { SpeciesDef } from '../../src/sim/types';

const cry = { voice: 'fm' as const, basePitchHz: 400, contour: [[0, 0], [1, 0]] as [number, number][], durationMs: 400 };

/** Fixture species reproducing design/systems.md §16 worked example (placeholder bases). */
export const fixtureSpecies: Record<string, SpeciesDef> = {
  x_elec2: { id: 'x_elec2', name: 'Testvolt', family: 'f01', stage: 2, types: ['electric'], base: { hp: 55, atk: 60, def: 50, spa: 80, spd: 55, spe: 95 }, trait: 'tr_keen_focus', catchRate: 45, xpYield: 131, growth: 'medium', heightM: 1, colors: [], cry },
  x_water2: { id: 'x_water2', name: 'Testwave', family: 'f03', stage: 2, types: ['water'], base: { hp: 70, atk: 80, def: 70, spa: 55, spd: 60, spe: 65 }, trait: 'tr_keen_focus', catchRate: 90, xpYield: 133, growth: 'medium', heightM: 1, colors: [], cry },
};

export function makeContent(species: Record<string, SpeciesDef> = fixtureSpecies): Content {
  return {
    species,
    moves: Object.fromEntries((moves as any[]).map((m) => [m.id, m])),
    items: Object.fromEntries((items as any[]).map((m) => [m.id, m])),
    typeMatrix: (types as any).matrix,
    families: families as any,
  };
}
