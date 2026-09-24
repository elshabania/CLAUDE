import type { SpeciesVisual } from './assemble';

/** speciesId -> bespoke visual spec. Auto-discovered from species/cXX.ts (each exports `cXX`). */
const mods = import.meta.glob('./species/c*.ts', { eager: true }) as Record<string, Record<string, SpeciesVisual>>;
export const SPECIES_VISUALS: Record<string, SpeciesVisual> = {};
for (const [path, mod] of Object.entries(mods)) {
  const id = path.match(/(c\d\d)\.ts$/)![1];
  if (!mod[id]) throw new Error(`${path} must export const ${id}`);
  SPECIES_VISUALS[id] = mod[id];
}
