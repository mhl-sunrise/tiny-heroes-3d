// world/debris.js — falling debris: a pulsing red telegraph ring marks the
// landing spot, then a brick (or a burning chunk) drops from the upper edge
// of the floor with real gravity, ending in a dust puff. Everything is
// pooled; impacts are reported back to game.js via the update() callback.
import * as THREE from "three";
import { DEBRIS } from "../config.js";

const POOL = 10;

export function buildDebris() {
  const group = new THREE.Group();

  // --- falling chunks (pooled) ------------------------------------------
  const brickGeo = new THREE.BoxGeometry(0.26, 0.2, 0.3);
  const fireGeo = new THREE.BoxGeometry(0.3, 0.24, 0.26);
  const brickMat = new THREE.MeshStandardMaterial({ color: 0x8a4a32, roughness: 1 });
  const fireMat = new THREE.MeshStandardMaterial({
    color: 0xff5a1e,
    emissive: 0xff6a1e,
    emissiveIntensity: 2.2,
    roughness: 0.6,
  });
  const chunks = [];
  for (let i = 0; i < POOL; i++) {
    const m = new THREE.Mesh(brickGeo, brickMat);
    m.visible = false;
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    group.add(m);
    chunks.push({
      mesh: m,
      vel: 0,
      active: false,
      tele: 0,
      kind: "brick",
      x: 0,
      z: 0,
      spinX: 4 + Math.random() * 5,
      spinZ: 3 + Math.random() * 5,
    });
  }

  // --- telegraph rings (pooled with chunks) ------------------------------
  const ringGeo = new THREE.RingGeometry(DEBRIS.hitR * 0.7, DEBRIS.hitR * 1.05, 20);
  const discGeo = new THREE.CircleGeometry(DEBRIS.hitR, 18);
  const rings = [];
  for (let i = 0; i < POOL; i++) {
    const rg = new THREE.Group();
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xff2020,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    const disc = new THREE.Mesh(
      discGeo,
      new THREE.MeshBasicMaterial({
        color: 0xff3010,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    disc.rotation.x = -Math.PI / 2;
    rg.add(ring, disc);
    rg.visible = false;
    group.add(rg);
    rings.push({ g: rg, ring, disc });
  }

  // --- dust puffs (pooled) -----------------------------------------------
  const puffGeo = new THREE.RingGeometry(0.35, 0.6, 18);
  const puffs = [];
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(
      puffGeo,
      new THREE.MeshBasicMaterial({
        color: 0xb09a80,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    p.rotation.x = -Math.PI / 2;
    p.visible = false;
    group.add(p);
    puffs.push({ m: p, t: 99 });
  }

  // --- impact explosion: fireball flashes + one shared flash light --------
  const flashGeo = new THREE.SphereGeometry(0.5, 10, 10);
  const flashes = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(
      flashGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffb040,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    m.visible = false;
    group.add(m);
    flashes.push({ m, t: 99 });
  }
  const flashLight = new THREE.PointLight(0xff8a30, 0, 9, 2);
  group.add(flashLight);
  let flashLightT = 1;

  let floorY = 0;
  let time = 0;

  function setFloor(y) {
    floorY = y;
    for (const c of chunks) {
      c.active = false;
      c.mesh.visible = false;
    }
    for (const r of rings) r.g.visible = false;
    for (const p of puffs) {
      p.m.visible = false;
      p.t = 99;
    }
    for (const f of flashes) {
      f.m.visible = false;
      f.t = 99;
    }
    flashLight.intensity = 0;
    flashLightT = 1;
  }

  function burst(x, z) {
    // bright fireball at the impact point
    const f = flashes.find((q) => q.t > 1) || flashes[0];
    f.t = 0;
    f.m.position.set(x, floorY + 0.5, z);
    f.m.visible = true;
    // light pop (one shared light, fastest impact wins)
    flashLight.position.set(x, floorY + 0.9, z);
    flashLightT = 0;
  }

  function spawn(x, z) {
    const i = chunks.findIndex((c) => !c.active);
    if (i < 0) return;
    const c = chunks[i];
    c.active = true;
    c.x = x;
    c.z = z;
    c.tele = DEBRIS.telegraph;
    c.vel = 0;
    c.kind = Math.random() < 0.4 ? "fire" : "brick";
    c.mesh.visible = false;
    c.mesh.position.set(x, floorY + DEBRIS.dropH, z);
    const r = rings[i];
    r.g.position.set(x, floorY + 0.04, z);
    r.g.visible = true;
  }

  function puff(x, z) {
    const p = puffs.find((q) => q.t > 1) || puffs[0];
    p.t = 0;
    p.m.position.set(x, floorY + 0.05, z);
    p.m.visible = true;
  }

  /**
   * @param cb { onDrop?(x,z), onImpact?(x,z,kind) }
   */
  function update(dt, cb) {
    time += dt;
    for (let i = 0; i < POOL; i++) {
      const c = chunks[i];
      if (!c.active) continue;
      const r = rings[i];
      if (c.tele > 0) {
        c.tele -= dt;
        const p = 1 - c.tele / DEBRIS.telegraph; // 0 -> 1 as impact nears
        const pulse = 0.5 + 0.5 * Math.sin(time * 18);
        r.ring.material.opacity = 0.35 + 0.6 * p * pulse;
        r.disc.material.opacity = 0.08 + 0.18 * p;
        r.g.scale.setScalar(1 + 0.12 * Math.sin(time * 10));
        if (c.tele <= 0) {
          // release: the chunk starts falling
          c.mesh.geometry = c.kind === "fire" ? fireGeo : brickGeo;
          c.mesh.material = c.kind === "fire" ? fireMat : brickMat;
          c.mesh.visible = true;
          c.vel = 1.5;
          if (cb && cb.onDrop) cb.onDrop(c.x, c.z);
        }
      } else {
        r.ring.material.opacity = 0;
        r.disc.material.opacity = 0;
        r.g.visible = false;
        c.vel += DEBRIS.gravity * dt;
        c.mesh.position.y -= c.vel * dt;
        c.mesh.rotation.x += c.spinX * dt;
        c.mesh.rotation.z += c.spinZ * dt;
        if (c.mesh.position.y <= floorY + 0.12) {
          c.mesh.visible = false;
          c.active = false;
          puff(c.x, c.z);
          burst(c.x, c.z); // explosion flash + light pop
          if (cb && cb.onImpact) cb.onImpact(c.x, c.z, c.kind);
        }
      }
    }
    for (const p of puffs) {
      if (p.t > 1) continue;
      p.t += dt;
      if (p.t > 0.7) {
        p.m.visible = false;
        p.t = 99;
        continue;
      }
      const s = p.t / 0.7;
      p.m.scale.setScalar(0.5 + s * 2.6);
      p.m.material.opacity = 0.7 * (1 - s);
    }
    for (const f of flashes) {
      if (f.t > 1) continue;
      f.t += dt;
      if (f.t > 0.3) {
        f.m.visible = false;
        f.t = 99;
        continue;
      }
      const s = f.t / 0.3;
      f.m.scale.setScalar(0.3 + s * 2.4);
      f.m.material.opacity = 0.85 * (1 - s);
    }
    // shared impact light pops hard, then dies in ~0.3s
    if (flashLightT < 1) {
      flashLightT = Math.min(1, flashLightT + dt / 0.3);
      flashLight.intensity = 26 * (1 - flashLightT) * (1 - flashLightT);
    }
  }

  function activeCount() {
    let n = 0;
    for (const c of chunks) if (c.active) n++;
    return n;
  }

  return { group, setFloor, spawn, update, activeCount };
}