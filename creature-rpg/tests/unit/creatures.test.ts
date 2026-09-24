import { describe, expect, it } from 'vitest';
import { assemble } from '../../src/creatures/assemble';
import { Animator } from '../../src/creatures/anim';
import * as fs from 'node:fs';
import * as path from 'node:path';

const dir = path.resolve(__dirname, '../../src/creatures/species');
const files = fs.readdirSync(dir).filter((f) => /^c\d\d\.ts$/.test(f)).sort();

describe('species builders', async () => {
  for (const f of files) {
    const id = f.slice(0, 3);
    const mod = await import(`../../src/creatures/species/${f}`);
    it(`${id} builds at all LODs/qualities, animates, and reports stats`, () => {
      const v = mod[id];
      expect(v.id).toBe(id);
      for (const q of ['high', 'balanced', 'mobile'] as const) {
        for (const lod of [0, 1, 2] as const) {
          const m = assemble(v, { lod, quality: q });
          const a = new Animator(m);
          for (const act of ['attack', 'special', 'hit', 'capture', 'faint', 'victory'] as const) {
            a.play(act);
            for (let i = 0; i < 20; i++) a.update(0.1);
          }
          a.resetPose();
          a.setSpeed(3);
          a.update(0.1);
          expect(m.bounds.height).toBeGreaterThan(0);
          expect(Number.isFinite(m.bounds.radius)).toBe(true);
          if (lod === 0 && q === 'high') {
            // eslint-disable-next-line no-console
            console.log(`${id} tris=${m.stats.triangles} draws=${m.stats.drawCalls} h=${m.bounds.height.toFixed(2)}`);
          }
          m.dispose();
        }
      }
    });
  }
});
