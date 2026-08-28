// game.js — game logic: two heroes (duo), victims, camera, fire spread,
// grab/save, win/lose. Reads input, drives the world + characters each frame.
import * as THREE from "three";
import { createBoy, createGirl, createVictim } from "./characters.js";
import { BOUNDS, EXIT } from "./world.js";

export const LEVEL_TIME = 90; // seconds to save everyone
const HERO_SPEED = 5.4;
const INTERACT_RADIUS = 1.3;
const MIN_HERO_DIST = 0.95;

const VICTIM_DEFS = [
  { x: -8, z: -5, color: 0x4a90d9, hair: 0x3a2a1a },
  { x: -4, z: -3.5, color: 0x9b59b6, hair: 0x241a12 },
  { x: 0.5, z: -5, color: 0x1abc9c, hair: 0x4a3423 },
  { x: 4, z: -4, color: 0xe91e63, hair: 0x5a3a1a },
  { x: 8, z: -5, color: 0x2ecc71, hair: 0x2a1c10 },
  { x: -6.5, z: 2.5, color: 0xe67e22, hair: 0x1e1611 },
  { x: 6.5, z: 1, color: 0xf1c40f, hair: 0x4a2f16 },
  { x: -1.5, z: 3.5, color: 0x3498db, hair: 0x2c1d12 },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Game {
  constructor({ scene, camera, world, input, audio, ui }) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.input = input;
    this.audio = audio;
    this.ui = ui;

    this.state = "title";
    this.time = 0;
    this._t = 0;
    this._lastLvl = 0;
    this.savedCount = 0;
    this.totalCount = 0;
    this.danger = 0;
    this.prompt = "";

    this.yaw = 0;
    this.pitch = 0.6;
    this.radius = 11;
    this.camPos = new THREE.Vector3(0, 6, 14);
    this._tmp = new THREE.Vector3();

    this.heroes = [];
    this.victims = [];

    this.reset();
  }

  reset() {
    for (const h of this.heroes) this.scene.remove(h.g);
    for (const v of this.victims) this.scene.remove(v.g);
    this.heroes = [];
    this.victims = [];
    this.savedCount = 0;
    this.time = 0;
    this.danger = 0;
    this.prompt = "";

    const boy = createBoy();
    const girl = createGirl();
    boy.x = -0.85;
    boy.z = 4.6;
    girl.x = 0.85;
    girl.z = 4.6;
    for (const k of [boy, girl]) {
      k.g.position.set(k.x, 0, k.z);
      k.g.rotation.y = Math.PI;
      this.scene.add(k.g);
      this.heroes.push(k);
    }

    for (const d of VICTIM_DEFS) {
      const v = createVictim({ color: d.color, hair: d.hair });
      v.x = d.x;
      v.z = d.z;
      v.saved = false;
      v.state = "idle";
      v.carrying = null;
      v.saveT = 0;
      v.g.position.set(d.x, 0, d.z);
      this.scene.add(v.g);
      this.victims.push(v);
    }
    this.totalCount = this.victims.length;
    this.state = "title";
  }

  play() {
    this.reset();
    this.state = "playing";
    this.ui.showHud(true);
  }


  clampHero(k) {
    k.x = clamp(k.x, BOUNDS.minX, BOUNDS.maxX);
    k.z = clamp(k.z, BOUNDS.minZ, BOUNDS.maxZ);
  }

  separate() {
    const [a, b] = this.heroes;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const d = Math.hypot(dx, dz) || 0.0001;
    if (d < MIN_HERO_DIST) {
      const push = (MIN_HERO_DIST - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
      this.clampHero(a);
      this.clampHero(b);
    }
  }

  updateHeroes(dt, mv, time) {
    const yaw = this.yaw;
    const fwd = this._tmp.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const moving = Math.hypot(mv.x, mv.y) > 0.05;
    let vx = 0;
    let vz = 0;
    if (moving) {
      vx = fwd.x * mv.y + rightX * mv.x;
      vz = fwd.z * mv.y + rightZ * mv.x;
    }
    const faceAngle = moving ? Math.atan2(vx, vz) : null;

    for (const k of this.heroes) {
      if (moving) {
        k.x += vx * HERO_SPEED * dt;
        k.z += vz * HERO_SPEED * dt;
      }
      this.clampHero(k);
    }
    this.separate();

    for (const k of this.heroes) {
      k.g.position.set(k.x, 0, k.z);
      if (faceAngle !== null) k.g.rotation.y = lerpAngle(k.g.rotation.y, faceAngle, 0.22);
      k.update(dt, { moving, moveSpeed: moving ? 1 : 0, carrying: k.carry, time });
    }
    this.updateCarried();
  }

  updateCarried() {
    for (const v of this.victims) {
      if (!v.carrying) continue;
      const h = v.carrying;
      v.mark.visible = false;
      v.halo.visible = false;
      v.g.position.set(h.x, 1.0, h.z);
      v.g.rotation.y = h.g.rotation.y;
      if (v._rescaled !== true) {
        v.g.scale.setScalar(0.82);
        v._rescaled = true;
      }
    }
  }


  tryPickup() {
    for (const h of this.heroes) {
      if (h.carry) continue;
      let best = null;
      let bd = INTERACT_RADIUS;
      for (const v of this.victims) {
        if (v.saved || v.carrying) continue;
        const d = Math.hypot(v.x - h.x, v.z - h.z);
        if (d < bd) {
          bd = d;
          best = v;
        }
      }
      if (best) {
        best.carrying = h;
        h.carry = best;
        best.state = "carried";
        this.audio.grab();
        return;
      }
    }
  }

  saveVictim(v, h) {
    if (h.carry === v) h.carry = null;
    v.carrying = null;
    v.saved = true;
    v.state = "saving";
    v.saveT = 0;
    this.savedCount++;
    this.audio.save();
  }

  updateVictims(dt) {
    const t = this._t;
    for (const v of this.victims) {
      if (v.saved) {
        if (v.state === "saving") {
          v.saveT += dt;
          const s = Math.max(0, 1 - v.saveT / 0.6);
          v.g.scale.setScalar(Math.max(0.001, s * (v._rescaled ? 0.82 : 1)));
          v.g.position.y = v.saveT * 1.6;
          v.g.rotation.y += dt * 6;
          if (v.saveT > 0.6) v.g.visible = false;
        }
        continue;
      }
      if (v.state !== "carried") {
        v.x = v.g.position.x;
        v.z = v.g.position.z;
        v.update(t);
      }
    }
  }

  computePrompt() {
    this.prompt = "";
    for (const h of this.heroes) {
      if (h.carry) {
        const d = Math.hypot(h.x - EXIT.x, h.z - EXIT.z);
        if (d < EXIT.r + 1.6) {
          this.prompt = "🏁  Safe zone — set them down";
          break;
        }
      }
    }
    if (!this.prompt) {
      outer: for (const h of this.heroes) {
        if (h.carry) continue;
        for (const v of this.victims) {
          if (!v.saved && !v.carrying && Math.hypot(v.x - h.x, v.z - h.z) < INTERACT_RADIUS) {
            this.prompt = "✋  Grab (E / button)";
            break outer;
          }
        }
      }
    }
  }


  updateCamera(dt) {
    const look = this.input.consumeLook();
    this.yaw -= look.x * 0.006;
    this.pitch = clamp(this.pitch + look.y * 0.005, 0.16, 1.2);
    const a = this.heroes[0];
    const b = this.heroes[1];
    const cx = (a.x + b.x) / 2;
    const cz = (a.z + b.z) / 2;
    const cy = 1.0;
    const cp = Math.cos(this.pitch);
    const desired = new THREE.Vector3(
      cx + Math.sin(this.yaw) * cp * this.radius,
      cy + Math.sin(this.pitch) * this.radius,
      cz + Math.cos(this.yaw) * cp * this.radius
    );
    this.camPos.lerp(desired, Math.min(1, dt * 6));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(cx, cy, cz);
  }

  updateFire(dt) {
    const lvl = clamp(this.time / LEVEL_TIME, 0, 1);
    this._lastLvl = lvl;
    this.world.update(dt, this.time, lvl);
    if (this.scene.fog) this.scene.fog.density = 0.003 + lvl * 0.018;
    this.danger = clamp((lvl - 0.35) / 0.65, 0, 1);
    this.audio.setFireIntensity(0.25 + lvl * 0.75);
  }

  finish(won) {
    if (this.state !== "playing") return;
    this.state = won ? "won" : "lost";
    this.ui.showHud(false);
    if (won) this.audio.win();
    else this.audio.lose();
    this.ui.showResult(won, this.savedCount, this.totalCount, this.time);
  }

  update(dt) {
    if (this.state !== "playing") {
      const lvl = this.state === "title" ? 0.28 : this._lastLvl;
      this._t += dt * 0.5;
      this.world.update(dt, this._t, lvl);
      for (const k of this.heroes)
        k.update(dt, { moving: false, moveSpeed: 0, carrying: k.carry, time: this._t });
      this.updateVictims(dt);
      if (this.state === "title") this.yaw += dt * 0.12; // slow cinematic orbit
      this.updateCamera(dt);
      return;
    }

    this.time += dt;
    this._t = this.time;
    this.updateFire(dt);

    const mv = this.input.update().move;
    this.updateHeroes(dt, mv, this.time);
    if (this.input.consumeAction()) this.tryPickup();

    for (const h of this.heroes) {
      if (h.carry && Math.hypot(h.x - EXIT.x, h.z - EXIT.z) < EXIT.r + 0.3) {
        this.saveVictim(h.carry, h);
      }
    }
    this.updateVictims(dt);
    this.updateCamera(dt);
    this.computePrompt();

    if (this.savedCount >= this.totalCount) this.finish(true);
    else if (this.time >= LEVEL_TIME) this.finish(false);
  }
}
