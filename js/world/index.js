// world/index.js — assembles every world module into one scene graph and
// exposes a single update(). Fire spots are rebuilt per level from config.
import * as THREE from "three";
import { LEVELS, FLOOR_H, PERF } from "../config.js";
import { buildSky, buildMoon, buildClouds, buildSkyline } from "./sky.js";
import { buildEnvironment, buildWindows, buildDetails } from "./building.js";
import { buildStreet } from "./street.js";
import { buildFurniture, buildFloorPlatform } from "./furniture.js";
import { Fire, buildExit } from "./fire.js";
import { buildSmoke, buildEmbers } from "./smoke.js";
import { buildFireTruck } from "./truck.js";

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function createWorld(scene) {
  const world = new THREE.Group();
  scene.add(world);

  // Environment (built once)
  world.add(buildSky());
  world.add(buildMoon());
  const clouds = buildClouds();
  world.add(clouds.g);
  world.add(buildSkyline());
  world.add(buildEnvironment());
  const details = buildDetails();
  world.add(details);
  const win = buildWindows();
  world.add(win.g);
  // Window point-light budget — the glass keeps its emissive glow, but on
  // mobile the extra per-pixel lights are what tank the frame rate.
  win.lights.forEach((wl, i) => {
    wl.l.visible = i < PERF.windowLights;
  });
  const street = buildStreet();
  world.add(street.g);

  // Per-floor interiors + the platform that carries upper floors
  const furnitureFloors = buildFurniture();
  furnitureFloors.forEach((f) => world.add(f));
  const platform = buildFloorPlatform();
  platform.visible = false;
  world.add(platform);

  // Dynamic systems
  const smoke = buildSmoke();
  world.add(smoke.points);
  const exit = buildExit();
  world.add(exit);
  const truck = buildFireTruck();
  world.add(truck);
  const fireColor = new THREE.Color(0xff6a1e);

  let fires = [];
  let embers = null;
  let smokeMul = 0.6;
  let floorY = 0;
  let scorchCount = 0;

  function setLevel(cfg) {
    const floor = cfg.floor || 0;
    floorY = floor * FLOOR_H;
    for (const f of fires) world.remove(f.group);
    if (embers) world.remove(embers.points);
    // Point-light budget: only the first few (earliest-igniting) fires carry
    // a real light; the rest burn as emissive-only shader planes.
    let lightBudget = PERF.fireLights;
    fires = cfg.spots.map((s) => {
      const fire = new Fire(new THREE.Vector3(s.x, floorY, s.z), s.scale);
      if (lightBudget > 0) {
        fire.light.visible = true;
        if (lightBudget !== Infinity) lightBudget--;
      } else {
        fire.light.visible = false;
      }
      world.add(fire.group);
      return { x: s.x, z: s.z, at: s.at, scale: s.scale, fire };
    });
    embers = buildEmbers(cfg.spots, floorY);
    world.add(embers.points);
    smoke.points.position.y = floorY;
    // On upper stories the ceiling caps the room, so smoke must not rise
    // through it: short column (max 4.0 base + 2.0 = 6.0 < ceiling at 6.2).
    smoke.mat.uniforms.uRise.value = floor > 0 ? 2.0 : 8.0;
    exit.position.y = floorY;
    furnitureFloors.forEach((f, i) => {
      f.visible = i === floor;
    });
    // Platform carries the upper story, including its CEILING. Ground floor
    // has neither — the camera looks down on that room from outside/above.
    platform.visible = floor > 0;
    platform.position.y = floorY;
    scorchCount = 0; // scorch fires ride the `fires` array, removed above
    smokeMul = cfg.smoke;
  }
  setLevel(LEVELS[0]);

  // Scorch fires: persistent flames left where falling debris lands.
  // They burn for the rest of the shift (and drain health like any fire);
  // the cap keeps the point-light count mobile-safe — oldest burns out first.
  const SCORCH_CAP = 4;
  function spawnScorch(x, z) {
    if (scorchCount >= SCORCH_CAP) {
      const i = fires.findIndex((f) => f.scorch);
      if (i >= 0) {
        world.remove(fires[i].fire.group);
        fires.splice(i, 1);
        scorchCount--;
      }
    }
    const fire = new Fire(new THREE.Vector3(x, floorY, z), 0.65);
    // scorch fires dim their light (point-light budget); on mobile it's off
    fire.lightMul = 0.35 * PERF.scorchLightMul;
    fire.intensity = 1; // burning the moment it lands
    world.add(fire.group);
    fires.push({ x, z, at: 0, scale: 0.65, fire, scorch: true });
    scorchCount++;
  }

  function update(dt, time, fireLevel) {
    for (const s of fires) {
      // scorch fires stay fully lit; level fires ramp in on their own timer
      const target = s.scorch ? 1 : smooth(s.at, s.at + 0.12, fireLevel);
      s.fire.update(dt, time, target);
    }

    smoke.mat.uniforms.uTime.value = time;
    smoke.mat.uniforms.uGlobal.value = (0.28 + fireLevel * 0.95) * smokeMul;
    if (embers) embers.update(dt, fireLevel > 0.03);

    for (const w of win.windows) {
      if (!w.on && fireLevel > w.threshold) w.on = true;
      if (w.on) {
        const f = 0.65 + 0.35 * Math.sin(time * 7 + w.ph) * Math.sin(time * 2.7 + w.ph);
        w.mat.emissive.copy(fireColor);
        w.mat.emissiveIntensity = (0.7 + f) * (0.5 + 0.7 * fireLevel);
        w.mat.color.setHex(0x1a0d04);
      } else {
        w.mat.emissiveIntensity = 0;
      }
    }
    for (const wl of win.lights) {
      const f = 0.6 + 0.4 * Math.sin(time * 8 + wl.ph);
      wl.l.intensity = fireLevel > 0.08 ? wl.base * f * (0.3 + fireLevel) : 0;
    }

    // truck beacons + rooftop beacon
    const on = Math.sin(time * 9) > 0;
    truck.userData.beaconMatR.emissiveIntensity = on ? 3.2 : 0.2;
    truck.userData.beaconMatB.emissiveIntensity = on ? 0.2 : 3.2;
    details.userData.beacon.material.emissiveIntensity = Math.sin(time * 2.4) > 0.6 ? 3 : 0.15;

    // exit pulse: a breathing green ring on the ground (no column)
    const u = exit.userData;
    u.t += dt;
    const pulse = 0.5 + 0.5 * Math.sin(u.t * 3);
    u.ring.scale.setScalar(1 + pulse * 0.07);
    u.ring.material.opacity = 0.55 + 0.45 * pulse;
    u.disc.material.opacity = 0.10 + 0.06 * pulse;

    clouds.update(dt);
    street.update(dt, time);
  }

  return {
    group: world,
    setLevel,
    spawnScorch,
    get fires() {
      return fires;
    },
    get floorY() {
      return floorY;
    },
    smoke,
    truck,
    exit,
    windows: win.windows,
    windowLights: win.lights,
    update,
  };
}