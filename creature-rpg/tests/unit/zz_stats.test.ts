import { it } from 'vitest';
import { assemble } from '../../src/creatures/assemble';
import { SPECIES_VISUALS } from '../../src/creatures/registry';
it('stats', () => {
  for (const id of Object.keys(SPECIES_VISUALS).sort()) {
    const row = (['high', 'balanced', 'mobile'] as const).map((q) => { const m = assemble(SPECIES_VISUALS[id], { lod: 0, quality: q }); const r = `${q[0]}:${m.stats.triangles}/${m.stats.sculptedTris}/${m.stats.meshMs.toFixed(0)}ms`; m.dispose(); return r; });
    process.stdout.write(`${id} ${row.join(' ')}\n`);
  }
});
