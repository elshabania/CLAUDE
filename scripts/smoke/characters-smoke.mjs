// Runtime smoke test: construct every character with a stubbed `three` + canvas,
// asserting each exposes the shared rig contract game.js depends on.
// Run: node --loader ./scripts/smoke/loader.mjs scripts/smoke/characters-smoke.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const base = pathToFileURL(join(here, '..', '..', 'public', 'pokemon-arena', 'characters') + '/').href;

const ctx2d = new Proxy({}, { get: (t, p) => {
  if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') return () => ({ addColorStop() {} });
  if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
  if (p === 'measureText') return () => ({ width: 10 });
  if (p === 'canvas') return { width: 256, height: 256 };
  return () => {};
}});
const fakeCanvas = () => ({ width: 256, height: 256, getContext: () => ctx2d });
globalThis.document = { createElement: (t) => t === 'canvas' ? fakeCanvas() : ({ style: {}, getContext: () => ctx2d }) };
globalThis.window = { devicePixelRatio: 1 };

const out = [];
function rig(name, g) {
  const ud = g && g.userData;
  if (!ud) throw new Error(name + ': no userData');
  for (const k of ['head', 'jaw', 'mouthAnchor', 'tailGroup', 'flame', 'bodyMats', 'arms', 'legs', 'element', 'name', 'height'])
    if (!(k in ud)) throw new Error(name + ': missing rig key ' + k);
  for (const k of ['arms', 'legs', 'bodyMats', 'wings'])
    if (!Array.isArray(ud[k])) throw new Error(name + ': ' + k + ' must be an array');
  if (typeof ud.animateExtra === 'function') ud.animateExtra(1, 0.016, { speed: 2, flying: false, attacking: true });
  out.push(name + ' OK (' + ud.name + '/' + ud.element + ', arms=' + ud.arms.length + ' legs=' + ud.legs.length + ' wings=' + ud.wings.length + ')');
}

const cz = await import(base + 'charizard.js'); rig('charizard', cz.createCharizard());
const vn = await import(base + 'venusaur.js'); rig('venusaur', vn.createVenusaur());
const bl = await import(base + 'blastoise.js'); rig('blastoise', bl.createBlastoise());
const vo = await import(base + 'voltaron.js'); rig('voltaron', vo.createVoltaron());
const ash = await import(base + 'ash.js'); rig('ash', ash.createAsh()); rig('referee', ash.createReferee());
if (!ash.createAsh().userData.throwArm) throw new Error('ash: throwArm missing');
const en = await import(base + 'enemies.js');
if (en.ENEMY_SPECIES.length !== 4) throw new Error('ENEMY_SPECIES must have exactly 4 entries');
for (const s of en.ENEMY_SPECIES) {
  const g = en.createEnemy(s.id); rig('enemy:' + s.id, g);
  if (g.userData.species !== s) throw new Error(s.id + ': userData.species not wired');
}
console.log(out.join('\n') + '\n\nCHARACTER SMOKE PASSED');
