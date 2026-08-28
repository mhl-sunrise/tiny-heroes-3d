// world/building.js â€” the burning building: brick shell, floor slabs, the
// window grid that catches fire, plus facade and rooftop details.
import * as THREE from "three";
import { PERF } from "../config.js";

// Phones can't afford the PBR (Standard) fragment cost: same colors/emissive,
// much cheaper Lambert. Desktop keeps the full PBR look.
const StdMat = PERF.useLambert ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;

const WALL_H = 9.6;
const STORY = 3.2;

/* ------------------------------ textures ------------------------------- */
function makeBrickTexture() {
  const w = 256, h = 256;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#4a4038";
  ctx.fillRect(0, 0, w, h);
  const bh = 32, bw = 64;
  for (let y = 0; y < h; y += bh) {
    const off = ((y / bh) % 2) * (bw / 2);
    for (let x = -bw; x < w + bw; x += bw) {
      const shade = 0.85 + Math.random() * 0.35;
      const r = Math.floor(150 * shade), g = Math.floor(122 * shade), b = Math.floor(112 * shade);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
    }
  }
  ctx.fillStyle = "rgba(255,180,120,0.06)";
  for (let i = 0; i < 400; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeAsphaltTexture() {
  const s = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#2c364e";
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 4000; i++) {
    const v = 52 + Math.random() * 40;
    ctx.fillStyle = `rgba(${v},${v + 4},${v + 14},0.6)`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 8);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


/* ------------------------- ground, road, building ---------------------- */
export function buildEnvironment() {
  const g = new THREE.Group();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new StdMat({
      map: makeAsphaltTexture(),
      color: 0xffffff,
      roughness: 0.95,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  g.add(ground);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 6),
    new StdMat({ color: 0x20222b, roughness: 1 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, 11);
  g.add(road);
  for (let i = -3; i <= 3; i++) {
    const dash = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.18),
      new StdMat({ color: 0xf5d76b, emissive: 0x332a00, roughness: 1 })
    );
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(i * 3, 0.012, 11);
    g.add(dash);
  }

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(22.4, 0.4, 14.4),
    new StdMat({ color: 0x4a4e58, roughness: 0.9 })
  );
  // Slab top sits at y=-0.05, CLEARLY below the floor plane (y=+0.02) so the
  // two surfaces can never Z-fight (horizontal stripe banding) at shallow
  // camera angles.
  slab.position.y = -0.25;
  g.add(slab);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 14),
    new StdMat({ color: 0x454a58, roughness: 0.6, metalness: 0.1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02; // raised 2cm above slab top (-0.05) -> no Z-fighting
  g.add(floor);

  const brick = makeBrickTexture();
  brick.repeat.set(4, 2);
  const wallMat = new StdMat({ map: brick, roughness: 0.95 });

  const farWall = new THREE.Mesh(new THREE.BoxGeometry(22.4, WALL_H, 0.5), wallMat);
  farWall.position.set(0, WALL_H / 2, -7.2);
  g.add(farWall);

  const sideMat = wallMat.clone();
  const lWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, WALL_H, 14.4), sideMat);
  lWall.position.set(-11.2, WALL_H / 2, 0);
  const rWall = lWall.clone();
  rWall.position.x = 11.2;
  g.add(lWall, rWall);

  const ledgeMat = new StdMat({ color: 0x1c1e26, roughness: 0.9 });
  for (const y of [STORY, STORY * 2]) {
    const fl = new THREE.Mesh(new THREE.BoxGeometry(22.6, 0.3, 0.7), ledgeMat);
    fl.position.set(0, y, -7.1);
    const ll = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 14.6), ledgeMat);
    ll.position.set(-11.1, y, 0);
    const rl = ll.clone();
    rl.position.x = 11.1;
    g.add(fl, ll, rl);
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(23, 0.6, 15), ledgeMat);
  roof.position.set(0, WALL_H + 0.3, 0);
  g.add(roof);
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(23, 0.7, 0.5), ledgeMat);
  parapet.position.set(0, WALL_H + 0.6, -7.2);
  g.add(parapet);

  return g;
}


/* ------------------------- windows (fire showpiece) -------------------- */
export function buildWindows() {
  const g = new THREE.Group();
  const windows = [];
  const frameMat = new StdMat({ color: 0x14161d, roughness: 0.8 });
  const xs = [-9, -6, -3, 0, 3, 6, 9];
  const ys = [1.6, 4.8, 8.0];
  const zc = [-5, -2, 1, 4];

  function addWindow(x, y, z, ry) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 0.12), frameMat);
    frame.position.set(x, y, z);
    frame.rotation.y = ry;
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 1.75),
      new StdMat({
        color: 0x18243a,
        emissive: 0x000000,
        emissiveIntensity: 1,
        roughness: 0.35,
        metalness: 0.0,
      })
    );
    glass.position.set(x, y, z);
    glass.rotation.y = ry;
    // push glass slightly proud of frame
    glass.position.x += Math.sin(ry) * 0.07;
    glass.position.z += Math.cos(ry) * 0.07;
    g.add(frame, glass);
    windows.push({ glass, mat: glass.material, threshold: 0.08 + Math.random() * 0.86, on: false, ph: Math.random() * 6 });
  }

  for (const y of ys) for (const x of xs) addWindow(x, y, -6.95, 0);
  for (const y of ys) for (const z of zc) {
    addWindow(-10.95, y, z, Math.PI / 2);
    addWindow(10.95, y, z, -Math.PI / 2);
  }

  // a few interior lights on the ground-floor windows to warm the room
  const lights = [];
  for (const x of [-6, 6]) {
    const l = new THREE.PointLight(0xff7a2a, 0, 14, 2);
    l.position.set(x, 2.2, -5.5);
    g.add(l);
    lights.push({ l, ph: Math.random() * 6, base: 14 });
  }

  return { g, windows, lights };
}

/* ---------------------- facade & rooftop details ------------------------ */
function makeSignTexture(text) {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 128;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "rgba(18,20,28,0.92)";
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = "#ff9a3d";
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = "#ffd28a";
  ctx.font = "bold 62px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildDetails() {
  const g = new THREE.Group();
  const metal = new StdMat({ color: 0x3a414f, roughness: 0.5, metalness: 0.65 });
  const dark = new StdMat({ color: 0x20232c, roughness: 0.7 });
  const orange = new StdMat({ color: 0xd96a24, roughness: 0.7 });
  const green = new StdMat({ color: 0x3f7d4e, roughness: 1 });

  // --- Fire escape on the right wall (outside x = 11.45)
  const fx = 11.45;
  for (const y of [STORY, STORY * 2]) {
    const plat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 3.6), metal);
    plat.position.set(fx, y - 0.04, -0.5);
    g.add(plat);
    for (const pz of [-2.1, -0.5, 1.1]) {
      for (const px of [fx - 0.65, fx + 0.65]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 6), metal);
        post.position.set(px, y + 0.44, pz);
        g.add(post);
      }
    }
    for (const dy of [0.35, 0.85]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.7, 6), metal);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(fx - 0.65, y + dy, -0.5);
      const rail2 = rail.clone();
      rail2.position.x = fx + 0.65;
      g.add(rail, rail2);
    }
  }
  // diagonal stair between ground and first landing
  const stair = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 4.4), metal);
  stair.position.set(fx, 1.55, 1.6);
  stair.rotation.x = 0.74;
  g.add(stair);
  const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 4.5), metal);
  stringer.position.set(fx + 0.5, 1.72, 1.6);
  stringer.rotation.x = 0.74;
  g.add(stringer);

  // --- climbable ladders on the fire escape (one per story, story 2-3 on
  // the back side of the rail so the climb reads against the building)
  for (let st = 0; st < 3; st++) {
    const y0 = st * STORY;
    for (const ro of [-0.32, 0.32]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, STORY, 0.06), metal);
      rail.position.set(fx + 0.12, y0 + STORY / 2, -0.5 + ro);
      g.add(rail);
    }
    for (let i = 0; i < 7; i++) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.74), metal);
      rung.position.set(fx + 0.12, y0 + 0.3 + i * 0.44, -0.5);
      g.add(rung);
    }
  }

  // --- Drains / pipes on the left wall
  for (const pz of [2.4, 3.1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, WALL_H, 8), dark);
    pipe.position.set(-11.45, WALL_H / 2, pz);
    g.add(pipe);
  }

  // --- AC units under second-floor windows (front wall, z = -7.2)
  for (const px of [-6, 0, 6]) {
    const ac = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.3), metal);
    ac.position.set(px, 3.85, -7.0);
    g.add(ac);
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14), dark);
    fan.rotation.x = Math.PI / 2;
    fan.position.set(px, 3.85, -6.82);
    g.add(fan);
  }

  // --- Window boxes with plants on the ground floor
  for (const px of [-3, 3]) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.32), orange);
    box.position.set(px, 1.32, -7.0);
    g.add(box);
    for (const ox of [-0.4, 0, 0.4]) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), green);
      leaf.position.set(px + ox, 1.52, -7.0);
      leaf.scale.set(1, 0.8, 1);
      g.add(leaf);
    }
  }

  // --- Entrance: door, awning, steps, glowing sign
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.5, 0.14), dark);
  door.position.set(0, 1.27, -7.06);
  g.add(door);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.09, 1.3), orange);
  awning.position.set(0, 2.85, -6.45);
  awning.rotation.x = 0.16;
  g.add(awning);
  const steps = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 1.3), metal);
  steps.position.set(0, 0.05, -6.4);
  g.add(steps);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 1.15),
    new THREE.MeshBasicMaterial({ map: makeSignTexture("CAMPUS HALL"), transparent: true })
  );
  sign.position.set(0, 4.35, -7.12);
  g.add(sign);

  // --- Rooftop: water tank + antenna with blinking warning light
  const roofY = WALL_H + 0.6;
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 2.5, 14), dark);
  tank.position.set(-6.5, roofY + 1.45, -3);
  g.add(tank);
  const tankTop = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.7, 14), dark);
  tankTop.position.set(-6.5, roofY + 3.05, -3);
  g.add(tankTop);
  for (const [lx, lz] of [[-7.4, -3.7], [-5.6, -3.7], [-7.4, -2.3], [-5.6, -2.3]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6), metal);
    leg.position.set(lx, roofY + 0.5, lz);
    g.add(leg);
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 3.4, 6), metal);
  antenna.position.set(6.5, roofY + 1.7, 2.5);
  g.add(antenna);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 10),
    new StdMat({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 2.5 })
  );
  beacon.position.set(6.5, roofY + 3.5, 2.5);
  g.add(beacon);
  g.userData.beacon = beacon;
  return g;
}