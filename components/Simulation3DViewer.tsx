"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ParsedDrawing, RoadCategory } from "@/lib/road-detect";
import type { RoadNetwork, BuildingType } from "@/lib/road-network";
import {
  buildSimulationState,
  spawnVehicles,
  clearVehicles,
  pointOnLink,
  tangentOnLink,
  step,
  type SimulationState,
} from "@/lib/simulation";

interface Props {
  drawing: ParsedDrawing;
  groupCategory: Record<string, RoadCategory>;
  network: RoadNetwork;
}

const BUILDING_COLOR: Record<BuildingType, number> = {
  residential: 0x4ade80,
  commercial: 0x38bdf8,
  retail: 0xa78bfa,
  office: 0x60a5fa,
  school: 0xfbbf24,
  mosque: 0x2dd4bf,
  hospital: 0xf87171,
  civic: 0xf472b6,
  industrial: 0x78716c,
  parking: 0x94a3b8,
  amenity: 0xe879f9,
  other: 0x94a3b8,
};

const BUILDING_HEIGHT: Record<BuildingType, number> = {
  residential: 0.025,
  commercial: 0.06,
  retail: 0.04,
  office: 0.08,
  school: 0.04,
  mosque: 0.06,
  hospital: 0.07,
  civic: 0.05,
  industrial: 0.05,
  parking: 0.02,
  amenity: 0.045,
  other: 0.025,
};

export function Simulation3DViewer({ drawing, groupCategory, network }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<SimulationState | null>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    vehicleMeshes: THREE.Mesh[];
    vehicleGroup: THREE.Group;
    raf: number;
  } | null>(null);

  const [running, setRunning] = useState(true);
  const [vehicleCount, setVehicleCount] = useState(150);
  const [speedMul, setSpeedMul] = useState(1);
  const runningRef = useRef(running);
  const speedRef = useRef(speedMul);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  useEffect(() => {
    speedRef.current = speedMul;
  }, [speedMul]);

  // Compute world transform: PDF user units mapped into a roughly unit-sized
  // 3D scene with x going east, z going south (so y is up).
  const worldTransform = useMemo(() => {
    const { minX, minY, maxX, maxY } = network.bounds;
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    // Normalise so the bigger axis spans 100 world units. Buildings height
    // and vehicle size pick sensible scales from this.
    const span = Math.max(w, h);
    const scale = 100 / span;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return {
      project: (x: number, y: number): [number, number] => [
        (x - cx) * scale,
        // PDF y is up; three.js z+ is into the screen for our camera so we
        // negate y to put north/+y at -z.
        -(y - cy) * scale,
      ],
      scale,
      span: span * scale,
    };
  }, [network.bounds]);

  // Build / rebuild the simulation state when the network changes.
  useEffect(() => {
    const fresh = buildSimulationState(network, { signalsEnabled: true });
    const diag =
      Math.hypot(
        network.bounds.maxX - network.bounds.minX,
        network.bounds.maxY - network.bounds.minY
      ) || 1;
    stateRef.current = spawnVehicles(fresh, vehicleCount, diag / 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  // Adjust vehicle count without resetting state.
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    const diag =
      Math.hypot(
        network.bounds.maxX - network.bounds.minX,
        network.bounds.maxY - network.bounds.minY
      ) || 1;
    if (vehicleCount > s.vehicles.length) {
      stateRef.current = spawnVehicles(s, vehicleCount - s.vehicles.length, diag / 60);
    } else if (vehicleCount < s.vehicles.length) {
      stateRef.current = { ...s, vehicles: s.vehicles.slice(0, vehicleCount) };
    }
  }, [vehicleCount, network]);

  // Set up the 3D scene once when the container mounts.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    scene.fog = new THREE.Fog(0x0b1220, 80, 220);

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 1000);
    camera.position.set(40, 60, 80);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 5;
    controls.maxDistance = 300;
    controls.target.set(0, 0, 0);

    // Lighting.
    const hemi = new THREE.HemisphereLight(0xb0c4de, 0x101727, 0.55);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d6, 1.05);
    sun.position.set(60, 120, 30);
    scene.add(sun);

    // Ground plane sized to the drawing.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(worldTransform.span * 1.4, worldTransform.span * 1.4),
      new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.95,
        metalness: 0,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Build static geometry: roads + buildings.
    const roadsGroup = new THREE.Group();
    scene.add(roadsGroup);
    const buildingsGroup = new THREE.Group();
    scene.add(buildingsGroup);
    const vehicleGroup = new THREE.Group();
    scene.add(vehicleGroup);

    addRoads(roadsGroup, drawing, groupCategory, network, worldTransform);
    addBuildings(buildingsGroup, network, worldTransform);

    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      vehicleMeshes: [],
      vehicleGroup,
      raf: 0,
    };

    let lastT = performance.now();
    const tickFn = (now: number) => {
      const dt = Math.min(0.1, (now - lastT) / 1000) * speedRef.current;
      lastT = now;
      const s = stateRef.current;
      if (s && runningRef.current) step(s, dt);
      syncVehicles(scene, vehicleGroup, sceneRef.current!.vehicleMeshes, stateRef.current, network, worldTransform);
      controls.update();
      renderer.render(scene, camera);
      sceneRef.current!.raf = requestAnimationFrame(tickFn);
    };
    sceneRef.current.raf = requestAnimationFrame(tickFn);

    // Resize handling.
    const ro = new ResizeObserver(() => {
      const cw = container.clientWidth || 800;
      const ch = container.clientHeight || 600;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.setSize(cw, ch);
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(sceneRef.current!.raf);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      // Dispose meshes / geometries to free GPU memory.
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, network, groupCategory, worldTransform]);

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, background: "#0b1220" }}>
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 12,
          padding: "10px 12px",
          background: "rgba(15, 23, 42, 0.92)",
          color: "#e2e8f0",
          fontSize: 12,
          borderRadius: 8,
          border: "1px solid #1e293b",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minWidth: 240,
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setRunning((r) => !r)}
            style={{
              background: running ? "#dc2626" : "#22c55e",
              color: "white",
              border: 0,
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {running ? "Pause" : "Play"}
          </button>
          <button
            onClick={() => {
              const s = stateRef.current;
              if (!s) return;
              const diag =
                Math.hypot(
                  network.bounds.maxX - network.bounds.minX,
                  network.bounds.maxY - network.bounds.minY
                ) || 1;
              stateRef.current = spawnVehicles(
                clearVehicles(s),
                vehicleCount,
                diag / 60
              );
            }}
            style={{
              background: "#334155",
              color: "white",
              border: 0,
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            Respawn
          </button>
          <span
            style={{
              marginLeft: "auto",
              color: "#94a3b8",
              fontSize: 11,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            3D · {network.junctions.length} junc · {network.links.length} links
          </span>
        </div>
        <Field label="Vehicles">
          <input
            type="range"
            min={0}
            max={1000}
            step={10}
            value={vehicleCount}
            onChange={(e) => setVehicleCount(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {vehicleCount}
          </span>
        </Field>
        <Field label="Speed">
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={speedMul}
            onChange={(e) => setSpeedMul(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {speedMul.toFixed(2)}×
          </span>
        </Field>
        <div style={{ color: "#94a3b8", fontSize: 10, lineHeight: 1.5 }}>
          Drag to orbit · scroll to zoom · right-drag to pan
        </div>
      </div>
    </div>
  );
}

interface WorldTransform {
  project: (x: number, y: number) => [number, number];
  scale: number;
  span: number;
}

/**
 * Asphalt mesh for a single link: build a triangulated ribbon of
 * (link.width or fallback) units around the link's polyline. Uses average
 * tangent at each interior point so the ribbon tracks curves smoothly.
 */
function buildLinkRibbon(
  link: { points: number[]; width?: number },
  fallbackWidth: number,
  wt: WorldTransform,
  yLevel: number
): THREE.BufferGeometry | null {
  const pts = link.points;
  if (pts.length < 4) return null;
  const halfW = ((link.width ?? fallbackWidth) * wt.scale) / 2;

  const verts: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    let tx: number, ty: number;
    if (i === 0) {
      tx = pts[2] - pts[0];
      ty = pts[3] - pts[1];
    } else if (i === pts.length - 2) {
      tx = pts[i] - pts[i - 2];
      ty = pts[i + 1] - pts[i - 1];
    } else {
      tx = pts[i + 2] - pts[i - 2];
      ty = pts[i + 3] - pts[i - 1];
    }
    const m = Math.hypot(tx, ty) || 1;
    tx /= m;
    ty /= m;
    // Right-hand normal in source coords (y-up): rotate tangent -90° = (ty, -tx).
    const nx = ty;
    const ny = -tx;
    const x = pts[i];
    const y = pts[i + 1];
    const [lwx, lwz] = wt.project(x - nx * (halfW / wt.scale), y - ny * (halfW / wt.scale));
    const [rwx, rwz] = wt.project(x + nx * (halfW / wt.scale), y + ny * (halfW / wt.scale));
    verts.push(lwx, yLevel, lwz);
    verts.push(rwx, yLevel, rwz);
  }
  const ringCount = verts.length / 6; // 2 verts per ring, 3 components each
  for (let i = 0; i < ringCount - 1; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function buildJunctionRegionGeom(
  polygon: number[],
  wt: WorldTransform,
  yLevel: number
): THREE.BufferGeometry | null {
  if (polygon.length < 6) return null;
  const shape = new THREE.Shape();
  const [x0, z0] = wt.project(polygon[0], polygon[1]);
  shape.moveTo(x0, z0);
  for (let i = 2; i < polygon.length; i += 2) {
    const [x, z] = wt.project(polygon[i], polygon[i + 1]);
    shape.lineTo(x, z);
  }
  const geom = new THREE.ShapeGeometry(shape);
  // ShapeGeometry sits on the XY plane; rotate so it lies on XZ at yLevel.
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, yLevel, 0);
  return geom;
}

function addRoads(
  group: THREE.Group,
  drawing: ParsedDrawing,
  groupCategory: Record<string, RoadCategory>,
  network: RoadNetwork,
  wt: WorldTransform
) {
  // 1. Asphalt: one mesh per link, sized by its derived width. Default to a
  //    reasonable fraction of the drawing diagonal when the network builder
  //    couldn't compute a width.
  const meanWidth =
    network.links.reduce((acc, l) => acc + (l.width ?? 0), 0) /
      Math.max(1, network.links.filter((l) => l.width).length) ||
    wt.span * 0.005;

  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    roughness: 0.92,
    metalness: 0.0,
  });

  for (const link of network.links) {
    const geom = buildLinkRibbon(link, meanWidth, wt, 0.005);
    if (geom) group.add(new THREE.Mesh(geom, asphaltMat));
  }

  // Junction regions: render the closed curb polygon as a flat asphalt slab
  // raised just above the link ribbons so it covers the seams cleanly.
  for (const node of network.junctions) {
    if (!node.region) continue;
    const geom = buildJunctionRegionGeom(node.region, wt, 0.012);
    if (geom) group.add(new THREE.Mesh(geom, asphaltMat));
  }

  // 2. Lane markings as thin LineSegments above the asphalt.
  const laneVerts: number[] = [];
  const centerVerts: number[] = [];
  for (const seg of drawing.segments) {
    const cat = groupCategory[seg.groupId] ?? seg.category;
    if (cat !== "lane" && cat !== "centerline") continue;
    const target = cat === "centerline" ? centerVerts : laneVerts;
    const pts = seg.points;
    for (let i = 2; i < pts.length; i += 2) {
      const [x1, z1] = wt.project(pts[i - 2], pts[i - 1]);
      const [x2, z2] = wt.project(pts[i], pts[i + 1]);
      target.push(x1, 0.06, z1, x2, 0.06, z2);
    }
  }
  if (laneVerts.length > 0) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(laneVerts, 3));
    group.add(
      new THREE.LineSegments(
        g,
        new THREE.LineBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.85 })
      )
    );
  }
  if (centerVerts.length > 0) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(centerVerts, 3));
    group.add(
      new THREE.LineSegments(
        g,
        new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.85 })
      )
    );
  }

  // 3. Curbs as light-grey lines along the asphalt edges.
  const curbVerts: number[] = [];
  for (const seg of drawing.segments) {
    const cat = groupCategory[seg.groupId] ?? seg.category;
    if (cat !== "edge" && cat !== "curb") continue;
    const pts = seg.points;
    for (let i = 2; i < pts.length; i += 2) {
      const [x1, z1] = wt.project(pts[i - 2], pts[i - 1]);
      const [x2, z2] = wt.project(pts[i], pts[i + 1]);
      curbVerts.push(x1, 0.04, z1, x2, 0.04, z2);
    }
  }
  if (curbVerts.length > 0) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(curbVerts, 3));
    group.add(
      new THREE.LineSegments(
        g,
        new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.85 })
      )
    );
  }
}

function addBuildings(
  group: THREE.Group,
  network: RoadNetwork,
  wt: WorldTransform
) {
  for (const b of network.buildings) {
    const pts = b.points;
    if (pts.length < 6) continue;
    const shape = new THREE.Shape();
    const [x0, z0] = wt.project(pts[0], pts[1]);
    shape.moveTo(x0, z0);
    for (let i = 2; i < pts.length; i += 2) {
      const [x, z] = wt.project(pts[i], pts[i + 1]);
      shape.lineTo(x, z);
    }
    const type: BuildingType = b.buildingType ?? "other";
    const heightFraction = BUILDING_HEIGHT[type];
    const height = wt.span * heightFraction;
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
    });
    // ExtrudeGeometry extrudes along +z; rotate so it goes up along +y.
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: BUILDING_COLOR[type],
      roughness: 0.78,
      metalness: 0.0,
      transparent: true,
      opacity: type === "other" ? 0.55 : 0.88,
    });
    const mesh = new THREE.Mesh(geom, mat);
    group.add(mesh);
  }
}

function syncVehicles(
  scene: THREE.Scene,
  group: THREE.Group,
  meshes: THREE.Mesh[],
  state: SimulationState | null,
  network: RoadNetwork,
  wt: WorldTransform
) {
  void scene;
  if (!state) return;

  // Pick a vehicle size from the typical road width if we have one. Real
  // proportions: car ~4.5m long, ~1.8m wide, ~1.5m tall on a ~3.5m lane.
  let medianWorldWidth = 0;
  const widths: number[] = [];
  for (const link of network.links) if (link.width) widths.push(link.width * wt.scale);
  if (widths.length > 0) {
    widths.sort((a, b) => a - b);
    medianWorldWidth = widths[Math.floor(widths.length / 2)];
  } else {
    medianWorldWidth = wt.span * 0.01;
  }
  const laneW = medianWorldWidth / 2; // assume 2 lanes per road
  const carLength = laneW * 1.4;
  const carWidth = laneW * 0.55;
  const carHeight = laneW * 0.42;

  while (meshes.length < state.vehicles.length) {
    const v = state.vehicles[meshes.length];
    const geom = new THREE.BoxGeometry(carLength, carHeight, carWidth);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(v.color),
      roughness: 0.4,
      metalness: 0.3,
    });
    const mesh = new THREE.Mesh(geom, mat);
    group.add(mesh);
    meshes.push(mesh);
  }
  while (meshes.length > state.vehicles.length) {
    const m = meshes.pop()!;
    group.remove(m);
    m.geometry.dispose();
    if (Array.isArray(m.material)) m.material.forEach((mt) => mt.dispose());
    else m.material.dispose();
  }

  const linksById = new Map(network.links.map((l) => [l.id, l]));
  for (let i = 0; i < state.vehicles.length; i++) {
    const v = state.vehicles[i];
    const link = linksById.get(v.linkId);
    const arc = state.linkArc.get(v.linkId);
    const mesh = meshes[i];
    if (!link || !arc) continue;
    const pos = pointOnLink(link, arc, v.s);
    const tan = tangentOnLink(link, arc, v.s);
    const fx = v.dir === 1 ? tan.dx : -tan.dx;
    const fy = v.dir === 1 ? tan.dy : -tan.dy;
    // Right-hand normal in world XY space (right-side driving).
    const rx = fy;
    const ry = -fx;
    // Offset to the right of centerline by half a lane width so opposing
    // flows take the two lanes of a 2-lane road instead of overlapping.
    const linkLaneOffset = link.width != null ? link.width / 4 : v.laneOffset;
    const offX = pos.x + rx * linkLaneOffset;
    const offY = pos.y + ry * linkLaneOffset;
    const [wx, wz] = wt.project(offX, offY);
    mesh.position.set(wx, carHeight / 2 + 0.06, wz);
    const heading = Math.atan2(-fy, fx);
    mesh.rotation.set(0, heading, 0);
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 11,
        color: "#94a3b8",
      }}
    >
      <span style={{ minWidth: 60 }}>{label}</span>
      {children}
    </label>
  );
}
