"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ParsedDrawing, RoadCategory } from "@/lib/road-detect";
import type { RoadNetwork, BuildingType, NetworkLink } from "@/lib/road-network";
import {
  buildSimulationState,
  spawnVehicles,
  clearVehicles,
  pointOnLink,
  tangentOnLink,
  step,
  activeGreen,
  type SimulationState,
} from "@/lib/simulation";
import { LOS_COLORS, type JunctionResult, type LOS } from "@/lib/hcm";

interface Props {
  drawing: ParsedDrawing;
  groupCategory: Record<string, RoadCategory>;
  network: RoadNetwork;
  /** HCM analysis output keyed by junction id, when available. */
  junctionResults?: Record<string, JunctionResult | undefined>;
  selectedJunctionId?: string | null;
  onSelectJunction?: (id: string | null) => void;
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

const LOS_COLOR_HEX: Record<LOS, number> = {
  A: 0x22dd77,
  B: 0x88ee44,
  C: 0xfbbf24,
  D: 0xff8c1a,
  E: 0xff5544,
  F: 0xee2244,
};

const ASPHALT_BASE_COLOR = 0x1a212d;

export function Simulation3DViewer({
  drawing,
  groupCategory,
  network,
  junctionResults,
  selectedJunctionId,
  onSelectJunction,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<SimulationState | null>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    vehicleMeshes: THREE.Mesh[];
    vehicleGroup: THREE.Group;
    junctionLabels: { sprite: THREE.Sprite; nodeId: string; canvasState: { los: LOS | null } }[];
    junctionPickMeshes: THREE.Mesh[];
    signalLights: { mesh: THREE.Mesh; nodeId: string; cardinal: "NB" | "EB" | "SB" | "WB" }[];
    linkAsphalt: { mesh: THREE.Mesh; link: NetworkLink }[];
    raf: number;
  } | null>(null);

  const [running, setRunning] = useState(true);
  const [vehicleCount, setVehicleCount] = useState(220);
  const [speedMul, setSpeedMul] = useState(1);
  const [losColoring, setLosColoring] = useState(true);
  const runningRef = useRef(running);
  const speedRef = useRef(speedMul);
  const losRef = useRef(losColoring);
  const resultsRef = useRef(junctionResults);
  const selectedRef = useRef(selectedJunctionId);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  useEffect(() => {
    speedRef.current = speedMul;
  }, [speedMul]);
  useEffect(() => {
    losRef.current = losColoring;
  }, [losColoring]);
  useEffect(() => {
    resultsRef.current = junctionResults;
  }, [junctionResults]);
  useEffect(() => {
    selectedRef.current = selectedJunctionId;
  }, [selectedJunctionId]);

  // Compute world transform: PDF user units mapped into a unit-sized 3D
  // scene with x=east, z=south (so y is up).
  const worldTransform = useMemo(() => {
    const { minX, minY, maxX, maxY } = network.bounds;
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const span = Math.max(w, h);
    const scale = 100 / span;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return {
      project: (x: number, y: number): [number, number] => [
        (x - cx) * scale,
        -(y - cy) * scale,
      ],
      scale,
      span: span * scale,
    };
  }, [network.bounds]);

  useEffect(() => {
    const fresh = buildSimulationState(network, { signalsEnabled: true });
    const diag =
      Math.hypot(
        network.bounds.maxX - network.bounds.minX,
        network.bounds.maxY - network.bounds.minY
      ) || 1;
    stateRef.current = spawnVehicles(fresh, vehicleCount, diag / 70);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    const diag =
      Math.hypot(
        network.bounds.maxX - network.bounds.minX,
        network.bounds.maxY - network.bounds.minY
      ) || 1;
    if (vehicleCount > s.vehicles.length) {
      stateRef.current = spawnVehicles(s, vehicleCount - s.vehicles.length, diag / 70);
    } else if (vehicleCount < s.vehicles.length) {
      stateRef.current = { ...s, vehicles: s.vehicles.slice(0, vehicleCount) };
    }
  }, [vehicleCount, network]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();

    // Sky gradient via a large inverted sphere.
    const skyGeom = new THREE.SphereGeometry(500, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0b1220) },
        bottomColor: { value: new THREE.Color(0x111827) },
        offset: { value: 33 },
        exponent: { value: 0.6 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
    });
    scene.add(new THREE.Mesh(skyGeom, skyMat));
    scene.fog = new THREE.Fog(0x0c1424, 90, 260);

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 1000);
    camera.position.set(50, 75, 95);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minDistance = 6;
    controls.maxDistance = 320;
    controls.target.set(0, 0, 0);

    // Warm three-point lighting.
    const hemi = new THREE.HemisphereLight(0xb0c4de, 0x0e1521, 0.62);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4d6, 1.15);
    sun.position.set(80, 140, 60);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x6ea0ff, 0.35);
    fill.position.set(-80, 60, -60);
    scene.add(fill);

    // Ground plane sized to the drawing.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(worldTransform.span * 1.6, worldTransform.span * 1.6),
      new THREE.MeshStandardMaterial({
        color: 0x0b1220,
        roughness: 0.95,
        metalness: 0,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const roadsGroup = new THREE.Group();
    scene.add(roadsGroup);
    const buildingsGroup = new THREE.Group();
    scene.add(buildingsGroup);
    const vehicleGroup = new THREE.Group();
    scene.add(vehicleGroup);
    const labelsGroup = new THREE.Group();
    scene.add(labelsGroup);
    const signalsGroup = new THREE.Group();
    scene.add(signalsGroup);

    const linkAsphalt = addRoads(roadsGroup, drawing, groupCategory, network, worldTransform);
    addBuildings(buildingsGroup, network, worldTransform);
    const junctionLabels = addJunctionLabels(labelsGroup, network, worldTransform);
    const { lights: signalLights, pickMeshes: junctionPickMeshes } = addSignalsAndPickers(
      signalsGroup,
      network,
      worldTransform
    );

    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      vehicleMeshes: [],
      vehicleGroup,
      junctionLabels,
      junctionPickMeshes,
      signalLights,
      linkAsphalt,
      raf: 0,
    };

    // Click-to-select a junction via raycasting against the picker discs.
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(junctionPickMeshes, false);
      if (hits.length > 0) {
        const id = (hits[0].object.userData as { nodeId?: string }).nodeId;
        if (id && onSelectJunction) onSelectJunction(id);
      } else if (onSelectJunction) {
        onSelectJunction(null);
      }
    };
    renderer.domElement.addEventListener("click", onClick);

    let lastT = performance.now();
    const tickFn = (now: number) => {
      const dt = Math.min(0.1, (now - lastT) / 1000) * speedRef.current;
      lastT = now;
      const s = stateRef.current;
      if (s && runningRef.current) step(s, dt);
      syncVehicles(scene, vehicleGroup, sceneRef.current!.vehicleMeshes, stateRef.current, network, worldTransform);
      syncSignals(stateRef.current, signalLights);
      syncLinkColors(linkAsphalt, resultsRef.current ?? null, losRef.current);
      syncJunctionLabels(junctionLabels, resultsRef.current ?? null, selectedRef.current ?? null, camera);
      controls.update();
      renderer.render(scene, camera);
      sceneRef.current!.raf = requestAnimationFrame(tickFn);
    };
    sceneRef.current.raf = requestAnimationFrame(tickFn);

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
      renderer.domElement.removeEventListener("click", onClick);
      renderer.dispose();
      renderer.domElement.remove();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material;
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
                diag / 70
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
            {network.junctions.length} junc · {network.links.length} links
          </span>
        </div>
        <Field label="Vehicles">
          <input
            type="range"
            min={0}
            max={1500}
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
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            color: "#94a3b8",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={losColoring}
            onChange={(e) => setLosColoring(e.target.checked)}
          />
          Colour roads by LOS
        </label>
        <div style={{ color: "#94a3b8", fontSize: 10, lineHeight: 1.5 }}>
          Drag = orbit · scroll = zoom · right-drag = pan · click a junction
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

function buildLinkRibbon(
  link: { points: number[]; width?: number },
  fallbackWidth: number,
  wt: WorldTransform,
  yLevel: number
): THREE.BufferGeometry | null {
  const pts = link.points;
  if (pts.length < 4) return null;
  const halfW = (link.width ?? fallbackWidth) / 2;
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
    // Right-hand normal in source coords (y-up).
    const nx = ty;
    const ny = -tx;
    const x = pts[i];
    const y = pts[i + 1];
    const [lwx, lwz] = wt.project(x - nx * halfW, y - ny * halfW);
    const [rwx, rwz] = wt.project(x + nx * halfW, y + ny * halfW);
    verts.push(lwx, yLevel, lwz);
    verts.push(rwx, yLevel, rwz);
  }
  const ringCount = verts.length / 6;
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

function buildPolygonGeom(
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
): { mesh: THREE.Mesh; link: NetworkLink }[] {
  // Average pavement width for any link that didn't get one from the
  // derivation, so the ribbon fallback still draws something sensible.
  const widthsKnown = network.links.filter((l) => l.width).map((l) => l.width!);
  const fallbackWidth =
    widthsKnown.length > 0
      ? widthsKnown.reduce((a, b) => a + b, 0) / widthsKnown.length
      : (network.bounds.maxX - network.bounds.minX) * 0.005;

  const linkAsphalt: { mesh: THREE.Mesh; link: NetworkLink }[] = [];
  // Hard cap to keep WebGL draw calls and GPU memory bounded on machines
  // with weaker GPUs. Sorted by descending length so the most important
  // (longest) road bodies survive when we hit the cap.
  const MAX_LINK_MESHES = 1500;
  const sortedLinks = [...network.links].sort((a, b) => b.length - a.length);
  for (const link of sortedLinks) {
    if (linkAsphalt.length >= MAX_LINK_MESHES) break;
    let geom: THREE.BufferGeometry | null = null;
    if (link.bodyPolygon && link.bodyPolygon.length >= 6) {
      geom = buildPolygonGeom(link.bodyPolygon, wt, 0.005);
    }
    if (!geom) {
      geom = buildLinkRibbon(link, fallbackWidth, wt, 0.005);
    }
    if (!geom) continue;
    const mat = new THREE.MeshStandardMaterial({
      color: ASPHALT_BASE_COLOR,
      roughness: 0.9,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geom, mat);
    group.add(mesh);
    linkAsphalt.push({ mesh, link });
  }

  // Junction-region asphalt slabs in a slightly lighter / warmer tone so
  // they read as junctions when viewed from above.
  const regionMat = new THREE.MeshStandardMaterial({
    color: 0x252e3c,
    roughness: 0.85,
    metalness: 0.0,
  });
  // Roundabouts get a slightly warmer / more visible asphalt tone than
  // signal junctions so the typology reads at a glance.
  const roundaboutMat = new THREE.MeshStandardMaterial({
    color: 0x2c3548,
    roughness: 0.85,
    metalness: 0.0,
  });
  for (const node of network.junctions) {
    if (!node.region) continue;
    const geom = buildPolygonGeom(node.region, wt, 0.012);
    if (geom)
      group.add(
        new THREE.Mesh(
          geom,
          node.kind === "roundabout" ? roundaboutMat : regionMat
        )
      );
  }

  // Drop the per-CAD-layer LineSegments overlays - the user wants the
  // 3D scene to show only the road network (asphalt + junction regions)
  // plus signals / roundabouts. Lane stripes etc. live in the 2D Drawing
  // tab where they belong.
  void drawing;
  void groupCategory;
  return linkAsphalt;
}

function addBuildings(group: THREE.Group, network: RoadNetwork, wt: WorldTransform) {
  // Cap building meshes for the same reason as roads. Buildings render as
  // FLAT 2D footprints on the ground plane (the user wants the roads to be
  // the visual hero, not the buildings); a thin extrude for vertical
  // separation is intentional (~0.2% of span) so they don't z-fight with
  // the asphalt.
  const MAX_BUILDING_MESHES = 1200;
  const FLAT_HEIGHT = wt.span * 0.002;
  const sorted = [...network.buildings].sort((a, b) => b.area - a.area);
  let added = 0;
  for (const b of sorted) {
    if (added >= MAX_BUILDING_MESHES) break;
    const pts = b.points;
    if (pts.length < 6) continue;
    added += 1;
    const shape = new THREE.Shape();
    const [x0, z0] = wt.project(pts[0], pts[1]);
    shape.moveTo(x0, z0);
    for (let i = 2; i < pts.length; i += 2) {
      const [x, z] = wt.project(pts[i], pts[i + 1]);
      shape.lineTo(x, z);
    }
    const type: BuildingType = b.buildingType ?? "other";
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: FLAT_HEIGHT,
      bevelEnabled: false,
    });
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: BUILDING_COLOR[type],
      roughness: 0.85,
      metalness: 0.0,
      transparent: true,
      opacity: 0.42,
    });
    const mesh = new THREE.Mesh(geom, mat);
    group.add(mesh);
  }
}

function addJunctionLabels(
  group: THREE.Group,
  network: RoadNetwork,
  wt: WorldTransform
) {
  const out: {
    sprite: THREE.Sprite;
    nodeId: string;
    canvasState: { los: LOS | null };
  }[] = [];
  for (const node of network.junctions) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    const [wx, wz] = wt.project(node.x, node.y);
    sprite.position.set(wx, wt.span * 0.025, wz);
    const size = wt.span * 0.018;
    sprite.scale.set(size, size, 1);
    sprite.renderOrder = 1000;
    group.add(sprite);
    out.push({ sprite, nodeId: node.id, canvasState: { los: null } });
  }
  return out;
}

function paintLosBadge(canvas: HTMLCanvasElement, los: LOS | null, selected: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!los) return;
  const fill = `#${LOS_COLOR_HEX[los].toString(16).padStart(6, "0")}`;
  ctx.fillStyle = fill;
  const r = canvas.width / 2 - 8;
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, r, 0, Math.PI * 2);
  ctx.fill();
  if (selected) {
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 64px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(los, canvas.width / 2, canvas.height / 2 + 4);
}

function syncJunctionLabels(
  labels: { sprite: THREE.Sprite; nodeId: string; canvasState: { los: LOS | null } }[],
  results: Record<string, JunctionResult | undefined> | null,
  selectedId: string | null,
  camera: THREE.Camera
) {
  for (const lbl of labels) {
    const r = results?.[lbl.nodeId];
    const newLos = r?.los ?? null;
    const isSelected = selectedId === lbl.nodeId;
    if (lbl.canvasState.los !== newLos || isSelected) {
      const tex = (lbl.sprite.material as THREE.SpriteMaterial).map;
      if (tex) {
        const canvas = tex.image as HTMLCanvasElement;
        paintLosBadge(canvas, newLos, isSelected);
        tex.needsUpdate = true;
      }
      lbl.canvasState.los = newLos;
    }
  }
  void camera;
}

function syncLinkColors(
  asphalt: { mesh: THREE.Mesh; link: NetworkLink }[],
  results: Record<string, JunctionResult | undefined> | null,
  losColoring: boolean
) {
  if (!losColoring || !results) {
    for (const a of asphalt) {
      const m = a.mesh.material as THREE.MeshStandardMaterial;
      if (m.color.getHex() !== ASPHALT_BASE_COLOR) m.color.setHex(ASPHALT_BASE_COLOR);
    }
    return;
  }
  const order: LOS[] = ["A", "B", "C", "D", "E", "F"];
  for (const a of asphalt) {
    const fr = results[a.link.fromNode];
    const tr = results[a.link.toNode];
    let worst: LOS | null = null;
    for (const r of [fr, tr]) {
      if (!r) continue;
      if (!worst || order.indexOf(r.los) > order.indexOf(worst)) worst = r.los;
    }
    const target = worst ? LOS_COLOR_HEX[worst] : ASPHALT_BASE_COLOR;
    // Mix the LOS hue with the asphalt base so the road still reads as a road.
    const base = new THREE.Color(ASPHALT_BASE_COLOR);
    const overlay = new THREE.Color(target);
    const mixed = base.clone().lerp(overlay, worst ? 0.55 : 0);
    const m = a.mesh.material as THREE.MeshStandardMaterial;
    m.color.copy(mixed);
  }
}

/** Approximate the smallest distance from a polygon's centroid to its
 *  vertices, in world units. For a roughly circular roundabout this is the
 *  inner radius of the kerb circle; we draw the central island slightly
 *  smaller than that. */
function roundaboutInnerRadius(
  polygon: number[] | undefined,
  wt: WorldTransform
): number {
  if (!polygon || polygon.length < 6) return 0;
  let cx = 0,
    cy = 0;
  for (let i = 0; i < polygon.length; i += 2) {
    cx += polygon[i];
    cy += polygon[i + 1];
  }
  const n = polygon.length / 2;
  cx /= n;
  cy /= n;
  let minD = Infinity;
  for (let i = 0; i < polygon.length; i += 2) {
    const d = Math.hypot(polygon[i] - cx, polygon[i + 1] - cy);
    if (d < minD) minD = d;
  }
  if (!isFinite(minD)) return 0;
  // Project from source-units to world-units and shrink by 30% so the dome
  // sits cleanly inside the kerb ring.
  return minD * wt.scale * 0.7;
}

function addSignalsAndPickers(
  group: THREE.Group,
  network: RoadNetwork,
  wt: WorldTransform
) {
  const lights: { mesh: THREE.Mesh; nodeId: string; cardinal: "NB" | "EB" | "SB" | "WB" }[] = [];
  const pickMeshes: THREE.Mesh[] = [];

  const poleH = wt.span * 0.022;
  const poleR = wt.span * 0.0018;
  const lampR = wt.span * 0.0035;
  const offset = wt.span * 0.012;

  const dirs: Array<{ card: "NB" | "EB" | "SB" | "WB"; dx: number; dz: number }> = [
    { card: "NB", dx: 0, dz: -1 },
    { card: "EB", dx: 1, dz: 0 },
    { card: "SB", dx: 0, dz: 1 },
    { card: "WB", dx: -1, dz: 0 },
  ];

  for (const node of network.junctions) {
    const [wx, wz] = wt.project(node.x, node.y);

    // Click-pick disc, invisible-ish, sits at junction level.
    const pickGeom = new THREE.CircleGeometry(wt.span * 0.012, 24);
    pickGeom.rotateX(-Math.PI / 2);
    const pickMat = new THREE.MeshBasicMaterial({
      color: 0xfde68a,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    const pick = new THREE.Mesh(pickGeom, pickMat);
    pick.position.set(wx, 0.02, wz);
    pick.userData = { nodeId: node.id };
    group.add(pick);
    pickMeshes.push(pick);

    if (!node.isJunction) continue;

    // Roundabouts get a domed central island instead of signal poles.
    if (node.kind === "roundabout") {
      const radius = roundaboutInnerRadius(node.region, wt);
      if (radius > 0.4) {
        const domeGeom = new THREE.SphereGeometry(
          radius,
          24,
          12,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2
        );
        const domeMat = new THREE.MeshStandardMaterial({
          color: 0x4ade80,
          roughness: 0.7,
          metalness: 0.0,
        });
        const dome = new THREE.Mesh(domeGeom, domeMat);
        dome.position.set(wx, 0.05, wz);
        dome.scale.set(1, 0.35, 1); // flat dome, like a real RAB island
        group.add(dome);
      }
      continue;
    }

    for (const d of dirs) {
      // Pole.
      const poleGeom = new THREE.CylinderGeometry(poleR, poleR, poleH, 8);
      const poleMat = new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        metalness: 0.4,
        roughness: 0.5,
      });
      const pole = new THREE.Mesh(poleGeom, poleMat);
      pole.position.set(wx + d.dx * offset, poleH / 2, wz + d.dz * offset);
      group.add(pole);

      // Lamp head.
      const lampGeom = new THREE.SphereGeometry(lampR, 16, 12);
      const lampMat = new THREE.MeshStandardMaterial({
        color: 0xff3b30,
        emissive: 0xff3b30,
        emissiveIntensity: 0.7,
        roughness: 0.4,
      });
      const lamp = new THREE.Mesh(lampGeom, lampMat);
      lamp.position.set(wx + d.dx * offset, poleH + lampR, wz + d.dz * offset);
      group.add(lamp);
      lights.push({ mesh: lamp, nodeId: node.id, cardinal: d.card });
    }
  }

  return { lights, pickMeshes };
}

function syncSignals(
  state: SimulationState | null,
  lights: { mesh: THREE.Mesh; nodeId: string; cardinal: "NB" | "EB" | "SB" | "WB" }[]
) {
  if (!state) return;
  for (const l of lights) {
    const greens = activeGreen(state, l.nodeId);
    const isGreen = greens?.has(l.cardinal) ?? false;
    const m = l.mesh.material as THREE.MeshStandardMaterial;
    const target = isGreen ? 0x22dd77 : 0xff3b30;
    if (m.color.getHex() !== target) {
      m.color.setHex(target);
      m.emissive.setHex(target);
    }
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

  // Pick a vehicle size from the typical road width.
  const widths: number[] = [];
  for (const link of network.links) if (link.width) widths.push(link.width * wt.scale);
  let medianWorldWidth: number;
  if (widths.length > 0) {
    widths.sort((a, b) => a - b);
    medianWorldWidth = widths[Math.floor(widths.length / 2)];
  } else {
    medianWorldWidth = wt.span * 0.01;
  }
  const laneW = medianWorldWidth / 2;
  const carLength = laneW * 1.4;
  const carWidth = laneW * 0.55;
  const carHeight = laneW * 0.45;

  while (meshes.length < state.vehicles.length) {
    const v = state.vehicles[meshes.length];
    // Body (lower). A second smaller box on top makes the cabin.
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(carLength, carHeight * 0.55, carWidth),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(v.color),
        roughness: 0.45,
        metalness: 0.35,
      })
    );
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(carLength * 0.55, carHeight * 0.55, carWidth * 0.9),
      new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.3,
        metalness: 0.2,
        transparent: true,
        opacity: 0.85,
      })
    );
    cabin.position.set(-carLength * 0.05, carHeight * 0.55, 0);
    body.add(cabin);
    group.add(body);
    meshes.push(body);
  }
  while (meshes.length > state.vehicles.length) {
    const m = meshes.pop()!;
    group.remove(m);
    m.geometry.dispose();
    if (Array.isArray(m.material)) m.material.forEach((mt) => mt.dispose());
    else m.material.dispose();
    m.children.forEach((c) => {
      const cm = c as THREE.Mesh;
      if (cm.geometry) cm.geometry.dispose();
      if (cm.material) {
        if (Array.isArray(cm.material)) cm.material.forEach((mt) => mt.dispose());
        else cm.material.dispose();
      }
    });
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
    const rx = fy;
    const ry = -fx;
    // Multi-lane offset: lane 0 closest to outer kerb, higher = toward
    // centerline. Falls back to width/4 single-lane behaviour when the
    // link's lanesPerDir wasn't computed.
    const lanesPerDir = Math.max(1, link.lanesPerDir ?? 1);
    const halfW = (link.width ?? v.laneOffset * 4) / 2;
    const laneWidth = halfW / lanesPerDir;
    const laneOffset = halfW - (v.lane + 0.5) * laneWidth;
    const offX = pos.x + rx * laneOffset;
    const offY = pos.y + ry * laneOffset;
    const [wx, wz] = wt.project(offX, offY);
    mesh.position.set(wx, carHeight * 0.27 + 0.06, wz);
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
