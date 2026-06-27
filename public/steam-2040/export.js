/* Exporters: link-results CSV, correspondence CSV, GeoJSON, and a genuine
 * zipped ESRI shapefile (built byte-for-byte in the browser). */
"use strict";

const PRJ = 'PROJCS["WGS_1984_UTM_Zone_40N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",57.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function exportLinkCSV(model, eng, vol) {
  const m = model, FAC = m.meta.facilities;
  const rows = ["link,from_node,to_node,class,ltype,lanes,length_m,capacity,volume,vc"];
  for (let l = 0; l < m.NL; l++) {
    const v = vol ? vol[l] : 0;
    const cap = eng.cap[l];
    rows.push([l, m.link.from[l], m.link.to[l], FAC[m.link.cls[l]], m.link.cls[l],
      m.link.lanes[l], m.link.len[l].toFixed(1), cap.toFixed(0),
      v.toFixed(2), (v / (cap || 1)).toFixed(3)].join(","));
  }
  download(new Blob([rows.join("\n")], { type: "text/csv" }), "steam_link_results.csv");
}

export function exportCorrespondence(corr) {
  const rows = ["old_zone,new_zone"];
  for (let z = 1; z < corr.length; z++) if (corr[z]) rows.push(z + "," + corr[z]);
  download(new Blob([rows.join("\n")], { type: "text/csv" }), "steam_correspondence.csv");
}

// convex hull (monotone chain) of [x,y] points
function hull(pts) {
  if (pts.length < 3) return pts.slice();
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  const up = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

function clusterPolys(model, members) {
  const polys = [];
  for (const [id, zs] of members) {
    const pts = [];
    for (const z of zs) {
      const x = model.zone.xy[2 * (z - 1)], y = model.zone.xy[2 * (z - 1) + 1];
      if (Number.isFinite(x) && Math.abs(y) > 1) pts.push([x, y]);
    }
    if (pts.length < 3) continue;
    let ring = hull(pts);
    // shapefile polygon rings are clockwise; close the ring
    if (ringArea(ring) > 0) ring = ring.reverse();
    ring.push(ring[0]);
    polys.push({ id, count: zs.length, ring });
  }
  return polys;
}
function ringArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0] * r[j][1] - r[j][0] * r[i][1]; } return a / 2; }

export function exportGeoJSON(model, members) {
  const polys = clusterPolys(model, members);
  const features = polys.map(p => ({
    type: "Feature",
    properties: { new_zone: p.id, members: p.count },
    geometry: { type: "Polygon", coordinates: [p.ring.map(c => [c[0], c[1]])] },
  }));
  const fc = {
    type: "FeatureCollection",
    crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::32640" } },
    features,
  };
  download(new Blob([JSON.stringify(fc)], { type: "application/geo+json" }), "steam_zones.geojson");
}

// ---- shapefile ----
export function exportShapefile(model, members) {
  const polys = clusterPolys(model, members);
  const N = polys.length;

  // bounds
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const p of polys) for (const c of p.ring) {
    if (c[0] < mnx) mnx = c[0]; if (c[0] > mxx) mxx = c[0];
    if (c[1] < mny) mny = c[1]; if (c[1] > mxy) mxy = c[1];
  }

  // record contents
  const recBufs = [];
  for (const p of polys) {
    const np = p.ring.length;
    const len = 4 + 32 + 4 + 4 + 4 + np * 16; // type+box+numParts+numPoints+parts(1)+points
    const b = new DataView(new ArrayBuffer(len));
    let o = 0;
    b.setInt32(o, 5, true); o += 4;            // shape type polygon
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const c of p.ring) { if (c[0] < bx0) bx0 = c[0]; if (c[0] > bx1) bx1 = c[0]; if (c[1] < by0) by0 = c[1]; if (c[1] > by1) by1 = c[1]; }
    b.setFloat64(o, bx0, true); o += 8; b.setFloat64(o, by0, true); o += 8;
    b.setFloat64(o, bx1, true); o += 8; b.setFloat64(o, by1, true); o += 8;
    b.setInt32(o, 1, true); o += 4;            // numParts
    b.setInt32(o, np, true); o += 4;           // numPoints
    b.setInt32(o, 0, true); o += 4;            // part 0 start
    for (const c of p.ring) { b.setFloat64(o, c[0], true); o += 8; b.setFloat64(o, c[1], true); o += 8; }
    recBufs.push(b.buffer);
  }

  // .shp
  let shpLen = 100;
  for (const r of recBufs) shpLen += 8 + r.byteLength;
  const shp = new DataView(new ArrayBuffer(shpLen));
  writeHeader(shp, shpLen / 2, mnx, mny, mxx, mxy);
  let off = 100;
  const shxRecs = [];
  for (let i = 0; i < recBufs.length; i++) {
    const r = recBufs[i];
    shp.setInt32(off, i + 1, false); off += 4;                 // record number (BE)
    shp.setInt32(off, r.byteLength / 2, false); off += 4;      // content length words (BE)
    shxRecs.push([(off - 8) / 2, r.byteLength / 2]);
    new Uint8Array(shp.buffer, off, r.byteLength).set(new Uint8Array(r)); off += r.byteLength;
  }

  // .shx
  const shxLen = 100 + 8 * N;
  const shx = new DataView(new ArrayBuffer(shxLen));
  writeHeader(shx, shxLen / 2, mnx, mny, mxx, mxy);
  let so = 100;
  for (const [pos, len] of shxRecs) { shx.setInt32(so, pos, false); so += 4; shx.setInt32(so, len, false); so += 4; }

  // .dbf  (fields: NEW_ZONE int, MEMBERS int)
  const dbf = buildDBF(polys);

  const files = {
    "steam_zones.shp": new Uint8Array(shp.buffer),
    "steam_zones.shx": new Uint8Array(shx.buffer),
    "steam_zones.dbf": dbf,
    "steam_zones.prj": new TextEncoder().encode(PRJ),
    "steam_zones.cpg": new TextEncoder().encode("UTF-8"),
  };
  download(new Blob([zip(files)], { type: "application/zip" }), "steam_zones_shapefile.zip");
}

function writeHeader(dv, totalWords, mnx, mny, mxx, mxy) {
  dv.setInt32(0, 9994, false);                 // file code
  dv.setInt32(24, totalWords, false);          // file length (words, BE)
  dv.setInt32(28, 1000, true);                 // version
  dv.setInt32(32, 5, true);                    // shape type polygon
  dv.setFloat64(36, mnx, true); dv.setFloat64(44, mny, true);
  dv.setFloat64(52, mxx, true); dv.setFloat64(60, mxy, true);
}

function buildDBF(polys) {
  const N = polys.length;
  const fields = [["NEW_ZONE", 11], ["MEMBERS", 11]];
  const headerLen = 32 + fields.length * 32 + 1;
  const recLen = 1 + fields.reduce((s, f) => s + f[1], 0);
  const buf = new Uint8Array(headerLen + recLen * N + 1);
  const dv = new DataView(buf.buffer);
  buf[0] = 0x03;
  buf[1] = 26; buf[2] = 1; buf[3] = 1;         // date (arbitrary)
  dv.setInt32(4, N, true);
  dv.setInt16(8, headerLen, true);
  dv.setInt16(10, recLen, true);
  let fo = 32;
  for (const [name, len] of fields) {
    for (let i = 0; i < name.length && i < 10; i++) buf[fo + i] = name.charCodeAt(i);
    buf[fo + 11] = "N".charCodeAt(0);          // numeric
    buf[fo + 16] = len; buf[fo + 17] = 0;      // length, decimals
    fo += 32;
  }
  buf[fo] = 0x0d;                              // header terminator
  let ro = headerLen;
  const pad = (s, len) => { s = String(s); return " ".repeat(Math.max(0, len - s.length)) + s; };
  for (const p of polys) {
    buf[ro++] = 0x20;                          // not deleted
    const f1 = pad(p.id, 11), f2 = pad(p.count, 11);
    for (let i = 0; i < 11; i++) buf[ro + i] = f1.charCodeAt(i);
    ro += 11;
    for (let i = 0; i < 11; i++) buf[ro + i] = f2.charCodeAt(i);
    ro += 11;
  }
  buf[ro] = 0x1a;                              // EOF
  return buf;
}

// ---- minimal ZIP (store, no compression) with CRC32 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function zip(files) {
  const enc = new TextEncoder();
  const locals = [], centrals = [];
  let offset = 0;
  for (const name of Object.keys(files)) {
    const data = files[name], nameB = enc.encode(name), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0, true);
    lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
    locals.push(new Uint8Array(lh.buffer), nameB, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0, true); ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, nameB.length, true); ch.setUint32(42, offset, true);
    centrals.push({ head: new Uint8Array(ch.buffer), name: nameB });
    offset += 30 + nameB.length + data.length;
  }
  const cdStart = offset;
  const centralChunks = [];
  let cdSize = 0;
  for (const c of centrals) { centralChunks.push(c.head, c.name); cdSize += c.head.length + c.name.length; }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, centrals.length, true); end.setUint16(10, centrals.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, cdStart, true);
  const parts = [...locals, ...centralChunks, new Uint8Array(end.buffer)];
  let total = 0; for (const p of parts) total += p.length;
  const out = new Uint8Array(total); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
