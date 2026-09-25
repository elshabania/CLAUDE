import type { ItemDef, LearnEntry, MoveDef, SpeciesDef, TypeId, Growth } from './types';

/** Read-only view of validated content, injected into every pure sim function. */
export interface Content {
  species: Record<string, SpeciesDef>;
  moves: Record<string, MoveDef>;
  items: Record<string, ItemDef>;
  /** k/2 encoding: 0,1,2,4 */
  typeMatrix: Record<TypeId, Record<TypeId, number>>;
  families: {
    learnsets: Record<string, LearnEntry[]>;
    discCoverage: Record<string, TypeId[]>;
    growth: Record<string, Growth>;
  };
}
