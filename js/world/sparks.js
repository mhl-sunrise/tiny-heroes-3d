// world/sparks.js — foreground sparks that streak PAST the camera, adding
// depth and urgency. Pooled billboards; density is set by game.js each
// frame (lerped by fire level, doubled in the ultra-danger state).
import * as THREE from "three";
import { SPARKS } from "../config.js";

export function buildSparks() {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(0.09, 0.5);
  const sparks = [];
  for (let i = 0; i < SPARKS.count; i++) {
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: 0xffa040,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    m.visible = false;
    m.renderOrder = 50; // drawn above the scene — it's between you and the fire
    group.add(m);
    sparks.push({
      m,
      life: 0,
      max: 0.3,
      vel: new THREE.Vector3(),
    });
  }

  let timer = 0;
  let rate = 0; // sparks per second, set from game.js
  const tmp = new THREE.Vector3();

  function spawnOne(camera) {
    const s = sparks.find((q) => !q.m.visible);
    if (!s) return;
    // start just off the edge of the view, ahead of the camera
    tmp.copy(camera.position);
    s.m.position.set(
      tmp.x + (Math.random() - 0.5) * 5,
      tmp.y + (Math.random() - 0.2) * 3,
      tmp.z + (Math.random() - 0.5) * 5
    );
    // streak toward (and past) the camera
    s.vel
      .copy(camera.position)
      .sub(s.m.position)
      .normalize()
      .multiplyScalar(18 + Math.random() * 10);
    s.vel.y -= 1 + Math.random() * 2; // a touch of gravity
    s.max = 0.22 + Math.random() * 0.18;
    s.life = 0;
    s.m.visible = true;
  }

  function update(dt, camera) {
    if (rate <= 0) return;
    timer -= dt;
    if (timer <= 0) {
      timer = (1 / rate) * (0.5 + Math.random() * 0.8);
      spawnOne(camera);
    }
    for (const s of sparks) {
      if (!s.m.visible) continue;
      s.life += dt;
      if (s.life >= s.max) {
        s.m.visible = false;
        continue;
      }
      s.m.position.addScaledVector(s.vel, dt);
      s.vel.y -= dt * 2;
      s.m.quaternion.copy(camera.quaternion); // billboard
      const fade = 1 - s.life / s.max;
      s.m.material.opacity = 0.85 * fade;
      s.m.scale.set(1, 0.7 + Math.min(1.2, s.vel.length() * 0.04), 1);
    }
  }

  function reset() {
    for (const s of sparks) s.m.visible = false;
    timer = 0;
  }

  return { group, update, reset, setRate(r) { rate = r; } };
}