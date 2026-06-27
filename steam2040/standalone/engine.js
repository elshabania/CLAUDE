/* STEAM 2040 Studio — transport engine (pure JS, typed arrays).
 *
 * Ported from the Python core: CSR graph, binary-heap Dijkstra + tree-load,
 * free-flow / MSA / incremental / Frank-Wolfe assignment, gravity demand,
 * zone aggregation under barrier + span rules, and an improvement recommender.
 * Runs single-threaded in the browser; assignment loads a sample of origins by
 * default (the speed/accuracy dial), exactly as documented.
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
    // slice() copies to a fresh, element-aligned buffer
    sec[name] = new C(buf.slice(base + m.offset, base + m.offset + m.len));
  }
  return { header, sec };
}

export class Model {
  constructor(decoded) {
    this.h = decoded.header;
    this.s = decoded.sec;
    this.nLinks = this.h.n_links;
    this.nNodes = this.h.n_nodes;
    this.nZones = this.h.n_zones;
    this.settings = { bprAlpha: 0.15, bprBeta: 4, periodFactor: 0.1, deterrence: 0.1,
                      vot: 35, workingDays: 250, originSample: 600, fwIters: 8, fwGap: 1e-3 };
    this._derive();
    this._buildCSR();
    this._zoneNodes();
    this._groupOD();
    this.result = null;       // {volume, ctime, fftime, cap, vc, los, gap}
    this.aggregation = null;  // {labels, nClusters, mergeEdges}
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

  setWeights(linkTime) {
    const { edgeLink, weight, E } = this.csr;
    for (let k = 0; k < E; k++) weight[k] = linkTime[edgeLink[k]];
  }

  _zoneNodes() {
    // nearest node to each zone centroid, via a uniform grid over node coords
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
      for (let r = 0; r <= 4 && best < 0; r++) {  // expand rings until found
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
    // group matrix trips by origin node -> CSR-like lists
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

  // ---- BPR ----
  bpr(vol, out) {
    const { bprAlpha: A, bprBeta: B } = this.settings, n = this.nLinks;
    out = out || new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = this.fftime[i] * (1 + A * Math.pow(vol[i] / Math.max(this.cap[i], 1e-9), B));
    return out;
  }

  // ---- Dijkstra (lazy-deletion binary heap) ----
  _dijkstra(srcNode, dist, pe, pn, hd, hn) {
    const { indptr, indices, edgeLink, weight } = this.csr, N = this.nNodes;
    dist.fill(Infinity); pe.fill(-1); pn.fill(-1);
    dist[srcNode] = 0; hd[0] = 0; hn[0] = srcNode; let size = 1;
    while (size > 0) {
      const d = hd[0], u = hn[0]; size--; hd[0] = hd[size]; hn[0] = hn[size];
      let i = 0;
      while (true) { let l = 2 * i + 1, r = 2 * i + 2, m = i;
        if (l < size && hd[l] < hd[m]) m = l; if (r < size && hd[r] < hd[m]) m = r;
        if (m === i) break;
        const td = hd[i]; hd[i] = hd[m]; hd[m] = td; const tn = hn[i]; hn[i] = hn[m]; hn[m] = tn; i = m; }
      if (d > dist[u]) continue;
      for (let k = indptr[u]; k < indptr[u + 1]; k++) {
        const v = indices[k], nd = d + weight[k];
        if (nd < dist[v]) { dist[v] = nd; pe[v] = edgeLink[k]; pn[v] = u;
          let j = size; hd[j] = nd; hn[j] = v; size++;
          while (j > 0) { const p = (j - 1) >> 1; if (hd[p] <= hd[j]) break;
            const td = hd[p]; hd[p] = hd[j]; hd[j] = td; const tn = hn[p]; hn[p] = hn[j]; hn[j] = tn; j = p; } }
      }
    }
  }

  _sampleOrigins(nodes) {
    const k = this.settings.originSample;
    if (!k || k >= nodes.length) return { nodes, scale: 1 };
    // deterministic stride sample
    const step = nodes.length / k, out = [];
    for (let i = 0; i < k; i++) out.push(nodes[Math.floor(i * step)]);
    return { nodes: out, scale: nodes.length / out.length };
  }

  // all-or-nothing load of the fixed matrix demand at the current weights
  _aonFixed(volOut) {
    const N = this.nNodes;
    const dist = new Float64Array(N), pe = new Int32Array(N), pn = new Int32Array(N);
    const hd = new Float64Array(this.csr.E + 1), hn = new Int32Array(this.csr.E + 1);
    volOut.fill(0); let sptt = 0;
    const origins = [...this.odByNode.keys()];
    const { nodes, scale } = this._sampleOrigins(origins);
    for (const s of nodes) {
      this._dijkstra(s, dist, pe, pn, hd, hn);
      const dl = this.odByNode.get(s);
      for (let q = 0; q < dl.length; q += 2) {
        const dn = dl[q], t = dl[q + 1] * scale * this.settings.periodFactor;
        if (t <= 0 || dn === s || pe[dn] < 0) continue;
        sptt += t * dist[dn];
        let u = dn; while (u !== s) { const e = pe[u]; if (e < 0) break; volOut[e] += t; u = pn[u]; }
      }
    }
    return sptt;
  }

  // gravity demand load
  _aonGravity(volOut) {
    const N = this.nNodes, s = this.s, zn = this.zoneNode;
    const prod = new Float64Array(this.nZones), attr = new Float64Array(this.nZones);
    for (let z = 0; z < this.nZones; z++) {
      prod[z] = 1.2 * s.z_pop_tot[z] + 0.9 * s.z_worker[z] + 0.7 * s.z_student[z];
      attr[z] = (3 * s.z_retail_gfa[z] + 1.5 * s.z_office_gfa[z] + 0.6 * s.z_ind_gfa[z] + 2 * s.z_school_gfa[z]) / 100;
    }
    const zoneList = []; for (let z = 0; z < this.nZones; z++) if (zn[z] >= 0 && attr[z] > 0) zoneList.push(z);
    const oList = []; for (let z = 0; z < this.nZones; z++) if (zn[z] >= 0 && prod[z] > 0) oList.push(z);
    const { nodes: oSample, scale } = this._sampleOrigins(oList);
    const dist = new Float64Array(N), pe = new Int32Array(N), pn = new Int32Array(N);
    const hd = new Float64Array(this.csr.E + 1), hn = new Int32Array(this.csr.E + 1);
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

  assign(method, demand, progress) {
    const n = this.nLinks, vol = new Float32Array(n), aux = new Float32Array(n);
    const gap = [];
    if (method === "freeflow") { this.setWeights(this.fftime); this._aon(vol, demand); }
    else if (method === "incremental") {
      const incs = [0.4, 0.3, 0.2, 0.1]; let acc = new Float32Array(n);
      for (let s = 0; s < incs.length; s++) { this.setWeights(this.bpr(acc)); this._aon(aux, demand);
        for (let i = 0; i < n; i++) acc[i] += incs[s] * aux[i]; if (progress) progress(s + 1, incs.length, NaN); }
      vol.set(acc);
    } else if (method === "msa") {
      this.setWeights(this.fftime); this._aon(vol, demand);
      const K = this.settings.fwIters;
      for (let k = 1; k <= K; k++) { const t = this.bpr(vol); this.setWeights(t); const sptt = this._aon(aux, demand);
        const step = 1 / (k + 1); for (let i = 0; i < n; i++) vol[i] = (1 - step) * vol[i] + step * aux[i];
        const g = this._gap(vol, sptt); gap.push(g); if (progress) progress(k, K, g); }
    } else { // frank-wolfe
      this.setWeights(this.fftime); this._aon(vol, demand);
      const K = this.settings.fwIters;
      for (let k = 0; k < K; k++) { const t = this.bpr(vol); this.setWeights(t); const sptt = this._aon(aux, demand);
        const g = this._gap(vol, sptt, t); gap.push(g); if (progress) progress(k + 1, K, g);
        if (g < this.settings.fwGap) break;
        const lam = this._line(vol, aux); for (let i = 0; i < n; i++) vol[i] += lam * (aux[i] - vol[i]); }
    }
    this._finalize(vol, gap, demand, method);
    return this.result;
  }

  _finalize(vol, gap, demand, method) {
    const n = this.nLinks, ctime = this.bpr(vol), vc = new Float32Array(n), los = new Uint8Array(n);
    for (let i = 0; i < n; i++) { vc[i] = vol[i] / Math.max(this.cap[i], 1e-9); los[i] = losBand(vc[i]); }
    this.result = { volume: vol, ctime, fftime: this.fftime, cap: this.cap, vc, los,
                    gap: gap.slice(), demand, method };
    return this.result;
  }

  // Async, interruptible assignment: yields to the event loop between iterations
  // and calls onIter(k, K, gap) after each, with this.result kept current so the
  // map and KPIs can refresh live. Set this.abort = true to stop early.
  async assignProgressive(method, demand, onIter) {
    const n = this.nLinks, vol = new Float32Array(n), aux = new Float32Array(n), gap = [];
    this.abort = false;
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
      this.setWeights(this.fftime); this._aon(vol, demand); const K = this.settings.fwIters;
      for (let k = 1; k <= K; k++) { if (this.abort) break;
        const t = this.bpr(vol); this.setWeights(t); const sptt = this._aon(aux, demand);
        const a = 1 / (k + 1); for (let i = 0; i < n; i++) vol[i] = (1 - a) * vol[i] + a * aux[i];
        const g = this._gap(vol, sptt); gap.push(g); await emit(k, K, g); }
    } else {
      this.setWeights(this.fftime); this._aon(vol, demand); const K = this.settings.fwIters;
      for (let k = 0; k < K; k++) { if (this.abort) break;
        const t = this.bpr(vol); this.setWeights(t); const sptt = this._aon(aux, demand);
        const g = this._gap(vol, sptt, t); gap.push(g); await emit(k + 1, K, g);
        if (g < this.settings.fwGap) break;
        const lam = this._line(vol, aux); for (let i = 0; i < n; i++) vol[i] += lam * (aux[i] - vol[i]); }
    }
    return this.result;
  }

  _gap(vol, sptt, t) { t = t || this.bpr(vol); let tstt = 0; for (let i = 0; i < this.nLinks; i++) tstt += vol[i] * t[i];
    return sptt > 0 ? Math.abs((tstt - sptt) / sptt) : 0; }

  _line(x, y) {
    const d = (lam) => { let s = 0; const n = this.nLinks; for (let i = 0; i < n; i++) {
      const f = x[i] + lam * (y[i] - x[i]); const tt = this.fftime[i] * (1 + this.settings.bprAlpha * Math.pow(f / Math.max(this.cap[i], 1e-9), this.settings.bprBeta));
      s += (y[i] - x[i]) * tt; } return s; };
    let lo = 0, hi = 1; if (d(0) >= 0) return 0; if (d(1) <= 0) return 1;
    for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2, dm = d(m); if (Math.abs(dm) < 1e-3) return m; if (dm > 0) hi = m; else lo = m; }
    return (lo + hi) / 2;
  }

  kpis() {
    const r = this.result; if (!r) return null; let vmt = 0, vht = 0, delay = 0, wsum = 0, wvc = 0, over = 0, peak = 0, loaded = 0;
    for (let i = 0; i < this.nLinks; i++) { const v = r.volume[i]; if (v <= 0) continue; loaded++;
      const km = this.s.length[i] / 1000, h = r.ctime[i] / 3600, fh = r.fftime[i] / 3600;
      vmt += v * km; vht += v * h; delay += v * (h - fh); wsum += v; wvc += r.vc[i] * v; if (r.vc[i] > 1) over++; peak = Math.max(peak, r.vc[i]); }
    return { vmt, vht, speed: vht > 0 ? vmt / vht : 0, avgVc: wsum > 0 ? wvc / wsum : 0,
             delay, over, overShare: loaded ? over / loaded : 0, peak, loaded,
             gap: r.gap.length ? r.gap[r.gap.length - 1] : NaN };
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
    // candidate pairs within span via centroid grid
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
      const saveH = r.volume[i] * (tOld - tNew) / 3600;             // hourly veh-h saved
      const annual = saveH * this.settings.vot * this.settings.workingDays * 10; // peak->daily x working days
      const cost = 2 * (this.s.length[i] / 1000) * (LANEKM_COST[c.klass] || 4e6);
      out.push({ i, klass: c.klass, vc: c.vc, saveVehH: saveH, annualBenefit: annual, cost, bcr: cost > 0 ? annual / cost : Infinity }); }
    out.sort((a, b) => b.bcr - a.bcr);
    return out.slice(0, nTop);
  }

  upgradeLink(i, addLanes) { this.s.lanes[i] = Math.max(1, this.s.lanes[i] + addLanes); this._derive(); }
}

function losBand(vc) { const t = [0.6, 0.7, 0.8, 0.9, 1.0]; let b = 0; for (const x of t) { if (vc >= x) b++; else break; } return b; }
function orient(ax, ay, bx, by, cx, cy) { return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); }
function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = orient(cx, cy, dx, dy, ax, ay), d2 = orient(cx, cy, dx, dy, bx, by),
        d3 = orient(ax, ay, bx, by, cx, cy), d4 = orient(ax, ay, bx, by, dx, dy);
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}

export { FACILITY };
