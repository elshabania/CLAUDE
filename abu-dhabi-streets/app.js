/* Abu Dhabi Streets — Google Maps basemap + deck.gl street overlays
 * Street geometry is fetched live from OpenStreetMap via the Overpass API
 * for the current viewport and rendered as glowing path layers.
 */

"use strict";

const STORAGE_KEY = "ad-streets-gmaps-key";
const AD_CENTER = { lat: 24.4539, lng: 54.3773 };
const INITIAL_ZOOM = 13;

// Overpass mirrors, tried in order on failure.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const LAYERS = {
  main: {
    regex: "^(motorway|trunk|primary|secondary|tertiary)(_link)?$",
    minZoom: 0,
    maxSpanDeg: 0.9, // clamp huge viewports so Overpass stays happy
  },
  local: {
    regex: "^(residential|living_street|unclassified|pedestrian)$",
    minZoom: 13,
    maxSpanDeg: 0.25,
  },
};

// Sunset palette for the main-road hierarchy, cool cyan for local streets.
const ROAD_STYLE = {
  motorway: { color: [255, 179, 71], width: 16 },
  trunk: { color: [255, 158, 74], width: 14 },
  primary: { color: [255, 132, 88], width: 11 },
  secondary: { color: [249, 112, 110], width: 9 },
  tertiary: { color: [232, 99, 132], width: 7 },
  motorway_link: { color: [255, 179, 71], width: 6 },
  trunk_link: { color: [255, 158, 74], width: 6 },
  primary_link: { color: [255, 132, 88], width: 5 },
  secondary_link: { color: [249, 112, 110], width: 5 },
  tertiary_link: { color: [232, 99, 132], width: 5 },
  residential: { color: [56, 189, 248], width: 4.5 },
  living_street: { color: [94, 211, 243], width: 4 },
  unclassified: { color: [56, 189, 248], width: 4.5 },
  pedestrian: { color: [125, 211, 252], width: 3.5 },
};
const FALLBACK_STYLE = { color: [148, 163, 184], width: 4 };

const BASEMAP_STYLES = {
  dark: [
    { elementType: "geometry", stylers: [{ color: "#0b1220" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#7c8698" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#0b1220" }] },
    { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#26304a" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#101b2c" }, { visibility: "on" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a2236" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ visibility: "off" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#5d6578" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#050a14" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3b4a63" }] },
  ],
  light: [
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ saturation: -70 }, { lightness: 30 }] },
  ],
};

const state = {
  map: null,
  overlay: null,
  data: { main: [], local: [] }, // deck.gl path records per layer
  fetchedBounds: { main: null, local: null }, // bbox covered by current data
  enabled: { main: true, local: true },
  pendingFetches: 0,
  fetchSeq: { main: 0, local: 0 },
  hovered: null,
};

const $ = (id) => document.getElementById(id);

/* ---------------- API key handling ---------------- */

function getApiKey() {
  const fromUrl = new URLSearchParams(location.search).get("key");
  if (fromUrl) {
    localStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  return localStorage.getItem(STORAGE_KEY);
}

function showKeyOverlay(errorMessage) {
  $("panel").classList.add("hidden");
  $("key-overlay").classList.remove("hidden");
  const err = $("key-error");
  if (errorMessage) {
    err.textContent = errorMessage;
    err.classList.remove("hidden");
  } else {
    err.classList.add("hidden");
  }
  $("key-input").focus();
}

function loadGoogleMaps(key) {
  const script = document.createElement("script");
  script.src =
    "https://maps.googleapis.com/maps/api/js?key=" +
    encodeURIComponent(key) +
    "&v=weekly&callback=__initMap";
  script.async = true;
  script.onerror = () => {
    showKeyOverlay("Could not load Google Maps. Check your network and API key.");
  };
  document.head.appendChild(script);
}

// Google calls this on auth errors (bad key, missing billing, referer block).
window.gm_authFailure = () => {
  localStorage.removeItem(STORAGE_KEY);
  showKeyOverlay(
    "Google rejected that API key (invalid key, billing not enabled, or referrer restricted). Try another key."
  );
};

/* ---------------- Map + overlay ---------------- */

window.__initMap = function () {
  $("key-overlay").classList.add("hidden");
  $("panel").classList.remove("hidden");

  state.map = new google.maps.Map($("map"), {
    center: AD_CENTER,
    zoom: INITIAL_ZOOM,
    styles: BASEMAP_STYLES.dark,
    disableDefaultUI: true,
    zoomControl: true,
    zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
    backgroundColor: "#0b0f1a",
    gestureHandling: "greedy",
    clickableIcons: false,
  });

  state.overlay = new deck.GoogleMapsOverlay({ layers: [] });
  state.overlay.setMap(state.map);

  state.map.addListener("idle", () => refreshData());
  wireUi();
};

function buildDeckLayers() {
  const layers = [];
  for (const name of ["main", "local"]) {
    if (!state.enabled[name]) continue;
    const data = state.data[name];
    if (!data.length) continue;

    // Soft glow underneath, crisp core on top.
    layers.push(
      new deck.PathLayer({
        id: name + "-glow",
        data,
        getPath: (d) => d.path,
        getColor: (d) => [...d.style.color, 50],
        getWidth: (d) => d.style.width * 3,
        widthUnits: "meters",
        widthMinPixels: name === "main" ? 5 : 3,
        capRounded: true,
        jointRounded: true,
      }),
      new deck.PathLayer({
        id: name + "-core",
        data,
        getPath: (d) => d.path,
        getColor: (d) =>
          state.hovered && state.hovered.id === d.id
            ? [255, 255, 255, 255]
            : [...d.style.color, name === "main" ? 235 : 200],
        getWidth: (d) => d.style.width,
        widthUnits: "meters",
        widthMinPixels: name === "main" ? 2 : 1.2,
        capRounded: true,
        jointRounded: true,
        pickable: true,
        onHover: handleHover,
        updateTriggers: {
          getColor: state.hovered ? state.hovered.id : null,
        },
      })
    );
  }
  return layers;
}

function redraw() {
  if (state.overlay) state.overlay.setProps({ layers: buildDeckLayers() });
}

function handleHover(info) {
  const tooltip = $("tooltip");
  if (info.object) {
    state.hovered = info.object;
    tooltip.innerHTML =
      '<div class="t-name">' +
      escapeHtml(info.object.name || "Unnamed street") +
      '</div><div class="t-class">' +
      escapeHtml(info.object.highway.replace(/_/g, " ")) +
      "</div>";
    tooltip.style.left = info.x + "px";
    tooltip.style.top = info.y + "px";
    tooltip.classList.remove("hidden");
  } else {
    state.hovered = null;
    tooltip.classList.add("hidden");
  }
  redraw();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
}

/* ---------------- Data fetching ---------------- */

function currentBbox(maxSpanDeg) {
  const b = state.map.getBounds();
  if (!b) return null;
  const ne = b.getNorthEast();
  const sw = b.getSouthWest();
  let { south, west, north, east } = {
    south: sw.lat(),
    west: sw.lng(),
    north: ne.lat(),
    east: ne.lng(),
  };
  // Clamp oversized viewports around the centre so queries stay bounded.
  const c = state.map.getCenter();
  if (north - south > maxSpanDeg) {
    south = c.lat() - maxSpanDeg / 2;
    north = c.lat() + maxSpanDeg / 2;
  }
  if (east - west > maxSpanDeg) {
    west = c.lng() - maxSpanDeg / 2;
    east = c.lng() + maxSpanDeg / 2;
  }
  return { south, west, north, east };
}

function padBbox(bbox, factor) {
  const dLat = (bbox.north - bbox.south) * factor;
  const dLng = (bbox.east - bbox.west) * factor;
  return {
    south: bbox.south - dLat,
    north: bbox.north + dLat,
    west: bbox.west - dLng,
    east: bbox.east + dLng,
  };
}

function bboxContains(outer, inner) {
  return (
    outer &&
    inner.south >= outer.south &&
    inner.north <= outer.north &&
    inner.west >= outer.west &&
    inner.east <= outer.east
  );
}

async function queryOverpass(regex, bbox) {
  const bboxStr = [bbox.south, bbox.west, bbox.north, bbox.east].join(",");
  const query =
    "[out:json][timeout:40];" +
    'way["highway"~"' + regex + '"](' + bboxStr + ");" +
    "out geom;";
  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

function toRecords(osmJson) {
  const records = [];
  for (const el of osmJson.elements || []) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
    const style = ROAD_STYLE[el.tags.highway] || FALLBACK_STYLE;
    records.push({
      id: el.id,
      path: el.geometry.map((p) => [p.lon, p.lat]),
      name: el.tags.name || el.tags["name:en"] || null,
      highway: el.tags.highway,
      style,
    });
  }
  return records;
}

function setLoading(delta) {
  state.pendingFetches += delta;
  $("loading-bar").classList.toggle("active", state.pendingFetches > 0);
}

async function refreshData() {
  if (!state.map) return;
  const zoom = state.map.getZoom();
  $("zoom-hint").classList.toggle(
    "hidden",
    !(state.enabled.local && zoom < LAYERS.local.minZoom)
  );

  for (const name of ["main", "local"]) {
    const cfg = LAYERS[name];
    if (!state.enabled[name] || zoom < cfg.minZoom) continue;

    const view = currentBbox(cfg.maxSpanDeg);
    if (!view || bboxContains(state.fetchedBounds[name], view)) continue;

    const fetchBbox = padBbox(view, 0.3);
    const seq = ++state.fetchSeq[name];
    setLoading(1);
    try {
      const json = await queryOverpass(cfg.regex, fetchBbox);
      if (seq !== state.fetchSeq[name]) continue; // superseded by a newer fetch
      state.data[name] = toRecords(json);
      state.fetchedBounds[name] = fetchBbox;
      updateLayerMeta(name);
      redraw();
    } catch (e) {
      console.error("Overpass fetch failed for " + name + " streets:", e);
      $("meta-" + name).textContent = "load failed — pan to retry";
      state.fetchedBounds[name] = null;
    } finally {
      setLoading(-1);
    }
  }
}

function totalLengthKm(records) {
  let km = 0;
  for (const r of records) {
    const p = r.path;
    for (let i = 1; i < p.length; i++) {
      km += haversineKm(p[i - 1], p[i]);
    }
  }
  return km;
}

function haversineKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function updateLayerMeta(name) {
  const records = state.data[name];
  $("meta-" + name).textContent =
    records.length.toLocaleString() +
    " segments · " +
    Math.round(totalLengthKm(records)).toLocaleString() +
    " km";
}

/* ---------------- UI wiring ---------------- */

function wireUi() {
  for (const name of ["main", "local"]) {
    $("toggle-" + name).addEventListener("change", (e) => {
      state.enabled[name] = e.target.checked;
      redraw();
      refreshData();
    });
  }

  $("basemap-seg").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    for (const b of $("basemap-seg").querySelectorAll("button")) {
      b.classList.toggle("active", b === btn);
    }
    const style = btn.dataset.style;
    if (style === "satellite") {
      state.map.setMapTypeId("hybrid");
      state.map.setOptions({ styles: null });
    } else {
      state.map.setMapTypeId("roadmap");
      state.map.setOptions({ styles: BASEMAP_STYLES[style] });
    }
  });

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.map.panTo({
        lat: parseFloat(chip.dataset.lat),
        lng: parseFloat(chip.dataset.lng),
      });
      state.map.setZoom(parseInt(chip.dataset.zoom, 10));
    });
  });

  $("panel-collapse").addEventListener("click", () => {
    $("panel").classList.add("hidden");
    $("panel-expand").classList.remove("hidden");
  });
  $("panel-expand").addEventListener("click", () => {
    $("panel-expand").classList.add("hidden");
    $("panel").classList.remove("hidden");
  });

  $("key-reset").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    location.href = location.pathname; // drop ?key=... and restart onboarding
  });
}

function wireKeyOverlay() {
  const launch = () => {
    const key = $("key-input").value.trim();
    if (!key) return;
    localStorage.setItem(STORAGE_KEY, key);
    $("key-overlay").classList.add("hidden");
    loadGoogleMaps(key);
  };
  $("key-launch").addEventListener("click", launch);
  $("key-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") launch();
  });
}

/* ---------------- Boot ---------------- */

wireKeyOverlay();
const apiKey = getApiKey();
if (apiKey) {
  loadGoogleMaps(apiKey);
} else {
  showKeyOverlay();
}
