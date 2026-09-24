import { it } from 'vitest';
(globalThis as any).__sdfProf = {};
it('prof', async () => {
  const { assemble } = await import('../../src/creatures/assemble');
  for (const id of ['c04', 'c12', 'c01']) {
    const v = (await import(`../../src/creatures/species/${id}.ts`))[id];
    const P = (globalThis as any).__sdfProf; for (const k in P) delete P[k];
    const t = performance.now();
    const m = assemble(v, { lod: 0, quality: 'high' });
    process.stdout.write("\n" + [id, (performance.now() - t).toFixed(0), JSON.stringify(Object.fromEntries(Object.entries(P).map(([k, x]) => [k, Math.round(x as number)]))), m.stats.sculptedTris].join(" ") + "\n");
  }
});
