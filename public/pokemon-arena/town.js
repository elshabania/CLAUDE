// town.js — Cinderhollow: a small walkable town with NPCs and a gym leader.
// Original content (names, dialogue, layout). Self-contained: primitives only.
// Exports buildTown(scene, ground, center) -> { group, npcs, update }.
//   npcs: [{ name, kind: "talk"|"nurse"|"gym", pos: Vector3, lines, team, badge,
//            defeated, group, faceTarget(p) }]

import * as THREE from "three";

function mat(color, rough = 0.85, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, emissive });
}

// ---- a simple low-poly townsperson -----------------------------------------
function makePerson({ shirt = 0x3366cc, pants = 0x223344, skin = 0xe8b890, hat = null }) {
  const g = new THREE.Group();
  const legMat = mat(pants), bodyMat = mat(shirt), skinMat = mat(skin);
  for (const s of [1, -1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.7, 8), legMat);
    leg.position.set(s * 0.12, 0.35, 0);
    g.add(leg);
  }
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.7, 10), bodyMat);
  torso.position.y = 1.05; g.add(torso);
  for (const s of [1, -1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.6, 8), bodyMat);
    arm.position.set(s * 0.32, 1.05, 0); arm.rotation.z = s * 0.18; g.add(arm);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), skinMat);
  head.position.y = 1.62; g.add(head);
  // eyes
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

// ---- buildings -------------------------------------------------------------
function house(w, d, h, wall, roof) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(wall));
  body.position.y = h / 2; g.add(body);
  const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) * 0.62, h * 0.7, 4), mat(roof));
  roofMesh.position.y = h + h * 0.35; roofMesh.rotation.y = Math.PI / 4; g.add(roofMesh);
  // door
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.1), mat(0x4a2f1a));
  door.position.set(0, 0.6, d / 2 + 0.02); g.add(door);
  // windows
  for (const s of [1, -1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.08), mat(0x9fd6ff, 0.3, 0x335577));
    win.position.set(s * w * 0.28, h * 0.62, d / 2 + 0.02); g.add(win);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function buildTown(scene, ground, center) {
  const group = new THREE.Group();
  group.name = "cinderhollow";
  scene.add(group);
  const gy = (x, z) => (ground ? ground(x, z) : 0);
  const cx = center.x, cz = center.z;

  // plaza disc
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 0.3, 40), mat(0xbfae93));
  plaza.position.set(cx, gy(cx, cz) + 0.05, cz); plaza.receiveShadow = true; group.add(plaza);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(12, 0.5, 8, 40), mat(0x8a7a60));
  ring.rotation.x = Math.PI / 2; ring.position.set(cx, gy(cx, cz) + 0.16, cz); group.add(ring);

  // central fountain
  const fountain = new THREE.Group();
  fountain.position.set(cx, gy(cx, cz) + 0.1, cz);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.6, 20), mat(0x9aa7b0));
  basin.position.y = 0.3; fountain.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.2, 20), mat(0x4ec0e6, 0.2, 0x1a5a7a));
  water.position.y = 0.55; fountain.add(water);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 1.4, 10), mat(0x9aa7b0));
  spout.position.y = 1.2; fountain.add(spout);
  group.add(fountain);

  // a few houses ringing the plaza
  const housePalettes = [
    [0xd9c7a3, 0xb5532e], [0xc8d2b0, 0x6a8f3a], [0xc7b6d4, 0x55408a], [0xe0c0a0, 0x9a5a2a],
  ];
  const houses = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const r = 17;
    const hx = cx + Math.cos(a) * r, hz = cz + Math.sin(a) * r;
    const [wall, roof] = housePalettes[i];
    const h = house(4.2, 4, 3, wall, roof);
    h.position.set(hx, gy(hx, hz), hz);
    h.rotation.y = -a + Math.PI / 2 + Math.PI;
    group.add(h); houses.push(h);
  }

  // healing house (greenish-white with a + sign), placed at one edge
  const healAng = -Math.PI / 2;
  const healX = cx + Math.cos(healAng) * 17, healZ = cz + Math.sin(healAng) * 17;
  const healHouse = house(5, 4.4, 3.2, 0xeef3ef, 0xd0594f);
  healHouse.position.set(healX, gy(healX, healZ), healZ);
  healHouse.rotation.y = Math.PI;
  const plus = new THREE.Group();
  plus.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.1), mat(0xffffff, 0.5, 0xdd3333)));
  plus.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.9, 0.1), mat(0xffffff, 0.5, 0xdd3333)));
  plus.position.set(0, 2.2, 2.25); healHouse.add(plus);
  group.add(healHouse);

  // GYM — big dark-stone hall with a flaming emblem (fire gym)
  const gymAng = Math.PI / 2;
  const gymX = cx + Math.cos(gymAng) * 22, gymZ = cz + Math.sin(gymAng) * 22;
  const gym = new THREE.Group();
  gym.position.set(gymX, gy(gymX, gymZ), gymZ);
  gym.rotation.y = Math.PI;
  const gymBody = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 7), mat(0x52565f));
  gymBody.position.y = 2.5; gym.add(gymBody);
  const gymRoof = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.6, 7.6), mat(0x33363c));
  gymRoof.position.y = 5.2; gym.add(gymRoof);
  const gymDoor = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.6, 0.2), mat(0x1b1b1f, 0.5, 0x551100));
  gymDoor.position.set(0, 1.3, 3.55); gym.add(gymDoor);
  // flaming braziers either side of the door
  const braziers = [];
  for (const s of [1, -1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.6, 8), mat(0x2a2a2e));
    post.position.set(s * 1.8, 0.8, 3.7); gym.add(post);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.2, 0.3, 10), mat(0x3a3a40));
    bowl.position.set(s * 1.8, 1.7, 3.7); gym.add(bowl);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 8),
      new THREE.MeshBasicMaterial({ color: 0xffa733, transparent: true, opacity: 0.92 }));
    flame.position.set(s * 1.8, 2.2, 3.7); gym.add(flame);
    const fl = new THREE.PointLight(0xff8a33, 6, 10, 2); fl.position.set(s * 1.8, 2.3, 3.7); gym.add(fl);
    braziers.push(flame);
  }
  // emblem
  const emblem = new THREE.Mesh(new THREE.ConeGeometry(1, 2, 3),
    new THREE.MeshBasicMaterial({ color: 0xff7a1c }));
  emblem.position.set(0, 4, 3.55); gym.add(emblem);
  gym.traverse((o) => { if (o.isMesh && o.material.type !== "MeshBasicMaterial") { o.castShadow = true; o.receiveShadow = true; } });
  group.add(gym);

  // a welcome sign
  const sign = new THREE.Group();
  const signX = cx, signZ = cz - 22;
  sign.position.set(signX, gy(signX, signZ), signZ);
  const sPost = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2, 8), mat(0x5a3a22));
  sPost.position.y = 1; sign.add(sPost);
  const sBoard = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1, 0.16), mat(0x8a5a30));
  sBoard.position.y = 2; sign.add(sBoard);
  group.add(sign);

  // ---- NPCs ----------------------------------------------------------------
  const npcs = [];
  function placeNpc(def, ax, az, palette, face = 0) {
    const fig = makePerson(palette);
    fig.position.set(ax, gy(ax, az), az);
    fig.rotation.y = face;
    group.add(fig);
    npcs.push({ ...def, pos: new THREE.Vector3(ax, gy(ax, az), az), group: fig, baseY: gy(ax, az), defeated: false, said: 0 });
  }

  placeNpc({
    name: "PIP", kind: "talk",
    lines: [
      "Welcome to Cinderhollow! The old volcano keeps us cozy all year.",
      "Wild creatures gather thickest near the tall grass past the gate.",
      "Beat the Gym and you'll earn the Ember Badge — nobody's managed it lately!",
    ],
  }, cx - 8, cz - 4, { shirt: 0x2f7d4f, pants: 0x3a2a1a, hat: 0xcc5533 });

  placeNpc({
    name: "NURSE WREN", kind: "nurse",
    lines: [
      "Let me patch up your team — there, good as new!",
      "Come back any time your friends are worn out.",
    ],
  }, healX + 2.4, healZ + 2.6, { shirt: 0xeef3ef, pants: 0xd0594f, hat: 0xffffff });

  placeNpc({
    name: "LEADER MAGMARA", kind: "gym",
    team: "magmite", level: 8,
    lines: [
      "So you've come for the Ember Badge? Then show me a fire that won't go out!",
    ],
    winLines: [
      "Hah! Your bond burns brighter than mine. The Ember Badge is yours — wear it proud.",
    ],
  }, gymX, gymZ + 5.5, { shirt: 0xb5321c, pants: 0x2a1a14, hat: 0xff8a33 }, Math.PI);

  // per-frame: bob NPCs, turn them to face a nearby target
  function update(dt, time, targetPos) {
    for (const n of npcs) {
      n.group.position.y = n.baseY + Math.sin(time * 1.6 + n.pos.x) * 0.04;
      if (targetPos) {
        const dx = targetPos.x - n.pos.x, dz = targetPos.z - n.pos.z;
        if (dx * dx + dz * dz < 36) n.group.rotation.y = Math.atan2(dx, dz);
      }
    }
    for (const f of braziers) f.scale.y = 1 + Math.sin(time * 12 + f.position.x) * 0.18;
  }

  return { group, npcs, center: new THREE.Vector3(cx, gy(cx, cz), cz), gymPos: new THREE.Vector3(gymX, gy(gymX, gymZ), gymZ), update };
}
