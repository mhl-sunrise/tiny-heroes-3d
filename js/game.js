// game.js — game logic: the firefighter hero, the trapped people (freed and
// following you to the safe zone), camera, fire spread, health + score
// systems, the multistory floor system and the three-shift level flow.
import * as THREE from "three";
import { createFirefighter, createVictim } from "./characters.js";
import { BOUNDS, EXIT, LEVELS, HERO, FLOOR_H, FLOOR_NAMES, DEBRIS, ULTRA } from "./config.js";
import { HealthSystem, ScoreSystem } from "./systems/health.js";
import { buildDebris } from "./world/debris.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
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
    this._banner = "";
    this._bannerT = 0;

    this.level = 0;
    this.health = new HealthSystem();
    this.score = new ScoreSystem();

    this.yaw = 0;
    this.pitch = 0.6;
    this.radius = 11;
    this._fireSlots = []; // pre-allocated fire list fed to the health system
    this.camPos = new THREE.Vector3(0, 6, 14);
    this._tmp = new THREE.Vector3();
    this._desired = new THREE.Vector3(); // camera target scratch (no per-frame alloc)

    this.heroes = [];
    this.victims = [];

    // tension layer: falling debris
    this.debris = buildDebris();
    this.scene.add(this.debris.group);
    this.shake = 0;
    this.ultra = false;
    this._debrisT = 4;
    this._debrisQueue = [];
    this._burstT = DEBRIS.burstEvery;
    this._rumbleT = 0;

    this.reset();
  }

  levelCfg() {
    return LEVELS[this.level];
  }
  get levelName() {
    return this.levelCfg().name;
  }
  get timeLeft() {
    return Math.max(0, this.levelCfg().time - this.time);
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
    this.health.reset();
    this.world.setLevel(this.levelCfg());
    this._fireSlots.length = 0; // fire set was just rebuilt — reuse starts clean
    this.floorY = this.world.floorY; // world.setLevel just set it
    this.heroY = this.floorY;

    const firefighter = createFirefighter();
    firefighter.x = 0;
    firefighter.z = 4.6;
    const k = firefighter;
    k.g.position.set(k.x, this.heroY, k.z);
    k.g.rotation.y = Math.PI;
    this.scene.add(k.g);
    this.heroes.push(k);

    for (const d of this.levelCfg().victims) {
      const v = createVictim({ color: d.color, hair: d.hair });
      v.x = d.x;
      v.z = d.z;
      v.saved = false;
      v.state = "idle";
      v.saveT = 0;
      v.g.position.set(d.x, this.floorY, d.z);
      this.scene.add(v.g);
      this.victims.push(v);
    }
    this.totalCount = this.victims.length;
    // Path history (the hero's recent route). Freed victims walk this ribbon
    // to follow you, so they can never get stuck on a maze obstacle -- they
    // retrace exactly where the hero has already walked.
    this.heroTrail = [];
    // reset the tension layer for the new shift
    this.debris.setFloor(this.floorY);
    this.shake = 0;
    this.ultra = false;
    this.ui.setUltra(false);
    this._debrisT = 4; // let the shift breathe before the first drop
    this._debrisQueue = [];
    this._burstT = DEBRIS.burstEvery + Math.random() * 10;
    this._rumbleT = 0;
    this.state = "title";
  }

  play(level = 0) {
    this.level = level;
    if (level === 0) this.score.reset();
    this.reset();
    this.ui.showHud(true);
    if (level > 0) {
      // Between shifts the firefighter climbs the OUTDOOR fire escape (ladder
      // on the right wall, rails at x=11.57) up a floor. He starts on the
      // ladder itself so the climb reads against the facade — the camera
      // parks outside the building and watches the whole way up.
      this.state = "climbing";
      this._climbT = 0;
      this._climbFrom = this.floorY - FLOOR_H;
      this._climbTo = this.floorY;
      const a = this.heroes[0];
      a.x = 11.72; // just in front of the ladder rails
      a.z = -0.5; // the ladder's centerline
      a.g.rotation.y = -Math.PI / 2; // face the ladder (back to the street)
      a.g.position.set(a.x, this._climbFrom, a.z); // group goes ON the ladder
      this.heroY = this._climbFrom;
      this.audio.levelUp();
      this.audio.climb();
      // hard cut to the parked outside view (dt=10 -> 100% lerp, so all
      // clamps apply): avoids the camera sliding through the right wall
      this.yaw = Math.PI / 2;
      this.updateCamera(10);
    } else {
      this.state = "playing";
    }
  }

  nextLevel() {
    if (this.level + 1 < LEVELS.length) this.play(this.level + 1);
  }

  clampHero(k) {
    k.x = clamp(k.x, BOUNDS.minX, BOUNDS.maxX);
    k.z = clamp(k.z, BOUNDS.minZ, BOUNDS.maxZ);
    // Maze: push the hero's body circle out of every solid obstacle box
    // (resolve along the smallest penetration axis — cheap, stable, no
    // sliding-jitter; the boxes are axis-aligned by construction).
    const R = 0.4;
    for (const b of this.world.colliders) {
      const minX = b.minX - R,
        maxX = b.maxX + R;
      const minZ = b.minZ - R,
        maxZ = b.maxZ + R;
      if (k.x > minX && k.x < maxX && k.z > minZ && k.z < maxZ) {
        const dxl = k.x - minX,
          dxr = maxX - k.x,
          dzl = k.z - minZ,
          dzr = maxZ - k.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) k.x = minX;
        else if (m === dxr) k.x = maxX;
        else if (m === dzl) k.z = minZ;
        else k.z = maxZ;
      }
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

    const speed = HERO.speed;

    for (const k of this.heroes) {
      if (moving) {
        k.x += vx * speed * dt;
        k.z += vz * speed * dt;
      }
      this.clampHero(k);
    }

    for (const k of this.heroes) {
      k.g.position.set(k.x, this.heroY, k.z);
      if (faceAngle !== null) k.g.rotation.y = lerpAngle(k.g.rotation.y, faceAngle, 0.22);
      k.update(dt, {
        moving,
        moveSpeed: moving ? 1 : 0,
        time,
      });
    }
    this.updateFollowers(dt);
  }

  // Freed victims walk behind you to the safe zone. Each one retraces the
  // hero's own path history (heroTrail) at a fixed arc-length back, so the
  // group can never get stuck on a maze obstacle -- they only ever walk
  // where the hero has already been.
  updateFollowers(dt) {
    if (this.state !== "playing") return;
    const me = this.heroes[0];
    // record the route (points ~0.12 m apart, newest last)
    const tr = this.heroTrail;
    const last = tr[tr.length - 1];
    if (!last || Math.hypot(me.x - last.x, me.z - last.z) > 0.12) {
      tr.push({ x: me.x, z: me.z });
      if (tr.length > 140) tr.shift();
    }
    const idx = [];
    for (let i = 0; i < this.victims.length; i++) if (this.victims[i].state === "following") idx.push(i);
    const SPACING = 1.05; // gap between followers in the line
    const SPEED = HERO.speed * 1.3; // a bit quicker so they can catch up
    for (let f = 0; f < idx.length; f++) {
      const v = this.victims[idx[f]];
      const target = this.trailPoint(tr, (f + 1) * SPACING);
      const dx = target.x - v.x;
      const dz = target.z - v.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const step = Math.min(d, SPEED * dt);
        v.x += (dx / d) * step;
        v.z += (dz / d) * step;
        this.pushOutObstacles(v, 0.3);
        v.g.rotation.y = lerpAngle(v.g.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 10));
      }
      v.g.position.set(v.x, this.heroY, v.z);
      v.update(this._t, {
        walkDt: d > 0.3 ? dt : 0, // walk cycle while actually moving
        waving: true, // a freed kid happily waves along
      });
    }
  }
  // A point L metres back along the path ribbon (clamped to its start).
  trailPoint(tr, L) {
    if (!tr.length) return { x: this.heroes[0].x, z: this.heroes[0].z };
    if (tr.length === 1) return tr[0];
    for (let i = tr.length - 1; i > 0; i--) {
      const dx = tr[i].x - tr[i - 1].x;
      const dz = tr[i].z - tr[i - 1].z;
      const seg = Math.hypot(dx, dz);
      if (seg >= L) return { x: tr[i].x, z: tr[i].z };
      L -= seg;
    }
    return tr[0];
  }
  // Push a circle out of the maze boxes (same resolution as the hero's).
  pushOutObstacles(o, R) {
    for (const b of this.world.colliders) {
      const minX = b.minX - R,
        maxX = b.maxX + R;
      const minZ = b.minZ - R,
        maxZ = b.maxZ + R;
      if (o.x > minX && o.x < maxX && o.z > minZ && o.z < maxZ) {
        const dxl = o.x - minX,
          dxr = maxX - o.x,
          dzl = o.z - minZ,
          dzr = maxZ - o.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) o.x = minX;
        else if (m === dxr) o.x = maxX;
        else if (m === dzl) o.z = minZ;
        else o.z = maxZ;
      }
    }
  }

  tryPickup() {
    // Tap a trapped person to free them: they get to their feet and follow
    // you to the safe zone (they save themselves once they reach it).
    for (const h of this.heroes) {
      let best = null;
      let bd = HERO.interactRadius;
      for (const v of this.victims) {
        if (v.saved || v.state !== "idle") continue;
        const d = Math.hypot(v.x - h.x, v.z - h.z);
        if (d < bd) {
          bd = d;
          best = v;
        }
      }
      if (best) {
        best.state = "following";
        best.mark.visible = false; // out of danger -- the "!" mark goes away
        this.audio.grab();
        return;
      }
    }
  }

  saveVictim(v) {
    // A freed person reached the green zone on their own feet.
    v.saved = true;
    v.state = "saving";
    // start straight at the "rise, spin, fade" part (they're standing, so no
    // step-down needed); _saveY + 1.42 keeps the floor math in updateVictims
    v.saveT = 0.3;
    v._saveY = v.g.position.y + 1.42;
    v._dropPose = null;
    this.savedCount++;
    this.score.addRescue();
    this.audio.save();
  }

  updateVictims(dt) {
    const t = this._t;
    for (const v of this.victims) {
      if (v.saved) {
        if (v.state === "saving") {
          // rise, spin, fade to safety (starts standing, so no step-down)
          v.saveT += dt;
          const t2 = v.saveT - 0.3;
          const floor = (v._saveY || 0) - 1.42; // ground under the person
          const s = Math.max(0, 1 - t2 / 0.5);
          v.g.scale.setScalar(Math.max(0.001, s));
          v.g.position.y = floor + t2 * 2.2;
          v.g.rotation.y += dt * 6;
          if (t2 > 0.5) v.g.visible = false;
        }
        continue;
      }
      // "following" is driven by updateFollowers(); "saving" above. For idle
      // (still trapped) victims: sync position + keep the scared idle pose.
      if (v.state === "following") continue;
      v.x = v.g.position.x;
      v.z = v.g.position.z;
      v.update(t);
    }
  }

  computePrompt() {
    if (this._bannerT > 0) {
      this.prompt = this._banner;
      return;
    }
    this.prompt = "";
    const following = this.victims.some((v) => v.state === "following");
    if (following) {
      const h = this.heroes[0];
      const d = Math.hypot(h.x - EXIT.x, h.z - EXIT.z);
      this.prompt =
        d < EXIT.r + 1.6 ? "🏁  Safe zone — they'll finish it" : "👣  They're following you to the safe zone";
    }
    if (!this.prompt) {
      outer: for (const h of this.heroes) {
        for (const v of this.victims) {
          if (!v.saved && v.state === "idle" && Math.hypot(v.x - h.x, v.z - h.z) < HERO.interactRadius) {
            this.prompt = "✋  Free them (E / button)";
            break outer;
          }
        }
      }
    }
  }

  updateCamera(dt) {
    const look = this.input.consumeLook();
    const transitioning =
      this.state === "climbing" || this.state === "entering";
    if (transitioning) {
      // Fire-escape transition: park the camera OUTSIDE the right wall, on
      // the +X side of the hero (yaw = π/2), closer in and level-ish, so the
      // whole climb is visible against the facade. The sightline stays at
      // x > 11.45 (outside the wall), so nothing occludes the hero.
      this.yaw = lerpAngle(this.yaw, Math.PI / 2, Math.min(1, dt * 3));
      this.pitch += (0.62 - this.pitch) * Math.min(1, dt * 3);
    } else {
      this.yaw -= look.x * 0.006;
      this.pitch = clamp(this.pitch + look.y * 0.005, 0.3, 1.2);
    }
    const a = this.heroes[0];
    const cx = a.x;
    const cz = a.z;
    const cy = this.heroY + 1.0; // rides the current floor (incl. climbing)
    const radius = transitioning ? this.radius * 0.6 : this.radius;
    const cp = Math.cos(this.pitch);
    this._desired.set(
      cx + Math.sin(this.yaw) * cp * radius,
      cy + Math.sin(this.pitch) * radius,
      cz + Math.cos(this.yaw) * cp * radius
    );
    this.camPos.lerp(this._desired, Math.min(1, dt * 6));
    // never let the orbit push the camera through the walls or roof:
    // clamp to the play volume (side walls' inside faces at x=±10.95,
    // back wall at z=-6.95, front side is open street). While parked on the
    // fire escape the camera legitimately lives outside the right wall.
    this.camPos.x = clamp(
      this.camPos.x,
      -10.4,
      transitioning ? 18 : 10.4
    );
    this.camPos.z = clamp(this.camPos.z, -6.3, 8.4);
    // On upper stories the camera must stay UNDER the story ceiling (roof on
    // the attic). Without this it rises above the roof, which occludes the
    // interior and fills the screen with the black roof box.
    if (this.level > 0) {
      this.camPos.y = Math.min(this.camPos.y, this.floorY + FLOOR_H - 0.45);
    }
    // camera shake: debris impacts, rumble tremor, ultra-danger micro-shake
    if (this.shake > 0.001) {
      const s = this._t * 57.3;
      this.camera.position.set(
        this.camPos.x + Math.sin(s) * this.shake,
        this.camPos.y + Math.cos(s * 1.31) * this.shake,
        this.camPos.z
      );
    } else {
      this.camera.position.copy(this.camPos);
    }
    this.camera.lookAt(cx, cy, cz);
  }

  updateFire(dt) {
    const cfg = this.levelCfg();
    const lvl = clamp(this.time / cfg.time, 0, 1);
    this._lastLvl = lvl;
    this.world.update(dt, this.time, lvl);
    if (this.scene.fog) this.scene.fog.density = (0.003 + lvl * 0.018) * cfg.fog;
    this.danger = clamp((lvl - 0.35) / 0.65, 0, 1);
    // Fire audio: ambient roar grows with fire level, plus a proximity boost
    // from the NEAREST burning spot — a murmur across the room, a roar when
    // you stand right next to a flame.
    const me = this.heroes[0];
    let near = Infinity;
    let nearBurn = 0;
    for (const s of this.world.fires) {
      // scorch fires burn the moment they land; level fires ignite once the
      // fire level reaches their `at`
      if (!s.scorch && lvl < s.at) continue;
      const d = Math.hypot(me.x - s.x, me.z - s.z);
      if (d < near) {
        near = d;
        nearBurn = s.fire.intensity;
      }
    }
    const prox = clamp(1 - (near - 1.6) / 5, 0, 1); // 1 at 1.6m → 0 at 6.6m
    this.audio.setFireIntensity(clamp(0.2 + lvl * 0.45 + prox * nearBurn * 0.85, 0, 1));

    // health: fire proximity + ambient smoke vs. safe-zone healing
    const h = this.heroes[0];
    const slots = this._fireSlots;
    const fireList = this.world.fires;
    for (let i = 0; i < fireList.length; i++) {
      const f = fireList[i];
      if (i < slots.length) {
        slots[i].x = f.x;
        slots[i].z = f.z;
        slots[i].intensity = f.fire.intensity;
      } else {
        slots.push({ x: f.x, z: f.z, intensity: f.fire.intensity });
      }
    }
    this.health.update(dt, h, slots, lvl);
    this.audio.heartbeat(this.health.low && this.state === "playing");
    if (!this.health.alive) this.finish(false, "collapsed");
  }

  /**
   * Falling debris — the tension layer. Steady drops accelerate with the
   * fire; a rumble telegraphs a burst of clustered drops. 65% of drops land
   * NEAR the hero (they herd you, they don't ambush you).
   */
  updateDebris(dt) {
    const lvl = this._lastLvl;
    const h = this.heroes[0];

    // rumble warning -> burst
    if (this._rumbleT > 0) {
      this._rumbleT -= dt;
      this.shake = Math.max(this.shake, 0.12); // nervous tremor while it groans
      if (this._rumbleT <= 0) {
        const n = DEBRIS.burstCount[0] + (Math.random() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          this._debrisQueue.push({
            at: i * 0.55,
            x: clamp(h.x + (Math.random() - 0.5) * 7, BOUNDS.minX, BOUNDS.maxX),
            z: clamp(h.z + (Math.random() - 0.5) * 7, BOUNDS.minZ, BOUNDS.maxZ),
          });
        }
      }
    } else {
      this._burstT -= dt;
      if (this._burstT <= 0) {
        this._burstT = DEBRIS.burstEvery + Math.random() * 10;
        this._rumbleT = DEBRIS.rumbleTime;
        this.audio.rumble();
      }
    }

    // steady drops, faster as the fire spreads
    this._debrisT -= dt;
    if (this._debrisT <= 0) {
      this._debrisT =
        lerp(DEBRIS.interval[0], DEBRIS.interval[1], lvl) *
        (0.7 + Math.random() * 0.6);
      const near = Math.random() < 0.65;
      const x = clamp(
        near ? h.x + (Math.random() - 0.5) * 6 : (Math.random() * 2 - 1) * BOUNDS.maxX,
        BOUNDS.minX,
        BOUNDS.maxX
      );
      const z = clamp(
        near ? h.z + (Math.random() - 0.5) * 6 : (Math.random() * 2 - 1) * BOUNDS.maxZ,
        BOUNDS.minZ,
        BOUNDS.maxZ
      );
      this._debrisQueue.push({ at: 0, x, z });
    }

    // release queued (burst) drops
    for (let i = this._debrisQueue.length - 1; i >= 0; i--) {
      const q = this._debrisQueue[i];
      q.at -= dt;
      if (q.at <= 0) {
        this.debris.spawn(q.x, q.z);
        this._debrisQueue.splice(i, 1);
      }
    }

    this.debris.update(dt, {
      onDrop: () => {
        this.audio.crack(); // the chunk tears loose
        this.audio.whoosh();
        this.shake = Math.max(this.shake, 0.12); // jolt as a chunk breaks loose
      },
      onImpact: (x, z) => this.onDebrisImpact(x, z),
    });

    this.shake = Math.max(0, this.shake - dt * 1.3);

    // ultra-danger screen state (hysteresis so it never flickers)
    let danger = Math.max(lvl, 1 - this.health.hp / this.health.max);
    if (this.debris.activeCount() > 0) danger = Math.min(1, danger + 0.15);
    if (danger >= ULTRA.enter || (this.ultra && danger >= ULTRA.exit)) {
      if (!this.ultra) {
        this.ultra = true;
        this.ui.setUltra(true);
        this.audio.dangerSting();
        this.shake = Math.max(this.shake, 0.25);
      }
      if (this.ultra) this.shake = Math.max(this.shake, ULTRA.microShake);
    } else if (this.ultra) {
      this.ultra = false;
      this.ui.setUltra(false);
    }
  }

  onDebrisImpact(x, z) {
    const h = this.heroes[0];
    const d = Math.hypot(h.x - x, h.z - z);
    // every impact is a real bang: hard shake, LOUD boom (deafening up close,
    // still clearly explosive far away), and the spot keeps burning
    const closeness = Math.max(0, 1 - d / 8);
    this.shake = Math.min(1.0, this.shake + 0.55 + 0.45 * closeness);
    this.audio.boom(clamp(0.6 + 0.4 * closeness, 0, 1));
    this.world.spawnScorch(x, z);
    if (d < DEBRIS.hitR) {
      this.health.damage(DEBRIS.damage);
    } else if (d < DEBRIS.closeR) {
      // the dodge paid off — the dopamine hit
      this.score.addPoints(DEBRIS.closeScore);
      this.audio.closeCall();
    }
  }

  finish(won, reason = "time") {
    if (this.state !== "playing") return;
    this.state = won ? "won" : "lost";
    this.ui.showHud(false);
    this.audio.stopMusic(); // fade the loop out so the fanfare reads clearly
    this.audio.heartbeat(false);
    if (won) {
      this.score.addClearBonus(this.time, this.levelCfg().time, this.health.hp);
      this.audio.win();
    } else {
      this.audio.lose();
    }
    this.ui.showResult({
      won,
      reason,
      level: this.level,
      score: this.score.score,
      saved: this.savedCount,
      total: this.totalCount,
      time: this.time,
      next: won && this.level + 1 < LEVELS.length,
    });
  }

  update(dt) {
    if (this.state === "climbing") {
      // Fire-escape climb between shifts: the hero rises one floor on the
      // ladder OUTSIDE the right wall, where the camera (parked outside,
      // see updateCamera) sees the whole climb. Everything else idles.
      this._t += dt;
      this._climbT += dt;
      const p = Math.min(1, this._climbT / 2.4);
      const e = p * p * (3 - 2 * p); // smoothstep
      this.heroY = this._climbFrom + (this._climbTo - this._climbFrom) * e;
      const a = this.heroes[0];
      a.g.position.set(a.x, this.heroY, a.z); // stay pinned to the ladder
      a.g.rotation.y = -Math.PI / 2; // face the ladder
      // climbing pose: hands over the rail, legs alternating
      const t = this._climbT * 7;
      a.armL.rotation.set(-2.5 + Math.sin(t) * 0.15, 0, 0.25);
      a.armR.rotation.set(-2.5 + Math.cos(t) * 0.15, 0, 0.25);
      a.legL.rotation.x = 0.9 * Math.sin(t);
      a.legR.rotation.x = 0.9 * Math.cos(t);
      this.world.update(dt, this._t, this._lastLvl);
      this.prompt = "🪜  Climbing to the " + FLOOR_NAMES[this.level] + "…";
      this.updateCamera(dt);
      if (p >= 1) {
        // reached the landing — now step through into the room
        this.state = "entering";
        this._enterT = 0;
        this.heroY = this._climbTo;
        this._enterFrom = a.x; // 11.72, on the landing
        this._enterTo = BOUNDS.maxX - 0.2; // inside, near the wall
      }
      return;
    }
    if (this.state === "entering") {
      // Short walk from the fire-escape landing through the wall into the
      // room. The camera stays OUTSIDE during this, so the wall face hides
      // the hero as he disappears — then a hard cut reframes the new floor.
      this._t += dt;
      this._enterT += dt;
      const p = Math.min(1, this._enterT / 0.55);
      const e = p * p * (3 - 2 * p);
      const a = this.heroes[0];
      a.x = this._enterFrom + (this._enterTo - this._enterFrom) * e;
      a.g.position.set(a.x, this.heroY, a.z);
      a.g.rotation.y = -Math.PI / 2; // facing the wall he's stepping through
      a.update(dt, { moving: true, moveSpeed: 0.7, time: this._t });
      this.world.update(dt, this._t, this._lastLvl);
      this.prompt = "";
      this.updateCamera(dt);
      if (p >= 1) {
        this.state = "playing";
        // hard cut: snap the orbit to a clean interior framing (updateCamera
        // with dt=10 lerps 100%, so all the usual clamps still apply)
        this.yaw = 0;
        this.updateCamera(10);
        this._banner = FLOOR_NAMES[this.level] + " — save everyone!";
        this._bannerT = 3;
      }
      return;
    }
    if (this.state !== "playing") {
      const lvl = this.state === "title" ? 0.28 : this._lastLvl;
      this._t += dt * 0.5;
      this.world.update(dt, this._t, lvl);
      this.debris.update(dt, null); // let any in-flight chunks land silently
      for (const k of this.heroes)
        k.update(dt, { moving: false, moveSpeed: 0, time: this._t });
      this.updateVictims(dt);
      if (this.state === "title") this.yaw += dt * 0.12; // slow cinematic orbit
      this.updateCamera(dt);
      return;
    }

    this.time += dt;
    this._t = this.time;
    if (this._bannerT > 0) this._bannerT -= dt;
    this.updateFire(dt);
    this.updateDebris(dt);

    const mv = this.input.update().move;
    this.updateHeroes(dt, mv, this.time);
    if (this.input.consumeAction()) this.tryPickup();

    // freed people save themselves: they count the moment THEY reach the zone
    for (const v of this.victims) {
      if (v.state === "following" && Math.hypot(v.x - EXIT.x, v.z - EXIT.z) < EXIT.r + 0.3) {
        this.saveVictim(v);
      }
    }
    this.updateVictims(dt);
    this.updateCamera(dt);
    this.computePrompt();

    if (this.savedCount >= this.totalCount) this.finish(true);
    else if (this.time >= this.levelCfg().time) this.finish(false, "time");
  }
}