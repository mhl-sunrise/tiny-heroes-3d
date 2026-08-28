// config.js — central tunables for the whole game.
// Level layouts, fire spots, victim placements, health & scoring constants.
// Moved out of world.js / game.js so balancing happens in ONE place.

export const BOUNDS = { minX: -9.6, maxX: 9.6, minZ: -6.2, maxZ: 6.2 };
export const EXIT = { x: 0, z: 5.8, r: 2.3 };

// Multistory: one story = 3.2 units (matches the building's floor ledges).
// Each shift is played on a different floor; between shifts the firefighter
// climbs the fire-escape ladder up to the next one.
export const FLOOR_H = 3.2;
export const FLOOR_NAMES = ["Ground floor", "Second floor", "Attic"];

// Victim placements (reused across levels, subset per level).
const PPL = {
  a: { x: -8, z: -5, color: 0x4a90d9, hair: 0x3a2a1a },
  b: { x: -4, z: -3.5, color: 0x9b59b6, hair: 0x241a12 },
  c: { x: 0.5, z: -5, color: 0x1abc9c, hair: 0x4a3423 },
  d: { x: 4, z: -4, color: 0xe91e63, hair: 0x5a3a1a },
  e: { x: 8, z: -5, color: 0x2ecc71, hair: 0x2a1c10 },
  f: { x: -6.5, z: 2.5, color: 0xe67e22, hair: 0x1e1611 },
  g: { x: 6.5, z: 1, color: 0xf1c40f, hair: 0x4a2f16 },
  h: { x: -1.5, z: 3.5, color: 0x3498db, hair: 0x2c1d12 },
};

// Fire spots: x/z on the floor, `at` = fireLevel (0..1) when it ignites,
// `scale` = flame size.
const SP = (x, z, at, scale = 1) => ({ x, z, at, scale });

export const LEVELS = [
  {
    name: "First Alarm",
    floor: 0,
    time: 100,
    smoke: 0.6, // ambient smoke multiplier
    fog: 0.75, // scene fog multiplier
    victims: [PPL.a, PPL.c, PPL.g],
    spots: [
      SP(-7, -4, 0.02, 1.1),
      SP(6.5, -4.5, 0.28, 1.0),
      SP(-2.5, 1.5, 0.52, 1.0),
      SP(8, 2, 0.7, 0.9),
      SP(0, -5.5, 0.85, 1.2),
    ],
  },
  {
    name: "Rising Smoke",
    floor: 1,
    time: 110,
    smoke: 0.85,
    fog: 0.95,
    victims: [PPL.a, PPL.b, PPL.c, PPL.d, PPL.e],
    spots: [
      SP(-7, -4, 0.02, 1.1),
      SP(6.5, -4.5, 0.2, 1.0),
      SP(-5, 3.5, 0.35, 1.0),
      SP(-2.5, 1.5, 0.5, 1.0),
      SP(2, 3, 0.62, 1.1),
      SP(8, 2, 0.75, 0.9),
      SP(0, -5.5, 0.85, 1.2),
    ],
  },
  {
    name: "Inferno",
    floor: 2,
    time: 120,
    smoke: 1.1,
    fog: 1.2,
    victims: [PPL.a, PPL.b, PPL.c, PPL.d, PPL.e, PPL.f],
    spots: [
      SP(-7, -4, 0.02, 1.15),
      SP(6.5, -4.5, 0.15, 1.0),
      SP(-9, 1, 0.3, 1.0),
      SP(-5, 3.5, 0.4, 1.0),
      SP(-2.5, 1.5, 0.5, 1.0),
      SP(5, -1, 0.6, 1.15),
      SP(2, 3, 0.7, 1.1),
      SP(8, 2, 0.8, 0.9),
      SP(0, -5.5, 0.9, 1.3),
    ],
  },
];

/* --------------------------- health & score ---------------------------- */
export const HEALTH = {
  max: 100,
  // damage per second next to a fully burned, full-size fire spot
  fireRate: 16,
  fireRadius: 4.8, // falloff radius around each fire
  // ambient damage when the whole level is thick with smoke
  smokeOnset: 0.62, // fireLevel where ambient damage starts
  smokeRate: 7, // extra max damage/sec at fireLevel 1
  regen: 7, // per second when no fire within safe distance
  safeRegen: 16, // per second inside the green exit zone
  safeRadius: 6, // "no fire nearby" distance
  lowAt: 30, // low-health threshold (heartbeat + screen pulse)
};

export const SCORE = {
  rescue: 100,
  timeBonusPerSec: 2, // added for every second left on a clear
  healthBonusPerPt: 1, // added per remaining HP point on a clear
};

export const HERO = {
  speed: 5.4,
  interactRadius: 1.3,
};

// Tension: falling debris + "ultra danger" screen state.
export const DEBRIS = {
  damage: 15, // HP lost when a chunk lands on you
  hitR: 0.95, // inside this radius at impact = hit
  closeR: 1.9, // between hitR and closeR = "Close!" bonus (reward for dodging)
  telegraph: 0.8, // seconds the red ring warns before the drop
  dropH: 4.6, // how far above the floor chunks start
  gravity: 14,
  interval: [4.5, 1.4], // steady-drop interval: calm start -> frantic finish
  burstEvery: 26, // base seconds between rumble -> burst events
  burstCount: [2, 3],
  rumbleTime: 1.4,
  closeScore: 5,
};

export const ULTRA = {
  enter: 0.78, // danger level that switches the screen to ultra
  exit: 0.7, // hysteresis: only leave below this
  microShake: 0.05,
};

/* ------------------------------ maze obstacles -------------------------- */
// Solid set-pieces per floor that give each shift a little-maze layout.
// x/z center, w/d full size, h height, kind = look. Placement rules (checked
// by eye): never blocks the exit zone (0, 5.8 r2.3), hero spawn (0, 4.6), any
// victim spot or fire spot; all heights < 2.6 so the orbit camera (min ~4.2)
// always sees over them. Gaps are wide enough (>= 2.4) to walk through.
const OB = (x, z, w, d, h, kind) => ({ x, z, w, d, h, kind });
export const MAZE = [
  // Floor 0 — First Alarm: an L of half-wall + counter, sofa and crates
  [
    OB(-4, -2, 4.4, 0.4, 1.8, "wall"), // back-left divider, open at both ends
    OB(2.5, -3.1, 2.4, 0.9, 1.0, "table"),
    OB(-6.2, 0.6, 2.4, 0.9, 0.85, "sofa"),
    OB(4.6, 1.6, 1.4, 1.4, 1.2, "crate"),
    OB(7.8, 4.4, 0.4, 2.4, 1.8, "wall"), // right-side sliver, gap at both ends
  ],
  // Floor 1 — Rising Smoke: central spine wall + corner pocket for victim e
  [
    OB(-1, -1.5, 5, 0.4, 1.8, "wall"), // spine, big gaps east + west
    OB(5, 0.5, 2, 0.9, 1.0, "table"),
    OB(-7.6, 1.5, 2.4, 0.9, 0.85, "sofa"),
    OB(-2.6, 3.3, 1.3, 1.3, 1.1, "crate"),
    OB(8.5, -2.5, 0.4, 2.5, 1.8, "wall"), // hides victim e until you round it
  ],
  // Floor 2 — Inferno: two staggered walls make a zig-zag through the middle
  [
    OB(-3, -1, 4.5, 0.4, 1.8, "wall"),
    OB(3.5, 0.5, 4.5, 0.4, 1.8, "wall"),
    OB(4.5, 4.4, 2.4, 0.9, 0.85, "sofa"),
    OB(6.8, 4.2, 1.3, 1.3, 1.1, "crate"),
    OB(0, -2.8, 1.6, 1.0, 1.0, "table"),
  ],
];

/* ------------------------------ performance ----------------------------- */
// Mobile GPUs cannot run this point-light-heavy night scene at desktop cost.
// One profile per device class so balancing happens in a single place.
export const IS_MOBILE =
  (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) ||
  (typeof navigator !== "undefined" &&
    navigator.maxTouchPoints > 1 &&
    Math.min(screen.width, screen.height) < 820);

export const PERF = {
  // Renderer: phones render far more CSS pixels per inch — cap the ratio.
  // 1.0 is the playability line: it's ~55% fewer pixels than 1.5 on a
  // typical phone, and fill rate (not resolution) is what the GPU drowns in.
  pixelRatioCap: IS_MOBILE ? 1.0 : 2,
  // 120/144Hz phones would otherwise render the whole scene at display rate.
  // Capping at 60fps halves the per-second GPU cost; 0 = uncapped.
  frameRateCap: IS_MOBILE ? 60 : 0,
  // Post chain (bloom = 4+ fullscreen passes) is skipped on mobile; the scene
  // renders straight to the MSAA canvas instead (antialias then pays off).
  postFX: !IS_MOBILE,
  // Per-pixel material model: PBR (Standard) is the single biggest fragment
  // cost in this light-heavy night scene. Phones use plain Lambert — same
  // colors/emissive/maps, but no specular GGX loop per light.
  useLambert: IS_MOBILE,
  // Point-light budget: every light is evaluated per-pixel in every PBR
  // material. Desktop can take them all; phones keep only the nearest fires
  // lit (unlit flames still glow via their emissive shader planes).
  fireLights: IS_MOBILE ? 2 : Infinity,
  scorchLightMul: IS_MOBILE ? 0 : 1, // scorch fires keep flames, lose their light
  windowLights: IS_MOBILE ? 0 : 2, // windows keep glowing, lose their lights
  streetLightInt: IS_MOBILE ? 3.5 : 9,
  // The 4th scene light (warm fill) is nearly invisible at night but costs a
  // per-pixel evaluation — drop it on phones.
  fillLight: !IS_MOBILE,
  // Flame shader: fewer crossed planes + fewer noise octaves per fragment.
  flamePlanes: IS_MOBILE ? 2 : 3,
  flameOctaves: IS_MOBILE ? 3 : 5,
  // Smoke: big soft particles are pure overdraw; phones get fewer, smaller.
  smokeCount: IS_MOBILE ? 80 : 140,
  smokeScale: IS_MOBILE ? 0.7 : 1,
};