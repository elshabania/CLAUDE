#!/usr/bin/env node
// Static audit for public/pokemon-arena:
//  1) node --check every .js module
//  2) every getElementById/querySelector('#id') used in JS exists in index.html
//  3) every relative import between game modules resolves to a real file AND
//     every imported named binding is actually exported by that file
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../public/pokemon-arena');
let failures = 0;
const fail = (msg) => { failures++; console.error('  ✗ ' + msg); };
const ok = (msg) => console.log('  ✓ ' + msg);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

const files = walk(ROOT);
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

console.log('\n[1/3] syntax check (' + files.length + ' modules)');
for (const f of files) {
  try { execFileSync('node', ['--check', f], { stdio: 'pipe' }); }
  catch (e) { fail(`node --check failed: ${f}\n${e.stderr}`); }
}
if (!failures) ok('all modules parse');

console.log('[2/3] DOM id references');
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
let idCount = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/getElementById\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) {
    idCount++;
    if (!htmlIds.has(m[1])) fail(`${f}: getElementById('${m[1]}') — id not in index.html`);
  }
  for (const m of src.matchAll(/querySelector(?:All)?\(\s*['"`]#([A-Za-z0-9_-]+)['"`]\s*\)/g)) {
    idCount++;
    if (!htmlIds.has(m[1])) fail(`${f}: querySelector('#${m[1]}') — id not in index.html`);
  }
}
ok(idCount + ' id references checked');

console.log('[3/3] import/export resolution');
const exportsOf = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g))
    for (const part of m[1].split(','))
      names.add((part.split(/\s+as\s+/)[1] || part).trim());
  if (/export\s+default/.test(src)) names.add('default');
  exportsOf.set(f, names);
}
let impCount = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s+(?:([A-Za-z0-9_$]+)\s*,?\s*)?(?:\{([^}]+)\})?\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const [, defaultImp, named, spec] = m;
    const target = resolve(dirname(f), spec);
    impCount++;
    if (!existsSync(target)) { fail(`${f}: import '${spec}' → file missing`); continue; }
    const exp = exportsOf.get(target) ?? new Set();
    if (defaultImp && !exp.has('default')) fail(`${f}: default import from '${spec}' but no default export`);
    for (const part of (named || '').split(',').filter(Boolean)) {
      const name = part.split(/\s+as\s+/)[0].trim();
      if (name && !exp.has(name)) fail(`${f}: '${name}' not exported by '${spec}'`);
    }
  }
  for (const m of src.matchAll(/import\s*\*\s*as\s+[A-Za-z0-9_$]+\s+from\s*['"](\.[^'"]+)['"]/g)) {
    impCount++;
    if (!existsSync(resolve(dirname(f), m[1]))) fail(`${f}: import '${m[1]}' → file missing`);
  }
}
ok(impCount + ' local imports checked');

if (failures) { console.error(`\nAUDIT FAILED: ${failures} problem(s)\n`); process.exit(1); }
console.log('\nAUDIT PASSED\n');
