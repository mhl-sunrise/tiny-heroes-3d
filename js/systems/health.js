// systems/health.js — firefighter health (HP) + score, driven each frame by
// fire proximity, ambient smoke and the safe zone. Pure logic: no DOM, no
// Three.js — main.js / game.js feed it positions, the HUD reads the result.
import { HEALTH, SCORE, EXIT } from "../config.js";

export class HealthSystem {
  constructor() {
    this.max = HEALTH.max;
    this.hp = this.max;
    this.alive = true;
    this.low = false;
    this.dmgThisFrame = 0; // for HUD flash / heartbeat triggers
  }

  reset() {
    this.hp = this.max;
    this.alive = true;
    this.low = false;
    this.dmgThisFrame = 0;
  }

  /**
   * @param dt seconds
   * @param hero {x, z} hero position
   * @param fires [{x, z, intensity}] active fire spots (intensity 0..1)
   * @param fireLevel 0..1 whole-level fire progression (drives smoke)
   */
  update(dt, hero, fires, fireLevel) {
    this.dmgThisFrame = 0;
    if (!this.alive) return;

    let dmg = 0;
    let nearFire = false;

    for (const f of fires) {
      if (f.intensity < 0.05) continue;
      const d = Math.hypot(hero.x - f.x, hero.z - f.z);
      if (d < HEALTH.fireRadius) {
        dmg += HEALTH.fireRate * (1 - d / HEALTH.fireRadius) * f.intensity;
        nearFire = true;
      }
    }
    if (fireLevel > HEALTH.smokeOnset) {
      dmg += HEALTH.smokeRate * ((fireLevel - HEALTH.smokeOnset) / (1 - HEALTH.smokeOnset));
    }
    this.hp -= dmg * dt;
    this.dmgThisFrame = dmg * dt;

    // Regenerate away from flames; the safe zone heals fast.
    if (!nearFire) {
      const inSafe = Math.hypot(hero.x - EXIT.x, hero.z - EXIT.z) < EXIT.r + 0.5;
      this.hp += (inSafe ? HEALTH.safeRegen : HEALTH.regen) * dt;
    }

    this.hp = Math.max(0, Math.min(this.max, this.hp));
    this.low = this.hp <= HEALTH.lowAt;
    if (this.hp <= 0) this.alive = false;
  }

  /**
   * Instant damage (e.g. a falling brick). Bypasses the per-frame drain,
   * so no regen can eat the same frame; the HUD flash fires via
   * dmgThisFrame.
   */
  damage(n) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - n);
    this.dmgThisFrame += n;
    this.low = this.hp <= HEALTH.lowAt;
    if (this.hp <= 0) this.alive = false;
  }
}

export class ScoreSystem {
  constructor() {
    this.score = 0;
    this.rescues = 0;
    this.clearBonus = 0;
  }

  reset() {
    this.score = 0;
    this.rescues = 0;
    this.clearBonus = 0;
  }

  addRescue() {
    this.rescues++;
    this.score += SCORE.rescue;
  }

  addPoints(n) {
    this.score += n;
  }

  // Called when a level is cleared: remaining-time + remaining-health bonus.
  addClearBonus(time, limit, hp) {
    const t = Math.max(0, Math.floor((limit - time) * SCORE.timeBonusPerSec));
    const h = Math.max(0, Math.round(hp) * SCORE.healthBonusPerPt);
    this.clearBonus = t + h;
    this.score += this.clearBonus;
  }
}