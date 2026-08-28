// world/street.js â€” the street around the burning building: streetlamps,
// trees, a fire hydrant, parked cars, benches, hedges, crosswalk, manholes
// and fake reflective puddles. All props sit OUTSIDE the play bounds.
import * as THREE from "three";
import { PERF, IS_MOBILE } from "../config.js";

// Phones can't afford the PBR (Standard) fragment cost: same colors/emissive,
// much cheaper Lambert. Desktop keeps the full PBR look.
const StdMat = PERF.useLambert ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;

function stdMat(color, o = {}) {
  return new StdMat(
    Object.assign({ color, roughness: 0.85, metalness: 0 }, o)
  );
}

/* ------------------------------ streetlamps ---------------------------- */
const LAMP_POS = [
  { x: -14, z: -2 },
  { x: 14, z: -2 },
  { x: -14, z: 5, lit: true },
  { x: 14, z: 5, lit: true },
];

// How many streetlamps get a real point light (the rest glow via emissive).
let lampLightCount = 0;

function buildLamp(x, z, lit) {
  const g = new THREE.Group();
  const pole = stdMat(0x2b2f3a, { roughness: 0.5, metalness: 0.6 });
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 4.6, 8), pole);
  p.position.y = 2.3;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.25, 8), pole);
  base.position.y = 0.12;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.2, 0.35),
    stdMat(0xffe0b0, { emissive: 0xffc880, emissiveIntensity: 1.8, roughness: 0.4 })
  );
  head.position.set(x > 0 ? -0.35 : 0.35, 4.62, 0);
  g.add(p, base, head);
  // Only the FIRST lit lamp gets a real point light on mobile (budget); the
  // others still glow via their emissive head.
  const useLight = lit && (!IS_MOBILE || lampLightCount++ < 1);
  if (useLight) {
    const l = new THREE.PointLight(0xffd9a0, PERF.streetLightInt, 20, 2);
    l.position.set(x > 0 ? -0.6 : 0.6, 4.5, 0);
    g.add(l);
  }
  g.position.set(x, 0, z);
  return g;
}

/* --------------------------------- trees ------------------------------- */
function buildTree(x, z, s = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13 * s, 0.2 * s, 1.7 * s, 8),
    stdMat(0x5a4632, { roughness: 1 })
  );
  trunk.position.y = 0.85 * s;
  g.add(trunk);
  const fol = new THREE.Group();
  const greens = [0x2f6b3e, 0x387a45, 0x2a5c38];
  const blobs = [
    { r: 0.95, y: 2.2, o: [0, 0, 0] },
    { r: 0.72, y: 2.75, o: [0.35, 0, 0.1] },
    { r: 0.6, y: 2.05, o: [-0.45, 0, -0.15] },
  ];
  blobs.forEach((b, i) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(b.r * s, 10, 10),
      stdMat(greens[i % 3], { roughness: 1 })
    );
    m.position.set(b.o[0] * s, b.y * s, b.o[2] * s);
    fol.add(m);
  });
  g.add(fol);
  g.position.set(x, 0, z);
  g.userData.fol = fol;
  return g;
}

/* ----------------------------- fire hydrant ---------------------------- */
function buildHydrant(x, z) {
  const g = new THREE.Group();
  const red = stdMat(0xd93a2a, { roughness: 0.45, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 10), red);
  body.position.y = 0.35;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), red);
  cap.position.y = 0.72;
  const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 8), red);
  nut.position.y = 0.85;
  g.add(body, cap, nut);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), red);
    side.rotation.z = Math.PI / 2;
    side.position.set(sx * 0.2, 0.45, 0);
    g.add(side);
  }
  g.position.set(x, 0, z);
  return g;
}

/* ------------------------------ parked cars ---------------------------- */
function buildCar(color) {
  const g = new THREE.Group();
  const paint = stdMat(color, { roughness: 0.35, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.2), paint);
  body.position.y = 0.78;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.5, 2.0),
    stdMat(0x24343f, { roughness: 0.15, metalness: 0.5 })
  );
  cabin.position.set(0, 1.3, -0.2);
  g.add(body, cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const dark = stdMat(0x14161c, { roughness: 0.7 });
  for (const sx of [-1, 1])
    for (const sz of [-1.35, 1.35]) {
      const w = new THREE.Mesh(wheelGeo, dark);
      w.position.set(sx * 0.95, 0.42, sz);
      g.add(w);
    }
  const hlMat = stdMat(0xfff2c0, { emissive: 0xffe9a0, emissiveIntensity: 1.2 });
  const tlMat = stdMat(0xff3030, { emissive: 0xff2020, emissiveIntensity: 0.9 });
  for (const sx of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), hlMat);
    hl.position.set(sx, 0.85, 2.11);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), tlMat);
    tl.position.set(sx, 0.85, -2.11);
    g.add(hl, tl);
  }
  return g;
}
/* -------------------------------- benches ------------------------------ */
function buildBench(x, z, ry) {
  const g = new THREE.Group();
  const wood = stdMat(0x7a5a3a, { roughness: 1 });
  const metal = stdMat(0x2b2f3a, { roughness: 0.5, metalness: 0.6 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), wood);
  seat.position.y = 0.45;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 0.07), wood);
  back.position.set(0, 0.78, -0.24);
  back.rotation.x = -0.15;
  g.add(seat, back);
  for (const sx of [-0.8, 0.8]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.45, 0.45), metal);
    leg.position.set(sx, 0.22, 0);
    g.add(leg);
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return g;
}

/* ----------------------------- road furniture -------------------------- */
function buildStreetExtras(g) {
  // sidewalk strip between stage slab and the road
  const curb = new THREE.Mesh(
    new THREE.BoxGeometry(22.4, 0.1, 1.2),
    stdMat(0x3c4150, { roughness: 0.95 })
  );
  curb.position.set(0, 0.05, 7.8);
  g.add(curb);
  const curbEdge = new THREE.Mesh(new THREE.BoxGeometry(22.4, 0.16, 0.2), stdMat(0x565d6e, { roughness: 0.9 }));
  curbEdge.position.set(0, 0.08, 8.42);
  g.add(curbEdge);

  // hedges lining the front, with a clear walkway to the exit
  const hedgeMat = stdMat(0x2e5d38, { roughness: 1 });
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.55, 0.8), hedgeMat);
      h.position.set(sx * (3.6 + i * 1.32), 0.33, 7.7);
      h.scale.y = 0.85 + Math.random() * 0.35;
      g.add(h);
    }
  }

  // zebra crossing over the road
  const stripeMat = new StdMat({ color: 0xd8dce6, roughness: 0.9 });
  for (const px of [-1.65, -1.0, -0.35, 0.35, 1.0, 1.65]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3.4), stripeMat);
    s.rotation.x = -Math.PI / 2;
    s.position.set(px, 0.013, 11);
    g.add(s);
  }

  // manholes
  const manhole = stdMat(0x191c24, { roughness: 0.6, metalness: 0.5 });
  for (const [mx, mz] of [[6, 11.8], [-8.5, 9.6]]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.03, 14), manhole);
    m.position.set(mx, 0.014, mz);
    g.add(m);
  }

  // fake reflective puddles (shiny phong catches the fire/lamp lights)
  const puddleMat = new THREE.MeshPhongMaterial({
    color: 0x1c2740,
    shininess: 220,
    specular: 0x99bbff,
  });
  for (const [px, pz, sx] of [[4.5, 12.2, 1.5], [-2, 9.4, 1.1], [8.5, 9.2, 0.9]]) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.8, 18), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(px, 0.012, pz);
    p.scale.set(sx, 0.9, 1);
    g.add(p);
  }
}

/* ------------------------------- assembly ------------------------------ */
export function buildStreet() {
  const g = new THREE.Group();
  const foliages = [];

  for (const L of LAMP_POS) g.add(buildLamp(L.x, L.z, !!L.lit));

  const trees = [
    [-15.2, -5, 1.1],
    [-15.8, -1.2, 0.95],
    [-14.8, 3.4, 1.05],
    [15.2, -4.6, 1.0],
    [15.8, -0.8, 1.15],
    [14.8, 4.2, 0.9],
  ];
  for (const [x, z, s] of trees) {
    const t = buildTree(x, z, s);
    foliages.push(t.userData.fol);
    g.add(t);
  }

  g.add(buildHydrant(-12.6, 8.7));
  const carA = buildCar(0x3a6ea5);
  carA.position.set(-3.6, 0, 12.7);
  const carB = buildCar(0xa54a3a);
  carB.position.set(3.8, 0, 12.9);
  carB.rotation.y = Math.PI;
  g.add(carA, carB);

  g.add(buildBench(-13.4, -6.6, Math.PI / 2));
  g.add(buildBench(13.4, 1.6, -Math.PI / 2));

  buildStreetExtras(g);

  function update(dt, time) {
    for (let i = 0; i < foliages.length; i++) {
      foliages[i].rotation.z = Math.sin(time * 0.8 + i * 1.7) * 0.035;
      foliages[i].rotation.x = Math.cos(time * 0.6 + i * 2.1) * 0.025;
    }
  }
  return { g, update };
}