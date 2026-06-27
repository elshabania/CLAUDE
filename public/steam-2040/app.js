/* STEAM 2040 Studio — controller: wiring, workspaces, interactions, and the
 * high-level operations the copilot drives. */
"use strict";
import { loadModel } from "./data.js";
import { Renderer } from "./render.js";
import { Engine } from "./engine.js";
import { Palette, FACILITY_COLOUR } from "./palette.js";
import { Copilot } from "./copilot.js";
import * as XP from "./export.js";

const FAC_NAMES = ["freeway", "ramp", "arterial", "collector", "rural", "local", "junction"];
const fmt = (n, d = 0) => {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(d || 1) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(d || 1) + "k";
  return n.toFixed(d);
};
const fmtN = (n) => Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";

class App {
  constructor() {
    this.ws = "network";
    this.volume = null; this.time = null; this.kpi = null;
    this.recs = null; this.aggr = null;
    this.lastColorToggle = "volume";
  }

  async boot() {
    this.statusEl = document.querySelector(".status-text");
    this.spinEl = document.querySelector(".spin");
    this.panelEl = document.getElementById("panel");
    this.legendEl = document.getElementById("legend");
    this.chatEl = document.getElementById("chat");
    this.cmdEl = document.getElementById("cmd");

    this.status("decoding network", true);
    this.model = await loadModel((s) => this.status(s, true));
    this.status("building engine", true);
    this.eng = new Engine(this.model);

    this.renderer = new Renderer(document.getElementById("map"), this.model);
    this.renderer.fit(this.model.meta.bbox);
    this.copilot = new Copilot(this);

    this._wireRail();
    this._wireCanvas();
    this._wireBar();
    this.renderPanel();
    this.scheduleDraw();
    this.status(`ready · ${fmtN(this.model.NL)} links · ${fmtN(this.model.NN)} nodes · ${fmtN(this.model.Z)} zones`, false);
    this._rotatePlaceholder();
    this.say("STEAM 2040 Studio is loaded. Try “colour zones by population”, “run an AM peak assignment”, or type help.", "ai");
  }

  // ---- status / chat ----
  status(text, busy) {
    this.statusEl.textContent = text;
    this.spinEl.hidden = !busy;
  }
  say(text, cls = "ai") {
    const d = document.createElement("div");
    d.className = "msg " + cls;
    d.textContent = text;
    this.chatEl.appendChild(d);
    while (this.chatEl.children.length > 7) this.chatEl.removeChild(this.chatEl.firstChild);
    this.chatEl.scrollTop = this.chatEl.scrollHeight;
  }

  setLegend(text, ramp = true) {
    this.legendEl.innerHTML = "";
    if (ramp) {
      const r = document.createElement("span");
      r.className = "ramp";
      r.style.background = ramp === "vc" ? Palette.vcGradient() : Palette.gradient();
      this.legendEl.appendChild(r);
    }
    this.legendEl.appendChild(document.createTextNode(text));
  }

  scheduleDraw() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.renderer.draw(); });
  }

  // ---- workspace rail ----
  _wireRail() {
    document.querySelectorAll(".rail-btn").forEach(b => {
      b.addEventListener("click", () => {
        document.querySelectorAll(".rail-btn").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        this.ws = b.dataset.ws;
        this.renderPanel();
      });
    });
  }

  renderPanel() {
    const p = this.panelEl;
    if (this.ws === "network") {
      p.innerHTML = `
        <h2>Network</h2>
        <p class="hint">Pan and zoom the 2040 network, or drive everything from the
        copilot bar below. Switch the rail for aggregation and assignment.</p>
        <div class="row"><label>Colour links by</label>
          <select id="lc">
            <option value="">facility class</option>
            <option value="lanes">lanes</option><option value="length">length</option>
            <option value="speed">free-flow speed</option>
            <option value="volume">volume</option><option value="vc">v/c</option>
          </select></div>
        <div class="row"><label>Colour zones by</label>
          <select id="zc">
            <option value="">— none —</option>
            <option value="population">population</option><option value="jobs">jobs</option>
            <option value="students">students</option><option value="households">households</option>
            <option value="density">density</option><option value="jhr">jobs-housing ratio</option>
            <option value="metro">metro access</option>
          </select></div>
        <div class="row"><label>Show only</label>
          <select id="fc">
            <option value="">all (level-of-detail)</option>
            <option value="freeway">freeways</option><option value="arterial">arterials</option>
            <option value="collector">collectors</option>
          </select></div>
        <div class="row"><label>Zone overlay</label>
          <div class="seg" id="ov">
            <button data-ov="centroids" class="${this.renderer?.showCentroids ? "on" : ""}">Centroids</button>
            <button data-ov="connectors" class="${this.renderer?.showConnectors ? "on" : ""}">Connectors</button>
          </div></div>`;
      p.querySelector("#lc").onchange = (e) => this.colorLinks(e.target.value);
      p.querySelector("#zc").onchange = (e) => this.colorZones(e.target.value);
      p.querySelector("#fc").onchange = (e) => this.filterClass(e.target.value ? [e.target.value] : null, true);
      p.querySelectorAll("#ov button").forEach(b => b.onclick = () => {
        const on = b.classList.toggle("on");
        if (b.dataset.ov === "centroids") this.showCentroids(on); else this.showConnectors(on);
      });
    } else if (this.ws === "aggregate") {
      p.innerHTML = `
        <h2>Zone aggregation</h2>
        <p class="hint">Build a coarser zone system from the base zones, respecting
        barriers and a size ceiling.</p>
        <div class="row"><label>Target zones</label><input id="ag-t" type="number" value="1800" min="50"></div>
        <div class="row"><label>Don't cross</label>
          <select id="ag-b"><option value="collector">collectors &amp; above</option>
            <option value="arterial">arterials &amp; above</option>
            <option value="freeway">freeways only</option></select></div>
        <div class="row"><label>Max span (km)</label>
          <select id="ag-s"><option>4.5</option><option selected>6</option><option>9</option><option>15</option></select></div>
        <div class="row"><button class="btn" id="ag-run">Aggregate</button></div>
        <div class="row"><button class="btn ghost" id="ag-shp">Export shapefile</button></div>
        <div class="row"><button class="btn ghost" id="ag-geo">Export GeoJSON</button></div>
        <div class="row"><button class="btn ghost" id="ag-csv">Export correspondence</button></div>
        <div class="kpis" id="ag-kpi"></div>`;
      p.querySelector("#ag-run").onclick = () => this.aggregate({
        target: +p.querySelector("#ag-t").value,
        barrier: p.querySelector("#ag-b").value,
        maxSpan: +p.querySelector("#ag-s").value,
      });
      p.querySelector("#ag-shp").onclick = () => this.exportAggr("shapefile");
      p.querySelector("#ag-geo").onclick = () => this.exportAggr("geojson");
      p.querySelector("#ag-csv").onclick = () => this.exportAggr("correspondence");
      this._renderAggrKPI();
    } else {
      p.innerHTML = `
        <h2>Assignment</h2>
        <p class="hint">Run traffic onto the 2040 network and inspect congestion.</p>
        <div class="row"><label>Method</label>
          <select id="as-m"><option value="fw">Frank-Wolfe equilibrium</option>
            <option value="incremental">BPR incremental</option>
            <option value="msa">MSA</option><option value="freeflow">free-flow (AON)</option></select></div>
        <div class="row"><label>Demand</label>
          <select id="as-d"><option value="matrix">land-use OD matrix</option>
            <option value="gravity">gravity model</option><option value="ones">all-ones test</option></select></div>
        <div class="row"><label>Period</label>
          <select id="as-p"><option value="am">AM peak</option><option value="24h">24-hour</option>
            <option value="offpeak">off-peak</option></select></div>
        <div class="row"><label>Origin sample</label><input id="as-s" type="number" value="400" min="20"></div>
        <div class="row"><button class="btn" id="as-run">Run assignment</button></div>
        <div class="row"><label>Link colour</label>
          <div class="seg" id="as-seg"><button data-v="volume" class="on">Volume</button><button data-v="vc">V/C</button></div></div>
        <div class="row"><button class="btn ghost" id="as-rec">Recommend improvements</button></div>
        <div class="row"><button class="btn ghost" id="as-csv">Export link results</button></div>
        <div class="kpis" id="as-kpi"></div>
        <div id="as-recs" class="recs"></div>`;
      p.querySelector("#as-run").onclick = () => this.runAssignment({
        method: p.querySelector("#as-m").value, demand: p.querySelector("#as-d").value,
        period: p.querySelector("#as-p").value, sample: +p.querySelector("#as-s").value,
      });
      p.querySelectorAll("#as-seg button").forEach(b => b.onclick = () => {
        p.querySelectorAll("#as-seg button").forEach(x => x.classList.remove("on"));
        b.classList.add("on"); this.colorLinks(b.dataset.v);
      });
      p.querySelector("#as-rec").onclick = () => this.recommend();
      p.querySelector("#as-csv").onclick = () => XP.exportLinkCSV(this.model, this.eng, this.volume);
      this._renderAssignKPI();
    }
  }

  // ---- colouring operations ----
  async colorLinks(metric) {
    const m = this.model, NL = m.NL;
    if (!metric) { this.renderer.clearLinkValues(); this.setLegend("facility class", false); this.scheduleDraw(); return; }
    if ((metric === "volume" || metric === "vc") && !this.volume) {
      this.say("No assignment yet — running a quick AM-peak Frank-Wolfe first.", "ai");
      await this.runAssignment({ method: "fw", demand: "matrix", period: "am", sample: 250 });
    }
    let vals = new Float32Array(NL), legend = "", sqrtWidth = false;
    if (metric === "vc") {
      // v/c on an absolute green->red scale
      vals = this.eng.vcArray(this.volume);
      this.renderer.setLinkValues(vals, "v/c", { vc: true, absMax: 1.5 });
      this.setLegend("v/c: free-flow → over capacity" + (Palette.mode === "cbsafe" ? " (cb-safe)" : ""), "vc");
      this.scheduleDraw();
      return;
    }
    if (metric === "volume") { vals = this.volume.slice(); legend = "volume: low → high"; sqrtWidth = true; }
    else if (metric === "lanes") { for (let l = 0; l < NL; l++) vals[l] = m.link.lanes[l]; legend = "lanes"; }
    else if (metric === "length") { for (let l = 0; l < NL; l++) vals[l] = m.link.len[l]; legend = "link length"; }
    else if (metric === "speed") { for (let l = 0; l < NL; l++) vals[l] = m.meta.freeSpeed[m.link.cls[l]]; legend = "free-flow speed"; }
    else return;
    this.renderer.setLinkValues(vals, legend, { sqrtWidth });
    this.setLegend(legend + (Palette.mode === "cbsafe" ? " (cb-safe)" : " (viridis)"));
    this.scheduleDraw();
  }

  zoneMetric(metric) {
    const m = this.model, Z = m.Z, out = new Float32Array(Z + 1).fill(NaN);
    const f = (name) => { for (let z = 1; z <= Z; z++) out[z] = m.zone.a(name, z); };
    if (metric === "population") { f("POP_TOT"); }
    else if (metric === "jobs") { f("WORKER"); }
    else if (metric === "students") { f("STUDENT"); }
    else if (metric === "households") { f("HH"); }
    else if (metric === "retail") { f("RETAIL_GFA"); }
    else if (metric === "office") { f("OFFICE_GFA"); }
    else if (metric === "industrial") { f("IND_GFA"); }
    else if (metric === "school") { f("SCHOOL_GFA"); }
    else if (metric === "density") { for (let z = 1; z <= Z; z++) { const a = m.zone.a("SHAPEAREA", z); out[z] = a > 0 ? m.zone.a("POP_TOT", z) / a : NaN; } }
    else if (metric === "jhr") { for (let z = 1; z <= Z; z++) { const h = m.zone.a("HH", z); out[z] = h > 0 ? m.zone.a("WORKER", z) / h : NaN; } }
    else if (metric === "metro") { for (let z = 1; z <= Z; z++) out[z] = m.zone.iv("METRO_ACCESS", z); }
    else if (metric === "productions" || metric === "attractions") {
      this.eng._buildGravity();
      const arr = metric === "productions" ? this.eng._productions : this.eng._attractions;
      for (let z = 1; z <= Z; z++) out[z] = z < arr.length ? arr[z] : NaN;
    } else return null;
    return out;
  }

  colorZones(metric) {
    if (!metric) { this.renderer.clearZoneValues(); this.scheduleDraw(); return; }
    const vals = this.zoneMetric(metric);
    if (!vals) { this.say("I don't know that zone measure.", "err"); return; }
    const labels = { population: "population", jobs: "jobs", students: "students", households: "households", density: "population density", jhr: "jobs-housing ratio", metro: "metro access", retail: "retail floor area", office: "office floor area", industrial: "industrial floor area", school: "school floor area", productions: "productions", attractions: "attractions" };
    this.renderer.setZoneValues(vals, labels[metric] || metric);
    this.setLegend("zones by " + (labels[metric] || metric) + (Palette.mode === "cbsafe" ? " (cb-safe)" : " (viridis)"));
    this.scheduleDraw();
  }

  showCentroids(on) { this.renderer.setCentroids(on); this.scheduleDraw(); }
  showConnectors(on) { this.renderer.setConnectors(on); this.scheduleDraw(); }

  filterClass(names, zoom) {
    if (!names) { this.renderer.setFilter(null); this.scheduleDraw(); return; }
    const idx = new Set(names.map(n => FAC_NAMES.indexOf(n)).filter(i => i >= 0));
    this.renderer.setFilter(idx);
    if (zoom) {
      // zoom to bbox of those classes
      const m = this.model; let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
      for (let l = 0; l < m.NL; l++) if (idx.has(m.link.cls[l])) {
        if (m.link.bMinX[l] < mnx) mnx = m.link.bMinX[l]; if (m.link.bMaxX[l] > mxx) mxx = m.link.bMaxX[l];
        if (m.link.bMinY[l] < mny) mny = m.link.bMinY[l]; if (m.link.bMaxY[l] > mxy) mxy = m.link.bMaxY[l];
      }
      if (mnx < mxx) this.renderer.zoomToBBox([mnx, mny, mxx, mxy]);
    }
    this.scheduleDraw();
  }

  async showWorstCongestion(n = 25) {
    if (!this.volume) { await this.runAssignment({ method: "fw", demand: "matrix", period: "am", sample: 250 }); }
    const vc = this.eng.vcArray(this.volume);
    const idx = [];
    for (let l = 0; l < this.model.NL; l++) if (this.volume[l] > 0) idx.push(l);
    idx.sort((a, b) => vc[b] - vc[a]);
    const top = idx.slice(0, n);
    this.renderer.setHighlight(new Set(top));
    this.copilot.ctx.lastLinks = top;
    // zoom to the worst cluster
    const m = this.model; let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (const l of top.slice(0, 8)) {
      if (m.link.bMinX[l] < mnx) mnx = m.link.bMinX[l]; if (m.link.bMaxX[l] > mxx) mxx = m.link.bMaxX[l];
      if (m.link.bMinY[l] < mny) mny = m.link.bMinY[l]; if (m.link.bMaxY[l] > mxy) mxy = m.link.bMaxY[l];
    }
    if (mnx < mxx) this.renderer.zoomToBBox([mnx, mny, mxx, mxy], 0.4);
    this.colorLinks("vc");
    return top.map(l => ({ link: l, vc: vc[l], vol: this.volume[l] }));
  }

  // ---- assignment ----
  async runAssignment(opts) {
    this.status("assigning…", true);
    const t0 = performance.now();
    const r = await this.eng.assign({ ...opts, onProgress: (p, label) => this.status(`assigning ${(p * 100 | 0)}% · ${label || ""}`, true) });
    this.volume = r.volume; this.time = r.time; this.kpi = r.kpi;
    this.colorLinks(this.lastColorToggle === "vc" ? "vc" : "volume");
    if (this.ws === "assign") this._renderAssignKPI();
    const dt = ((performance.now() - t0) / 1000).toFixed(1);
    this.status(`assignment done in ${dt}s · VHT ${fmt(r.kpi.vht)} · avg v/c ${r.kpi.avgVC.toFixed(2)}`, false);
    return r;
  }

  _renderAssignKPI() {
    const el = this.panelEl.querySelector("#as-kpi"); if (!el) return;
    if (!this.kpi) { el.innerHTML = `<div class="kpi"><span class="k">no run yet</span></div>`; return; }
    const k = this.kpi;
    el.innerHTML = `
      <div class="kpi"><div class="k">vehicle-hours</div><div class="v gold">${fmt(k.vht)}</div></div>
      <div class="kpi"><div class="k">vehicle-km</div><div class="v">${fmt(k.vkt)}</div></div>
      <div class="kpi"><div class="k">avg v/c</div><div class="v">${k.avgVC.toFixed(2)}</div></div>
      <div class="kpi"><div class="k">peak v/c</div><div class="v">${k.peakVC.toFixed(1)}</div></div>
      <div class="kpi"><div class="k">LOS F links</div><div class="v">${fmtN(k.overCount)}</div></div>
      <div class="kpi"><div class="k">congested</div><div class="v">${(k.overShare * 100).toFixed(1)}%</div></div>
      <div class="kpi"><div class="k">rel. gap</div><div class="v">${Number.isFinite(k.gap) ? k.gap.toExponential(1) : "—"}</div></div>
      <div class="kpi"><div class="k">loaded links</div><div class="v">${fmtN(k.loaded)}</div></div>`;
  }

  // ---- recommender ----
  async recommend() {
    if (!this.volume) { await this.runAssignment({ method: "fw", demand: "matrix", period: "am", sample: 250 }); }
    this.status("finding improvements", true);
    this.recs = this.eng.recommend(this.volume, this.time);
    this.renderer.setHighlight(new Set(this.recs.slice(0, 6).map(r => r.link)));
    this.colorLinks("vc");
    this._renderRecs();
    this.status(`found ${this.recs.length} candidates`, false);
    return this.recs;
  }

  _renderRecs() {
    const el = this.panelEl.querySelector("#as-recs"); if (!el) return;
    if (!this.recs || !this.recs.length) { el.innerHTML = `<div class="recs-h">No congested links to improve.</div>`; return; }
    const FAC = this.model.meta.facilities;
    const rows = this.recs.slice(0, 8).map((r, i) => `
      <div class="rec" data-n="${i + 1}">
        <div class="rec-top"><span class="rec-i">${i + 1}</span>
          <span class="rec-link">link ${r.link} · ${FAC[r.cls]}</span>
          <button class="rec-apply" data-n="${i + 1}">Apply &amp; re-assign</button></div>
        <div class="rec-stats">v/c ${r.vc.toFixed(1)} · saves ~${fmt(r.saveHrYr)} veh-h/yr · cost ~${(r.cost / 1e6).toFixed(0)}M AED · <b>BCR ${r.bcr.toFixed(1)}</b></div>
      </div>`).join("");
    el.innerHTML = `<div class="recs-h">Proposed improvements (widen +2 lanes), ranked by benefit-cost:</div>${rows}`;
    el.querySelectorAll(".rec-apply").forEach(b => b.onclick = () => this._applyFromPanel(+b.dataset.n));
    el.querySelectorAll(".rec").forEach(d => d.onmouseenter = () => {
      const r = this.recs[+d.dataset.n - 1]; if (!r) return;
      this.renderer.setHighlight(new Set([r.link])); this.scheduleDraw();
    });
  }

  async _applyFromPanel(n) {
    const r = await this.applyRecommendation(n);
    if (r) {
      this.say(`Applied #${n}: widened link ${r.rec.link}. Network VHT ${r.saved != null ? `${fmt(r.before)} → ${fmt(r.after)} (saved ${fmt(r.saved)})` : fmt(r.after)}.`, "ai");
      this.recs = this.eng.recommend(this.volume, this.time);  // re-screen the improved network
      this._renderRecs();
    }
  }

  async applyRecommendation(n) {
    if (!this.recs || !this.recs[n - 1]) { this.say("No such recommendation. Run “recommend improvements” first.", "err"); return; }
    const rec = this.recs[n - 1];
    const before = this.kpi ? this.kpi.vht : null;
    this.eng.widenLink(rec.link, 2);
    this.say(`Widened link ${rec.link} by 2 lanes — re-assigning the whole network…`, "ai");
    const r = await this.runAssignment({ method: "fw", demand: "matrix", period: "am", sample: 250 });
    const after = r.kpi.vht;
    this.renderer.setHighlight(new Set([rec.link]));
    this.scheduleDraw();
    return { rec, before, after, saved: before != null ? before - after : null };
  }

  // ---- aggregation ----
  async aggregate(opts) {
    this.status("aggregating zones…", true);
    const r = await this.eng.aggregate(opts, (p) => this.status(`aggregating ${(p * 100 | 0)}%`, true));
    this.aggr = r;
    this.status(`aggregated to ${fmtN(r.count)} zones`, false);
    if (this.ws === "aggregate") this._renderAggrKPI();
    return r;
  }
  _renderAggrKPI() {
    const el = this.panelEl.querySelector("#ag-kpi"); if (!el) return;
    el.innerHTML = this.aggr
      ? `<div class="kpi"><div class="k">base zones</div><div class="v">${fmtN(this.model.meta.counts.matrixZones)}</div></div>
         <div class="kpi"><div class="k">aggregated</div><div class="v gold">${fmtN(this.aggr.count)}</div></div>`
      : `<div class="kpi"><span class="k">not aggregated yet</span></div>`;
  }
  exportAggr(kind) {
    if (!this.aggr) { this.say("Aggregate first, then export.", "err"); return; }
    if (kind === "shapefile") XP.exportShapefile(this.model, this.aggr.members);
    else if (kind === "geojson") XP.exportGeoJSON(this.model, this.aggr.members);
    else XP.exportCorrespondence(this.aggr.corr);
    this.say(`Exported aggregated zones as ${kind}.`, "ai");
  }

  // ---- canvas interaction ----
  _wireCanvas() {
    const cv = document.getElementById("map");
    let dragging = false, lx = 0, ly = 0;
    cv.addEventListener("pointerdown", (e) => { dragging = true; lx = e.clientX; ly = e.clientY; cv.classList.add("drag"); cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", (e) => { if (!dragging) return; this.renderer.panBy(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY; this.scheduleDraw(); });
    cv.addEventListener("pointerup", (e) => { dragging = false; cv.classList.remove("drag"); });
    cv.addEventListener("wheel", (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); this.renderer.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15); this.scheduleDraw(); }, { passive: false });
  }

  _wireBar() {
    document.getElementById("bar").addEventListener("submit", (e) => {
      e.preventDefault();
      const text = this.cmdEl.value.trim();
      if (!text) return;
      this.say(text, "me");
      this.cmdEl.value = "";
      this.copilot.handle(text);
    });
  }

  _rotatePlaceholder() {
    const ex = ["colour zones by population", "run an AM peak assignment", "show me the worst congestion",
      "recommend improvements", "trips from zone 200", "aggregate to 1500 zones",
      "top 10 zones by jobs", "busiest corridors", "compare district Al Falah and Al Maryah"];
    let i = 0;
    setInterval(() => { this.cmdEl.setAttribute("placeholder", ex[i++ % ex.length]); }, 3500);
  }
}

const app = new App();
app.boot().catch(err => {
  console.error(err);
  document.querySelector(".status-text").textContent = "error: " + err.message;
});
window.STEAM = app;
