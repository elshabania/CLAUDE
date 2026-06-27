/* Loads the gzipped typed-array blobs and exposes the in-memory model. */
"use strict";

const DATA = "data/";

async function loadGz(name, Type) {
  const res = await fetch(DATA + name + ".gz");
  if (!res.ok) throw new Error("fetch " + name + ": " + res.status);
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Type(buf);
}

export async function loadModel(onStep) {
  const step = onStep || (() => {});
  step("decoding network");
  const meta = await (await fetch(DATA + "meta.json")).json();

  const [nodeXY, lFrom, lTo, lClass, lLanes, lLen, gOff, gXY] = await Promise.all([
    loadGz("node_xy.f32", Float32Array),
    loadGz("link_from.i32", Int32Array),
    loadGz("link_to.i32", Int32Array),
    loadGz("link_class.u8", Uint8Array),
    loadGz("link_lanes.u8", Uint8Array),
    loadGz("link_len.f32", Float32Array),
    loadGz("geom_off.i32", Int32Array),
    loadGz("geom_xy.f32", Float32Array),
  ]);

  step("decoding zones");
  const [zXY, zAttr, zInt, zNode] = await Promise.all([
    loadGz("zone_xy.f32", Float32Array),
    loadGz("zone_attr.f32", Float32Array),
    loadGz("zone_int.i16", Int16Array),
    loadGz("zone_node.i32", Int32Array),
  ]);

  step("decoding matrix");
  const [mOff, mDest, mTrips] = await Promise.all([
    loadGz("matrix_off.i32", Int32Array),
    loadGz("matrix_dest.u16", Uint16Array),
    loadGz("matrix_trips.f32", Float32Array),
  ]);

  const NL = meta.counts.links, NN = meta.counts.nodes, Z = meta.counts.zones;

  // per-link bbox + midpoint, precomputed once for culling and labels
  const bMinX = new Float32Array(NL), bMinY = new Float32Array(NL);
  const bMaxX = new Float32Array(NL), bMaxY = new Float32Array(NL);
  for (let l = 0; l < NL; l++) {
    let s = gOff[l] * 2, e = gOff[l + 1] * 2;
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (let i = s; i < e; i += 2) {
      const x = gXY[i], y = gXY[i + 1];
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
    }
    bMinX[l] = mnx; bMinY[l] = mny; bMaxX[l] = mxx; bMaxY[l] = mxy;
  }

  // attribute accessor: name -> Float32 column view
  const attrIdx = {};
  meta.attrNames.forEach((n, k) => attrIdx[n] = k);
  const intIdx = {};
  meta.intNames.forEach((n, k) => intIdx[n] = k);

  const model = {
    meta, NL, NN, Z,
    node: { xy: nodeXY },
    link: {
      from: lFrom, to: lTo, cls: lClass, lanes: lLanes, len: lLen,
      geomOff: gOff, geomXY: gXY,
      bMinX, bMinY, bMaxX, bMaxY,
    },
    zone: {
      xy: zXY, attr: zAttr, int: zInt, node: zNode,
      attrIdx, intIdx,
      // value of attribute "name" for zone z (1-based)
      a(name, z) { return zAttr[attrIdx[name] * Z + (z - 1)]; },
      iv(name, z) { return zInt[intIdx[name] * Z + (z - 1)]; },
    },
    matrix: { off: mOff, dest: mDest, trips: mTrips, n: meta.counts.matrixZones },
  };
  return model;
}
