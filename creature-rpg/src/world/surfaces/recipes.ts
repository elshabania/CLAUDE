// Procedural PBR surface recipes (original, noise-based; no external textures).
// Each layer is a tileable 0..1 UV function evaluated once on the GPU by bake.ts and stored in two
// texture arrays: A = albedo (sRGB) + height, B = tangent normal xy + roughness + AO.
// All noise is *periodic* (lattice wrapped by an integer period) so every layer tiles seamlessly.

export const SURF = {
  grass: 0,
  dirt: 1,
  rock: 2,
  mud: 3,       // sand / mud / shore (palette tint decides which)
  snow: 4,
  ash: 5,
  litter: 6,    // forest floor: leaf litter, twigs, moss
  cobble: 7,
  plaster: 8,
  wood: 9,
  roof: 10,     // clay roof tiles (rows along U)
  canvas: 11,
  brick: 12,    // dressed stone blocks
  bark: 13,
  metal: 14,
  ice: 15,
} as const;
export type SurfId = (typeof SURF)[keyof typeof SURF];
export const SURF_COUNT = 16;

/** Metres covered by one texture tile per layer (world-space scale used by every sampler). */
export const SURF_TILE = [2.6, 2.8, 5.0, 3.0, 4.0, 3.0, 2.6, 3.2, 2.2, 2.0, 2.4, 1.5, 3.2, 1.6, 1.2, 3.0];
/** Normal strength per layer (height delta → slope). */
export const SURF_BUMP = [2.2, 3.0, 4.5, 2.2, 1.4, 3.0, 3.2, 5.5, 1.6, 2.6, 5.0, 1.2, 4.5, 5.0, 1.6, 1.4];
/**
 * Approximate mean albedo (sRGB) of each baked layer. Tinting divides by this so a palette/vertex colour
 * sets the *average* colour while the texture keeps its natural variation.
 */
export const SURF_MEAN = ['#5b6a34', '#6c5741', '#76726b', '#80735f', '#dfe6ee', '#3b3735', '#5b4730', '#817b70', '#cfc7b8', '#86684a', '#8e5a44', '#c3bcaf', '#8f887c', '#5d4e41', '#45454a', '#b3d4e0'];

export const NOISE_GLSL = /* glsl */ `
uint ih(uint x){ x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
float hs(ivec2 c, int s){ return float(ih(uint(c.x) * 1597334677u ^ ih(uint(c.y) * 3812015801u ^ ih(uint(s) + 77u)))) * (1.0 / 4294967295.0); }
ivec2 wrapc(ivec2 c, ivec2 P){ return ((c % P) + P) % P; }
ivec2 wrapc(ivec2 c, int P){ return wrapc(c, ivec2(P)); }
vec2 hs2(ivec2 c, int s){ return vec2(hs(c, s), hs(c, s + 101)); }
// periodic gradient noise, p in lattice units, period P cells per axis, roughly -1..1
float gnoise(vec2 p, ivec2 P, int s){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0); ivec2 c = ivec2(i);
  vec2 ga = hs2(wrapc(c, P), s) * 2.0 - 1.0, gb = hs2(wrapc(c + ivec2(1, 0), P), s) * 2.0 - 1.0;
  vec2 gc = hs2(wrapc(c + ivec2(0, 1), P), s) * 2.0 - 1.0, gd = hs2(wrapc(c + ivec2(1, 1), P), s) * 2.0 - 1.0;
  float a = dot(ga, f), b = dot(gb, f - vec2(1, 0)), d = dot(gc, f - vec2(0, 1)), e = dot(gd, f - vec2(1, 1));
  return 1.6 * mix(mix(a, b, u.x), mix(d, e, u.x), u.y);
}
// periodic fbm over the unit tile: uv 0..1, base frequency P cells (per axis)
float fbm(vec2 uv, ivec2 P, int oct, int s){
  float a = 0.5, v = 0.0; vec2 p = uv * vec2(P);
  for (int i = 0; i < 8; i++) { if (i >= oct) break; v += a * gnoise(p, P, s + i * 7); p *= 2.0; P *= 2; a *= 0.5; }
  return v;
}
float fbm(vec2 uv, int P, int oct, int s){ return fbm(uv, ivec2(P), oct, s); }
float ridged(vec2 uv, ivec2 P, int oct, int s){
  float a = 0.5, v = 0.0; vec2 p = uv * vec2(P);
  for (int i = 0; i < 8; i++) { if (i >= oct) break; v += a * (1.0 - abs(gnoise(p, P, s + i * 7))); p *= 2.0; P *= 2; a *= 0.5; }
  return v;
}
float ridged(vec2 uv, int P, int oct, int s){ return ridged(uv, ivec2(P), oct, s); }
// periodic Voronoi: x = F1, y = distance to cell border, z = cell hash, w = F2
vec4 voro(vec2 uv, ivec2 P, int s, float jit){
  vec2 p = uv * vec2(P); vec2 n = floor(p), f = fract(p); ivec2 ni = ivec2(n);
  vec2 mr = vec2(0); ivec2 mc = ivec2(0); float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 g = ivec2(i, j); vec2 o = 0.5 + (hs2(wrapc(ni + g, P), s) - 0.5) * jit; vec2 r = vec2(g) + o - f; float d = dot(r, r);
    if (d < md) { md = d; mr = r; mc = g; }
  }
  float bd = 8.0, f2 = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    ivec2 g = mc + ivec2(i, j); vec2 o = 0.5 + (hs2(wrapc(ni + g, P), s) - 0.5) * jit; vec2 r = vec2(g) + o - f;
    vec2 dr = r - mr; if (dot(dr, dr) > 1e-5) { bd = min(bd, dot(0.5 * (mr + r), normalize(dr))); f2 = min(f2, dot(r, r)); }
  }
  return vec4(sqrt(md), bd, hs(wrapc(ni + mc, P), s + 33), sqrt(f2));
}
vec4 voro(vec2 uv, int P, int s, float jit){ return voro(uv, ivec2(P), s, jit); }
// distance to a segment
float sdSeg(vec2 p, vec2 a, vec2 b, out float t){ vec2 pa = p - a, ba = b - a; t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * t); }
vec3 hex3(float r, float g, float b){ return pow(vec3(r, g, b), vec3(2.2)); }
`;

/**
 * Recipes: void surfN(vec2 uv, out vec3 col, out float h, out float rough, out float ao)
 * col is linear albedo, h 0..1, rough 0..1, ao 0..1.
 */
export const RECIPES_GLSL = /* glsl */ `
// ---- 0 grass: blade strokes over dark soil ----
void surf0(vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  float sn = fbm(uv, 6, 4, 11) * 0.5 + 0.5;
  col = mix(hex3(0.20, 0.15, 0.10), hex3(0.32, 0.25, 0.16), sn);
  h = 0.15 * sn; rough = 0.95; ao = 0.72;
  float dry = smoothstep(0.1, 0.6, fbm(uv, 3, 3, 12) * 0.5 + 0.5);
  for (int L = 0; L < 4; L++) {
    int P = 26 + L * 6; vec2 p = uv * float(P); vec2 n = floor(p);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      ivec2 c = wrapc(ivec2(n) + ivec2(i, j), P); vec2 rnd = hs2(c, 40 + L * 13);
      vec2 base = n + vec2(i, j) + rnd; float ang = (hs(c, 90 + L) - 0.5) * 2.4 + 1.5708 + float(L) * 0.7;
      float len = 1.1 + hs(c, 70 + L) * 0.9; vec2 tip = base + vec2(cos(ang), sin(ang)) * len;
      float t; float d = sdSeg(p, base, tip, t); float w = 0.16 * (1.0 - t * 0.85);
      if (d < w) {
        float bh = 0.35 + 0.15 * float(L) + 0.45 * t;
        if (bh > h) {
          float v = hs(c, 7 + L);
          vec3 g1 = mix(hex3(0.26, 0.36, 0.12), hex3(0.36, 0.46, 0.16), v);
          vec3 g2 = mix(hex3(0.55, 0.52, 0.28), hex3(0.46, 0.42, 0.22), v);
          col = mix(g1, g2, dry * step(0.55, hs(c, 3 + L))) * (0.72 + 0.4 * t) * (0.85 + 0.3 * (1.0 - d / w));
          h = bh; rough = 0.82 - 0.1 * t; ao = 0.7 + 0.3 * t;
        }
      }
    }
  }
}
// ---- 1 dirt: packed earth, pebbles, grit ----
void surf1(vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  float n = fbm(uv, 5, 5, 21) * 0.5 + 0.5;
  float n2 = fbm(uv, 24, 3, 22) * 0.5 + 0.5;
  col = mix(hex3(0.34, 0.26, 0.18), hex3(0.50, 0.41, 0.30), n) * (0.85 + 0.3 * n2);
  h = 0.35 * n + 0.1 * n2; rough = 0.93; ao = 1.0;
  // compacted smooth patches
  float comp = smoothstep(0.55, 0.75, fbm(uv, 3, 3, 23) * 0.5 + 0.5);
  col = mix(col, col * 1.12, comp); h = mix(h, 0.3, comp * 0.6);
  vec4 v = voro(uv, 30, 24, 0.9);
  float pr = 0.18 + 0.2 * v.z;
  if (v.x < pr && v.z > 0.35) { float k = 1.0 - v.x / pr; col = mix(hex3(0.40, 0.37, 0.33), hex3(0.62, 0.58, 0.52), hs(ivec2(v.z * 9999.0), 1)) * (0.75 + 0.35 * k); h = 0.45 + 0.4 * sqrt(k); rough = 0.7; }
  else if (v.x < pr * 1.35 && v.z > 0.35) { ao = 0.7; }
  vec4 g = voro(uv, 90, 25, 1.0);
  if (g.x < 0.22 && g.z > 0.6) { col *= 0.7 + 0.6 * g.z; h += 0.05; }
}
// ---- 2 rock: stratified, cracked, lichen ----
void surf2(vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  vec2 w = vec2(fbm(uv, 3, 3, 31), fbm(uv + 0.37, 3, 3, 32)) * 0.08;
  float strata = sin((uv.y + w.y + fbm(uv, 2, 2, 33) * 0.1) * 6.2831 * 9.0) * 0.5 + 0.5;
  float r = ridged(uv + w, 4, 6, 34);
  float n = fbm(uv, 8, 5, 35) * 0.5 + 0.5;
  h = r * 0.55 + strata * 0.15 + n * 0.3;
  vec4 v = voro(uv + w, 6, 36, 0.85);
  float crack = 1.0 - smoothstep(0.0, 0.045, v.y);
  h -= crack * 0.35; h += (v.z - 0.5) * 0.12;
  col = mix(hex3(0.36, 0.35, 0.33), hex3(0.62, 0.60, 0.56), clamp(h, 0.0, 1.0));
  col *= mix(vec3(1.05, 0.98, 0.9), vec3(0.92, 0.97, 1.05), v.z);
  float lich = smoothstep(0.62, 0.8, fbm(uv, 6, 4, 37) * 0.5 + 0.5) * smoothstep(0.4, 0.7, h);
  col = mix(col, hex3(0.55, 0.56, 0.36), lich * 0.7);
  col *= 1.0 - crack * 0.6;
  rough = 0.82 - 0.12 * n + lich * 0.1; ao = 1.0 - crack * 0.7;
  h = clamp(h, 0.0, 1.0);
}
// ---- 3 sand / mud: ripples, grains, wet puddles ----
void surf3(vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  float n = fbm(uv, 4, 4, 41);
  float rip = sin((uv.y * 11.0 + uv.x * 2.0 + n * 0.9) * 6.2831) * 0.5 + 0.5;
  float grain = hs(ivec2(uv * 1024.0), 42);
  h = 0.4 + n * 0.25 + rip * 0.12 + grain * 0.03;
  col = mix(hex3(0.42, 0.37, 0.29), hex3(0.60, 0.54, 0.43), h) * (0.92 + 0.16 * grain);
  float wet = smoothstep(0.52, 0.66, fbm(uv, 3, 3, 43) * 0.5 + 0.5);
  col *= 1.0 - wet * 0.42; h = mix(h, 0.28, wet); rough = mix(0.92, 0.22, wet); ao = 1.0;
  vec4 v = voro(uv, 40, 44, 1.0);
  if (v.x < 0.12 && v.z > 0.8) { col = hex3(0.55, 0.53, 0.5); h += 0.1; }
}
// ---- 4 snow: soft drifts, sparkle ----
void surf4(vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  float n = fbm(uv, 3, 5, 51) * 0.5 + 0.5;
  float d = fbm(uv, 12, 3, 52) * 0.5 + 0.5;
  h = n * 0.8 + d * 0.2;
  col = mix(hex3(0.78, 0.84, 0.92), hex3(0.95, 0.96, 0.98), smoothstep(0.2, 0.8, h));
  float sp = hs(ivec2(uv * 512.0), 53);
  rough = 0.62 - step(0.985, sp) * 0.4; ao = 1.0; col += step(0.992, sp) * 0.2;
}
// ---- 5 volcanic ash: dark grit, cinders, rust flecks ----
void surf5(vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  float n = fbm(uv, 5, 5, 61) * 0.5 + 0.5;
  col = mix(hex3(0.12, 0.11, 0.11), hex3(0.28, 0.26, 0.25), n);
  h = n * 0.4; rough = 0.95; ao = 1.0;
  vec4 v = voro(uv, 22, 62, 0.9);
  float pr = 0.25 + 0.2 * v.z;
  if (v.x < pr && v.z > 0.4) { float k = 1.0 - v.x / pr; col = mix(hex3(0.16, 0.14, 0.14), hex3(0.36, 0.2, 0.14), step(0.85, v.z)) * (0.7 + 0.5 * k); h = 0.45 + 0.4 * k; rough = 0.8; }
  vec4 c = voro(uv, 5, 63, 0.9);
  float crack = 1.0 - smoothstep(0.0, 0.03, c.y); h -= crack * 0.3; col *= 1.0 - crack * 0.5; ao = 1.0 - crack * 0.5;
  h = clamp(h, 0.0, 1.0);
}
// ---- 6 forest floor: layered leaves, twigs, moss ----
void surf6(vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  float sn = fbm(uv, 6, 4, 71) * 0.5 + 0.5;
  col = mix(hex3(0.16, 0.12, 0.08), hex3(0.26, 0.2, 0.13), sn); h = 0.1 * sn; rough = 0.9; ao = 0.7;
  for (int L = 0; L < 4; L++) {
    int P = 16 + L * 4; vec2 p = uv * float(P); vec2 n = floor(p);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      ivec2 c = wrapc(ivec2(n) + ivec2(i, j), P); vec2 ctr = n + vec2(i, j) + hs2(c, 80 + L);
      float a = hs(c, 81 + L) * 6.2831; vec2 q = p - ctr; q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
      float e = length(q / vec2(0.62, 0.3));
      if (e < 1.0 && hs(c, 82 + L) > 0.15) {
        float lh = 0.3 + 0.18 * float(L) + 0.1 * (1.0 - e);
        if (lh > h) {
          float k = hs(c, 83 + L);
          vec3 lc = k < 0.35 ? hex3(0.45, 0.28, 0.12) : k < 0.6 ? hex3(0.55, 0.42, 0.2) : k < 0.8 ? hex3(0.34, 0.22, 0.12) : hex3(0.42, 0.4, 0.2);
          float vein = 1.0 - smoothstep(0.0, 0.04, abs(q.y)) * 0.3;
          col = lc * vein * (0.8 + 0.3 * (1.0 - e)); h = lh; rough = 0.78; ao = 0.75 + 0.25 * float(L) / 3.0;
        }
      }
    }
  }
  float t; vec2 p = uv * 7.0; vec2 n = floor(p);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 c = wrapc(ivec2(n) + ivec2(i, j), 7); vec2 b = n + vec2(i, j) + hs2(c, 91); float a = hs(c, 92) * 6.2831;
    float d = sdSeg(p, b, b + vec2(cos(a), sin(a)) * 0.9, t);
    if (d < 0.035 && hs(c, 93) > 0.4) { col = hex3(0.3, 0.22, 0.15) * (0.8 + 0.4 * (1.0 - d / 0.035)); h = 0.95; ao = 1.0; }
  }
  float moss = smoothstep(0.6, 0.75, fbm(uv, 4, 4, 94) * 0.5 + 0.5);
  col = mix(col, hex3(0.24, 0.34, 0.12) * (0.8 + 0.4 * sn), moss); rough = mix(rough, 0.95, moss);
}
// ---- 7 cobblestones ----
void surf7(vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  vec2 w = vec2(fbm(uv, 8, 2, 101), fbm(uv + 0.5, 8, 2, 102)) * 0.012;
  vec4 v = voro(uv + w, 10, 103, 0.75);
  float joint = 0.06 + 0.02 * fbm(uv, 20, 2, 104);
  float st = smoothstep(joint, joint + 0.08, v.y);
  float n = fbm(uv, 32, 3, 105) * 0.5 + 0.5;
  vec3 sc = mix(hex3(0.42, 0.40, 0.37), hex3(0.66, 0.62, 0.55), v.z) * (0.85 + 0.25 * n);
  sc *= mix(vec3(1.0), vec3(1.06, 0.98, 0.9), step(0.7, fract(v.z * 7.0)));
  vec3 jc = hex3(0.28, 0.24, 0.19) * (0.8 + 0.4 * n);
  col = mix(jc, sc, st);
  h = st * (0.5 + 0.35 * sqrt(clamp(v.y * 3.0, 0.0, 1.0))) + n * 0.08;
  rough = mix(0.95, 0.7 - 0.1 * n, st); ao = mix(0.55, 1.0, st);
}
// ---- 8 plaster: lime render, stains, hairline cracks ----
void surf8(vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  float n = fbm(uv, 4, 5, 111) * 0.5 + 0.5;
  float f = fbm(uv, 40, 3, 112) * 0.5 + 0.5;
  col = vec3(0.66) * (0.9 + 0.12 * n) * (0.96 + 0.06 * f);
  float stain = smoothstep(0.55, 0.8, fbm(uv, 2, 4, 113) * 0.5 + 0.5);
  col *= 1.0 - stain * vec3(0.18, 0.2, 0.24);
  h = n * 0.5 + f * 0.25; rough = 0.9; ao = 1.0;
  vec4 v = voro(uv, 3, 114, 1.0);
  float cr = (1.0 - smoothstep(0.0, 0.008, v.y)) * step(0.7, fbm(uv, 6, 2, 115) * 0.5 + 0.5);
  col *= 1.0 - cr * 0.5; h -= cr * 0.2;
}
// ---- 9 wood planks along U ----
void surf9(vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  float rows = 8.0; float r = floor(uv.y * rows); float fy = fract(uv.y * rows);
  float off = hs(ivec2(int(r), 0), 121);
  float seg = floor(fract(uv.x + off) * 2.0);
  float id = hs(ivec2(int(r), int(seg)), 122);
  float grain = fbm(vec2(uv.x + id, uv.y), ivec2(2, 16), 3, 123) * 0.5;
  float lines = sin((uv.y * rows * 7.0 + grain * 6.0 + id * 20.0) * 6.2831) * 0.5 + 0.5;
  float fine = fbm(uv, ivec2(4, 64), 3, 124) * 0.5 + 0.5;
  col = mix(hex3(0.40, 0.29, 0.19), hex3(0.62, 0.48, 0.33), 0.35 + 0.4 * id + 0.25 * lines * fine);
  float edge = smoothstep(0.0, 0.06, fy) * smoothstep(1.0, 0.94, fy);
  float ex = fract(fract(uv.x + off) * 2.0); float endj = smoothstep(0.0, 0.01, ex) * smoothstep(1.0, 0.99, ex);
  edge *= endj;
  h = 0.4 + 0.4 * edge + lines * 0.08 + id * 0.08; col *= 0.55 + 0.45 * edge;
  rough = 0.75 + 0.15 * fine; ao = 0.5 + 0.5 * edge;
  // knots
  vec4 k = voro(uv, 5, 125, 1.0); if (k.x < 0.07 && k.z > 0.7) { col *= 0.6; h -= 0.1; }
}
// ---- 10 clay roof tiles, rows along U, overlapping downwards in -V ----
void surf10(vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  float rows = 10.0; float r = floor(uv.y * rows); float fy = fract(uv.y * rows);
  float cols = 10.0; float x = uv.x * cols + (mod(r, 2.0) * 0.5); float c = floor(x); float fx = fract(x);
  float id = hs(ivec2(int(mod(c, cols)), int(r)), 131);
  float bump = sin(fx * 3.14159);       // barrel shape across the tile
  float lip = smoothstep(0.0, 0.12, fy);  // lower edge of the tile above casts a step
  h = 0.25 + 0.5 * fy * lip + 0.25 * bump;
  float n = fbm(uv, 16, 3, 132) * 0.5 + 0.5;
  col = mix(hex3(0.50, 0.28, 0.20), hex3(0.66, 0.40, 0.28), id) * (0.8 + 0.3 * n) * (0.7 + 0.3 * bump);
  float gap = smoothstep(0.0, 0.05, fx) * smoothstep(1.0, 0.95, fx);
  col *= 0.35 + 0.65 * lip * gap; ao = 0.35 + 0.65 * lip * gap;
  float moss = smoothstep(0.62, 0.8, fbm(uv, 4, 3, 133) * 0.5 + 0.5) * (1.0 - fy);
  col = mix(col, hex3(0.3, 0.33, 0.18), moss * 0.6);
  rough = 0.7 + 0.2 * n;
}
// ---- 11 canvas / cloth: weave ----
void surf11(vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  float P = 180.0; float wx = sin(uv.x * P * 6.2831) * 0.5 + 0.5, wy = sin(uv.y * P * 6.2831) * 0.5 + 0.5;
  float sel = step(0.5, fract((floor(uv.x * P * 2.0) + floor(uv.y * P * 2.0)) * 0.5));
  h = mix(wx, wy, sel) * 0.5 + 0.25;
  float n = fbm(uv, 4, 4, 141) * 0.5 + 0.5;
  col = vec3(0.6) * (0.88 + 0.18 * n) * (0.9 + 0.1 * h);
  rough = 0.95; ao = 0.85 + 0.15 * h;
}
// ---- 12 dressed stone blocks (ashlar, running bond) ----
void surf12(vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  float rows = 8.0; float r = floor(uv.y * rows); float fy = fract(uv.y * rows);
  float o = hs(ivec2(int(r), 3), 151);
  float cols = 4.0 + floor(hs(ivec2(int(r), 4), 152) * 3.0);
  float x = fract(uv.x + o) * cols; float c = floor(x); float fx = fract(x);
  float id = hs(ivec2(int(c), int(r)), 153);
  vec2 w = vec2(fbm(uv, 16, 3, 154), fbm(uv + 0.3, 16, 3, 155)) * 0.02;
  float ex = min(fx, 1.0 - fx) / cols * 1.0; float ey = min(fy, 1.0 - fy) / rows;
  float e = min(ex * cols / rows * 0.9, ey) * rows + w.x * 4.0;
  float m = smoothstep(0.035, 0.09, e);
  float n = fbm(uv, 12, 4, 156) * 0.5 + 0.5;
  col = mix(hex3(0.46, 0.44, 0.40), hex3(0.66, 0.62, 0.56), id * 0.7 + n * 0.3);
  col = mix(hex3(0.36, 0.34, 0.31), col, m);
  h = m * (0.6 + 0.2 * n + 0.2 * smoothstep(0.09, 0.25, e)); rough = mix(0.95, 0.78, m); ao = mix(0.5, 1.0, m);
}
// ---- 13 bark: vertical furrows (V along the trunk) ----
void surf13(vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  vec2 q = vec2(uv.x + fbm(uv, 2, 3, 161) * 0.06, uv.y);
  float f = ridged(q, ivec2(10, 3), 4, 162);
  float plates = voro(q, ivec2(7, 3), 163, 0.9).y;
  h = clamp(f * 0.75 + smoothstep(0.0, 0.1, plates) * 0.35 - 0.1, 0.0, 1.0);
  float n = fbm(uv, 8, 3, 164) * 0.5 + 0.5;
  col = mix(hex3(0.20, 0.16, 0.13), hex3(0.46, 0.40, 0.34), h) * (0.85 + 0.3 * n);
  float moss = smoothstep(0.6, 0.78, fbm(uv, 3, 3, 165) * 0.5 + 0.5) * (1.0 - h);
  col = mix(col, hex3(0.28, 0.34, 0.14), moss * 0.7);
  rough = 0.92; ao = 0.45 + 0.55 * h;
}
// ---- 14 wrought metal: hammered, rust ----
void surf14(vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  vec4 v = voro(uv, 14, 171, 1.0);
  float n = fbm(uv, 6, 4, 172) * 0.5 + 0.5;
  h = 0.5 + v.x * 0.3 + n * 0.1;
  col = vec3(0.12, 0.12, 0.13) * (0.85 + 0.3 * v.z);
  float rust = smoothstep(0.6, 0.8, fbm(uv, 3, 5, 173) * 0.5 + 0.5);
  col = mix(col, hex3(0.42, 0.22, 0.12), rust); rough = mix(0.45, 0.9, rust); ao = 1.0;
}
// ---- 15 ice: pale, cracked, smooth ----
void surf15(vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  float n = fbm(uv, 3, 5, 181) * 0.5 + 0.5;
  vec4 v = voro(uv, 5, 182, 0.9);
  float cr = 1.0 - smoothstep(0.0, 0.02, v.y);
  col = mix(hex3(0.55, 0.72, 0.8), hex3(0.82, 0.9, 0.95), n); col = mix(col, vec3(0.95), cr * 0.7);
  h = n * 0.6 - cr * 0.2 + 0.2; rough = 0.12 + 0.1 * n + cr * 0.4; ao = 1.0;
}
void surfEval(int L, vec2 uv, out vec3 col, out float h, out float rough, out float ao){
  if (L == 0) surf0(uv, col, h, rough, ao);
  else if (L == 1) surf1(uv, col, h, rough, ao);
  else if (L == 2) surf2(uv, col, h, rough, ao);
  else if (L == 3) surf3(uv, col, h, rough, ao);
  else if (L == 4) surf4(uv, col, h, rough, ao);
  else if (L == 5) surf5(uv, col, h, rough, ao);
  else if (L == 6) surf6(uv, col, h, rough, ao);
  else if (L == 7) surf7(uv, col, h, rough, ao);
  else if (L == 8) surf8(uv, col, h, rough, ao);
  else if (L == 9) surf9(uv, col, h, rough, ao);
  else if (L == 10) surf10(uv, col, h, rough, ao);
  else if (L == 11) surf11(uv, col, h, rough, ao);
  else if (L == 12) surf12(uv, col, h, rough, ao);
  else if (L == 13) surf13(uv, col, h, rough, ao);
  else if (L == 14) surf14(uv, col, h, rough, ao);
  else surf15(uv, col, h, rough, ao);
}
`;
