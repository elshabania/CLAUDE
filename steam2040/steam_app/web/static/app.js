/* STEAM 2040 Studio — browser controller. */
import { GLMap } from "/static/glmap.js";

const $ = (id) => document.getElementById(id);
const getJSON = (u) => fetch(u).then(r => r.json());
const postJSON = (u, b) => fetch(u, { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(b || {}) }).then(async r => { if (!r.ok) throw new Error((await r.json()).detail || r.statusText); return r.json(); });
const getBin = (u) => fetch(u).then(r => r.arrayBuffer());

const COLOR_MODES = [["class", "Facility class"], ["volume", "Volume"],
  ["vc", "v/c ratio"], ["los", "LOS A–F"], ["difference", "Scenario Δ"]];

let map, selectedLink = -1, zonesXY = null, zoneLabels = null, aggActive = false;

async function init() {
  const canvas = $("map");
  try { map = new GLMap(canvas); }
  catch (e) { $("status").textContent = "WebGL2 unavailable: " + e.message; return; }
  map.onAfterRender = drawOverlay;

  COLOR_MODES.forEach(([v, t]) => $("color").add(new Option(t, v)));
  const st = await getJSON("/api/status");
  st.methods.forEach(m => $("method").add(new Option(m, m)));
  st.demand_sources.forEach(s => $("demand").add(new Option(s, s)));
  $("method").value = st.methods[3];
  ["district", "areatype", "urban_rura", "metro_access", "lu_class"].forEach(k => {
    const l = document.createElement("label");
    l.innerHTML = `<input type="checkbox" value="${k}" ${k === "district" ? "checked" : ""}>${k}`;
    $("agg-keys").appendChild(l);
  });
  $("backend").textContent = st.assistant_backend;
  updateStatus(st);
  wire();
  window.addEventListener("resize", () => { map.resize(); sizeOverlay(); });
  if (st.network > 0) await loadNetwork();
  else $("status").textContent = "No network found. Set STEAM_DATA_DIR or use /api/load.";
}

function updateStatus(st) {
  $("status").textContent = `${st.network.toLocaleString()} links · ${st.nodes.toLocaleString()} nodes · ` +
    `${st.zones.toLocaleString()} zones · ${st.od_pairs.toLocaleString()} OD`;
}

async function loadNetwork() {
  $("status").textContent = "loading network geometry…";
  const meta = await getJSON("/api/network/meta");
  const [off, xy] = await Promise.all([
    getBin("/api/network/offsets").then(b => new Int32Array(b)),
    getBin("/api/network/xy").then(b => new Float32Array(b)),
  ]);
  const [xmin, ymin, xmax, ymax] = meta.bounds;
  map.resize(); sizeOverlay();
  map.setGeometry(off, xy, [0, 0, xmax - xmin, ymax - ymin]);
  await setColor($("color").value);
  map.resetView();
  buildLegend();
  updateStatus(await getJSON("/api/status"));
}

async function setColor(mode) {
  if (!map.nLinks) return;
  const bytes = new Uint8Array(await getBin("/api/style/" + mode));
  map.setStyle(bytes);
  buildLegend();
}

function buildLegend() {
  const m = $("color").value;
  $("legend").textContent = COLOR_MODES.find(c => c[0] === m)?.[1] || m;
}

/* ---- assignment ---- */
async function runAssignment() {
  $("run").disabled = true;
  try {
    await postJSON("/api/assignment/run",
      { method: $("method").value, demand_source: $("demand").value });
  } catch (e) { $("run").disabled = false; return alert(e.message); }
  poll();
}

async function poll() {
  const s = await getJSON("/api/assignment/state");
  $("progress").firstElementChild.style.width = (100 * s.iter / Math.max(s.max, 1)) + "%";
  if (s.gap != null) $("gap").textContent = "gap: " + s.gap.toExponential(2);
  if (!s.done) return setTimeout(poll, 350);
  $("run").disabled = false;
  if (s.error) return alert("Assignment failed: " + s.error);
  renderKPIs(s.kpis);
  await loadTopLinks();
  if ($("color").value === "class") { $("color").value = "volume"; }
  await setColor($("color").value);
}

function renderKPIs(rows) {
  $("kpis").innerHTML = (rows || []).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
}

async function loadTopLinks() {
  const { rows } = await getJSON("/api/top_links?n=15");
  $("toplinks").querySelector("tbody").innerHTML = rows.map(r =>
    `<tr><td>${r.link_id}</td><td>${r.class}</td><td>${r.vc.toFixed(2)}</td><td>${r.los}</td></tr>`).join("");
}

/* ---- aggregation ---- */
async function aggregate() {
  $("aggregate").disabled = true;
  const keys = [...$("agg-keys").querySelectorAll("input:checked")].map(c => c.value);
  try {
    const st = await postJSON("/api/aggregate", {
      target_zone_count: +$("agg-target").value, barrier_threshold: $("agg-barrier").value,
      max_span_m: +$("agg-span").value, method: $("agg-method").value, keys,
    });
    $("agg-stats").textContent =
      `${st.zones_in.toLocaleString()} → ${st.clusters_out.toLocaleString()} clusters · ${st.merge_steps.toLocaleString()} merges · mean ${st.mean_cluster_size.toFixed(2)}, max ${st.max_cluster_size}`;
    if (!zonesXY) zonesXY = new Float32Array(await getBin("/api/zones/xy"));
    zoneLabels = new Int32Array(await getBin("/api/aggregation/labels"));
    aggActive = true; map.render();
  } catch (e) { alert(e.message); }
  $("aggregate").disabled = false;
}

function clusterColor(id) {
  if (id < 0) return null;
  const h = (id * 2654435761) >>> 0;
  return `rgb(${(h >> 16) & 255},${((h >> 8) & 255) | 40},${(h & 255) | 40})`;
}

function sizeOverlay() {
  const o = $("overlay"), dpr = window.devicePixelRatio || 1;
  o.width = o.clientWidth * dpr; o.height = o.clientHeight * dpr;
}

function drawOverlay() {
  const o = $("overlay"); const ctx = o.getContext("2d");
  ctx.clearRect(0, 0, o.width, o.height);
  if (!aggActive || !zonesXY || !zoneLabels) return;
  const dpr = window.devicePixelRatio || 1;
  const W = o.width, H = o.height, sc = map.scale, cx = map.center[0], cy = map.center[1];
  for (let i = 0; i < zoneLabels.length; i++) {
    const lab = zoneLabels[i]; if (lab < 0) continue;
    const wx = zonesXY[i * 2], wy = zonesXY[i * 2 + 1];
    const sx = (wx - cx) * sc + W / 2, sy = -(wy - cy) * sc + H / 2;
    if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
    ctx.fillStyle = clusterColor(lab);
    ctx.fillRect(sx - 1.5 * dpr, sy - 1.5 * dpr, 3 * dpr, 3 * dpr);
  }
}

/* ---- interaction ---- */
function wire() {
  $("color").onchange = () => setColor($("color").value);
  $("reset").onclick = () => map.resetView();
  $("mode").onchange = () => {
    const agg = $("mode").value === "aggregation";
    document.querySelector('[data-panel="assignment"]').hidden = agg;
    document.querySelector('[data-panel="aggregation"]').hidden = !agg;
  };
  $("run").onclick = runAssignment;
  $("aggregate").onclick = aggregate;
  $("agg-qa").onclick = async () => {
    try { const q = await getJSON("/api/aggregation/qa");
      alert(`Non-contiguous: ${q.n_non_contiguous}\nBarrier-spanning: ${q.n_barrier_spanning}`); }
    catch (e) { alert(e.message); }
  };
  $("upgrade").onclick = async () => {
    if (selectedLink < 0) return alert("Right-click a link to select it.");
    const d = await getJSON("/api/link/" + selectedLink);
    await postJSON("/api/scenario/upgrade", { link_id: d.link_id, add_lanes: +$("addlanes").value });
    $("sel").textContent = `Queued +${$("addlanes").value} lanes on link ${d.link_id}`;
  };
  $("scenario").onclick = async () => {
    try {
      const d = await postJSON("/api/scenario/run",
        { method: $("method").value, demand_source: $("demand").value });
      $("color").value = "difference"; await setColor("difference");
      alert(`ΔVHT ${fmt(d.vht_delta)} veh-h\nΔVMT ${fmt(d.vmt_delta)} veh-km\n` +
        `Δover-capacity ${d.overcap_delta}\nCost-benefit ${fmt(d.cost_benefit)}`);
    } catch (e) { alert(e.message); }
  };
  $("undo").onclick = () => postJSON("/api/scenario/undo");
  $("recommend").onclick = async () => {
    try {
      const r = await postJSON("/api/recommend", { method: $("method").value, demand_source: $("demand").value });
      alert(r.recommendations.slice(0, 6).map(x =>
        `${x.name}\n  VHT saved ${fmt(x.vht_saved)}, BCR ${x.bcr == null ? "∞" : x.bcr.toFixed(3)}`).join("\n")
        + `\n\nProgramme: ${r.programme.length} projects`);
    } catch (e) { alert(e.message); }
  };
  $("chatsend").onclick = sendChat;
  $("chatinput").addEventListener("keydown", e => { if (e.key === "Enter") sendChat(); });

  const c = $("map");
  let dragging = false, lx = 0, ly = 0, hoverT = 0, inflight = false;
  c.addEventListener("pointerdown", e => { dragging = true; lx = e.clientX; ly = e.clientY; c.setPointerCapture(e.pointerId); });
  c.addEventListener("pointerup", () => dragging = false);
  c.addEventListener("contextmenu", e => e.preventDefault());
  c.addEventListener("pointermove", async e => {
    if (dragging) { map.panPixels(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY; return; }
    const now = performance.now();
    if (now - hoverT < 70 || inflight) return; hoverT = now;
    const i = map.pick(e.offsetX, e.offsetY);
    if (i < 0) { $("tip").hidden = true; return; }
    inflight = true;
    try {
      const d = await getJSON("/api/link/" + i);
      $("tip").hidden = false; $("tip").style.left = (e.offsetX + 14) + "px"; $("tip").style.top = (e.offsetY + 14) + "px";
      $("tip").innerHTML = `<b>Link ${d.link_id}</b> · ${d.class} · ${d.lanes} ln · ${d.length_m} m` +
        (d.volume != null ? `<br>vol ${d.volume} / cap ${d.capacity} · v/c ${d.vc} · LOS ${d.los} · ${d.speed_kmh} km/h` : "");
    } finally { inflight = false; }
  });
  c.addEventListener("pointerdown", e => {
    if (e.button === 2) {
      const i = map.pick(e.offsetX, e.offsetY);
      if (i >= 0) { selectedLink = i; getJSON("/api/link/" + i).then(d =>
        $("sel").textContent = `Selected link ${d.link_id} (${d.class}, ${d.lanes} ln)`); }
    }
  });
  c.addEventListener("wheel", e => { e.preventDefault(); map.zoomAt(e.offsetX, e.offsetY, Math.pow(1.0015, -e.deltaY)); }, { passive: false });
}

async function sendChat() {
  const t = $("chatinput").value.trim(); if (!t) return;
  $("chatinput").value = ""; logChat("you", t);
  $("chatsend").disabled = true;
  try {
    const r = await postJSON("/api/chat", { message: t });
    r.actions.forEach(a => logChat("act", `▸ ${a.capability}(${fmtParams(a.params)})`));
    if (r.text) logChat("bot", r.text);
    if (r.actions.length) {  // assistant changed state — refresh everything
      updateStatus(await getJSON("/api/status"));
      await setColor($("color").value);
      const s = await getJSON("/api/assignment/state");
      if (s.kpis) { renderKPIs(s.kpis); await loadTopLinks(); }
    }
  } catch (e) { logChat("bot", "Error: " + e.message); }
  $("chatsend").disabled = false;
}

function logChat(cls, text) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = (cls === "you" ? "You: " : cls === "bot" ? "Assistant: " : "") + text;
  $("chatlog").appendChild(d); $("chatlog").scrollTop = $("chatlog").scrollHeight;
}

const fmt = (x) => (x >= 0 ? "+" : "") + Math.round(x).toLocaleString();
const fmtParams = (p) => Object.entries(p).map(([k, v]) => `${k}=${v}`).join(", ");

init();
