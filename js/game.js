// game.js — game logic: the firefighter hero, the trapped people (CARRIED
// across the shoulders to safety), camera, fire spread, health + score
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
    this.camPos = new THREE.Vector3(0, 6, 14);
    this._tmp = new THREE.Vector3();

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
      v.carrying = null;
      v.saveT = 0;
      v.g.position.set(d.x, this.floorY, d.z);
      this.scene.add(v.g);
      this.victims.push(v);
    }
    this.totalCount = this.victims.length;
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
      // Between shifts the firefighter climbs the fire escape up a floor.
      this.state = "climbing";
      this._climbT = 0;
      this._climbFrom = this.floorY - FLOOR_H;
      this._climbTo = this.floorY;
      const a = this.heroes[0];
      a.x = BOUNDS.maxX;
      a.z = -0.5;
      a.g.rotation.y = Math.PI / 2; // face the fire escape wall (+X)
      a.g.position.y = this._climbFrom;
      this.heroY = this._climbFrom;
      this.audio.levelUp();
      this.audio.climb();
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

    // carrying someone is slower — the cost of a grab
    const speed = HERO.speed * (this.heroes[0] && this.heroes[0].carry ? HERO.carrySpeedMul : 1);

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
        carrying: k.carry,
        dragging: !!k.carry,
        time,
      });
    }
    this.updateCarried(dt);
  }

  // Fireman's carry: the victim lies across the hero's shoulders — head over
  // the right shoulder (drooping), legs over the left, face toward the
  // direction of travel. The body has WEIGHT: it bounces against the hero's
  // own step (a little late), drifts around when the hero turns, and the head
  // and arms sway like a limp passenger instead of being welded to the mesh.
  updateCarried(dt) {
    for (const v of this.victims) {
      if (!v.carrying) continue;
      const h = v.carrying;
      v.mark.visible = false;
      v.halo.visible = false;
      if (v._rescaled !== true) {
        v.g.scale.setScalar(0.78);
        v._rescaled = true;
        v.g.rotation.order = "YXZ";
        v._spring = { y: 1.42, yaw: h.g.rotation.y, step: 0, limp: 0 };
        v._ph = Math.random() * Math.PI * 2;
      }
      const sp = v._spring;

      // 1) WEIGHT — chase the hero's step bounce with a slight lag, so the
      //    body lands on the shoulders a frame behind the hero's own bob.
      const targetY = 1.42 + (h._bobY || 0) * 1.35;
      sp.y += (targetY - sp.y) * Math.min(1, dt * 9);

      // 2) TURNING — the load lags the hero's heading, so it visibly "drifts"
      //    around the shoulders when you spin (instead of teleporting).
      sp.yaw = lerpAngle(sp.yaw, h.g.rotation.y, Math.min(1, dt * 6));

      // 3) STRIDE — a lagged copy of the hero's step phase drives the sway.
      sp.step += ((h._step || 0) - sp.step) * Math.min(1, dt * 7);

      // 4) LIMP — the head droop + arm drape ease in over ~0.3s on grab
      //    (no pose snap) and ease back out when the person is set down.
      sp.limp += ((v.state === "carried" ? 1 : 0) - sp.limp) * Math.min(1, dt * 6);
      const L = sp.limp;

      // Rest across the shoulders, a touch behind the neck (over the spine).
      const ry = sp.yaw;
      const back = 0.07;
      v.g.position.set(
        h.x - Math.sin(ry) * back,
        this.heroY + sp.y,
        h.z - Math.cos(ry) * back
      );
      // Head end droops over the right shoulder and dips with each stride;
      // the small x-tilt rolls the chest with the step (YXZ: z lays the body
      // sideways first, x then rolls it along its own long axis).
      const droop = 0.12 + 0.1 * L + Math.max(0, sp.step) * 0.06 * L;
      v.g.rotation.set(sp.step * 0.06 * L, ry, -Math.PI / 2 - droop);

      // LIMP HEAD — face tips down toward the shoulder (local +X is world-down
      // in this pose) and rolls gently with the stride + a slow personal wobble.
      if (v.head) {
        const wobble = Math.sin(this._t * 1.7 + v._ph) * 0.05 * L;
        v.head.rotation.set((0.28 + wobble) * L, (0.34 + sp.step * 0.05) * L, sp.step * 0.12 * L);
      }
      // DRAPED ARMS — ease from the idle hang into a drape down the hero's
      // back (world-down ≈ local +X here), swinging with the stride.
      if (v.armR) v.armR.rotation.set(sp.step * 0.2 * L, 0, (1.45 + sp.step * 0.16) * L);
      if (v.armL) v.armL.rotation.set(-sp.step * 0.2 * L, 0, (1.62 - sp.step * 0.16) * L);
      if (v.body) {
        v.body.position.set(0, 0, 0);
        v.body.rotation.set(0, 0, 0);
      }
      v.x = h.x;
      v.z = h.z;
    }
  }

  // Eases a person's head/arm Euler angles from the captured carried pose
  // toward the idle pose by factor k — used while stepping down after a carry.
  _easeLimb(v, p, k) {
    if (p.head && v.head) v.head.rotation.set(p.head.x * k, p.head.y * k, p.head.z * k);
    if (p.armL && v.armL) v.armL.rotation.set(p.armL.x * k, p.armL.y * k, p.armL.z * k);
    if (p.armR && v.armR) v.armR.rotation.set(p.armR.x * k, p.armR.y * k, p.armR.z * k);
  }

  tryPickup() {
    for (const h of this.heroes) {
      // action button while carrying = set the person down
      if (h.carry) {
        const v = h.carry;
        h.carry = null;
        v.carrying = null;
        v.state = "standing";
        v.standT = 0;
        v._dropY = v.g.position.y; // they step down from shoulder height
        // remember the exact carried pose so the stand-down eases from it
        v._dropPose = {
          rx: v.g.rotation.x,
          ry: v.g.rotation.y,
          rz: v.g.rotation.z,
          head: v.head ? v.head.rotation.clone() : null,
          armL: v.armL ? v.armL.rotation.clone() : null,
          armR: v.armR ? v.armR.rotation.clone() : null,
        };
        this.audio.grab();
        return;
      }
      let best = null;
      let bd = HERO.interactRadius;
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
    v._saveY = v.g.position.y; // rescued from the shoulders
    // remember the carried pose so the step-down eases from the real droop
    v._dropPose = {
      rx: v.g.rotation.x,
      rz: v.g.rotation.z,
      head: v.head ? v.head.rotation.clone() : null,
      armL: v.armL ? v.armL.rotation.clone() : null,
      armR: v.armR ? v.armR.rotation.clone() : null,
    };
    this.savedCount++;
    this.score.addRescue();
    this.audio.save();
  }

  updateVictims(dt) {
    const t = this._t;
    for (const v of this.victims) {
      if (v.saved) {
        if (v.state === "saving") {
          v.saveT += dt;
          const base = v._rescaled ? 0.78 : 1;
          const floor = (v._saveY || 0) - 1.42; // ground under the shoulders
          const p = v._dropPose;
          const pRx = p ? p.rx : 0;
          const pRz = p ? p.rz : -Math.PI / 2 - 0.12;
          if (v.saveT < 0.3) {
            const s = v.saveT / 0.3;
            const e = s * s * (3 - 2 * s); // step down off the back
            v.g.rotation.x = pRx * (1 - e);
            v.g.rotation.z = pRz * (1 - e);
            v.g.position.y = floor + 1.42 * (1 - e);
            if (p) this._easeLimb(v, p, 1 - e);
          } else {
            const t2 = v.saveT - 0.3; // rise, spin, fade to safety
            const s = Math.max(0, 1 - t2 / 0.5);
            v.g.scale.setScalar(Math.max(0.001, s * base));
            v.g.position.y = floor + t2 * 2.2;
            v.g.rotation.y += dt * 6;
            if (t2 > 0.5) v.g.visible = false;
          }
        }
        continue;
      }
      if (v.state === "standing") {
        v.mark.visible = true; // un-hide the "!" mark + halo from the carry
        v.halo.visible = true;
        v.standT += dt; // set down: step off the back to the floor
        const s = Math.min(1, v.standT / 0.25);
        const e = s * s * (3 - 2 * s);
        const floor = (v._dropY || 0) - 1.42;
        const p = v._dropPose;
        const pRx = p ? p.rx : 0;
        const pRz = p ? p.rz : -Math.PI / 2 - 0.12;
        v.g.rotation.x = pRx * (1 - e);
        v.g.rotation.z = pRz * (1 - e);
        v.g.position.y = floor + 1.42 * (1 - e);
        if (p) this._easeLimb(v, p, 1 - e);
        if (s >= 1) {
          v.g.rotation.set(0, 0, 0);
          v.g.position.y = floor;
          v.state = "idle";
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
    if (this._bannerT > 0) {
      this.prompt = this._banner;
      return;
    }
    this.prompt = "";
    for (const h of this.heroes) {
      if (h.carry) {
        const d = Math.hypot(h.x - EXIT.x, h.z - EXIT.z);
        if (d < EXIT.r + 1.6) {
          this.prompt = "🏁  Safe zone — let go to save";
          break;
        }
      }
    }
    if (!this.prompt) {
      outer: for (const h of this.heroes) {
        if (h.carry) continue;
        for (const v of this.victims) {
          if (!v.saved && !v.carrying && Math.hypot(v.x - h.x, v.z - h.z) < HERO.interactRadius) {
            this.prompt = "✋  Grab & carry (E / button)";
            break outer;
          }
        }
      }
    }
  }

  updateCamera(dt) {
    const look = this.input.consumeLook();
    this.yaw -= look.x * 0.006;
    this.pitch = clamp(this.pitch + look.y * 0.005, 0.3, 1.2);
    const a = this.heroes[0];
    const cx = a.x;
    const cz = a.z;
    const cy = this.heroY + 1.0; // rides the current floor (incl. climbing)
    const cp = Math.cos(this.pitch);
    const desired = new THREE.Vector3(
      cx + Math.sin(this.yaw) * cp * this.radius,
      cy + Math.sin(this.pitch) * this.radius,
      cz + Math.cos(this.yaw) * cp * this.radius
    );
    this.camPos.lerp(desired, Math.min(1, dt * 6));
    // never let the orbit push the camera through the walls or roof:
    // clamp to the play volume (side walls' inside faces at x=±10.95,
    // back wall at z=-6.95, front side is open street).
    this.camPos.x = clamp(this.camPos.x, -10.4, 10.4);
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
    for (const s of this.fires) {
      if (!s.active) continue;
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
    this.health.update(
      dt,
      h,
      this.world.fires.map((f) => ({ x: f.x, z: f.z, intensity: f.fire.intensity })),
      lvl
    );
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
      // Ladder climb between shifts: the hero rises one floor on the
      // fire escape while the camera follows; everything else idles.
      this._t += dt;
      this._climbT += dt;
      const p = Math.min(1, this._climbT / 2.4);
      const e = p * p * (3 - 2 * p); // smoothstep
      this.heroY = this._climbFrom + (this._climbTo - this._climbFrom) * e;
      const a = this.heroes[0];
      a.g.position.y = this.heroY;
      a.g.rotation.y = Math.PI / 2;
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
        this.state = "playing";
        this.heroY = this._climbTo;
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
        k.update(dt, { moving: false, moveSpeed: 0, carrying: k.carry, time: this._t });
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

    for (const h of this.heroes) {
      if (h.carry && Math.hypot(h.x - EXIT.x, h.z - EXIT.z) < EXIT.r + 0.3) {
        this.saveVictim(h.carry, h);
      }
    }
    this.updateVictims(dt);
    this.updateCamera(dt);
    this.computePrompt();

    if (this.savedCount >= this.totalCount) this.finish(true);
    else if (this.time >= this.levelCfg().time) this.finish(false, "time");
  }
}