/* Canvas2D map renderer: holds geometry (sent once), receives binary result
   arrays, paints links/zones with pan/zoom and zoom-based level-of-detail. */
const STEAM = (window.STEAM = window.STEAM || {});

STEAM.Map = class {
  constructor(canvas, minimap) {
    this.canvas = canvas;
    this.minimap = minimap;
    this.ctx = canvas.getContext('2d');
    this.geom = null;             // {links, zones, bounds}
    this.result = null;           // {volume, vc, los}
    this.mode = 'class';          // class | volume | vc | los | diff
    this.view = { x: 0, y: 0, scale: 1 };
    this.hover = null;
    this._initEvents();
    this.resize();
    window.addEventListener('resize', () => { this.resize(); this.draw(); });
  }

  // class -> base colour (network workspace)
  classColor(c) {
    return ({ fwy: '#e0524a', ramp: '#e0884a', art: '#c8a24a', coll: '#6f8fb8',
      rural: '#7c9a6f', local: '#566784', junc: '#8a6fa8' })[c] || '#566784';
  }
  // links visible at the current zoom (LOD): hide local/junc when zoomed out
  lodVisible(c) {
    if (this.view.scale > 0.55) return true;
    if (this.view.scale > 0.25) return c !== 'local' && c !== 'junc';
    return c === 'fwy' || c === 'ramp' || c === 'art';
  }

  setGeometry(g) {
    this.geom = g;
    this.result = null;
    this.fit();
  }
  setResult(r) { this.result = r; this.draw(); }
  setMode(m) { this.mode = m; this.draw(); }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w; this.H = h;
  }

  fit() {
    if (!this.geom || !this.geom.bounds) return;
    const [minx, miny, maxx, maxy] = this.geom.bounds;
    const bw = maxx - minx || 1, bh = maxy - miny || 1;
    const pad = 0.9;
    this.view.scale = Math.min(this.W / bw, this.H / bh) * pad;
    this.view.x = this.W / 2 - (minx + maxx) / 2 * this.view.scale;
    this.view.y = this.H / 2 + (miny + maxy) / 2 * this.view.scale; // flip Y
    this.draw();
  }

  // world (metres) -> screen
  tx(x) { return x * this.view.scale + this.view.x; }
  ty(y) { return -y * this.view.scale + this.view.y; }   // flip Y up
  inv(sx, sy) {
    return [(sx - this.view.x) / this.view.scale,
            -(sy - this.view.y) / this.view.scale];
  }

  draw() {
    const ctx = this.ctx, css = getComputedStyle(document.documentElement);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.fillStyle = css.getPropertyValue('--bg').trim();
    ctx.fillRect(0, 0, this.W, this.H);
    if (!this.geom) return;
    const unloaded = css.getPropertyValue('--link-unloaded').trim();

    const links = this.geom.links;
    for (let i = 0; i < links.length; i++) {
      const L = links[i];
      if (!this.lodVisible(L.class)) continue;
      const pts = L.pts;
      ctx.beginPath();
      ctx.moveTo(this.tx(pts[0]), this.ty(pts[1]));
      for (let k = 2; k < pts.length; k += 2)
        ctx.lineTo(this.tx(pts[k]), this.ty(pts[k + 1]));

      let color = this.classColor(L.class), width = 1;
      if (this.result && this.mode !== 'class') {
        const v = this.result.volume[i], vc = this.result.vc[i];
        if (this.mode === 'volume') {
          const t = Math.min(1, v / (this._volMax || 1));
          color = STEAM.palette.volume(t); width = 0.6 + t * 5;
        } else if (this.mode === 'vc') {
          color = STEAM.palette.los(losFromVc(vc)); width = 0.6 + Math.min(2, vc) * 2.2;
        } else if (this.mode === 'los') {
          color = STEAM.palette.los(this.result.los[i]); width = 1.6;
        } else if (this.mode === 'diff' && this.result.diff) {
          color = STEAM.palette.diff(this.result.diff[i]); width = 0.6 + Math.abs(this.result.diff[i]) * 4;
        }
      } else {
        color = (this.result ? this.classColor(L.class) : unloaded);
      }
      if (this.hover === i) { color = '#fff'; width += 1.5; }
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    }

    // zones (zoom-gated bubbles)
    if (this.geom.zones && this.view.scale > 0.15) {
      for (const z of this.geom.zones) {
        const r = Math.max(2, Math.sqrt(z.pop) * 0.04 * Math.min(2, this.view.scale));
        ctx.beginPath();
        ctx.arc(this.tx(z.x), this.ty(z.y), r, 0, 7);
        ctx.fillStyle = 'rgba(200,162,74,.22)';
        ctx.strokeStyle = 'rgba(200,162,74,.55)'; ctx.lineWidth = 0.6;
        ctx.fill(); ctx.stroke();
      }
    }
    this.drawMinimap();
  }

  drawMinimap() {
    if (!this.minimap || !this.geom.bounds) return;
    const m = this.minimap, mc = m.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    m.width = m.clientWidth * dpr; m.height = m.clientHeight * dpr;
    mc.setTransform(dpr, 0, 0, dpr, 0, 0);
    const [minx, miny, maxx, maxy] = this.geom.bounds;
    const bw = maxx - minx || 1, bh = maxy - miny || 1;
    const s = Math.min(m.clientWidth / bw, m.clientHeight / bh) * 0.92;
    const ox = (m.clientWidth - bw * s) / 2, oy = (m.clientHeight - bh * s) / 2;
    mc.clearRect(0, 0, m.clientWidth, m.clientHeight);
    mc.strokeStyle = '#46597a'; mc.lineWidth = 0.4;
    for (const L of this.geom.links) {
      if (L.class === 'local' || L.class === 'coll') continue;
      const p = L.pts;
      mc.beginPath();
      mc.moveTo(ox + (p[0]-minx)*s, oy + (maxy-p[1])*s);
      for (let k=2;k<p.length;k+=2) mc.lineTo(ox+(p[k]-minx)*s, oy+(maxy-p[k+1])*s);
      mc.stroke();
    }
    // viewport rect
    const [wx0, wy0] = this.inv(0, this.H), [wx1, wy1] = this.inv(this.W, 0);
    mc.strokeStyle = '#c8a24a'; mc.lineWidth = 1;
    mc.strokeRect(ox+(wx0-minx)*s, oy+(maxy-wy1)*s, (wx1-wx0)*s, (wy1-wy0)*s);
  }

  computeVolMax() {
    if (!this.result) return;
    let mx = 1; for (const v of this.result.volume) if (v > mx) mx = v;
    this._volMax = mx;
  }

  _initEvents() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener('mousedown', e => drag = { x: e.clientX, y: e.clientY });
    window.addEventListener('mouseup', () => drag = null);
    window.addEventListener('mousemove', e => {
      if (drag) {
        this.view.x += e.clientX - drag.x;
        this.view.y += e.clientY - drag.y;
        drag = { x: e.clientX, y: e.clientY };
        this.draw();
      }
    });
    c.addEventListener('mousemove', e => this._hoverTest(e));
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const [wx, wy] = this.inv(mx, my);
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      this.view.scale *= f;
      this.view.x = mx - wx * this.view.scale;
      this.view.y = my + wy * this.view.scale;
      this.draw();
    }, { passive: false });
  }

  _hoverTest(e) {
    if (!this.geom) return;
    const rect = this.canvas.getBoundingClientRect();
    const [wx, wy] = this.inv(e.clientX - rect.left, e.clientY - rect.top);
    let best = -1, bestD = 18 / this.view.scale;
    const links = this.geom.links;
    for (let i = 0; i < links.length; i++) {
      const p = links[i].pts;
      for (let k = 0; k < p.length - 2; k += 2) {
        const d = distToSeg(wx, wy, p[k], p[k+1], p[k+2], p[k+3]);
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    if (best !== this.hover) { this.hover = best; this.draw();
      if (this._onHover) this._onHover(best); }
  }
  onHover(fn) { this._onHover = fn; }
};

function losFromVc(vc) {
  const b = [0.6,0.7,0.8,0.9,1.0]; let i = 0;
  for (const x of b) if (vc >= x) i++;
  return i;
}
function distToSeg(px, py, x0, y0, x1, y1) {
  const dx = x1-x0, dy = y1-y0, l2 = dx*dx+dy*dy;
  let t = l2 ? ((px-x0)*dx + (py-y0)*dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x0+t*dx, cy = y0+t*dy;
  return Math.hypot(px-cx, py-cy);
}
