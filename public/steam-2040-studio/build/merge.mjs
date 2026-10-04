/* Merge two preload result sets (JSON + packed diff blobs) into one,
   re-packing offsets. Usage: node merge.mjs <sufA> <sufB> <sufOut>
   e.g. node merge.mjs "" ".x" ".final" */
import fs from 'fs';
import zlib from 'zlib';
const SCR = new URL('.', import.meta.url).pathname;
const [sa, sb, so] = [process.argv[2] || '', process.argv[3] || '.x', process.argv[4] || '.m'];

function load(suf) {
  const j = JSON.parse(fs.readFileSync(`${SCR}preload-agg${suf}.json`, 'utf8'));
  const buf = zlib.gunzipSync(fs.readFileSync(`${SCR}preload-diff${suf}.gz`));
  return { j, buf };
}
const A = load(sa), B = load(sb);
if (A.j.sampleN !== B.j.sampleN || A.j.minAbs !== B.j.minAbs) throw new Error('incompatible protocols');

const chunks = [], results = [];
let off = 0;
for (const src of [A, B]) {
  for (const r of src.j.results) {
    const out = { ...r };
    if (r.dN) {
      const bytes = 8 * r.dN, pad = (4 - (bytes % 4)) % 4;
      chunks.push(src.buf.subarray(r.dOff, r.dOff + bytes), Buffer.alloc(pad));
      out.dOff = off; off += bytes + pad;
    }
    results.push(out);
  }
}
fs.writeFileSync(`${SCR}preload-diff${so}.gz`, zlib.gzipSync(Buffer.concat(chunks), { level: 9 }));
fs.writeFileSync(`${SCR}preload-agg${so}.json`, JSON.stringify({ ...A.j, results }, null, 1));
console.log(`merged ${A.j.results.length} + ${B.j.results.length} = ${results.length} configs → preload-agg${so}.json / preload-diff${so}.gz (${off} bytes raw)`);
