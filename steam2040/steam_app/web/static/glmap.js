/* GPU network map — WebGL2 instanced line renderer.
 *
 * Each link segment is one instance of a unit quad expanded to a screen-space
 * ribbon in the vertex shader; per-link colour + width come from a data texture
 * so re-styling on assignment only re-uploads ~150k texels, not the geometry.
 * Handles the full 150k-link network at interactive frame rates.
 */

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;   // x: 0|1 endpoint, y: -1|+1 side
layout(location=1) in vec2 aP0;       // segment start (local metres)
layout(location=2) in vec2 aP1;       // segment end
layout(location=3) in float aLink;    // link index
uniform vec2 uResolution;
uniform vec2 uCenter;                 // world centre (metres)
uniform float uScale;                 // pixels per metre
uniform float uWidthScale;            // px per width-unit
uniform highp usampler2D uStyle;      // RGBA8UI per link (RGB=colour, A=width)
uniform int uTexW;
out vec4 vColor;
void main() {
  ivec2 t = ivec2(int(aLink) % uTexW, int(aLink) / uTexW);
  uvec4 s = texelFetch(uStyle, t, 0);
  vColor = vec4(float(s.r)/255.0, float(s.g)/255.0, float(s.b)/255.0, 1.0);
  float widthPx = max(float(s.a) / 28.0 * uWidthScale, 1.0);

  vec2 p0 = (aP0 - uCenter) * uScale;
  vec2 p1 = (aP1 - uCenter) * uScale;
  vec2 base = mix(p0, p1, aCorner.x);
  vec2 dir = p1 - p0;
  float len = length(dir);
  vec2 nrm = len > 0.0 ? vec2(-dir.y, dir.x) / len : vec2(0.0, 1.0);
  vec2 screen = base + nrm * (aCorner.y * widthPx * 0.5);
  // screen-space (origin centre, +y up) -> clip
  vec2 clip = screen / (uResolution * 0.5);
  gl_Position = vec4(clip.x, clip.y, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 outColor;
void main() { outColor = vColor; }`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

export class GLMap {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: true });
    if (!gl) throw new Error("WebGL2 not available");
    this.gl = gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    this.u = {
      res: gl.getUniformLocation(prog, "uResolution"),
      center: gl.getUniformLocation(prog, "uCenter"),
      scale: gl.getUniformLocation(prog, "uScale"),
      widthScale: gl.getUniformLocation(prog, "uWidthScale"),
      style: gl.getUniformLocation(prog, "uStyle"),
      texW: gl.getUniformLocation(prog, "uTexW"),
    };

    // view state (world metres, local-recentred)
    this.center = [0, 0];
    this.scale = 1;
    this.widthScale = 1.0;
    this.nSeg = 0;
    this.nLinks = 0;
    this.bounds = [0, 0, 1, 1];

    // unit-quad template (instanced)
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const corners = new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]);
    const cbuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cbuf);
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** Build per-segment instance buffers from offsets + flat xy. */
  setGeometry(offsets, xy, bounds) {
    const gl = this.gl;
    this.bounds = bounds;
    const nLinks = offsets.length - 1;
    this.nLinks = nLinks;
    // count segments
    let nSeg = 0;
    for (let i = 0; i < nLinks; i++) nSeg += Math.max(0, (offsets[i + 1] - offsets[i]) - 1);
    this.nSeg = nSeg;

    const p0 = new Float32Array(nSeg * 2);
    const p1 = new Float32Array(nSeg * 2);
    const link = new Float32Array(nSeg);
    // segment spatial grid for picking
    const cell = 400; // metres
    const grid = new Map();
    const segMid = new Float32Array(nSeg * 2);
    const segLink = new Int32Array(nSeg);

    let s = 0;
    for (let i = 0; i < nLinks; i++) {
      const a = offsets[i], b = offsets[i + 1];
      for (let k = a; k < b - 1; k++) {
        const x0 = xy[k * 2], y0 = xy[k * 2 + 1];
        const x1 = xy[(k + 1) * 2], y1 = xy[(k + 1) * 2 + 1];
        p0[s * 2] = x0; p0[s * 2 + 1] = y0;
        p1[s * 2] = x1; p1[s * 2 + 1] = y1;
        link[s] = i;
        const mx = (x0 + x1) * 0.5, my = (y0 + y1) * 0.5;
        segMid[s * 2] = mx; segMid[s * 2 + 1] = my;
        segLink[s] = i;
        const key = ((mx / cell) | 0) + "," + ((my / cell) | 0);
        let arr = grid.get(key);
        if (!arr) { arr = []; grid.set(key, arr); }
        arr.push(s);
        s++;
      }
    }
    this._grid = grid; this._cell = cell;
    this._segP0 = p0; this._segP1 = p1; this._segLink = segLink;

    this._instBuf(1, p0); this._instBuf(2, p1); this._instBuf(3, link, 1);
  }

  _instBuf(loc, data, size) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const sz = size || 2;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, sz, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(loc, 1);
    gl.bindVertexArray(null);
  }

  /** Upload per-link style bytes (RGBA+width, 5? no: server packs RGBA where A=width). */
  setStyle(bytes) {
    // server packs 5 bytes/link: RGB, A=255, W. We pack into RGBA8 where A=width.
    const gl = this.gl;
    const n = this.nLinks;
    const texW = 2048;
    const texH = Math.ceil(n / texW);
    const data = new Uint8Array(texW * texH * 4);
    for (let i = 0; i < n; i++) {
      data[i * 4] = bytes[i * 5];
      data[i * 4 + 1] = bytes[i * 5 + 1];
      data[i * 4 + 2] = bytes[i * 5 + 2];
      data[i * 4 + 3] = bytes[i * 5 + 4]; // width byte
    }
    if (!this.styleTex) this.styleTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.styleTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, texW, texH, 0,
                  gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, data);
    this.texW = texW;
    this.render();
  }

  resetView() {
    const [xmin, ymin, xmax, ymax] = this.bounds;
    const w = Math.max(xmax - xmin, 1), h = Math.max(ymax - ymin, 1);
    this.center = [w / 2, h / 2];
    this._fit(w, h);
  }

  _fit(w, h) {
    const r = this.canvas.width, c = this.canvas.height;
    this.scale = Math.min(r / w, c / h) * 0.92;
    this.render();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.render();
  }

  screenToWorld(sx, sy) {
    const dpr = window.devicePixelRatio || 1;
    const px = sx * dpr - this.canvas.width / 2;
    const py = -(sy * dpr - this.canvas.height / 2);
    return [px / this.scale + this.center[0], py / this.scale + this.center[1]];
  }

  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.scale *= factor;
    const after = this.screenToWorld(sx, sy);
    this.center[0] += before[0] - after[0];
    this.center[1] += before[1] - after[1];
    this.render();
  }

  panPixels(dx, dy) {
    const dpr = window.devicePixelRatio || 1;
    this.center[0] -= dx * dpr / this.scale;
    this.center[1] += dy * dpr / this.scale;
    this.render();
  }

  pick(sx, sy, tolPx = 7) {
    if (!this._grid) return -1;
    const [wx, wy] = this.screenToWorld(sx, sy);
    const tol = tolPx * (window.devicePixelRatio || 1) / this.scale;
    const cx = (wx / this._cell) | 0, cy = (wy / this._cell) | 0;
    let best = -1, bestd = tol * tol;
    for (let gx = cx - 1; gx <= cx + 1; gx++)
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const arr = this._grid.get(gx + "," + gy);
        if (!arr) continue;
        for (const s of arr) {
          const d2 = segDist2(wx, wy, this._segP0[s * 2], this._segP0[s * 2 + 1],
                              this._segP1[s * 2], this._segP1[s * 2 + 1]);
          if (d2 < bestd) { bestd = d2; best = this._segLink[s]; }
        }
      }
    return best;
  }

  render() {
    const gl = this.gl;
    gl.clearColor(0.098, 0.110, 0.133, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.nSeg || !this.styleTex) return;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.u.res, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.u.center, this.center[0], this.center[1]);
    gl.uniform1f(this.u.scale, this.scale);
    gl.uniform1f(this.u.widthScale, this.widthScale);
    gl.uniform1i(this.u.texW, this.texW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.styleTex);
    gl.uniform1i(this.u.style, 0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nSeg);
    if (this.onAfterRender) this.onAfterRender();
  }
}

function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}
