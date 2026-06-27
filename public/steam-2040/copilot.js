/* The copilot: an offline natural-language planner that drives the studio.
 * It chains clauses, resolves references, runs recipes, ensures prerequisites,
 * and synthesises answers. An optional LLM can be attached for phrasing. */
"use strict";

const fmtN = (n) => Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—";
const f1 = (n) => Number.isFinite(n) ? n.toFixed(1) : "—";

export class Copilot {
  constructor(app) {
    this.app = app;
    this.m = app.model;
    this.ctx = { lastZone: null, lastZones: null, lastLinks: null };
    this.llm = null;
    this._districts = null;
    this._colTotals = null;
  }

  // ---- entry ----
  async handle(raw) {
    const text = raw.trim();
    if (!text) return;
    // single-shot commands that shouldn't be split
    if (/^connect\s/i.test(text)) return this._connect(text);
    if (/^help$/i.test(text)) return this._help();
    if (/(light|dark|high-contrast|contrast)\s*theme|colou?r-?blind|cb-?safe/i.test(text) && !/colou?r (links|zones)/i.test(text))
      return this._appearance(text);

    let clauses = [text];
    if (this.llm) {
      try { const t = await this._viaLLM(text); if (t) clauses = this._split(t); }
      catch (e) { this.app.say("(LLM unreachable — using the offline planner)", "ai"); clauses = this._split(text); }
    } else clauses = this._split(text);

    for (const c of clauses) {
      const cl = c.trim(); if (!cl) continue;
      try { await this._dispatch(cl); }
      catch (e) { console.error(e); this.app.say("Hit an error on “" + cl + "”: " + e.message, "err"); }
    }
  }

  _split(text) {
    return text.split(/\s*(?:;|\bthen\b|\band then\b|\balso\b)\s*/i).filter(Boolean);
  }

  // ---- dispatch one clause ----
  async _dispatch(c) {
    const s = c.toLowerCase();
    for (const [re, fn] of this.handlers()) {
      const m = s.match(re);
      if (m) return await fn.call(this, m, s);
    }
    this.app.say("I didn't catch that. Type help for examples.", "ai");
  }

  // ---- handler table (order matters: specific first) ----
  handlers() {
    return [
      // appearance inline
      [/colou?r-?blind|cb-?safe/, () => this._appearance("colorblind")],

      // colour links
      [/colou?r (?:the )?links? by (volume|v\/?c|vc|lanes|length|speed)/, (m) => this.app.colorLinks(this._lk(m[1]))],
      [/colou?r (?:the )?network by (volume|v\/?c|vc|lanes|length|speed)/, (m) => this.app.colorLinks(this._lk(m[1]))],
      // colour zones
      [/colou?r (?:the )?zones? by ([a-z\- ]+)/, (m) => this._zoneColour(m[1])],

      // filters / show only
      [/show (?:only )?(freeway|arterial|collector)s?/, (m) => { this.app.filterClass([m[1]], true); this.app.say(`Showing ${m[1]}s.`, "ai"); }],
      [/(worst congestion|most congested|worst links|over capacity|los f links?)/, () => this._worst()],
      [/busiest corridors?|busiest links?|heaviest corridors?/, () => this._busiest()],

      // run assignment
      [/run .*assign|assign .*network|^assign\b|run (?:an? )?(?:am|24|off|free|fw|frank|msa|incremental)/, (m, s) => this._run(s)],
      [/recommend improvements?|find improvements?/, () => this._recommend()],
      [/apply (?:recommendation|rec) (\d+)/, (m) => this._apply(+m[1])],
      [/(?:upgrade|widen) link (\d+)(?: by (\d+) lanes?)?/, (m) => this._widen(+m[1], +(m[2] || 2))],

      // aggregate + export
      [/aggregate (?:to )?(\d+)/, (m) => this._aggregate(+m[1])],
      [/export .*shapefile|export the new zones as shapefile/, () => this.app.exportAggr("shapefile")],
      [/export .*geojson/, () => this.app.exportAggr("geojson")],
      [/export .*correspondence/, () => this.app.exportAggr("correspondence")],
      [/export .*(link results|link csv)|export link/, () => this._exportLinks()],

      // recipes
      [/analyse zone (\d+)|analyze zone (\d+)/, (m) => this._analyseZone(+(m[1] || m[2]))],
      [/compare district[s]? (.+?) (?:and|vs|versus|to) (.+)/, (m) => this._compareDistricts(m[1], m[2])],

      // matrix
      [/trips from (?:zone )?(\d+) to (?:zone )?(\d+)/, (m) => this._tripsFromTo(+m[1], +m[2])],
      [/top (?:\d+ )?destinations? from (?:zone )?(\d+)/, (m) => this._topDest(+m[1])],
      [/(?:trips from|where do trips from) (?:zone )?(\d+)/, (m) => this._originTotal(+m[1])],
      [/trips to (?:zone )?(\d+)/, (m) => this._destTotal(+m[1])],
      [/biggest flows?|largest flows?/, () => this._biggestFlows()],
      [/intrazonal/, () => this.app.say("Intrazonal trips are not stored in this matrix (origin ≠ destination only).", "ai")],

      // zone interrogation
      [/population of (?:zone )?(\d+)/, (m) => this._zoneFact(+m[1], "POP_TOT", "population")],
      [/jobs in (?:zone )?(\d+)|jobs of (?:zone )?(\d+)/, (m) => this._zoneFact(+(m[1] || m[2]), "WORKER", "jobs")],
      [/students? in (?:zone )?(\d+)/, (m) => this._zoneFact(+m[1], "STUDENT", "students")],
      [/zoom to (?:zone )?(\d+)/, (m) => this._zoomZone(+m[1])],
      [/zoom (?:there|to it|to that)/, () => this._zoomThere()],
      [/top (\d+) zones? by ([a-z\- ]+)/, (m) => this._topZones(+m[1], m[2])],
      [/median density/, () => this._medianDensity()],
      [/zones? with metro access|how many zones? have metro/, () => this._metroCount()],
      [/zones? with population over (\d+) and jobs under (\d+)/, (m) => this._zoneFilter(+m[1], +m[2])],

      // district interrogation
      [/list districts|how many districts/, () => this._listDistricts()],
      [/how many zones in (.+)|zones in district (.+)/, (m) => this._zonesInDistrict(m[1] || m[2])],
      [/most populous district|biggest district/, () => this._mostPopulousDistrict()],
      [/area-?type breakdown/, () => this._areaTypeBreakdown()],

      // link interrogation
      [/how many links/, () => this.app.say(`The network has ${fmtN(this.m.NL)} links.`, "ai")],
      [/how many nodes/, () => this.app.say(`The network has ${fmtN(this.m.NN)} nodes.`, "ai")],
      [/total lane-?km/, () => this._laneKm()],
      [/longest freeway/, () => this._longestFreeway()],
      [/average speed/, () => this._avgSpeed()],
      [/how many links at los f|how many links over capacity/, () => this._losF()],
    ];
  }

  // ---- helpers ----
  _lk(s) { return s.replace("/", "").replace("vc", "vc") === "vc" || s === "v/c" || s === "vc" ? "vc" : s; }

  _zoneColour(metric) {
    const map = { population: "population", people: "population", jobs: "jobs", employment: "jobs", students: "students", households: "households", houses: "households", density: "density", "jobs-housing ratio": "jhr", "jobs housing ratio": "jhr", "metro access": "metro", metro: "metro", retail: "retail", office: "office", industrial: "industrial", school: "school", "retail floor area": "retail", "office floor area": "office", productions: "productions", attractions: "attractions" };
    const key = map[metric.trim()] || metric.trim().split(" ")[0];
    this.app.colorZones(key);
    this.app.say(`Coloured zones by ${metric.trim()}.`, "ai");
  }

  async _worst() {
    const top = await this.app.showWorstCongestion(25);
    if (top && top.length) {
      const w = top[0];
      this.app.say(`The worst congestion is on link ${w.link} at v/c ${f1(w.vc)} (volume ${fmtN(w.vol)}). Highlighted the 25 worst and zoomed in.`, "ai");
    }
  }

  async _busiest() {
    if (!this.app.volume) await this.app.runAssignment({ method: "fw", demand: "matrix", period: "am", sample: 250 });
    const vol = this.app.volume, idx = [];
    for (let l = 0; l < this.m.NL; l++) if (vol[l] > 0) idx.push(l);
    idx.sort((a, b) => vol[b] - vol[a]);
    const top = idx.slice(0, 20);
    this.app.renderer.setHighlight(new Set(top));
    this.ctx.lastLinks = top;
    this.app.colorLinks("volume");
    const m = this.m; let bx = [Infinity, Infinity, -Infinity, -Infinity];
    for (const l of top.slice(0, 8)) { bx[0] = Math.min(bx[0], m.link.bMinX[l]); bx[1] = Math.min(bx[1], m.link.bMinY[l]); bx[2] = Math.max(bx[2], m.link.bMaxX[l]); bx[3] = Math.max(bx[3], m.link.bMaxY[l]); }
    if (bx[0] < bx[2]) this.app.renderer.zoomToBBox(bx, 0.4);
    this.app.say(`Busiest corridor carries ${fmtN(vol[top[0]])} veh; highlighted the top 20.`, "ai");
  }

  async _run(s) {
    const method = /free|aon|all-or/.test(s) ? "freeflow" : /msa/.test(s) ? "msa" : /increment/.test(s) ? "incremental" : "fw";
    const period = /24|daily|all day/.test(s) ? "24h" : /off-?peak/.test(s) ? "offpeak" : "am";
    const demand = /gravity/.test(s) ? "gravity" : /all-?ones|test matrix/.test(s) ? "ones" : "matrix";
    const sm = s.match(/sample (\d+)/); const sample = sm ? +sm[1] : 400;
    this.app.say(`Running ${method === "fw" ? "Frank-Wolfe" : method} · ${period} · ${demand} demand · sample ${sample}…`, "ai");
    const r = await this.app.runAssignment({ method, period, demand, sample });
    const k = r.kpi;
    this.app.say(`Done. VHT ${fmtN(k.vht)}, VKT ${fmtN(k.vkt)}, avg v/c ${f1(k.avgVC)}, ${fmtN(k.overCount)} links over capacity${Number.isFinite(k.gap) ? `, gap ${k.gap.toExponential(1)}` : ""}.`, "ai");
  }

  async _recommend() {
    const recs = await this.app.recommend();
    if (!recs || !recs.length) { this.app.say("No congested links to improve — try a larger sample or 24-hour period.", "ai"); return; }
    const lines = recs.slice(0, 6).map((r, i) =>
      `${i + 1}. link ${r.link} (${this.m.meta.facilities[r.cls]}) v/c ${f1(r.vc)} · saves ~${fmtN(r.saveHrYr)} veh-h/yr · cost ~${(r.cost / 1e6).toFixed(0)}M · BCR ${f1(r.bcr)}`);
    this.app.say("Top improvement candidates by benefit-cost:\n" + lines.join("\n"), "ai");
  }

  async _apply(n) {
    const r = await this.app.applyRecommendation(n);
    if (r) this.app.say(`Applied. Network VHT ${r.saved != null ? `${fmtN(r.before)} → ${fmtN(r.after)} (saved ${fmtN(r.saved)})` : fmtN(r.after)}.`, "ai");
  }

  async _widen(link, lanes) {
    if (link < 0 || link >= this.m.NL) { this.app.say("That link number is out of range.", "err"); return; }
    const before = this.app.kpi ? this.app.kpi.vht : null;
    this.app.eng.widenLink(link, lanes);
    this.app.say(`Widened link ${link} by ${lanes} lanes — re-assigning…`, "ai");
    const r = await this.app.runAssignment({ method: "fw", demand: "matrix", period: "am", sample: 250 });
    this.app.renderer.setHighlight(new Set([link])); this.app.scheduleDraw();
    this.app.say(`Network VHT now ${fmtN(r.kpi.vht)}${before != null ? ` (was ${fmtN(before)})` : ""}.`, "ai");
  }

  async _aggregate(target) {
    const barrier = this.app.panelEl.querySelector("#ag-b")?.value || "collector";
    const maxSpan = +(this.app.panelEl.querySelector("#ag-s")?.value || 6);
    const r = await this.app.aggregate({ target, barrier, maxSpan });
    this.app.say(`Aggregated ${fmtN(this.m.meta.counts.matrixZones)} base zones to ${fmtN(r.count)} (target ${fmtN(target)}). Export as shapefile, GeoJSON or correspondence.`, "ai");
  }

  _exportLinks() {
    if (!this.app.volume) { this.app.say("Run an assignment first so the link results have volumes.", "ai"); return; }
    import("./export.js").then(XP => XP.exportLinkCSV(this.m, this.app.eng, this.app.volume));
    this.app.say("Exported link results CSV.", "ai");
  }

  // ---- recipes ----
  async _analyseZone(z) {
    if (!this._validZone(z)) return;
    const m = this.m;
    const pop = m.zone.a("POP_TOT", z), jobs = m.zone.a("WORKER", z), st = m.zone.a("STUDENT", z);
    const dist = m.zone.iv("DISTRICT", z), dn = m.meta.districts[dist] || ("district " + dist);
    this._zoomZone(z, false);
    const dests = this._rowTop(z, 5);
    const dl = dests.map(d => `zone ${d.d} (${fmtN(d.t)})`).join(", ");
    this.app.say(`Zone ${z} — ${dn}: population ${fmtN(pop)}, jobs ${fmtN(jobs)}, students ${fmtN(st)}. Top destinations: ${dl || "—"}.`, "ai");
  }

  async _compareDistricts(a, b) {
    const da = this._findDistrict(a), db = this._findDistrict(b);
    if (!da || !db) { this.app.say(`I couldn't find ${!da ? a : b} as a district.`, "err"); return; }
    const sum = (d, attr) => d.zones.reduce((s, z) => s + this.m.zone.a(attr, z), 0);
    const pa = sum(da, "POP_TOT"), pb = sum(db, "POP_TOT");
    const ja = sum(da, "WORKER"), jb = sum(db, "WORKER");
    const flow = this._districtFlow(da, db);
    this.app.say(`${da.name}: pop ${fmtN(pa)}, jobs ${fmtN(ja)} (${da.zones.length} zones)\n${db.name}: pop ${fmtN(pb)}, jobs ${fmtN(jb)} (${db.zones.length} zones)\nTrips ${da.name}→${db.name}: ${fmtN(flow)}.`, "ai");
  }

  // ---- matrix interrogation ----
  _row(o) { const mt = this.m.matrix; return [mt.off[o - 1], mt.off[o]]; }
  _rowTop(o, n) {
    if (o < 1 || o > this.m.matrix.n) return [];
    const mt = this.m.matrix, [s, e] = this._row(o), arr = [];
    for (let i = s; i < e; i++) arr.push({ d: mt.dest[i], t: mt.trips[i] });
    arr.sort((a, b) => b.t - a.t); return arr.slice(0, n);
  }
  _tripsFromTo(o, d) {
    if (o < 1 || o > this.m.matrix.n) { this.app.say(`Zone ${o} is outside the matrix (1–${this.m.matrix.n}).`, "err"); return; }
    const mt = this.m.matrix, [s, e] = this._row(o); let t = 0;
    for (let i = s; i < e; i++) if (mt.dest[i] === d) { t = mt.trips[i]; break; }
    this.ctx.lastZone = o;
    this.app.say(`Trips from zone ${o} to ${d}: ${fmtN(t)} per day.`, "ai");
  }
  _originTotal(o) {
    if (o < 1 || o > this.m.matrix.n) { this.app.say(`Zone ${o} is outside the matrix.`, "err"); return; }
    const mt = this.m.matrix, [s, e] = this._row(o); let t = 0;
    for (let i = s; i < e; i++) t += mt.trips[i];
    this.ctx.lastZone = o;
    const top = this._rowTop(o, 3).map(x => `${x.d} (${fmtN(x.t)})`).join(", ");
    this.app.say(`Zone ${o} produces ${fmtN(t)} trips/day. Biggest destinations: ${top}.`, "ai");
  }
  _destTotal(d) {
    const col = this._colTotalsArr();
    if (d < 1 || d >= col.length) { this.app.say(`Zone ${d} is outside the matrix.`, "err"); return; }
    this.app.say(`Zone ${d} attracts ${fmtN(col[d])} trips/day.`, "ai");
  }
  _colTotalsArr() {
    if (this._colTotals) return this._colTotals;
    const mt = this.m.matrix, col = new Float32Array(mt.n + 1);
    for (let i = 0; i < mt.dest.length; i++) col[mt.dest[i]] += mt.trips[i];
    return this._colTotals = col;
  }
  _topDest(o) {
    const top = this._rowTop(o, 8);
    if (!top.length) { this.app.say(`Zone ${o} has no recorded trips.`, "ai"); return; }
    this.ctx.lastZone = o;
    this.app.say(`Top destinations from zone ${o}:\n` + top.map((x, i) => `${i + 1}. zone ${x.d} — ${fmtN(x.t)}`).join("\n"), "ai");
  }
  _biggestFlows() {
    const mt = this.m.matrix; const heap = [];
    let min = -1;
    for (let o = 1; o <= mt.n; o++) {
      for (let i = mt.off[o - 1]; i < mt.off[o]; i++) {
        const t = mt.trips[i];
        if (heap.length < 10) { heap.push({ o, d: mt.dest[i], t }); if (heap.length === 10) heap.sort((a, b) => a.t - b.t); }
        else if (t > heap[0].t) { heap[0] = { o, d: mt.dest[i], t }; heap.sort((a, b) => a.t - b.t); }
      }
    }
    heap.sort((a, b) => b.t - a.t);
    this.app.say("Biggest OD flows:\n" + heap.map((x, i) => `${i + 1}. ${x.o} → ${x.d}: ${fmtN(x.t)}`).join("\n"), "ai");
  }

  // ---- zone interrogation ----
  _validZone(z) { if (z < 1 || z > this.m.Z) { this.app.say(`Zone ${z} is out of range (1–${this.m.Z}).`, "err"); return false; } return true; }
  _zoneFact(z, attr, label) {
    if (!this._validZone(z)) return;
    this.ctx.lastZone = z;
    this.app.say(`Zone ${z} ${label}: ${fmtN(this.m.zone.a(attr, z))}.`, "ai");
  }
  _zoomZone(z, announce = true) {
    if (!this._validZone(z)) return;
    const x = this.m.zone.xy[2 * (z - 1)], y = this.m.zone.xy[2 * (z - 1) + 1];
    this.ctx.lastZone = z;
    this.app.renderer.zoomToPoint(x, y, this.app.renderer.fitScale * 18);
    this.app.scheduleDraw();
    if (announce) this.app.say(`Zoomed to zone ${z}.`, "ai");
  }
  _zoomThere() {
    if (this.ctx.lastZone) return this._zoomZone(this.ctx.lastZone);
    if (this.ctx.lastLinks && this.ctx.lastLinks.length) {
      const m = this.m; let bx = [Infinity, Infinity, -Infinity, -Infinity];
      for (const l of this.ctx.lastLinks.slice(0, 8)) { bx[0] = Math.min(bx[0], m.link.bMinX[l]); bx[1] = Math.min(bx[1], m.link.bMinY[l]); bx[2] = Math.max(bx[2], m.link.bMaxX[l]); bx[3] = Math.max(bx[3], m.link.bMaxY[l]); }
      this.app.renderer.zoomToBBox(bx, 0.4); this.app.scheduleDraw(); return;
    }
    this.app.say("Nothing to zoom to yet.", "ai");
  }
  _topZones(n, measure) {
    const map = { jobs: "WORKER", population: "POP_TOT", people: "POP_TOT", students: "STUDENT", households: "HH" };
    const attr = map[measure.trim().split(" ")[0]] || "POP_TOT";
    const arr = [];
    for (let z = 1; z <= this.m.Z; z++) arr.push([this.m.zone.a(attr, z), z]);
    arr.sort((a, b) => b[0] - a[0]);
    const top = arr.slice(0, n);
    this.ctx.lastZones = top.map(x => x[1]);
    this.app.say(`Top ${n} zones by ${measure.trim()}:\n` + top.map((x, i) => `${i + 1}. zone ${x[1]} — ${fmtN(x[0])}`).join("\n"), "ai");
  }
  _medianDensity() {
    const arr = [];
    for (let z = 1; z <= this.m.Z; z++) { const a = this.m.zone.a("SHAPEAREA", z); if (a > 0) arr.push(this.m.zone.a("POP_TOT", z) / a); }
    arr.sort((a, b) => a - b);
    const med = arr[arr.length >> 1];
    this.app.say(`Median zone density is ${fmtN(med)} people per unit area.`, "ai");
  }
  _metroCount() {
    let c = 0; for (let z = 1; z <= this.m.Z; z++) if (this.m.zone.iv("METRO_ACCESS", z) === 1) c++;
    this.app.say(`${fmtN(c)} zones have metro access.`, "ai");
  }
  _zoneFilter(popOver, jobsUnder) {
    const hits = [];
    for (let z = 1; z <= this.m.Z; z++) if (this.m.zone.a("POP_TOT", z) > popOver && this.m.zone.a("WORKER", z) < jobsUnder) hits.push(z);
    this.ctx.lastZones = hits.slice(0, 50);
    this.app.say(`${fmtN(hits.length)} zones have population over ${fmtN(popOver)} and jobs under ${fmtN(jobsUnder)}. e.g. ${hits.slice(0, 8).join(", ")}.`, "ai");
  }

  // ---- districts ----
  _buildDistricts() {
    if (this._districts) return this._districts;
    const m = this.m, byId = new Map();
    for (let z = 1; z <= m.Z; z++) {
      const id = m.zone.iv("DISTRICT", z);
      let d = byId.get(id);
      if (!d) { d = { id, name: m.meta.districts[id] || ("district " + id), zones: [] }; byId.set(id, d); }
      d.zones.push(z);
    }
    return this._districts = byId;
  }
  _findDistrict(name) {
    const want = name.trim().toLowerCase();
    for (const d of this._buildDistricts().values())
      if (d.name.toLowerCase() === want || d.name.toLowerCase().includes(want)) return d;
    return null;
  }
  _listDistricts() {
    const ds = [...this._buildDistricts().values()].sort((a, b) => a.id - b.id);
    this.app.say(`There are ${ds.length} districts. e.g. ` + ds.slice(0, 12).map(d => d.name).join(", ") + "…", "ai");
  }
  _zonesInDistrict(name) {
    const d = this._findDistrict(name);
    if (!d) { this.app.say(`No district matching “${name.trim()}”.`, "err"); return; }
    const pop = d.zones.reduce((s, z) => s + this.m.zone.a("POP_TOT", z), 0);
    this.app.say(`${d.name} has ${d.zones.length} zones and ${fmtN(pop)} people.`, "ai");
  }
  _mostPopulousDistrict() {
    let best = null, bp = -1;
    for (const d of this._buildDistricts().values()) {
      const p = d.zones.reduce((s, z) => s + this.m.zone.a("POP_TOT", z), 0);
      if (p > bp) { bp = p; best = d; }
    }
    this.app.say(`The most populous district is ${best.name} with ${fmtN(bp)} people.`, "ai");
  }
  _areaTypeBreakdown() {
    const cnt = {};
    for (let z = 1; z <= this.m.Z; z++) { const a = this.m.zone.iv("AREATYPE", z); cnt[a] = (cnt[a] || 0) + 1; }
    const parts = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([a, c]) => `type ${a}: ${fmtN(c)}`);
    this.app.say("Zones by area type — " + parts.join(", ") + ".", "ai");
  }
  _districtFlow(da, db) {
    const set = new Set(db.zones.filter(z => z <= this.m.matrix.n));
    const mt = this.m.matrix; let t = 0;
    for (const o of da.zones) { if (o > mt.n) continue; for (let i = mt.off[o - 1]; i < mt.off[o]; i++) if (set.has(mt.dest[i])) t += mt.trips[i]; }
    return t;
  }

  // ---- links ----
  _laneKm() {
    let s = 0; for (let l = 0; l < this.m.NL; l++) s += this.m.link.len[l] * this.m.link.lanes[l] / 1000;
    this.app.say(`Total lane-kilometres: ${fmtN(s)}.`, "ai");
  }
  _longestFreeway() {
    let best = -1, bl = 0;
    for (let l = 0; l < this.m.NL; l++) if (this.m.link.cls[l] === 0 && this.m.link.len[l] > bl) { bl = this.m.link.len[l]; best = l; }
    this.app.say(`The longest freeway link is ${best}, ${fmtN(bl)} m.`, "ai");
  }
  _avgSpeed() {
    let num = 0, den = 0;
    for (let l = 0; l < this.m.NL; l++) { const len = this.m.link.len[l]; num += this.m.meta.freeSpeed[this.m.link.cls[l]] * len; den += len; }
    this.app.say(`Length-weighted average free-flow speed: ${f1(num / den)} km/h.`, "ai");
  }
  async _losF() {
    if (!this.app.volume) { this.app.say("No assignment yet — running one to find LOS F links.", "ai"); await this.app.runAssignment({ method: "fw", demand: "matrix", period: "am", sample: 250 }); }
    this.app.say(`${fmtN(this.app.kpi.overCount)} links are over capacity (LOS F) — ${f1(this.app.kpi.overShare * 100)}% of loaded links.`, "ai");
  }

  // ---- appearance / connect / help ----
  _appearance(text) {
    const root = document.body;
    if (/light/.test(text)) { root.dataset.theme = "light"; this.app.say("Light theme on.", "ai"); }
    else if (/contrast/.test(text)) { root.dataset.theme = "contrast"; this.app.say("High-contrast theme on.", "ai"); }
    else if (/dark/.test(text)) { delete root.dataset.theme; this.app.say("Dark theme on.", "ai"); }
    if (/colou?r-?blind|cb-?safe/.test(text)) { this._toggleCB(); }
  }
  _toggleCB() {
    const P = this.app.constructor;
    import("./palette.js").then(({ Palette }) => {
      Palette.mode = Palette.mode === "cbsafe" ? "viridis" : "cbsafe";
      this.app.say(`Palette: ${Palette.mode === "cbsafe" ? "colour-blind safe" : "viridis"}.`, "ai");
      // refresh current colouring
      if (this.app.renderer.linkVals) this.app.renderer.setLinkValues(this.app.renderer.linkVals, this.app.renderer.linkLegend, { sqrtWidth: true });
      if (this.app.renderer.zoneVals) this.app.renderer.setZoneValues(this.app.renderer.zoneVals, this.app.renderer.zoneLegend);
      this.app.setLegend(this.app.legendEl.textContent || "");
      this.app.scheduleDraw();
    });
  }

  _connect(text) {
    let m;
    if ((m = text.match(/connect ollama (\S+)(?:\s*\|\s*(\S+))?/i))) {
      this.llm = { kind: "ollama", model: m[1], url: m[2] || "http://localhost:11434/v1/chat/completions" };
      this.app.say(`Connected to local Ollama (${m[1]}). The offline planner stays as fallback.`, "ai");
    } else if ((m = text.match(/connect claude (\S+)/i))) {
      this.llm = { kind: "anthropic", key: m[1], model: "claude-3-5-sonnet-latest" };
      this.app.say("Connected to Claude. The offline planner stays as fallback.", "ai");
    } else if ((m = text.match(/connect ai\s+(.+)/i))) {
      const parts = m[1].split("|").map(s => s.trim());
      this.llm = { kind: "openai", url: parts[0], key: parts[1] || "", model: parts[2] || "gpt-4o-mini" };
      this.app.say("Connected to an OpenAI-compatible endpoint.", "ai");
    } else this.app.say("Usage: connect ollama <model> | connect claude <key> | connect ai <url> | <key> | <model>", "ai");
  }

  async _viaLLM(text) {
    const sys = "You translate a user's request about a transport model into one or more canonical commands, joined by ' then '. Valid commands include: colour links by volume|v/c|lanes|length|speed; colour zones by population|jobs|students|households|density|jobs-housing ratio|metro access; show only freeways|arterials|collectors; show worst congestion; busiest corridors; run an AM peak assignment (optionally with sample N, method frank-wolfe|msa|incremental|free-flow); recommend improvements; apply recommendation N; widen link N by M lanes; aggregate to N zones; export shapefile|geojson|correspondence|link results; trips from zone A to B; top destinations from zone A; population of zone N; jobs in zone N; top 10 zones by jobs; analyse zone N; compare district A and B. Reply with ONLY the commands.";
    const body = { messages: [{ role: "system", content: sys }, { role: "user", content: text }], temperature: 0, stream: false };
    let url, headers = { "Content-Type": "application/json" };
    if (this.llm.kind === "anthropic") {
      url = "https://api.anthropic.com/v1/messages";
      headers["x-api-key"] = this.llm.key; headers["anthropic-version"] = "2023-06-01";
      const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ model: this.llm.model, max_tokens: 256, system: sys, messages: [{ role: "user", content: text }] }) });
      const j = await r.json(); return j.content?.[0]?.text?.trim();
    }
    url = this.llm.url;
    if (this.llm.key) headers["Authorization"] = "Bearer " + this.llm.key;
    body.model = this.llm.model;
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const j = await r.json();
    return (j.choices?.[0]?.message?.content || "").trim();
  }

  _help() {
    this.app.say([
      "I drive the whole studio from plain English. Examples:",
      "• colour zones by population · colour links by v/c · show only freeways",
      "• run an AM peak assignment · run frank-wolfe with sample 800 · busiest corridors",
      "• show the worst congestion · recommend improvements · apply recommendation 1",
      "• trips from zone 200 · top destinations from zone 200 · biggest flows",
      "• top 10 zones by jobs · population of zone 120 · compare district Al Falah and Al Maryah",
      "• aggregate to 1500 zones · export the new zones as shapefile",
      "• light theme · colour-blind palette · connect ollama llama3.1",
      "Chain steps with “then”.",
    ].join("\n"), "ai");
  }
}
