import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const STUB = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'three-stub.mjs')).href;
export async function resolve(spec, ctx, next) {
  if (spec === 'three' || spec.startsWith('three/addons/')) return { url: STUB, shortCircuit: true };
  return next(spec, ctx);
}
