/* Transport engine: CSR graph, Dijkstra tree-load, assignment methods,
 * gravity demand, zone aggregation, and the improvement recommender.
 * Pure typed-array compute, designed to run single-threaded in the browser. */
"use strict";

const yield_ = () => new Promise(r => setTimeout(r, 0));

export class Engine {
  constructor(model) {
    this.m = model;
    this.cap = new Float32Array(model.NL);    // veh/h
    this.t0 = new Float32Array(model.NL);     // free-flow hours
    this._recalcLink();
    this._buildGraph();
    this._productions = null;
    this._attractions = null;
  }

  _recalcLink() {
    const m = this.m, M = m.meta;
    for (let l = 0; l < m.NL; l++) {
      const c = m.link.cls[l];
      const spd = M.freeSpeed[c] || 30;
      this.t0[l] = (m.link.len[l] / 1000) / spd;            // hours
      this.cap[l] = (M.capPerLane[c] || 600) * m.link.lanes[l];
    }
  }

  _buildGraph() {
    const m = this.m, NN = m.NN, NL = m.NL;
    const head = new Int32Array(NN + 1);
    for (let l = 0; l < NL; l++) { head[m.link.from[l] + 1]++; head[m.link.to[l] + 1]++; }
    for (let i = 0; i < NN; i++) head[i + 1] += head[i];
    const adjTo = new Int32Array(2 * NL), adjLink = new Int32Array(2 * NL);
    const cur = head.slice(0, NN);
    for (let l = 0; l < NL; l++) {
      const a = m.link.from[l], b = m.link.to[l];
      adjTo[cur[a]] = b; adjLink[cur[a]] = l; cur[a]++;
      adjTo[cur[b]] = a; adjLink[cur[b]] = l; cur[b]++;
    }
    this.g = { head, adjTo, adjLink };
    // reusable Dijkstra scratch. dist/heap-keys are Float64: travel times are
    // tiny (~5e-5 h) and accumulate over long paths, so Float32 would lose the
    // resolution to tell settled nodes apart and spuriously re-relax them.
    this.dist = new Float64Array(NN).fill(Infinity);
    this.prevLink = new Int32Array(NN).fill(-1);
    this.prevNode = new Int32Array(NN).fill(-1);
    this.nodeFlow = new Float64Array(NN);
    // the heap uses lazy deletion, so it can hold up to one entry per directed
    // edge at once — size it accordingly or out-of-bounds writes corrupt it
    this.hN = new Int32Array(2 * NL + 1);
    this.hD = new Float64Array(2 * NL + 1);
  }

  bpr(l, vol) {
    const x = vol / (this.cap[l] || 1);
    return this.t0[l] * (1 + 0.15 * x * x * x * x);
  }

  // ---- Dijkstra from a node; fills dist/prev*, returns settle order array ----
  _dijkstra(src, tt, order) {
    const { head, adjTo, adjLink } = this.g;
    const dist = this.dist, prevLink = this.prevLink, prevNode = this.prevNode;
    const hN = this.hN, hD = this.hD;
    let hs = 0;
    dist[src] = 0;
    hN[hs] = src; hD[hs] = 0; hs++;
    let on = 0;
    while (hs > 0) {
      // pop min
      const u = hN[0], ud = hD[0];
      hs--;
      if (hs > 0) {
        hN[0] = hN[hs]; hD[0] = hD[hs];
        let i = 0;
        while (true) {
          let lft = 2 * i + 1, rgt = 2 * i + 2, sm = i;
          if (lft < hs && hD[lft] < hD[sm]) sm = lft;
          if (rgt < hs && hD[rgt] < hD[sm]) sm = rgt;
          if (sm === i) break;
          const tn = hN[i]; hN[i] = hN[sm]; hN[sm] = tn;
          const td = hD[i]; hD[i] = hD[sm]; hD[sm] = td;
          i = sm;
        }
      }
      if (ud > dist[u]) continue;
      order[on++] = u;
      for (let e = head[u]; e < head[u + 1]; e++) {
        const v = adjTo[e], l = adjLink[e];
        const nd = ud + tt[l];
        if (nd < dist[v]) {
          dist[v] = nd; prevLink[v] = l; prevNode[v] = u;
          // push
          let i = hs; hN[i] = v; hD[i] = nd; hs++;
          while (i > 0) {
            const p = (i - 1) >> 1;
            if (hD[p] <= hD[i]) break;
            const tn = hN[p]; hN[p] = hN[i]; hN[i] = tn;
            const td = hD[p]; hD[p] = hD[i]; hD[i] = td;
            i = p;
          }
        }
      }
    }
    return on;
  }

  _resetScratch(order, n) {
    for (let i = 0; i < n; i++) {
      const u = order[i];
      this.dist[u] = Infinity; this.prevLink[u] = -1; this.prevNode[u] = -1; this.nodeFlow[u] = 0;
    }
  }

  // ---- choose sampled origins and the scale factor ----
  _sample(demand, sample) {
    const m = this.m, nz = m.matrix.n;
    // productions per origin
    const prod = this._origProductions(demand);
    const origins = [];
    for (let z = 1; z <= nz; z++) if (prod[z] > 0 && m.zone.node[z - 1] >= 0) origins.push(z);
    origins.sort((a, b) => prod[b] - prod[a]);
    const k = Math.min(sample, origins.length);
    const chosen = origins.slice(0, k);
    let totAll = 0, totSel = 0;
    for (let z = 1; z <= nz; z++) totAll += prod[z];
    for (const z of chosen) totSel += prod[z];
    const scale = totSel > 0 ? totAll / totSel : 1;
    return { chosen, scale, prod };
  }

  _origProductions(demand) {
    const m = this.m, nz = m.matrix.n;
    const p = new Float32Array(nz + 1);
    if (demand === "gravity") {
      this._buildGravity();
      for (let z = 1; z <= nz; z++) p[z] = this._productions[z] || 0;
    } else if (demand === "ones") {
      for (let z = 1; z <= nz; z++) if (m.zone.node[z - 1] >= 0) p[z] = nz;
    } else {
      const off = m.matrix.off, trips = m.matrix.trips;
      for (let o = 1; o <= nz; o++) {
        let s = 0; for (let i = off[o - 1]; i < off[o]; i++) s += trips[i];
        p[o] = s;
      }
    }
    return p;
  }

  // gravity productions/attractions
  _buildGravity() {
    if (this._productions) return;
    const m = this.m, nz = m.matrix.n;
    const P = new Float32Array(nz + 1), A = new Float32Array(nz + 1);
    let popSum = 0;
    for (let z = 1; z <= nz; z++) {
      const pop = m.zone.a("POP_TOT", z);
      P[z] = pop; popSum += pop;
      A[z] = 1.2 * m.zone.a("WORKER", z) + 0.6 * m.zone.a("STUDENT", z)
        + 1.0e-3 * (m.zone.a("RETAIL_GFA", z) + 0.7 * m.zone.a("OFFICE_GFA", z)
          + 0.5 * m.zone.a("IND_GFA", z) + 0.4 * m.zone.a("SCHOOL_GFA", z));
    }
    // scale productions toward ~16.7M daily
    const target = 16.7e6, cur = popSum || 1;
    const f = target / cur;
    for (let z = 1; z <= nz; z++) P[z] *= f;
    this._productions = P; this._attractions = A;
  }

  // ---- all-or-nothing load given link times tt -> aux volumes ----
  async _aon(tt, ctx, onProg) {
    const m = this.m, NL = m.NL, nz = m.matrix.n;
    const aux = new Float32Array(NL);
    const order = ctx.order;
    const { chosen } = ctx;
    let done = 0;
    for (const o of chosen) {
      const srcNode = m.zone.node[o - 1];
      if (srcNode < 0) { done++; continue; }
      const n = this._dijkstra(srcNode, tt, order);
      // deposit destination trips at their nodes
      // deposit only at destination nodes Dijkstra actually reached, else the
      // flow can never cascade back up the tree (and would leak across origins)
      if (ctx.demand === "matrix") {
        const off = m.matrix.off, dest = m.matrix.dest, trips = m.matrix.trips;
        for (let i = off[o - 1]; i < off[o]; i++) {
          const dn = m.zone.node[dest[i] - 1];
          if (dn >= 0 && this.dist[dn] < Infinity) this.nodeFlow[dn] += trips[i];
        }
      } else if (ctx.demand === "gravity") {
        this._loadGravity(o, nz);
      } else { // ones
        for (let d = 1; d <= nz; d++) {
          if (d === o) continue;
          const dn = m.zone.node[d - 1];
          if (dn >= 0 && this.dist[dn] < Infinity) this.nodeFlow[dn] += 1;
        }
      }
      // cascade flow up the tree
      for (let i = n - 1; i >= 0; i--) {
        const u = order[i];
        const f = this.nodeFlow[u];
        if (f !== 0) {
          const pl = this.prevLink[u];
          if (pl >= 0) { aux[pl] += f; this.nodeFlow[this.prevNode[u]] += f; }
        }
      }
      this._resetScratch(order, n);
      done++;
      if ((done & 31) === 0) { if (onProg) onProg(done / chosen.length); await yield_(); }
    }
    // apply demand scale + period
    const sp = ctx.scale * ctx.period;
    for (let l = 0; l < NL; l++) aux[l] *= sp;
    return aux;
  }

  _loadGravity(o, nz) {
    const m = this.m, P = this._productions, A = this._attractions;
    const ox = m.zone.xy[2 * (o - 1)], oy = m.zone.xy[2 * (o - 1) + 1];
    const beta = 0.06; // per km
    // single pass: weights then normalise
    let wsum = 0;
    const w = this._gw || (this._gw = new Float32Array(nz + 1));
    for (let d = 1; d <= nz; d++) {
      if (d === o || m.zone.node[d - 1] < 0) { w[d] = 0; continue; }
      const dx = (m.zone.xy[2 * (d - 1)] - ox) / 1000, dy = (m.zone.xy[2 * (d - 1) + 1] - oy) / 1000;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const val = A[d] * Math.exp(-beta * dist);
      w[d] = val; wsum += val;
    }
    if (wsum <= 0) return;
    const Po = P[o] / wsum;
    for (let d = 1; d <= nz; d++) {
      if (w[d] <= 0) continue;
      const dn = m.zone.node[d - 1];
      if (dn >= 0 && this.dist[dn] < Infinity) this.nodeFlow[dn] += Po * w[d];
    }
  }

  // ---- public: run an assignment ----
  async assign(opts) {
    const m = this.m;
    const method = opts.method || "fw";
    const demand = opts.demand || "matrix";
    const period = opts.period === "24h" ? 1.0 : opts.period === "offpeak" ? 0.04 : 0.1;
    const sample = opts.sample || 400;
    const onProg = opts.onProgress || (() => {});

    const { chosen, scale } = this._sample(demand, sample);
    const ctx = { chosen, scale, period, demand, order: new Int32Array(m.NN) };

    const NL = m.NL;
    let vol = new Float32Array(NL);
    let tt = this.t0.slice();
    let gap = NaN;

    const aonTimes = () => { for (let l = 0; l < NL; l++) tt[l] = this.bpr(l, vol[l]); };

    if (method === "freeflow") {
      onProg(0, "free-flow load");
      vol = await this._aon(this.t0, ctx, p => onProg(p, "loading"));
    } else if (method === "msa") {
      vol = await this._aon(this.t0, ctx, p => onProg(p * 0.25, "msa init"));
      const K = 5;
      for (let k = 2; k <= K; k++) {
        aonTimes();
        const aux = await this._aon(tt, ctx, p => onProg((k - 1) / K + p / K, "msa " + k + "/" + K));
        const a = 1 / k;
        for (let l = 0; l < NL; l++) vol[l] += a * (aux[l] - vol[l]);
      }
    } else if (method === "incremental") {
      const slices = [0.4, 0.3, 0.2, 0.1];
      for (let s = 0; s < slices.length; s++) {
        aonTimes();
        const fr = slices[s];
        const aux = await this._aon(tt, { ...ctx, scale: ctx.scale * fr }, p => onProg(s / slices.length + p / slices.length, "slice " + (s + 1)));
        for (let l = 0; l < NL; l++) vol[l] += aux[l];
      }
    } else { // frank-wolfe
      vol = await this._aon(this.t0, ctx, p => onProg(p * 0.2, "fw init"));
      const K = opts.iters || 6;
      for (let k = 1; k <= K; k++) {
        aonTimes();
        const aux = await this._aon(tt, ctx, p => onProg(0.2 + (k - 1 + p) / K * 0.8, "fw " + k + "/" + K));
        // line search
        const lam = this._lineSearch(vol, aux);
        for (let l = 0; l < NL; l++) vol[l] += lam * (aux[l] - vol[l]);
        // gap at updated point
        aonTimes();
        let tstt = 0, sptt = 0;
        for (let l = 0; l < NL; l++) { tstt += vol[l] * tt[l]; sptt += aux[l] * tt[l]; }
        gap = tstt > 0 ? (tstt - sptt) / tstt : 0;
        onProg(0.2 + k / K * 0.8, "gap " + gap.toExponential(2));
        if (gap < 1e-4) break;
      }
    }

    // final times & KPIs
    for (let l = 0; l < NL; l++) tt[l] = this.bpr(l, vol[l]);
    const kpi = this._kpis(vol, tt, gap);
    this.volume = vol; this.time = tt;
    return { volume: vol, time: tt, kpi };
  }

  _lineSearch(vol, aux) {
    const NL = this.m.NL;
    const D = (lam) => {
      let s = 0;
      for (let l = 0; l < NL; l++) {
        const v = vol[l] + lam * (aux[l] - vol[l]);
        s += (aux[l] - vol[l]) * this.bpr(l, v);
      }
      return s;
    };
    if (D(0) >= 0) return 0;
    if (D(1) <= 0) return 1;
    let lo = 0, hi = 1;
    for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (D(mid) > 0) hi = mid; else lo = mid; }
    return (lo + hi) / 2;
  }

  _kpis(vol, tt, gap) {
    const m = this.m, NL = m.NL;
    let vht = 0, vkt = 0, vcsum = 0, vcn = 0, peak = 0, over = 0, loaded = 0;
    for (let l = 0; l < NL; l++) {
      if (vol[l] <= 0) continue;
      loaded++;
      vht += vol[l] * tt[l];
      vkt += vol[l] * m.link.len[l] / 1000;
      const vc = vol[l] / (this.cap[l] || 1);
      vcsum += vc; vcn++;
      if (vc > peak) peak = vc;
      if (vc > 1) over++;
    }
    return {
      vht, vkt, avgVC: vcn ? vcsum / vcn : 0, peakVC: peak,
      overCount: over, overShare: loaded ? over / loaded : 0,
      loaded, gap,
    };
  }

  vcArray(vol) {
    const NL = this.m.NL, out = new Float32Array(NL);
    for (let l = 0; l < NL; l++) out[l] = vol[l] / (this.cap[l] || 1);
    return out;
  }

  // ---- improvement recommender ----
  recommend(vol, tt) {
    const m = this.m, NL = m.NL;
    const VOT = 40;            // value of time, AED/veh-h
    const DAILY = 10;         // AM-peak hour -> daily factor
    const DAYS = 300;
    const COST = [9, 7, 6, 5, 4, 3, 4]; // M AED per lane-km by class
    const cand = [];
    for (let l = 0; l < NL; l++) {
      const vc = vol[l] / (this.cap[l] || 1);
      if (vc <= 1 || vol[l] <= 0) continue;
      const lanes = m.link.lanes[l];
      const newCap = (this.cap[l] / lanes) * (lanes + 2);
      const x1 = vol[l] / this.cap[l], x2 = vol[l] / newCap;
      const dt = this.t0[l] * 0.15 * (x1 ** 4 - x2 ** 4);   // hours saved per veh
      const saveHrYr = vol[l] * dt * DAILY * DAYS;
      const benefit = saveHrYr * VOT;                        // AED/yr
      const km = m.link.len[l] / 1000;
      const cost = COST[m.link.cls[l]] * 1e6 * 2 * km;       // +2 lanes
      const ann = cost * 0.08;                               // annualised capital
      const bcr = ann > 0 ? benefit / ann : 0;
      cand.push({ link: l, vc, saveHrYr, cost, bcr, lanes, cls: m.link.cls[l] });
    }
    cand.sort((a, b) => b.bcr - a.bcr);
    return cand.slice(0, 12);
  }

  widenLink(l, addLanes) {
    this.m.link.lanes[l] = Math.min(255, this.m.link.lanes[l] + addLanes);
    const c = this.m.link.cls[l];
    this.cap[l] = (this.m.meta.capPerLane[c] || 600) * this.m.link.lanes[l];
  }

  // ---- zone aggregation (contiguity + barrier + span) ----
  async aggregate(opts, onProg) {
    const m = this.m, nz = m.matrix.n;          // aggregate the routable zones
    const target = opts.target || 1800;
    const maxSpan = (opts.maxSpan || 9) * 1000; // m
    const barrierClasses = opts.barrier === "freeway" ? new Set([0])
      : opts.barrier === "arterial" ? new Set([0, 1, 2])
      : new Set([0, 1, 2, 3]);                  // collectors-and-above (default)

    // valid zones with coords
    const zones = [];
    for (let z = 1; z <= nz; z++) {
      const x = m.zone.xy[2 * (z - 1)], y = m.zone.xy[2 * (z - 1) + 1];
      if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(y) > 1) zones.push(z);
    }
    // kNN edges via grid
    const GS = 3000;
    const grid = new Map();
    const key = (cx, cy) => cx * 100000 + cy;
    const cellOf = (z) => [Math.floor(m.zone.xy[2 * (z - 1)] / GS), Math.floor(m.zone.xy[2 * (z - 1) + 1] / GS)];
    for (const z of zones) { const [cx, cy] = cellOf(z); const k = key(cx, cy); (grid.get(k) || grid.set(k, []).get(k)).push(z); }

    const barrierGrid = this._barrierGrid(barrierClasses, GS);

    // candidate edges
    const edges = [];
    for (const z of zones) {
      const [cx, cy] = cellOf(z);
      const zx = m.zone.xy[2 * (z - 1)], zy = m.zone.xy[2 * (z - 1) + 1];
      const near = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const arr = grid.get(key(cx + dx, cy + dy)); if (!arr) continue;
        for (const w of arr) if (w > z) {
          const ddx = m.zone.xy[2 * (w - 1)] - zx, ddy = m.zone.xy[2 * (w - 1) + 1] - zy;
          near.push([ddx * ddx + ddy * ddy, w]);
        }
      }
      near.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < Math.min(6, near.length); i++) {
        const w = near[i][1], d = Math.sqrt(near[i][0]);
        if (this._crossesBarrier(z, w, barrierGrid, GS, barrierClasses)) continue;
        edges.push([d, z, w]);
      }
    }
    edges.sort((a, b) => a[0] - b[0]);

    // union-find with cluster bbox + count
    const parent = new Int32Array(m.Z + 1);
    const bb = {}; // root -> [minx,miny,maxx,maxy]
    for (const z of zones) {
      parent[z] = z;
      const x = m.zone.xy[2 * (z - 1)], y = m.zone.xy[2 * (z - 1) + 1];
      bb[z] = [x, y, x, y];
    }
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    let count = zones.length;
    const span = (b) => Math.hypot(b[2] - b[0], b[3] - b[1]);

    let processed = 0;
    for (const [, a, c] of edges) {
      if (count <= target) break;
      const ra = find(a), rc = find(c);
      if (ra === rc) continue;
      const ba = bb[ra], bc = bb[rc];
      const nb = [Math.min(ba[0], bc[0]), Math.min(ba[1], bc[1]), Math.max(ba[2], bc[2]), Math.max(ba[3], bc[3])];
      if (span(nb) > maxSpan) continue;
      parent[rc] = ra; bb[ra] = nb; delete bb[rc]; count--;
      if ((++processed & 1023) === 0 && onProg) { onProg(1 - (count - target) / Math.max(1, zones.length - target)); await yield_(); }
    }

    // relabel roots -> 1..K
    const corr = new Int32Array(m.Z + 1);     // old zone -> new id (0 = not aggregated)
    const rootId = new Map();
    let next = 1;
    for (const z of zones) {
      const r = find(z);
      let id = rootId.get(r);
      if (id === undefined) { id = next++; rootId.set(r, id); }
      corr[z] = id;
    }
    return { corr, count: next - 1, members: this._members(corr, m.Z) };
  }

  _members(corr, Z) {
    const map = new Map();
    for (let z = 1; z <= Z; z++) { const id = corr[z]; if (!id) continue; (map.get(id) || map.set(id, []).get(id)).push(z); }
    return map;
  }

  _barrierGrid(classes, GS) {
    const m = this.m, grid = new Map();
    const key = (cx, cy) => cx * 100000 + cy;
    for (let l = 0; l < m.NL; l++) {
      if (!classes.has(m.link.cls[l])) continue;
      const cx = Math.floor(((m.link.bMinX[l] + m.link.bMaxX[l]) / 2) / GS);
      const cy = Math.floor(((m.link.bMinY[l] + m.link.bMaxY[l]) / 2) / GS);
      const k = key(cx, cy); (grid.get(k) || grid.set(k, []).get(k)).push(l);
    }
    return grid;
  }

  _crossesBarrier(z, w, bgrid, GS, classes) {
    const m = this.m;
    const ax = m.zone.xy[2 * (z - 1)], ay = m.zone.xy[2 * (z - 1) + 1];
    const bx = m.zone.xy[2 * (w - 1)], by = m.zone.xy[2 * (w - 1) + 1];
    const c0 = Math.floor(Math.min(ax, bx) / GS), c1 = Math.floor(Math.max(ax, bx) / GS);
    const r0 = Math.floor(Math.min(ay, by) / GS), r1 = Math.floor(Math.max(ay, by) / GS);
    const key = (cx, cy) => cx * 100000 + cy;
    let tests = 0;
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      const arr = bgrid.get(key(cx, cy)); if (!arr) continue;
      for (const l of arr) {
        if (tests++ > 400) return false;
        const g = m.link.geomXY, off = m.link.geomOff;
        for (let i = off[l] * 2; i < off[l + 1] * 2 - 2; i += 2) {
          if (segInt(ax, ay, bx, by, g[i], g[i + 1], g[i + 2], g[i + 3])) return true;
        }
      }
    }
    return false;
  }
}

function segInt(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = cross(cx, cy, dx, dy, ax, ay), d2 = cross(cx, cy, dx, dy, bx, by);
  const d3 = cross(ax, ay, bx, by, cx, cy), d4 = cross(ax, ay, bx, by, dx, dy);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function cross(ax, ay, bx, by, px, py) { return (bx - ax) * (py - ay) - (by - ay) * (px - ax); }
