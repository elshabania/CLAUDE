#!/usr/bin/env node
// Static audit of the game at public/pokemon-arena/.
// Checks: JS syntax, DOM id contract, module import graph, CSS classes used by JS.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARENA = path.join(ROOT, "public", "pokemon-arena");

const errors = [];
const warnings = [];
const results = []; // { check, status, detail }

function fail(check, msg) { errors.push(`[${check}] ${msg}`); }
function warn(check, msg) { warnings.push(`[${check}] ${msg}`); }

if (!fs.existsSync(ARENA)) {
  console.error(`FATAL: directory not found: ${ARENA}`);
  process.exit(2);
}

const jsFiles = fs.readdirSync(ARENA).filter((f) => f.endsWith(".js")).sort();
const indexHtmlPath = path.join(ARENA, "index.html");
const indexHtml = fs.existsSync(indexHtmlPath)
  ? fs.readFileSync(indexHtmlPath, "utf8")
  : null;
if (indexHtml === null) fail("html", "index.html not found");

const sources = new Map(); // file -> content
for (const f of jsFiles) sources.set(f, fs.readFileSync(path.join(ARENA, f), "utf8"));

// ---------------------------------------------------------------------------
// 1. Syntax check: node --check on a temp .mjs copy (files are ES modules).
// ---------------------------------------------------------------------------
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "check-arena-"));
  let bad = 0;
  try {
    for (const f of jsFiles) {
      const tmpFile = path.join(tmpDir, f.replace(/\.js$/, ".mjs"));
      fs.writeFileSync(tmpFile, sources.get(f));
      const res = spawnSync(process.execPath, ["--check", tmpFile], { encoding: "utf8" });
      if (res.status !== 0) {
        bad++;
        const msg = (res.stderr || res.stdout || "unknown error")
          .replaceAll(tmpFile, f)
          .trim()
          .split("\n")
          .slice(0, 6)
          .join("\n  ");
        fail("syntax", `${f}: ${msg}`);
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  results.push({
    check: "1. Syntax (node --check)",
    status: bad === 0 ? "PASS" : "FAIL",
    detail: `${jsFiles.length - bad}/${jsFiles.length} files OK`,
  });
}

// ---------------------------------------------------------------------------
// 2. DOM contract: getElementById("X") / querySelector("#X") ids exist in HTML.
// ---------------------------------------------------------------------------
{
  const wanted = new Map(); // id -> Set of "file" refs
  const addRef = (id, f) => {
    if (!wanted.has(id)) wanted.set(id, new Set());
    wanted.get(id).add(f);
  };
  const reGet = /getElementById\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  // Only simple "#id" selectors (no spaces, combinators, attrs, classes).
  const reQs = /querySelector(?:All)?\(\s*["'`]#([A-Za-z_][\w-]*)["'`]\s*\)/g;
  for (const [f, src] of sources) {
    // Skip template literals with interpolation — id is computed at runtime.
    for (const m of src.matchAll(reGet)) if (!m[1].includes("${")) addRef(m[1], f);
    for (const m of src.matchAll(reQs)) if (!m[1].includes("${")) addRef(m[1], f);
  }
  const htmlIds = new Set();
  if (indexHtml) {
    for (const m of indexHtml.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) htmlIds.add(m[1]);
  }
  // Ids the JS itself creates dynamically (el.id = "x", setAttribute("id", "x")).
  const dynIds = new Set();
  for (const src of sources.values()) {
    for (const m of src.matchAll(/\.id\s*=\s*["'`]([^"'`$]+)["'`]/g)) dynIds.add(m[1]);
    for (const m of src.matchAll(/setAttribute\(\s*["'`]id["'`]\s*,\s*["'`]([^"'`$]+)["'`]\s*\)/g)) dynIds.add(m[1]);
  }
  let missing = 0;
  for (const [id, refs] of [...wanted.entries()].sort()) {
    if (!htmlIds.has(id)) {
      if (dynIds.has(id)) {
        warn("dom", `id "${id}" not in index.html but created dynamically (used by ${[...refs].join(", ")})`);
      } else {
        missing++;
        fail("dom", `id "${id}" used by ${[...refs].join(", ")} but not found in index.html`);
      }
    }
  }
  results.push({
    check: "2. DOM id contract",
    status: missing === 0 ? "PASS" : "FAIL",
    detail: `${wanted.size - missing}/${wanted.size} ids resolved`,
  });
}

// ---------------------------------------------------------------------------
// 3. Module graph: imports resolve to existing files exporting each name.
// ---------------------------------------------------------------------------
{
  let problems = 0, checked = 0;
  const exportCache = new Map(); // file -> Set of exported names
  function exportsOf(file) {
    if (exportCache.has(file)) return exportCache.get(file);
    const src = sources.get(file) ?? fs.readFileSync(path.join(ARENA, file), "utf8");
    const names = new Set();
    for (const m of src.matchAll(/export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of src.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    // export const/let/var a = ..., b = ...
    for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([^=;\n]+)/g)) {
      for (const part of m[1].split(",")) {
        const nm = part.trim().match(/^([A-Za-z_$][\w$]*)/);
        if (nm) names.add(nm[1]);
      }
    }
    // export { a, b as c }
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(",")) {
        const seg = part.trim();
        if (!seg) continue;
        const asM = seg.match(/\bas\s+([A-Za-z_$][\w$]*)\s*$/);
        names.add(asM ? asM[1] : seg.split(/\s+/)[0]);
      }
    }
    if (/export\s+default/.test(src)) names.add("default");
    exportCache.set(file, names);
    return names;
  }
  const reImport = /import\s+(?:([A-Za-z_$][\w$]*)\s*,\s*)?(?:\{([^}]*)\}|([A-Za-z_$][\w$]*)|\*\s+as\s+[A-Za-z_$][\w$]*)?\s*from\s*["'`](\.[^"'`]+)["'`]/g;
  for (const [f, src] of sources) {
    for (const m of src.matchAll(reImport)) {
      const [, defaultWithNamed, namedList, defaultOnly, spec] = m;
      const target = path.normalize(spec).replace(/^\.\//, "").replace(/^\//, "");
      checked++;
      const targetPath = path.join(ARENA, target);
      if (!fs.existsSync(targetPath)) {
        problems++;
        fail("modules", `${f}: imports "${spec}" but ${target} does not exist`);
        continue;
      }
      const exp = exportsOf(target);
      const wantNames = [];
      if (namedList) {
        for (const part of namedList.split(",")) {
          const seg = part.trim();
          if (!seg) continue;
          wantNames.push(seg.split(/\s+as\s+/)[0].trim());
        }
      }
      if (defaultWithNamed || defaultOnly) wantNames.push("default");
      for (const name of wantNames) {
        if (!exp.has(name)) {
          problems++;
          fail("modules", `${f}: imports "${name}" from ${target}, but ${target} does not export it`);
        }
      }
    }
  }
  results.push({
    check: "3. Module graph",
    status: problems === 0 ? "PASS" : "FAIL",
    detail: `${checked} import statements checked, ${problems} problem(s)`,
  });
}

// ---------------------------------------------------------------------------
// 4. CSS classes toggled via classList.add/remove exist in index.html <style>.
//    Warn-level only — never fatal.
// ---------------------------------------------------------------------------
{
  const used = new Map(); // class -> Set of files
  const reCls = /classList\.(?:add|remove|toggle)\(([^)]*)\)/g;
  for (const [f, src] of sources) {
    for (const m of src.matchAll(reCls)) {
      for (const lit of m[1].matchAll(/["'`]([^"'`]+)["'`]/g)) {
        for (const cls of lit[1].split(/\s+/)) {
          if (!cls) continue;
          if (!used.has(cls)) used.set(cls, new Set());
          used.get(cls).add(f);
        }
      }
    }
  }
  let styleCss = "";
  if (indexHtml) {
    for (const m of indexHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) styleCss += m[1];
  }
  let unknown = 0;
  for (const [cls, refs] of [...used.entries()].sort()) {
    // Look for ".cls" in the style block (followed by a non-word char).
    const re = new RegExp(`\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`);
    if (!re.test(styleCss)) {
      unknown++;
      warn("css", `class "${cls}" toggled by ${[...refs].join(", ")} but not found in index.html <style>`);
    }
  }
  results.push({
    check: "4. CSS classes (warn-only)",
    status: unknown === 0 ? "PASS" : "WARN",
    detail: `${used.size - unknown}/${used.size} classes found in <style>`,
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const w1 = Math.max(...results.map((r) => r.check.length), 5) + 2;
const w2 = 6;
console.log(`pokemon-arena static audit — ${jsFiles.length} JS file(s)\n`);
console.log("CHECK".padEnd(w1) + "STATUS".padEnd(w2 + 2) + "DETAIL");
console.log("-".repeat(w1 + w2 + 30));
for (const r of results) {
  console.log(r.check.padEnd(w1) + r.status.padEnd(w2 + 2) + r.detail);
}
if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const w of warnings) console.log("  warn: " + w);
}
if (errors.length) {
  console.log(`\nErrors (${errors.length}):`);
  for (const e of errors) console.log("  ERROR: " + e);
  console.log("\nRESULT: FAIL");
  process.exit(1);
}
console.log("\nRESULT: PASS" + (warnings.length ? ` (${warnings.length} warning(s))` : ""));
process.exit(0);
