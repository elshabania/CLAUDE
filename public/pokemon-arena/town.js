// town.js — Cinderhollow: a large walkable city with NPCs, a gym, castles and
// enterable buildings. Original content. Self-contained: primitives only.
// Exports buildTown(scene, ground, center) -> { group, npcs, doors, update, ... }

import * as THREE from "three";

function mat(color, rough = 0.9, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, emissive });
}

// ---- a simple low-poly townsperson -----------------------------------------
function makePerson({ shirt = 0x3366cc, pants = 0x223344, skin = 0xe8b890, hat = null }) {
  const g = new THREE.Group();
  const legMat = mat(pants), bodyMat = mat(shirt), skinMat = mat(skin);
  for (const s of [1, -1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.7, 8), legMat);
    leg.position.set(s * 0.12, 0.35, 0); g.add(leg);
  }
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.7, 10), bodyMat);
  torso.position.y = 1.05; g.add(torso);
  for (const s of [1, -1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.6, 8), bodyMat);
    arm.position.set(s * 0.32, 1.05, 0); arm.rotation.z = s * 0.18; g.add(arm);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), skinMat);
  head.position.y = 1.62; g.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x161616 });
  for (const s of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat);
    eye.position.set(s * 0.09, 1.66, 0.21); g.add(eye);
  }
  if (hat) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 16), mat(hat));
    brim.position.y = 1.8; g.add(brim);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(hat));
    cap.position.y = 1.8; g.add(cap);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---- a house (box + pitched roof), optionally enterable ---------------------
function house(w, d, h, wall, roof) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(wall));
  body.position.y = h / 2; g.add(body);
  const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) * 0.62, h * 0.7, 4), mat(roof));
  roofMesh.position.y = h + h * 0.35; roofMesh.rotation.y = Math.PI / 4; g.add(roofMesh);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.12), mat(0x3a2614));
  door.position.set(0, 0.75, d / 2 + 0.02); g.add(door);
  for (const s of [1, -1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.08), mat(0x8fb6d8, 0.5, 0x1a2a3a));
    win.position.set(s * w * 0.3, h * 0.62, d / 2 + 0.02); g.add(win);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---- a castle (keep + corner towers + battlements + gate) -------------------
function castle(size, h, stone, roof) {
  const g = new THREE.Group();
  const keep = new THREE.Mesh(new THREE.BoxGeometry(size, h, size), mat(stone));
  keep.position.y = h / 2; g.add(keep);
  // crenellated parapet
  const merlonMat = mat(stone, 0.95);
  const per = size / 2;
  for (let i = -per + 1; i <= per - 1; i += 2) {
    for (const [x, z] of [[i, per], [i, -per], [per, i], [-per, i]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.9), merlonMat);
      m.position.set(x, h + 0.55, z); g.add(m);
    }
  }
  // corner towers
  const tR = size * 0.16, tH = h * 1.5;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(tR, tR * 1.1, tH, 12), mat(stone));
    tower.position.set(sx * per, tH / 2, sz * per); g.add(tower);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(tR * 1.35, tH * 0.5, 12), mat(roof));
    cone.position.set(sx * per, tH + tH * 0.22, sz * per); g.add(cone);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7),
      new THREE.MeshStandardMaterial({ color: roof, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(sx * per + 0.6, tH + tH * 0.5, sz * per); g.add(flag);
  }
  // big gate
  const gate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 0.3), mat(0x2a1c12, 0.8));
  gate.position.set(0, 1.7, per + 0.05); g.add(gate);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.3, 16, 1, false, 0, Math.PI), mat(0x2a1c12, 0.8));
  arch.rotation.z = Math.PI / 2; arch.position.set(0, 3.4, per + 0.05); g.add(arch);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildTown(scene, ground, center) {
  const group = new THREE.Group();
  group.name = "cinderhollow";
  scene.add(group);
  const gy = (x, z) => (ground ? ground(x, z) : 0);
  const cx = center.x, cz = center.z;
  const doors = [];          // enterable buildings: { name, pos, kind }

  // paved ground district (large) ------------------------------------------
  const DISTRICT = 150;
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(DISTRICT, 0.3, DISTRICT), mat(0xb6a98e));
  plaza.position.set(cx, gy(cx, cz) + 0.04, cz); plaza.receiveShadow = true; group.add(plaza);
  // street grid (darker strips)
  const streetMat = mat(0x6e6456);
  for (let i = -2; i <= 2; i++) {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(DISTRICT, 0.32, 7), streetMat);
    sh.position.set(cx, gy(cx, cz) + 0.06, cz + i * 28); group.add(sh);
    const sv = new THREE.Mesh(new THREE.BoxGeometry(7, 0.32, DISTRICT), streetMat);
    sv.position.set(cx + i * 28, gy(cx, cz) + 0.06, cz); group.add(sv);
  }

  // central fountain plaza -------------------------------------------------
  const fountain = new THREE.Group();
  fountain.position.set(cx, gy(cx, cz) + 0.1, cz);
  fountain.add(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.7, 24), mat(0x9aa7b0)).translateY(0.35));
  fountain.add(new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.25, 24), mat(0x4ea0c6, 0.3, 0x123848)).translateY(0.62));
  fountain.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 1.8, 12), mat(0x9aa7b0)).translateY(1.5));
  group.add(fountain);

  // many houses in blocks between the streets ------------------------------
  const palettes = [
    [0xd9c7a3, 0xb5532e], [0xc8d2b0, 0x6a8f3a], [0xc7b6d4, 0x55408a],
    [0xe0c0a0, 0x9a5a2a], [0xb9d2d8, 0x3a6f8a], [0xe6cf9a, 0xc25a2a],
  ];
  let houseN = 0;
  for (let bx = -2; bx <= 2; bx++) {
    for (let bz = -2; bz <= 2; bz++) {
      if (bx === 0 && bz === 0) continue;            // fountain plaza
      // 2x2 cluster of houses per block, facing the nearest street
      for (const [ox, oz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
        if (Math.random() < 0.18) continue;          // some empty lots
        const hx = cx + bx * 28 + ox, hz = cz + bz * 28 + oz;
        const pal = palettes[houseN % palettes.length];
        const w = 5 + Math.random() * 2, d = 4.5 + Math.random() * 2, h = 3 + Math.random() * 1.6;
        const ho = house(w, d, h, pal[0], pal[1]);
        const face = Math.atan2(cz - hz, cx - hx);   // door faces toward centre
        ho.position.set(hx, gy(hx, hz), hz);
        ho.rotation.y = -face + Math.PI / 2 + Math.PI;
        group.add(ho);
        // enterable: door anchor a little in front of the door
        const dpx = hx + Math.cos(face) * (d / 2 + 1.2);
        const dpz = hz + Math.sin(face) * (d / 2 + 1.2);
        doors.push({ name: `House ${houseN + 1}`, pos: new THREE.Vector3(dpx, gy(dpx, dpz), dpz), kind: "house" });
        houseN++;
      }
    }
  }

  // two castles at opposite ends of the city -------------------------------
  const castleDefs = [
    { name: "Emberhold Castle", dx: -56, dz: -42, stone: 0x7a7066, roof: 0xb5402a },
    { name: "Frostspire Keep", dx: 58, dz: 46, stone: 0x808895, roof: 0x3a6fb0 },
  ];
  for (const c of castleDefs) {
    const ccx = cx + c.dx, ccz = cz + c.dz;
    const cas = castle(16, 9, c.stone, c.roof);
    cas.position.set(ccx, gy(ccx, ccz), ccz);
    const face = Math.atan2(cz - ccz, cx - ccx);
    cas.rotation.y = -face + Math.PI / 2 + Math.PI;
    group.add(cas);
    const gpx = ccx + Math.cos(face) * 10, gpz = ccz + Math.sin(face) * 10;
    doors.push({ name: c.name, pos: new THREE.Vector3(gpx, gy(gpx, gpz), gpz), kind: "castle" });
  }

  // healing house ----------------------------------------------------------
  const healX = cx - 22, healZ = cz - 8;
  const healHouse = house(6, 5, 3.4, 0xeef3ef, 0xd0594f);
  healHouse.position.set(healX, gy(healX, healZ), healZ); healHouse.rotation.y = Math.PI;
  const plus = new THREE.Group();
  plus.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 0.1), mat(0xffffff, 0.7, 0x882020)));
  plus.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 0.1), mat(0xffffff, 0.7, 0x882020)));
  plus.position.set(0, 2.4, 2.6); healHouse.add(plus);
  group.add(healHouse);

  // GYM (dark stone hall, restrained flame braziers) -----------------------
  const gymX = cx + 20, gymZ = cz - 14;
  const gym = new THREE.Group();
  gym.position.set(gymX, gy(gymX, gymZ), gymZ); gym.rotation.y = Math.PI;
  gym.add(new THREE.Mesh(new THREE.BoxGeometry(11, 6, 8), mat(0x52565f)).translateY(3));
  gym.add(new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.7, 8.6), mat(0x33363c)).translateY(6.3));
  gym.add(new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.2), mat(0x1b1b1f, 0.6, 0x2a0a00)).translateY(1.5).translateZ(4.05));
  const braziers = [];
  for (const s of [1, -1]) {
    gym.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.7, 8), mat(0x2a2a2e)).translateX(s * 2).translateY(0.85).translateZ(4.2));
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 8),
      new THREE.MeshBasicMaterial({ color: 0xd9772a, transparent: true, opacity: 0.8 }));
    flame.position.set(s * 2, 2.0, 4.2); gym.add(flame);
    const fl = new THREE.PointLight(0xff8a44, 1.6, 6, 2); fl.position.set(s * 2, 2.1, 4.2); gym.add(fl);
    braziers.push(flame);
  }
  group.add(gym);

  // subtle direction marker (NO blinding beacon — just a soft floating chevron)
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 4, 4),
    new THREE.MeshStandardMaterial({ color: 0x3a78b0, emissive: 0x1c4a72, emissiveIntensity: 0.5, roughness: 0.6 }));
  marker.rotation.x = Math.PI; marker.position.set(cx, gy(cx, cz) + 24, cz); group.add(marker);
  const markerBaseY = marker.position.y;

  // ---- NPCs --------------------------------------------------------------
  const npcs = [];
  function placeNpc(def, ax, az, palette, face = 0) {
    const fig = makePerson(palette);
    fig.position.set(ax, gy(ax, az), az); fig.rotation.y = face;
    group.add(fig);
    npcs.push({ ...def, pos: new THREE.Vector3(ax, gy(ax, az), az), group: fig, baseY: gy(ax, az), defeated: false, said: 0 });
  }
  placeNpc({ name: "PIP", kind: "talk", lines: [
    "Welcome to Cinderhollow — biggest city in the valley!",
    "Two castles guard our gates. You can wander right inside, you know.",
    "Beat the Gym for the Ember Badge — nobody's managed it lately!",
  ] }, cx - 5, cz - 4, { shirt: 0x2f7d4f, pants: 0x3a2a1a, hat: 0xcc5533 });
  placeNpc({ name: "NURSE WREN", kind: "nurse", lines: [
    "Let me patch up your team — there, good as new!",
    "Come back any time your friends are worn out.",
  ] }, healX + 3, healZ + 3, { shirt: 0xeef3ef, pants: 0xd0594f, hat: 0xffffff });
  placeNpc({ name: "LEADER MAGMARA", kind: "gym",
    team: [{ key: "magmite", level: 9 }, { key: "emberpup", level: 10 }, { key: "terradon", level: 12 }],
    badge: "Ember",
    lines: ["So you've come for the Ember Badge? Then show me a fire that won't go out!"],
    winLines: ["Hah! Your bond burns brighter than mine. The Ember Badge is yours — wear it proud."],
  }, gymX, gymZ + 6, { shirt: 0xb5321c, pants: 0x2a1a14, hat: 0xff8a33 }, Math.PI);
  placeNpc({ name: "ROCKHOUND BRYNN", kind: "trainer",
    team: [{ key: "pebblade", level: 7 }, { key: "terradon", level: 8 }],
    lines: ["You there! My rock-hard team will crush you flat!"],
    winLines: ["Argh — solid moves. You've earned this one."],
  }, cx + 14, cz + 6, { shirt: 0x7a6a4a, pants: 0x3a2a1a, hat: 0x8a5a30 });
  placeNpc({ name: "RANGER KOA", kind: "trainer",
    team: [{ key: "leafcub", level: 7 }, { key: "galefeather", level: 8 }, { key: "mistfin", level: 9 }],
    lines: ["The wilds taught me everything. Let's see what YOU'VE learned!"],
    winLines: ["Whew! A worthy battle — the forest smiles on you."],
  }, cx - 16, cz + 14, { shirt: 0x2f7d4f, pants: 0x244a2a, hat: 0x355e35 });
  placeNpc({ name: "ACE DUELIST RIO", kind: "trainer",
    team: [{ key: "sparkmouse", level: 8 }, { key: "shadowpaw", level: 9 }, { key: "frostbun", level: 10 }],
    lines: ["They call me the Ace of Cinderhollow. Care to find out why?"],
    winLines: ["Incredible! You and your team move as one. Respect."],
  }, cx + 30, cz + 22, { shirt: 0x33408a, pants: 0x1a2040, hat: 0x5566cc });

  function update(dt, time, targetPos) {
    for (const n of npcs) {
      n.group.position.y = n.baseY + Math.sin(time * 1.6 + n.pos.x) * 0.04;
      if (targetPos) {
        const dx = targetPos.x - n.pos.x, dz = targetPos.z - n.pos.z;
        if (dx * dx + dz * dz < 36) n.group.rotation.y = Math.atan2(dx, dz);
      }
    }
    for (const f of braziers) f.scale.y = 1 + Math.sin(time * 10 + f.position.x) * 0.15;
    marker.position.y = markerBaseY + Math.sin(time * 1.6) * 0.7;
    marker.rotation.z = time * 0.5;
  }

  return {
    group, npcs, doors, update,
    center: new THREE.Vector3(cx, gy(cx, cz), cz),
    gymPos: new THREE.Vector3(gymX, gy(gymX, gymZ), gymZ),
    radius: DISTRICT * 0.6,
  };
}
