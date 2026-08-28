// world/furniture.js — per-floor set dressing for the multistory building,
// plus the floor platform that appears under the stage on the upper floors.
// Each floor is a group in FLOOR-LOCAL coordinates (y=0 at the floor face);
// world/index.js shows only the current one and lifts it to the right height.
import * as THREE from "three";
import { MAZE, PERF } from "../config.js";

// Phones can't afford the PBR (Standard) fragment cost: same colors/emissive,
// much cheaper Lambert. Desktop keeps the full PBR look.
const StdMat = PERF.useLambert ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;

function std(color, o = {}) {
  return new StdMat(
    Object.assign({ color, roughness: 0.9 }, o)
  );
}
function box(w, h, d, color, o = {}) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(color, o));
}

// Slab + wooden floor that carries the stage on the upper stories, plus a
// CEILING one story up so the camera never looks up into an open, unlit void
// (which read as a black band and let you "see through" to the roof/street).
// The attic (floor 2) doesn't need one — the real roof sits at +FLOOR_H there.
export function buildFloorPlatform() {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(22.4, 0.4, 14.4),
    std(0x4a4e58, { roughness: 0.9 })
  );
  slab.position.y = -0.25;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 14),
    std(0x6a5138, { roughness: 0.85 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  g.add(slab, floor);
  // ceiling of this story = the underside slab of the one above
  const ceilingSlab = new THREE.Mesh(
    new THREE.BoxGeometry(22.4, 0.4, 14.4),
    std(0x3c3f48, { roughness: 0.95 })
  );
  ceilingSlab.position.y = 3.2 - 0.2; // bottom face at +3.0, above the hero (1.8)
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 14),
    std(0x454136, { roughness: 0.95 })
  );
  ceiling.rotation.x = Math.PI / 2; // face DOWN
  ceiling.position.y = 3.2 - 0.42; // just under the slab bottom — no z-fight
  g.add(ceilingSlab, ceiling);
  return g;
}

/* --------------------------- GROUND FLOOR ------------------------------ */
function buildGroundFloor() {
  const g = new THREE.Group();
  // stack of crates tucked into the corner (outside the walkable bounds)
  const c1 = box(0.7, 0.7, 0.7, 0x8a6a42);
  c1.position.set(-10.25, 0.35, -6.25);
  const c2 = box(0.7, 0.7, 0.7, 0x7a5c38);
  c2.position.set(-9.85, 0.35, -5.9);
  const c3 = box(0.7, 0.7, 0.7, 0x8a6a42);
  c3.position.set(-10.05, 1.05, -6.0);
  c3.rotation.y = 0.4;
  g.add(c1, c2, c3);
  // potted plant near the right wall
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.16, 0.3, 10),
    std(0x9c4a2a, { roughness: 0.8 })
  );
  pot.position.set(10.0, 0.15, -5.4);
  const leaves = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 10, 10),
    std(0x3f7d4e, { roughness: 1 })
  );
  leaves.position.set(10.0, 0.55, -5.4);
  g.add(pot, leaves);
  // doormat in front of the entrance
  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.1),
    std(0x2a2d38, { roughness: 1 })
  );
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(0, 0.025, -6.2);
  g.add(mat);
  // shelf with jars against the left wall
  const shelf = box(1.7, 0.07, 0.4, 0x6a5138);
  shelf.position.set(-10.3, 1.5, 3.2);
  g.add(shelf);
  for (const jx of [-0.5, 0, 0.5]) {
    const jar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.1, 0.22, 8),
      std(0xbfd8e8, { roughness: 0.25, transparent: true, opacity: 0.75 })
    );
    jar.position.set(-10.3 + jx, 1.65, 3.2);
    g.add(jar);
  }
  return g;
}
/* ---------------------------- SECOND FLOOR ----------------------------- */
function buildSecondFloor() {
  const g = new THREE.Group();
  // round rug
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(1.7, 20),
    std(0x8a4a3a, { roughness: 1 })
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.025, 0);
  g.add(rug);
  // sofa against the back wall
  const seat = box(2.2, 0.4, 0.9, 0x4a6a8a);
  seat.position.set(-4, 0.2, -5.9);
  const back = box(2.2, 0.7, 0.25, 0x3e5a76);
  back.position.set(-4, 0.65, -6.2);
  g.add(seat, back);
  for (const sx of [-1, 1]) {
    const arm = box(0.25, 0.55, 0.9, 0x3e5a76);
    arm.position.set(-4 + sx * 1.22, 0.28, -5.9);
    g.add(arm);
  }
  // bed against the right side
  const frame = box(1.5, 0.3, 2.4, 0x5a4632);
  frame.position.set(8.3, 0.15, -4.5);
  const mattress = box(1.4, 0.25, 2.3, 0xe8e2d4);
  mattress.position.set(8.3, 0.42, -4.5);
  const blanket = box(1.42, 0.12, 1.5, 0x8a3a4a);
  blanket.position.set(8.3, 0.52, -4.1);
  const pillow = box(0.6, 0.14, 0.35, 0xf4f0e4);
  pillow.position.set(8.3, 0.6, -5.5);
  g.add(frame, mattress, blanket, pillow);
  // small table with legs
  const top = box(1.1, 0.08, 1.1, 0x6a5138);
  top.position.set(3.8, 0.55, 2.8);
  g.add(top);
  for (const [lx, lz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.55, 6),
      std(0x4a3a28)
    );
    leg.position.set(3.8 + lx, 0.27, 2.8 + lz);
    g.add(leg);
  }
  // burnt floor hole with a ring of glowing embers
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 18),
    new StdMat({ color: 0x050403, roughness: 1 })
  );
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(-1.5, 0.03, -3.5);
  const emberRing = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.25, 20),
    new StdMat({
      color: 0x3a1204,
      emissive: 0xff5a1e,
      emissiveIntensity: 1.6,
      side: THREE.DoubleSide,
      roughness: 1,
    })
  );
  emberRing.rotation.x = -Math.PI / 2;
  emberRing.position.set(-1.5, 0.035, -3.5);
  g.add(hole, emberRing);
  return g;
}

/* -------------------------------- ATTIC -------------------------------- */
function buildAttic() {
  const g = new THREE.Group();
  // rafters leaning against the back wall
  for (let i = 0; i < 6; i++) {
    const r = box(0.14, 0.14, 3.4, 0x4a3a28);
    r.position.set(-8.4 + i * 3.2, 1.5, -6.9);
    r.rotation.x = 0.5;
    g.add(r);
  }
  // wardrobe in the corner
  const ward = box(1.5, 2.2, 0.8, 0x6a5138);
  ward.position.set(-9.4, 1.1, -6.1);
  const line = box(0.03, 2.1, 0.05, 0x3a2c1e);
  line.position.set(-9.4, 1.1, -5.68);
  g.add(ward, line);
  // stacked boxes by the right wall
  const b1 = box(0.8, 0.8, 0.8, 0x8a6a42);
  b1.position.set(10.0, 0.4, -5.8);
  const b2 = box(0.6, 0.6, 0.6, 0x7a5c38);
  b2.position.set(9.9, 1.1, -5.9);
  b2.rotation.y = 0.5;
  g.add(b1, b2);
  // rug
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 2),
    std(0x5a4a6a, { roughness: 1 })
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(2, 0.025, 1);
  g.add(rug);
  // a toppled ladder lying on the floor (story beat)
  const lie = box(0.12, 0.12, 2.6, 0x7a5c38);
  lie.position.set(-5.5, 0.06, 3.8);
  lie.rotation.y = 0.7;
  g.add(lie);
  return g;
}

/* ------------------------------ MAZE OBSTACLES -------------------------- */
// Solid set-pieces (half-walls, tables, sofas, crate stacks) that maze up each
// floor. Built from the MAZE config so the layout lives in ONE place. Every
// entry also yields an AABB (minX/maxX/minZ/maxZ, floor-local) for hero
// collision — world/index.js hands the active floor's list to the game.
function buildWallOb(o) {
  const g = new THREE.Group();
  const body = box(o.w, o.h, o.d, 0x7d7468, { roughness: 0.95 });
  body.position.y = o.h / 2;
  g.add(body);
  // charred, broken top edge — it's a building on fire, not a park
  const char = box(o.w + 0.04, 0.14, o.d + 0.04, 0x241d16);
  char.position.y = o.h + 0.05;
  g.add(char);
  // a darker scorch patch on the face
  const patch = box(o.w * 0.4, o.h * 0.5, o.d + 0.02, 0x4a4238);
  patch.position.set(o.w * 0.15, o.h * 0.42, 0);
  g.add(patch);
  g.position.set(o.x, 0, o.z);
  return g;
}
function buildTableOb(o) {
  const g = new THREE.Group();
  const top = box(o.w, 0.08, o.d, 0x5a4632);
  top.position.y = o.h;
  g.add(top);
  const h = o.h - 0.04;
  for (const [lx, lz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, h, 6),
      std(0x4a3a28)
    );
    leg.position.set(lx * (o.w / 2 - 0.1), h / 2, lz * (o.d / 2 - 0.1));
    g.add(leg);
  }
  // something knocked over on the floor next to it (story beat)
  const fallen = box(0.3, 0.3, 0.3, 0x6a5138);
  fallen.position.set(o.w / 2 + 0.3, 0.15, o.d / 2 - 0.1);
  fallen.rotation.y = 0.6;
  g.add(fallen);
  g.position.set(o.x, 0, o.z);
  return g;
}
function buildSofaOb(o) {
  const g = new THREE.Group();
  const seat = box(o.w, 0.42, o.d, 0x4a6a8a);
  seat.position.y = 0.21;
  const back = box(o.w, o.h - 0.35, 0.22, 0x3e5a76);
  back.position.set(0, 0.42 + (o.h - 0.35) / 2, -o.d / 2 + 0.11);
  g.add(seat, back);
  for (const sx of [-1, 1]) {
    const arm = box(0.22, 0.58, o.d, 0x3e5a76);
    arm.position.set(sx * (o.w / 2 - 0.11), 0.29, 0);
    g.add(arm);
  }
  g.position.set(o.x, 0, o.z);
  return g;
}
function buildCrateOb(o) {
  const g = new THREE.Group();
  const n = Math.round(o.h / 0.55); // stack of crates ~0.55 tall each
  for (let i = 0; i < n; i++) {
    const s = Math.min(o.w, o.d) * (i % 2 ? 0.78 : 1);
    const c = box(s, 0.55, s, i % 2 ? 0x7a5c38 : 0x8a6a42);
    c.position.set((i % 2 ? 0.12 : -0.08), 0.275 + i * 0.55, 0);
    c.rotation.y = i % 2 ? 0.35 : -0.15;
    g.add(c);
  }
  g.position.set(o.x, 0, o.z);
  return g;
}
const OB_BUILDERS = { wall: buildWallOb, table: buildTableOb, sofa: buildSofaOb, crate: buildCrateOb };

export function buildMaze() {
  return MAZE.map((layout) => {
    const g = new THREE.Group();
    const boxes = [];
    for (const o of layout) {
      const b = OB_BUILDERS[o.kind] ? OB_BUILDERS[o.kind](o) : buildWallOb(o);
      g.add(b);
      boxes.push({
        minX: o.x - o.w / 2,
        maxX: o.x + o.w / 2,
        minZ: o.z - o.d / 2,
        maxZ: o.z + o.d / 2,
      });
    }
    return { g, boxes };
  });
}

/* ------------------------------- assembly ------------------------------ */
export function buildFurniture() {
  const floors = [buildGroundFloor(), buildSecondFloor(), buildAttic()];
  floors.forEach((f, i) => {
    f.visible = i === 0;
  });
  return floors;
}