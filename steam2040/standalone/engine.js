/* STEAM 2040 Studio — transport engine (pure JS, typed arrays).
 *
 * Ported from the Python core: CSR graph, binary-heap Dijkstra + tree-load,
 * free-flow / MSA / incremental / (conjugate) Frank-Wolfe assignment, gravity
 * demand, zone aggregation under barrier + span rules, an improvement
 * recommender, and interactive analysis (select-link, scenario diff, isochrone,
 * corridor, screenline). Runs single-threaded; assignment samples origins by
 * default (the speed/accuracy dial) and is async + interruptible.
 */
const FACILITY = ["fwy", "ramp", "art", "coll", "local", "rural", "junc"];
const CAP_LANE = { fwy: 2000, ramp: 1500, art: 900, coll: 700, local: 500, rural: 600, junc: 600 };
const SPEED = { fwy: 100, ramp: 60, art: 60, coll: 50, local: 30, rural: 80, junc: 30 };
const BARRIER_RANK = { fwy: 0, ramp: 1, art: 2, coll: 3, rural: 3, local: 4, junc: 5 };
const LANEKM_COST = { fwy: 12e6, ramp: 8e6, art: 6e6, coll: 4e6, local: 2e6, rural: 3e6, junc: 2e6 };

function dtypeCtor(s) {
  return { "<i4": Int32Array, "<f4": Float32Array, "|u1": Uint8Array,
           "<i2": Int16Array, "<f8": Float64Array }[s] || Float32Array;
}

export async function decodeBlob(b64) {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const ds = new DecompressionStream("gzip");
  const buf = await new Response(new Blob([bin]).stream().pipeThrough(ds)).arrayBuffer();
  const dv = new DataView(buf);
  const hlen = dv.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hlen)));
  const base = 4 + hlen;
  const sec = {};
  for (const [name, m] of Object.entries(header.sections)) {
    const C = dtypeCtor(m.dtype);
    sec[name] = new C(buf.slice(base + m.offset, base + m.offset + m.len));
  }
  return { header, sec };
}

export class Model {
  constructor(decoded) {
    this.h = decoded.header;
    this.s = decoded.sec;
    this.nLinks = this.h.n_links | 0;
    this.nNodes = this.h.n_nodes | 0;
    this.nZones = this.h.n_zones | 0;
    // Capability flags: tolerate networks shipped without zones or an OD matrix.
    this.hasZones = this.nZones > 0 && !!this.s.z_centroid && this.s.z_centroid.length >= this.nZones * 2;
    this.hasOD = (this.h.n_od | 0) > 0 && !!this.s.od_o && !!this.s.od_d && !!this.s.od_t;
    if (!this.hasZones) this.nZones = 0;
    if (!this.hasOD) this.h.n_od = 0;
    if (this.nLinks <= 0) throw new Error("This network has no road links — nothing to display.");
    // originSample is the live-run speed/accuracy dial. In-browser sampling
    // scales a random subset of origins up, which over-loads their corridors, so
    // the *displayed* result comes from the baked full-origin baseline below;
    // live re-runs use a large sample + warm-start to stay close to it.
    this.settings = { bprAlpha: 0.15, bprBeta: 4, periodFactor: 0.1, deterrence: 0.1,
                      vot: 35, workingDays: 250, originSample: 1500, fwIters: 8, fwGap: 1e-3,
                      dispVcCap: 3, dispSpeedFloor: 5 };
    this._derive();
    this._buildCSR();
    if (this.hasZones) this._zoneNodes(); else this.zoneNode = new Int32Array(0);
    if (this.hasZones && this.hasOD) this._groupOD(); else this.odByNode = new Map();
    this.result = null;
    this.aggregation = null;
    this.baselineVolume = null;
    // Correct full-origin equilibrium computed at build time and baked in.
    if (this.h.has_baseline && this.s.base_volume && this.s.base_volume.length === this.nLinks) {
      this.baselineVolume = new Float32Array(this.s.base_volume);
      this._finalize(this.baselineVolume, [], this.hasOD ? "fixed" : "gravity", "baseline");
    }
  }

  canAssign(demand) {
    if (!this.hasZones) return false;
    return demand === "gravity" ? true : this.hasOD;   // gravity synthesises demand from land use
  }

  className(i) { return FACILITY[this.s.klass[i]] || "local"; }

  _derive() {
    const n = this.nLinks, s = this.s;
    this.cap = new Float32Array(n);
    this.fftime = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const c = FACILITY[s.klass[i]] || "local";
      this.cap[i] = Math.max(1, s.lanes[i]) * CAP_LANE[c];
      this.fftime[i] = s.length[i] / (SPEED[c] / 3.6);
    }
  }

  _buildCSR() {
    const n = this.nLinks, s = this.s;
    let extra = 0;
    for (let i = 0; i < n; i++) if (!s.oneway[i]) extra++;
    const E = n + extra;
    const src = new Int32Array(E), dst = new Int32Array(E), elink = new Int32Array(E);
    let e = 0;
    for (let i = 0; i < n; i++) { src[e] = s.node_a[i]; dst[e] = s.node_b[i]; elink[e] = i; e++;
      if (!s.oneway[i]) { src[e] = s.node_b[i]; dst[e] = s.node_a[i]; elink[e] = i; e++; } }
    const indptr = new Int32Array(this.nNodes + 1);
    for (let k = 0; k < E; k++) indptr[src[k] + 1]++;
    for (let k = 0; k < this.nNodes; k++) indptr[k + 1] += indptr[k];
    const indices = new Int32Array(E), edgeLink = new Int32Array(E), weight = new Float32Array(E);
    const cur = indptr.slice();
    for (let k = 0; k < E; k++) { const p = cur[src[k]]++; indices[p] = dst[k]; edgeLink[p] = elink[k]; }
    this.csr = { indptr, indices, edgeLink, weight, E };
    this.setWeights(this.fftime);
  }

  setWeights(linkTimeArr) {
    const { edgeLink, weight, E } = this.csr;
    for (let k = 0; k < E; k++) weight[k] = linkTimeArr[edgeLink[k]];
  }

  _zoneNodes() {
    const nx = this.s.node_xy, cell = 1000;
    const grid = new Map();
    const key = (x, y) => ((x / cell) | 0) + "," + ((y / cell) | 0);
    for (let i = 0; i < this.nNodes; i++) {
      const k = key(nx[i * 2], nx[i * 2 + 1]);
      let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i);
    }
    const zc = this.s.z_centroid;
    this.zoneNode = new Int32Array(this.nZones).fill(-1);
    for (let z = 0; z < this.nZones; z++) {
      const x = zc[z * 2], y = zc[z * 2 + 1];
      if (x === 0 && y === 0) continue;
      const gx = (x / cell) | 0, gy = (y / cell) | 0;
      let best = -1, bd = Infinity;
      for (let r = 0; r <= 4 && best < 0; r++) {
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
          if (r > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const a = grid.get((gx + dx) + "," + (gy + dy)); if (!a) continue;
          for (const i of a) { const d = (nx[i * 2] - x) ** 2 + (nx[i * 2 + 1] - y) ** 2; if (d < bd) { bd = d; best = i; } }
        }
      }
      this.zoneNode[z] = best;
    }
  }

  _groupOD() {
    const s = this.s, zn = this.zoneNode, M = this.h.n_od;
    const byNode = new Map();
    for (let k = 0; k < M; k++) {
      const on = zn[s.od_o[k]], dn = zn[s.od_d[k]];
      if (on < 0 || dn < 0 || on === dn) continue;
      let a = byNode.get(on); if (!a) byNode.set(on, a = []);
      a.push(dn, s.od_t[k]);
    }
    this.odByNode = byNode;
  }

  // ---- BPR (assignment link cost; the equilibrium uses ONLY this) ----
  bpr(vol, out) {
    const { bprAlpha: A, bprBeta: B } = this.settings, n = this.nLinks;
    out = out || new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = vol[i] > 0 ? vol[i] : 0;
      const c = this.cap[i] > 1e-9 ? this.cap[i] : 1e-9;
      const ff = this.fftime[i] >= 0 ? this.fftime[i] : 0;
      let t = ff * (1 + A * Math.pow(v / c, B));
      out[i] = Number.isFinite(t) ? t : ff;
    }
    return out;
  }

  // Display-only congestion time (capped v/c) — NOT used by the equilibrium.
  dispTime(vol, out) {
    const { bprAlpha: A, bprBeta: B } = this.settings, n = this.nLinks;
    const vcCap = this.settings.dispVcCap || 3;
    out = out || new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = vol[i] > 0 ? vol[i] : 0;
      const c = this.cap[i] > 1e-9 ? this.cap[i] : 1e-9;
      const ff = this.fftime[i] >= 0 ? this.fftime[i] : 0;
      const r = Math.min(v / c, vcCap);
      let t = ff * (1 + A * Math.pow(r, B));
      out[i] = Number.isFinite(t) ? t : ff;
    }
    return out;
  }

  // Reusable Dijkstra scratch (allocated once per Model; shared across origins
  // and the analysis tools — no per-call allocation).
  _scratch() {
    let sc = this._sc;
    if (!sc || sc.N !== this.nNodes) {
      const N = this.nNodes, H = this.csr.E + 1;
      sc = this._sc = { N, dist: new Float64Array(N), pe: new Int32Array(N),
                        pn: new Int32Array(N), hd: new Float64Array(H), hn: new Int32Array(H) };
    }
    return sc;
  }

  // ---- Dijkstra (lazy-deletion 4-ary heap) ----
  _dijkstra(srcNode, dist, pe, pn, hd, hn) {
    const indptr = this.csr.indptr, indices = this.csr.indices,
          edgeLink = this.csr.edgeLink, weight = this.csr.weight;
    dist.fill(Infinity); pe.fill(-1); pn.fill(-1);
    dist[srcNode] = 0; hd[0] = 0; hn[0] = srcNode; let size = 1;
    while (size > 0) {
      const d = hd[0], u = hn[0]; size--;
      if (size > 0) {
        const md = hd[size], mn = hn[size]; let i = 0;
        for (;;) {
          let c = 4 * i + 1; if (c >= size) break;
          let best = c, bd = hd[c];
          const c1 = c + 1, c2 = c + 2, c3 = c + 3;
          if (c1 < size && hd[c1] < bd) { best = c1; bd = hd[c1]; }
          if (c2 < size && hd[c2] < bd) { best = c2; bd = hd[c2]; }
          if (c3 < size && hd[c3] < bd) { best = c3; bd = hd[c3]; }
          if (bd >= md) break;
          hd[i] = bd; hn[i] = hn[best]; i = best;
        }
        hd[i] = md; hn[i] = mn;
      }
      if (d > dist[u]) continue;
      const end = indptr[u + 1];
      for (let k = indptr[u]; k < end; k++) {
        const v = indices[k], nd = d + weight[k];
        if (nd < dist[v]) {
          dist[v] = nd; pe[v] = edgeLink[k]; pn[v] = u;
          let j = size++;
          while (j > 0) { const p = (j - 1) >> 2; if (hd[p] <= nd) break;
            hd[j] = hd[p]; hn[j] = hn[p]; j = p; }
          hd[j] = nd; hn[j] = v;
        }
      }
    }
  }

  _sampleOrigins(nodes) {
    const k = this.settings.originSample;
    if (!k || k >= nodes.length) return { nodes, scale: 1 };
    const step = nodes.length / k, out = [];
    for (let i = 0; i < k; i++) out.push(nodes[Math.floor(i * step)]);
    return { nodes: out, scale: nodes.length / out.length };
  }

  // Flatten odByNode into contiguous typed arrays honouring the current sample.
  _buildODArrays() {
    const origins = [...this.odByNode.keys()];
    const { nodes, scale } = this._sampleOrigins(origins);
    let tot = 0; for (const s of nodes) tot += this.odByNode.get(s).length >> 1;
    const on = new Int32Array(nodes.length), oOff = new Int32Array(nodes.length + 1);
    const odDst = new Int32Array(tot), odTrp = new Float32Array(tot);
    let p = 0;
    for (let i = 0; i < nodes.length; i++) {
      const s = nodes[i]; on[i] = s; oOff[i] = p; const dl = this.odByNode.get(s);
      for (let q = 0; q < dl.length; q += 2) { odDst[p] = dl[q]; odTrp[p] = dl[q + 1]; p++; }
    }
    oOff[nodes.length] = p;
    this._odNodes = on; this._odOff = oOff; this._odDst = odDst; this._odTrp = odTrp;
    this._odScale = scale; this._odSampleKey = this.settings.originSample;
  }

  // all-or-nothing load of the fixed matrix demand at the current weights
  _aonFixed(volOut) {
    const { dist, pe, pn, hd, hn } = this._scratch();
    volOut.fill(0); let sptt = 0;
    const pf = this.settings.periodFactor;
    if (!this._odNodes || this._odSampleKey !== this.settings.originSample) this._buildODArrays();
    const on = this._odNodes, oOff = this._odOff, odDst = this._odDst, odTrp = this._odTrp, scale = this._odScale;
    for (let oi = 0; oi < on.length; oi++) {
      const s = on[oi];
      this._dijkstra(s, dist, pe, pn, hd, hn);
      const qe = oOff[oi + 1];
      for (let q = oOff[oi]; q < qe; q++) {
        const dn = odDst[q], t = odTrp[q] * scale * pf;
        if (t <= 0 || dn === s || pe[dn] < 0) continue;
        sptt += t * dist[dn];
        let u = dn; while (u !== s) { const e = pe[u]; if (e < 0) break; volOut[e] += t; u = pn[u]; }
      }
    }
    return sptt;
  }

  // gravity demand load
  _aonGravity(volOut) {
    const s = this.s, zn = this.zoneNode;
    const prod = new Float64Array(this.nZones), attr = new Float64Array(this.nZones);
    for (let z = 0; z < this.nZones; z++) {
      prod[z] = 1.2 * s.z_pop_tot[z] + 0.9 * s.z_worker[z] + 0.7 * s.z_student[z];
      attr[z] = (3 * s.z_retail_gfa[z] + 1.5 * s.z_office_gfa[z] + 0.6 * s.z_ind_gfa[z] + 2 * s.z_school_gfa[z]) / 100;
    }
    const zoneList = []; for (let z = 0; z < this.nZones; z++) if (zn[z] >= 0 && attr[z] > 0) zoneList.push(z);
    const oList = []; for (let z = 0; z < this.nZones; z++) if (zn[z] >= 0 && prod[z] > 0) oList.push(z);
    const { nodes: oSample, scale } = this._sampleOrigins(oList);
    const { dist, pe, pn, hd, hn } = this._scratch();
    volOut.fill(0); let sptt = 0, total = 0; const beta = this.settings.deterrence;
    for (const z of oSample) {
      const s0 = zn[z], P = prod[z] * scale * this.settings.periodFactor;
      this._dijkstra(s0, dist, pe, pn, hd, hn);
      let wsum = 0; const ws = [];
      for (const zj of zoneList) { const nd = zn[zj]; if (nd === s0 || dist[nd] === Infinity) { ws.push(0); continue; }
        const w = attr[zj] * Math.exp(-beta * dist[nd] / 60); ws.push(w); wsum += w; }
      if (wsum <= 0) continue;
      for (let q = 0; q < zoneList.length; q++) { if (ws[q] <= 0) continue;
        const nd = zn[zoneList[q]], t = P * ws[q] / wsum; sptt += t * dist[nd]; total += t;
        let u = nd; while (u !== s0) { const e = pe[u]; if (e < 0) break; volOut[e] += t; u = pn[u]; } }
    }
    this._gravityTotal = total;
    return sptt;
  }

  _aon(volOut, demand) { return demand === "gravity" ? this._aonGravity(volOut) : this._aonFixed(volOut); }

  _emptyDemand() {
    if (!this.odByNode || this.odByNode.size === 0) {
      // gravity can still synthesise from land use even without an OD matrix
      return !this.hasZones;
    }
    for (const dl of this.odByNode.values()) for (let q = 1; q < dl.length; q += 2) if (dl[q] > 0) return false;
    return !this.hasZones;
  }

  // warmStart (optional): Float32Array of starting link volumes.
  assign(method, demand, progress, warmStart) {
    const n = this.nLinks, vol = new Float32Array(n), aux = new Float32Array(n);
    const gap = [];
    if (warmStart && warmStart.length === n) for (let i = 0; i < n; i++) { const v = warmStart[i]; vol[i] = v > 0 ? v : 0; }
    if (method === "freeflow") { this.setWeights(this.fftime); this._aon(vol, demand); }
    else if (method === "incremental") {
      const incs = [0.4, 0.3, 0.2, 0.1]; let acc = new Float32Array(n);
      for (let s = 0; s < incs.length; s++) { this.setWeights(this.bpr(acc)); this._aon(aux, demand);
        for (let i = 0; i < n; i++) acc[i] += incs[s] * aux[i]; if (progress) progress(s + 1, incs.length, NaN); }
      vol.set(acc);
    } else if (method === "msa") {
      if (!warmStart) { this.setWeights(this.fftime); this._aon(vol, demand); }
      const K = this.settings.fwIters;
      for (let k = 1; k <= K; k++) { const t = this.bpr(vol); this.setWeights(t); const sptt = this._aon(aux, demand);
        const step = 1 / (k + 1); for (let i = 0; i < n; i++) vol[i] = (1 - step) * vol[i] + step * aux[i];
        const g = this._gap(vol, sptt); gap.push(g); if (progress) progress(k, K, g); }
    } else { // conjugate frank-wolfe
      if (!warmStart) { this.setWeights(this.fftime); this._aon(vol, demand); }
      const K = this.settings.fwIters;
      const prevDir = new Float32Array(n); let havePrev = false;
      for (let k = 0; k < K; k++) { const t = this.bpr(vol); this.setWeights(t); const sptt = this._aon(aux, demand);
        const g = this._gap(vol, sptt, t); gap.push(g); if (progress) progress(k + 1, K, g);
        if (g < this.settings.fwGap) break;
        const dir = this._cfwDir(vol, aux, t, prevDir, havePrev); havePrev = true;
        const target = this._dirTarget(vol, dir);
        const lam = this._line(vol, target);
        for (let i = 0; i < n; i++) { vol[i] += lam * (target[i] - vol[i]); if (!(vol[i] > 0)) vol[i] = 0; } }
    }
    this._finalize(vol, gap, demand, method);
    return this.result;
  }

  // Async, interruptible assignment: yields between iterations and calls
  // onIter(k, K, gap) with this.result kept current so the map/KPIs refresh live.
  // Set this.abort = true to stop early. warmStart (optional) seeds the volumes.
  async assignProgressive(method, demand, onIter, warmStart) {
    if (!this.canAssign(demand)) {
      throw new Error(demand === "gravity"
        ? "Gravity assignment needs zone land-use data, which this network does not include."
        : "Matrix assignment needs zones and an OD matrix, which this network does not include.");
    }
    const n = this.nLinks, vol = new Float32Array(n), aux = new Float32Array(n), gap = [];
    this.abort = false;
    if (warmStart && warmStart.length === n) for (let i = 0; i < n; i++) { const v = warmStart[i]; vol[i] = v > 0 ? v : 0; }
    const step = () => new Promise(r => setTimeout(r, 0));
    const emit = async (k, K, g) => { this._finalize(vol, gap, demand, method); if (onIter) onIter(k, K, g); await step(); };
    if (method === "freeflow") {
      this.setWeights(this.fftime); this._aon(vol, demand); await emit(1, 1, NaN);
    } else if (method === "incremental") {
      const incs = [0.4, 0.3, 0.2, 0.1], acc = new Float32Array(n);
      for (let s = 0; s < incs.length; s++) { if (this.abort) break;
        this.setWeights(this.bpr(acc)); this._aon(aux, demand);
        for (let i = 0; i < n; i++) acc[i] += incs[s] * aux[i]; vol.set(acc); await emit(s + 1, incs.length, NaN); }
    } else if (method === "msa") {
      if (!warmStart) { this.setWeights(this.fftime); this._aon(vol, demand); } const K = this.settings.fwIters;
      for (let k = 1; k <= K; k++) { if (this.abort) break;
        const t = this.bpr(vol); this.setWeights(t); const sptt = this._aon(aux, demand);
        const a = 1 / (k + 1); for (let i = 0; i < n; i++) vol[i] = (1 - a) * vol[i] + a * aux[i];
        const g = this._gap(vol, sptt); gap.push(g); await emit(k, K, g); }
    } else { // conjugate frank-wolfe
      if (!warmStart) { this.setWeights(this.fftime); this._aon(vol, demand); } const K = this.settings.fwIters;
      const prevDir = new Float32Array(n); let havePrev = false;
      for (let k = 0; k < K; k++) { if (this.abort) break;
        const t = this.bpr(vol); this.setWeights(t); const sptt = this._aon(aux, demand);
        const g = this._gap(vol, sptt, t); gap.push(g); await emit(k + 1, K, g);
        if (g < this.settings.fwGap) break;
        const dir = this._cfwDir(vol, aux, t, prevDir, havePrev); havePrev = true;
        const target = this._dirTarget(vol, dir);
        const lam = this._line(vol, target);
        for (let i = 0; i < n; i++) { vol[i] += lam * (target[i] - vol[i]); if (!(vol[i] > 0)) vol[i] = 0; } }
    }
    return this.result;
  }

  // Conjugate Frank-Wolfe descent direction (returns the target vertex so the
  // existing line search, which interpolates x -> target, is reused unchanged).
  _cfwDir(vol, aux, t, prevDir, havePrev) {
    const n = this.nLinks, dir = new Float32Array(n);
    for (let i = 0; i < n; i++) dir[i] = aux[i] - vol[i];
    if (!havePrev) { prevDir.set(dir); return dir; }
    const A = this.settings.bprAlpha, B = this.settings.bprBeta;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      const c = this.cap[i] > 1e-9 ? this.cap[i] : 1e-9;
      const v = vol[i] > 0 ? vol[i] : 0;
      let h = this.fftime[i] * A * B * Math.pow(v / c, B - 1) / c;   // diagonal Hessian approx
      if (!(h >= 0) || !Number.isFinite(h)) h = 0;
      num += h * prevDir[i] * dir[i];
      den += h * prevDir[i] * (dir[i] - prevDir[i]);
    }
    let beta = den !== 0 ? num / den : 0;
    if (!Number.isFinite(beta)) beta = 0;
    beta = Math.max(0, Math.min(0.99, beta));
    const comb = new Float32Array(n);
    for (let i = 0; i < n; i++) comb[i] = (1 - beta) * dir[i] + beta * prevDir[i];
    prevDir.set(comb);
    return comb;
  }

  _dirTarget(vol, dir) {
    const n = this.nLinks, out = new Float32Array(n);
    for (let i = 0; i < n; i++) { let v = vol[i] + dir[i]; out[i] = v > 0 ? v : 0; }
    return out;
  }

  _gap(vol, sptt, t) { t = t || this.bpr(vol); let tstt = 0;
    for (let i = 0; i < this.nLinks; i++) { const term = vol[i] * t[i]; if (Number.isFinite(term)) tstt += term; }
    return (sptt > 0 && Number.isFinite(tstt)) ? Math.abs((tstt - sptt) / sptt) : 0; }

  // Derivative of the Beckmann objective along x -> y at step lam.
  _dirDeriv(x, y, lam) {
    const n = this.nLinks, A = this.settings.bprAlpha, B = this.settings.bprBeta;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const dx = y[i] - x[i]; if (dx === 0) continue;
      let f = x[i] + lam * dx; if (!(f > 0)) f = 0;
      const c = this.cap[i] > 1e-9 ? this.cap[i] : 1e-9;
      let tt = this.fftime[i] * (1 + A * Math.pow(f / c, B));
      if (!Number.isFinite(tt)) tt = this.fftime[i];
      s += dx * tt;
    }
    return s;
  }

  _line(x, y) {
    const d0 = this._dirDeriv(x, y, 0);
    if (!(d0 < 0)) return 0;
    const d1 = this._dirDeriv(x, y, 1);
    if (d1 <= 0) return 1;
    let lo = 0, hi = 1;
    for (let it = 0; it < 40; it++) {
      const m = 0.5 * (lo + hi), dm = this._dirDeriv(x, y, m);
      if (!Number.isFinite(dm)) { hi = m; continue; }
      if (Math.abs(dm) < 1e-4) return m;
      if (dm > 0) hi = m; else lo = m;
    }
    return 0.5 * (lo + hi);
  }

  _finalize(vol, gap, demand, method) {
    const n = this.nLinks, ctime = this.bpr(vol), vc = new Float32Array(n), los = new Uint8Array(n);
    const dtime = this.dispTime(vol);
    for (let i = 0; i < n; i++) {
      const c = this.cap[i] > 1e-9 ? this.cap[i] : 1e-9;
      let r = vol[i] / c; if (!Number.isFinite(r) || r < 0) r = 0;
      vc[i] = r; los[i] = losBand(r);
    }
    this.result = { volume: vol, ctime, fftime: this.fftime, cap: this.cap, vc, los,
                    dtime, gap: gap.slice(), demand, method };
    return this.result;
  }

  // KPIs that survive extreme v/c. VHT/VMT/delay use the TRUE equilibrium time;
  // the headline speed uses a per-link display floor so a few v/c~16 links can't
  // zero it. Percentile speeds are VMT-weighted and robust.
  kpis() {
    const r = this.result; if (!r) return null;
    const n = this.nLinks, floorKmh = this.settings.dispSpeedFloor || 5;
    let vmt = 0, vht = 0, delay = 0, wsum = 0, wvc = 0, over = 0, peak = 0, loaded = 0;
    let laneKmOver = 0, vmtEF = 0, dispVHT = 0;
    const speeds = [];
    for (let i = 0; i < n; i++) {
      const v = r.volume[i]; if (!(v > 0)) continue; loaded++;
      const lenM = this.s.length[i] > 0 ? this.s.length[i] : 0;
      const km = lenM / 1000;
      const ct = r.ctime[i] > 1e-9 ? r.ctime[i] : 1e-9;
      const ft = r.fftime[i] > 1e-9 ? r.fftime[i] : 1e-9;
      const h = ct / 3600, fh = ft / 3600;
      if (Number.isFinite(km)) { vmt += v * km; vht += v * h; }
      if (Number.isFinite(h - fh)) delay += v * Math.max(0, h - fh);
      const vc = Number.isFinite(r.vc[i]) ? r.vc[i] : 0;
      wsum += v; wvc += vc * v; if (vc > 1) { over++; laneKmOver += Math.max(1, this.s.lanes[i]) * km; }
      if (vc > peak) peak = vc;
      if (r.los[i] >= 4) vmtEF += v * km;
      const dt = (r.dtime ? r.dtime[i] : ct);
      let sp = lenM > 0 && dt > 1e-9 ? lenM / dt * 3.6 : floorKmh;
      if (!Number.isFinite(sp)) sp = floorKmh;
      sp = Math.max(floorKmh, sp);
      dispVHT += (km > 0 ? v * km / sp : 0);
      if (km > 0) speeds.push([sp, v * km]);
    }
    speeds.sort((a, b) => a[0] - b[0]);
    let tot = 0; for (const s of speeds) tot += s[1];
    const pct = (p) => { if (!speeds.length || tot <= 0) return 0; const target = p * tot; let acc = 0;
      for (const s of speeds) { acc += s[1]; if (acc >= target) return s[0]; } return speeds[speeds.length - 1][0]; };
    const speedRaw = vht > 0 ? vmt / vht : 0;
    const speedDisp = dispVHT > 0 ? vmt / dispVHT : 0;
    return {
      vmt, vht, delay, loaded, over, peak,
      avgVc: wsum > 0 ? wvc / wsum : 0,
      overShare: loaded ? over / loaded : 0,
      speed: speedDisp, speedRaw,
      p15: pct(0.15), p50: pct(0.50), p85: pct(0.85),
      laneKmOver, pctVmtEF: vmt > 0 ? vmtEF / vmt : 0, speedFloor: floorKmh,
      gap: r.gap.length ? r.gap[r.gap.length - 1] : NaN
    };
  }

  topCongested(nTop) {
    const r = this.result; if (!r) return [];
    const idx = [...Array(this.nLinks).keys()].filter(i => r.volume[i] > 0);
    idx.sort((a, b) => (r.volume[b] * (r.ctime[b] - r.fftime[b])) - (r.volume[a] * (r.ctime[a] - r.fftime[a])));
    return idx.slice(0, nTop).map(i => ({ i, klass: this.className(i), lanes: this.s.lanes[i],
      vol: r.volume[i], cap: r.cap[i], vc: r.vc[i], los: "ABCDEF"[r.los[i]], delay: r.volume[i] * (r.ctime[i] - r.fftime[i]) / 3600 }));
  }

  // ---- aggregation ----
  aggregate(target, barrier, maxSpan, keys) {
    const zc = this.s.z_centroid, valid = [];
    for (let z = 0; z < this.nZones; z++) if (!(zc[z * 2] === 0 && zc[z * 2 + 1] === 0)) valid.push(z);
    const grid = this._barrierGrid(barrier);
    const key = (z) => (keys || ["district"]).map(k => this.s["z_" + k][z]).join(",");
    const cell = maxSpan, gmap = new Map();
    const gk = (x, y) => ((x / cell) | 0) + "," + ((y / cell) | 0);
    for (const z of valid) { const k = gk(zc[z * 2], zc[z * 2 + 1]); let a = gmap.get(k); if (!a) gmap.set(k, a = []); a.push(z); }
    const pairs = [];
    for (const z of valid) { const gx = (zc[z * 2] / cell) | 0, gy = (zc[z * 2 + 1] / cell) | 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const a = gmap.get((gx + dx) + "," + (gy + dy)); if (!a) continue;
        for (const w of a) { if (w <= z) continue; const d = Math.hypot(zc[z * 2] - zc[w * 2], zc[z * 2 + 1] - zc[w * 2 + 1]);
          if (d <= maxSpan && key(z) === key(w) && !grid.crosses(zc[z * 2], zc[z * 2 + 1], zc[w * 2], zc[w * 2 + 1])) pairs.push([d, z, w]); } } }
    pairs.sort((a, b) => a[0] - b[0]);
    const parent = new Int32Array(this.nZones); for (let z = 0; z < this.nZones; z++) parent[z] = z;
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    let nClusters = valid.length; const merges = [];
    for (const [d, z, w] of pairs) { if (nClusters <= target) break; const ra = find(z), rb = find(w); if (ra === rb) continue;
      parent[rb] = ra; nClusters--; merges.push([z, w, d]); }
    const labels = new Int32Array(this.nZones).fill(-1); const root2id = new Map(); let next = 0;
    for (const z of valid) { const r = find(z); if (!root2id.has(r)) root2id.set(r, next++); labels[z] = root2id.get(r); }
    this.aggregation = { labels, nClusters: next, mergeEdges: merges, target, barrier, maxSpan };
    return this.aggregation;
  }

  _barrierGrid(barrier) {
    const cutoff = BARRIER_RANK[barrier], segs = [], cell = 2000, gmap = new Map();
    const gx = this.s.geom_xy, off = this.s.geom_off;
    const addCellsForSeg = (i, ax, ay, bx, by) => { const steps = Math.max(1, (Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / cell) | 0);
      const seen = new Set(); for (let s = 0; s <= steps; s++) { const t = s / steps, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        const k = ((x / cell) | 0) + "," + ((y / cell) | 0); if (seen.has(k)) continue; seen.add(k); let a = gmap.get(k); if (!a) gmap.set(k, a = []); a.push(i); } };
    for (let i = 0; i < this.nLinks; i++) { const c = FACILITY[this.s.klass[i]]; if (BARRIER_RANK[c] > cutoff) continue;
      for (let k = off[i]; k < off[i + 1] - 1; k++) { const ax = gx[k * 2], ay = gx[k * 2 + 1], bx = gx[(k + 1) * 2], by = gx[(k + 1) * 2 + 1];
        const id = segs.length; segs.push([ax, ay, bx, by]); addCellsForSeg(id, ax, ay, bx, by); } }
    return { crosses: (x1, y1, x2, y2) => {
      const steps = Math.max(1, (Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / cell) | 0), cand = new Set();
      for (let s = 0; s <= steps; s++) { const t = s / steps, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
        const a = gmap.get(((x / cell) | 0) + "," + ((y / cell) | 0)); if (a) for (const id of a) cand.add(id); }
      for (const id of cand) { const [ax, ay, bx, by] = segs[id]; if (segCross(x1, y1, x2, y2, ax, ay, bx, by)) return true; } return false; } };
  }

  // ---- recommender ----
  recommend(nTop) {
    const r = this.result; if (!r) return [];
    const cand = this.topCongested(60).filter(c => c.vc > 0.9);
    const out = [];
    for (const c of cand) { const i = c.i, lanes = this.s.lanes[i], capNew = r.cap[i] * (lanes + 2) / Math.max(1, lanes);
      const tOld = this.fftime[i] * (1 + this.settings.bprAlpha * Math.pow(r.volume[i] / Math.max(r.cap[i], 1e-9), this.settings.bprBeta));
      const tNew = this.fftime[i] * (1 + this.settings.bprAlpha * Math.pow(r.volume[i] / Math.max(capNew, 1e-9), this.settings.bprBeta));
      const saveH = r.volume[i] * (tOld - tNew) / 3600;
      const annual = saveH * this.settings.vot * this.settings.workingDays * 10;
      const cost = 2 * (this.s.length[i] / 1000) * (LANEKM_COST[c.klass] || 4e6);
      out.push({ i, klass: c.klass, vc: c.vc, saveVehH: saveH, annualBenefit: annual, cost, bcr: cost > 0 ? annual / cost : Infinity }); }
    out.sort((a, b) => b.bcr - a.bcr);
    return out.slice(0, nTop);
  }

  upgradeLink(i, addLanes) { this.s.lanes[i] = Math.max(1, this.s.lanes[i] + addLanes); this._derive(); }

  // ===================================================================
  // ANALYSIS / SCENARIO EXTENSIONS (additive)
  // ===================================================================
  linkTime(congested) { return (congested && this.result) ? this.result.ctime : this.fftime; }

  // ---- select-link analysis ----
  selectLink(linkId, opts) {
    opts = opts || {};
    const congested = opts.congested !== false;
    this.setWeights(this.linkTime(congested));
    const sc = this._scratch(), { dist, pe, pn } = sc;
    const a = this.s.node_a[linkId], b = this.s.node_b[linkId];
    const oneway = this.s.oneway[linkId];
    const usesLink = (dn, src) => { let u = dn;
      while (u !== src) { const e = pe[u]; if (e < 0) return false; if (e === linkId) return true; u = pn[u]; } return false; };
    const origins = [...this.odByNode.keys()];
    const { nodes, scale } = this._sampleOrigins(origins);
    const linkVol = new Float32Array(this.nLinks);
    const flows = []; let through = 0, totalDemand = 0;
    for (const s of nodes) {
      this._dijkstra(s, dist, pe, pn, sc.hd, sc.hn);
      const dl = this.odByNode.get(s);
      for (let q = 0; q < dl.length; q += 2) {
        const dn = dl[q], t = dl[q + 1] * scale * this.settings.periodFactor;
        if (t <= 0 || dn === s || pe[dn] < 0) continue;
        totalDemand += t;
        if (usesLink(dn, s)) { through += t; flows.push({ on: s, dn, t });
          let u = dn; while (u !== s) { const e = pe[u]; if (e < 0) break; linkVol[e] += t; u = pn[u]; } }
      }
    }
    flows.sort((x, y) => y.t - x.t);
    const contributing = []; for (let i = 0; i < this.nLinks; i++) if (linkVol[i] > 0) contributing.push(i);
    const node2zone = (nd) => { for (let z = 0; z < this.nZones; z++) if (this.zoneNode[z] === nd) return z; return -1; };
    return { linkId, a, b, oneway, through, totalDemand,
             share: totalDemand > 0 ? through / totalDemand : 0, contributing, linkVol,
             topFlows: flows.slice(0, 12).map(f => ({ oNode: f.on, dNode: f.dn, oZone: node2zone(f.on), dZone: node2zone(f.dn), trips: f.t })) };
  }

  // ---- scenario editing ----
  snapshotVolume() { this._baseVol = this.result ? this.result.volume.slice() : null; return this._baseVol; }
  volumeDiff() {
    if (!this.result) return null;
    const n = this.nLinks, d = new Float32Array(n), base = this._baseVol;
    for (let i = 0; i < n; i++) d[i] = this.result.volume[i] - (base ? base[i] : 0);
    return d;
  }
  addLanes(i, n) { this.s.lanes[i] = Math.max(1, this.s.lanes[i] + (n == null ? 1 : n)); this._derive(); this.setWeights(this.fftime); this._applyClosures(); }
  closeLink(i) { if (!this._closed) this._closed = new Set(); this._closed.add(i); this.cap[i] = 1e-6; this.fftime[i] = 1e12; this._applyClosures(); }
  restoreLink(i) { if (this._closed) this._closed.delete(i); this._derive(); this._applyClosures(); }
  restoreAll() { this._closed = new Set(); this._derive(); this.setWeights(this.fftime); }
  _applyClosures() {
    if (this._closed) for (const i of this._closed) { this.cap[i] = 1e-6; this.fftime[i] = 1e12; }
    const { edgeLink, weight, E } = this.csr;
    for (let k = 0; k < E; k++) if (this._closed && this._closed.has(edgeLink[k])) weight[k] = 1e12;
  }

  // ---- isochrone / catchment ----
  isochrone(srcNode, bandsMin, congested) {
    this.setWeights(this.linkTime(congested !== false));
    const sc = this._scratch(); this._dijkstra(srcNode, sc.dist, sc.pe, sc.pn, sc.hd, sc.hn);
    const dist = sc.dist, bandSec = bandsMin.map(m => m * 60);
    const band = new Int32Array(this.nLinks).fill(-1);
    const counts = new Array(bandsMin.length).fill(0);
    for (let i = 0; i < this.nLinks; i++) {
      const da = dist[this.s.node_a[i]], db = dist[this.s.node_b[i]];
      const d = Math.min(da, db); if (!isFinite(d)) continue;
      let bi = -1; for (let k = 0; k < bandSec.length; k++) if (d <= bandSec[k]) { bi = k; break; }
      band[i] = bi; if (bi >= 0) counts[bi]++;
    }
    return { srcNode, band, counts, bandsMin };
  }

  // ---- corridor / path query ----
  corridor(zoneA, zoneB, congested) {
    const sA = this.zoneNode[zoneA], sB = this.zoneNode[zoneB];
    if (sA < 0 || sB < 0) return null;
    this.setWeights(this.linkTime(congested));
    const sc = this._scratch(); this._dijkstra(sA, sc.dist, sc.pe, sc.pn, sc.hd, sc.hn);
    if (!isFinite(sc.dist[sB]) || sc.pe[sB] < 0) return null;
    const links = []; let u = sB, distM = 0, timeS = 0, guard = 0;
    while (u !== sA && guard++ < this.nNodes) { const e = sc.pe[u]; if (e < 0) break;
      links.push(e); distM += this.s.length[e]; timeS += (congested && this.result ? this.result.ctime[e] : this.fftime[e]); u = sc.pn[u]; }
    links.reverse();
    return { zoneA, zoneB, sA, sB, links, distKm: distM / 1000, timeMin: timeS / 60, congested: !!congested };
  }

  // ---- screenline counts ----
  screenline(x1, y1, x2, y2) {
    const gx = this.s.geom_xy, off = this.s.geom_off, r = this.result;
    const crossing = []; let vol = 0;
    for (let i = 0; i < this.nLinks; i++) {
      let hit = false;
      for (let k = off[i]; k < off[i + 1] - 1 && !hit; k++) {
        const ax = gx[k * 2], ay = gx[k * 2 + 1], bx = gx[(k + 1) * 2], by = gx[(k + 1) * 2 + 1];
        if (segCross(x1, y1, x2, y2, ax, ay, bx, by)) hit = true;
      }
      if (hit) { crossing.push(i); if (r) vol += r.volume[i]; }
    }
    return { x1, y1, x2, y2, links: crossing, count: crossing.length, volume: vol };
  }
}

function losBand(vc) { const t = [0.6, 0.7, 0.8, 0.9, 1.0]; let b = 0; for (const x of t) { if (vc >= x) b++; else break; } return b; }
function orient(ax, ay, bx, by, cx, cy) { return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); }
function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = orient(cx, cy, dx, dy, ax, ay), d2 = orient(cx, cy, dx, dy, bx, by),
        d3 = orient(ax, ay, bx, by, cx, cy), d4 = orient(ax, ay, bx, by, dx, dy);
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}

export { FACILITY };
