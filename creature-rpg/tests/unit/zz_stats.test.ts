import { it } from 'vitest';
import * as THREE from 'three';
import { assemble } from '../../src/creatures/assemble';
import { SPECIES_VISUALS } from '../../src/creatures/registry';
it('stats', () => {
  for (const id of Object.keys(SPECIES_VISUALS).sort()) {
    const m = assemble(SPECIES_VISUALS[id], { lod: 0, quality: 'high' });
    let fur = 0; const acc: Record<string, number> = {};
    m.root.traverse((o) => { const me = o as THREE.Mesh; if (!me.isMesh) return; const t = me.geometry.index ? me.geometry.index.count / 3 : me.geometry.attributes.position.count / 3; if (o.name.startsWith('fur')) fur += t; else if (!(me as any).isSkinnedMesh) { const k = o.parent?.name ?? '?'; acc[k] = (acc[k] ?? 0) + t; } });
    const top = Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' ');
    process.stdout.write(`${id} tot=${m.stats.triangles} sculpt=${m.stats.sculptedTris} fur=${fur} acc=${Object.values(acc).reduce((a, b) => a + b, 0)} ${top}\n`);
    m.dispose();
  }
});
