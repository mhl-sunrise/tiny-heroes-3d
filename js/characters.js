// characters.js — builds our two recognizable little heroes (and victims)
// procedurally with Three.js. No external models: everything is geometry +
// PBR materials + small canvas textures, so it stays tiny and loads fast.
import * as THREE from "three";

/* ----------------------------- tiny helpers ----------------------------- */
function std(color, o = {}) {
  return new THREE.MeshStandardMaterial(
    Object.assign({ color, roughness: 0.85, metalness: 0.0 }, o)
  );
}
function mesh(geo, mat) {
  return new THREE.Mesh(geo, mat);
}
function capsule(r, len, mat, cap = 6, rad = 14) {
  return mesh(new THREE.CapsuleGeometry(r, len, cap, rad), mat);
}

/* --------------------------- procedural textures ------------------------ */
// Multi-camouflage (green / tan / brown / dark) — the girl's uniform.
function makeCamoTexture() {
  const s = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#8a8b57"; // base khaki-green
  ctx.fillRect(0, 0, s, s);
  const blobs = [
    ["#5b5f38", 34, 0.32],
    ["#3d4a2c", 26, 0.24],
    ["#c9b184", 30, 0.2],
    ["#6e5636", 24, 0.16],
    ["#2f3620", 18, 0.14],
    ["#a89b74", 22, 0.16],
  ];
  for (const [col, count, rMax] of blobs) {
    ctx.fillStyle = col;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 8 + Math.random() * rMax;
      // irregular blob via overlapping circles
      for (let k = 0; k < 3; k++) {
        const ox = x + (Math.random() - 0.5) * r;
        const oy = y + (Math.random() - 0.5) * r;
        const rr = r * (0.4 + Math.random() * 0.6);
        ctx.beginPath();
        ctx.ellipse(ox, oy, rr, rr * 0.7, Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // light speckle
  ctx.fillStyle = "rgba(230,225,190,0.35)";
  for (let i = 0; i < 220; i++) {
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Tiger-stripe sock texture (orange base + dark stripes) for the boy.
function makeTigerTexture() {
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#ef7a25";
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = "#2a1c10";
  ctx.lineWidth = 7;
  for (let i = -2; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 20, -10);
    ctx.bezierCurveTo(i * 20 + 14, 40, i * 20 - 10, 90, i * 20 + 6, s + 10);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Soft radial blob used for fake contact shadows under characters.
function makeShadowTexture() {
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(0,0,0,0.5)");
  g.addColorStop(0.6, "rgba(0,0,0,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(cv);
}
const _shadowTex = makeShadowTexture();

/* ------------------------------ face builder --------------------------- */
function buildFace(head, { skin, eye = 0x6b4a2f, brow }) {
  const skinMat = std(skin, { roughness: 0.7 });
  const eyeWhite = std(0xffffff, { roughness: 0.35 });
  const irisMat = std(eye, { roughness: 0.25 });
  const browMat = std(brow, { roughness: 0.9 });
  const lipMat = std(0xb5606a, { roughness: 0.6 });
  const cheekMat = new THREE.MeshStandardMaterial({
    color: 0xff9d86,
    roughness: 0.8,
    transparent: true,
    opacity: 0.5,
  });

  const R = 0.24; // head radius used by builder

  // Eyes (large, childlike)
  for (const sx of [-1, 1]) {
    const eyeG = new THREE.Group();
    const white = mesh(new THREE.SphereGeometry(0.055, 20, 20), eyeWhite);
    white.scale.set(1, 1.15, 0.7);
    const iris = mesh(new THREE.SphereGeometry(0.028, 16, 16), irisMat);
    iris.position.z = 0.028;
    const pupil = mesh(new THREE.SphereGeometry(0.013, 12, 12), std(0x14100c, { roughness: 0.2 }));
    pupil.position.z = 0.048;
    const glint = mesh(new THREE.SphereGeometry(0.008, 8, 8), std(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.9 }));
    glint.position.set(0.012, 0.014, 0.056);
    eyeG.add(white, iris, pupil, glint);
    eyeG.position.set(sx * 0.085, 0.02, R * 0.86);
    head.add(eyeG);
  }

  // Eyebrows
  for (const sx of [-1, 1]) {
    const brow = mesh(new THREE.BoxGeometry(0.06, 0.014, 0.012), browMat);
    brow.position.set(sx * 0.085, 0.095, R * 0.88);
    brow.rotation.z = sx * -0.18;
    head.add(brow);
  }

  // Nose
  const nose = mesh(new THREE.SphereGeometry(0.02, 12, 12), skinMat);
  nose.position.set(0, -0.02, R * 0.92);
  nose.scale.set(1, 0.8, 0.7);
  head.add(nose);

  // Gentle smile
  const smile = mesh(
    new THREE.TorusGeometry(0.045, 0.009, 8, 16, Math.PI),
    lipMat
  );
  smile.position.set(0, -0.05, R * 0.86);
  smile.rotation.set(Math.PI, 0, Math.PI);
  head.add(smile);

  // Rosy cheeks
  for (const sx of [-1, 1]) {
    const cheek = mesh(new THREE.SphereGeometry(0.035, 12, 12), cheekMat);
    cheek.position.set(sx * 0.12, -0.03, R * 0.8);
    cheek.scale.set(1, 0.7, 0.5);
    head.add(cheek);
  }

  // Ears
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.035, 12, 12), skinMat);
    ear.position.set(sx * R * 0.96, -0.01, 0.01);
    ear.scale.set(0.6, 1, 0.8);
    head.add(ear);
  }
}


/* ------------------------------ body builder --------------------------- */
const SKIN_R = 0.24;
function buildKid(cfg) {
  const g = new THREE.Group(); // outer: positioned + rotated by the game
  const body = new THREE.Group(); // inner: animated (bob / swing)
  g.add(body);

  const skinMat = std(cfg.skin, { roughness: 0.7 });
  const pantsMat = cfg.pants;
  const torsoMat = cfg.torso;
  const sleeveMat = cfg.sleeve || torsoMat;
  const sockMat = cfg.sock;

  const mkLeg = (sx) => {
    const lg = new THREE.Group();
    lg.position.set(sx * 0.12, 0.6, 0);
    const leg = capsule(0.11, 0.32, pantsMat);
    leg.position.y = -0.27;
    const foot = mesh(new THREE.SphereGeometry(0.1, 14, 14), sockMat);
    foot.scale.set(1, 0.72, 1.35);
    foot.position.set(0, -0.47, 0.05);
    lg.add(leg, foot);
    body.add(lg);
    return lg;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  const torso = capsule(0.2, 0.42, torsoMat);
  torso.position.y = 0.84;
  body.add(torso);

  const mkArm = (sx) => {
    const ag = new THREE.Group();
    ag.position.set(sx * 0.2, 1.02, 0);
    const arm = capsule(0.08, 0.3, sleeveMat);
    arm.position.y = -0.23;
    const hand = mesh(new THREE.SphereGeometry(0.085, 14, 14), skinMat);
    hand.position.y = -0.42;
    ag.add(arm, hand);
    body.add(ag);
    return ag;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  const head = new THREE.Group();
  head.position.y = 1.3;
  const skull = mesh(new THREE.SphereGeometry(SKIN_R, 28, 28), skinMat);
  skull.scale.set(1, 1.03, 0.98);
  head.add(skull);
  buildFace(head, { skin: cfg.skin, eye: cfg.eye, brow: cfg.brow });
  body.add(head);

  return { g, body, armL, armR, legL, legR, head, torso };
}

/* --------------------------- shared animation -------------------------- */
function makeKidUpdate(k) {
  let phase = 0;
  k._amp = 0;
  return function update(dt, state) {
    const moving = state.moving;
    const spd = state.moveSpeed || 0;
    const carrying = !!state.carrying;
    k._amp += ((moving ? 1 : 0) - k._amp) * Math.min(1, dt * 8);
    if (moving) phase += dt * (5.5 + spd * 6);
    const s = Math.sin(phase);
    const amp = 0.55 * k._amp;
    const t = state.time || 0;
    const idle = 1 - k._amp;

    if (carrying) {
      k.armL.rotation.x = -1.05;
      k.armR.rotation.x = -1.05;
      k.armL.rotation.z = 0.18;
      k.armR.rotation.z = -0.18;
      k.legL.rotation.x = s * 0.28;
      k.legR.rotation.x = -s * 0.28;
      k.torso.rotation.x = 0.06;
    } else {
      k.armL.rotation.x = s * amp;
      k.armR.rotation.x = -s * amp;
      k.armL.rotation.z = 0.05 + Math.sin(t * 1.5) * 0.05 * idle;
      k.armR.rotation.z = -0.05 - Math.sin(t * 1.5) * 0.05 * idle;
      k.legL.rotation.x = -s * amp * 0.95;
      k.legR.rotation.x = s * amp * 0.95;
      k.torso.rotation.x = 0;
    }

    k.torso.position.y = 0.84 + Math.abs(Math.sin(phase)) * 0.03 * k._amp;
    k.body.position.y =
      Math.abs(Math.sin(phase)) * 0.02 * k._amp +
      Math.sin(t * 2) * 0.008 * idle;
    k.head.rotation.x = Math.sin(t * 1.3) * 0.03 + (moving ? -0.05 : 0);
    k.head.rotation.y = Math.sin(t * 0.9) * 0.05;
  };
}

// Fake contact shadow (cheap, looks great over a dark floor).
function addBlob(g, scale = 0.72) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 32),
    new THREE.MeshBasicMaterial({
      map: _shadowTex,
      depthWrite: false,
      opacity: 0.6,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.scale.setScalar(scale);
  m.renderOrder = -1;
  g.add(m);
}


/* ----------------------------- THE BOY -------------------------------- */
export function createBoy() {
  const navy = std(0x17223f, { roughness: 0.55, metalness: 0.05 });
  const lime = std(0xc8ff4d, {
    emissive: 0x9dff1f,
    emissiveIntensity: 1.1,
    roughness: 0.5,
  });
  const orange = std(0xf26a1b, { roughness: 0.6 });
  const black = std(0x14161c, { roughness: 0.5 });
  const tigerMat = std(0xffffff, { map: makeTigerTexture(), roughness: 0.7 });

  const k = buildKid({
    pants: navy,
    torso: navy,
    sleeve: navy,
    sock: tigerMat,
    skin: 0xf2c9a0,
    eye: 0x6b4a2f,
    brow: 0x9a6a3e,
  });

  // Reflective chartreuse stripes — the signature firefighter look
  for (const sx of [-1, 1]) {
    const strip = mesh(new THREE.BoxGeometry(0.035, 0.34, 0.02), lime);
    strip.position.set(sx * 0.09, 0.9, 0.185);
    k.body.add(strip);
  }
  const mkRing = (radius) => {
    const ring = mesh(new THREE.TorusGeometry(radius, 0.014, 8, 18), lime);
    ring.rotation.x = Math.PI / 2;
    return ring;
  };
  const cuffL = mkRing(0.09);
  cuffL.position.y = -0.3;
  k.armL.add(cuffL);
  const cuffR = mkRing(0.09);
  cuffR.position.y = -0.3;
  k.armR.add(cuffR);
  const ankL = mkRing(0.115);
  ankL.position.y = -0.4;
  k.legL.add(ankL);
  const ankR = mkRing(0.115);
  ankR.position.y = -0.4;
  k.legR.add(ankR);

  // Orange crossbody messenger bag + strap
  const strap = mesh(new THREE.BoxGeometry(0.07, 0.52, 0.02), black);
  strap.position.set(0, 0.95, 0.185);
  strap.rotation.z = -0.55;
  k.body.add(strap);
  const bag = mesh(new THREE.BoxGeometry(0.24, 0.18, 0.12), orange);
  bag.position.set(0.14, 0.64, 0.16);
  bag.rotation.z = -0.12;
  const flap = mesh(new THREE.BoxGeometry(0.2, 0.1, 0.03), black);
  flap.position.set(0.14, 0.7, 0.215);
  flap.rotation.z = -0.12;
  k.body.add(bag, flap);

  // Buzzed light-brown hair (short cap over the crown) + fringe
  const hairMat = std(0xb08a5c, { roughness: 1 });
  const hair = mesh(
    new THREE.SphereGeometry(0.253, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.52),
    hairMat
  );
  hair.position.y = 0.01;
  k.head.add(hair);
  const fringe = mesh(
    new THREE.SphereGeometry(0.248, 20, 12, -Math.PI * 0.42, Math.PI * 0.84, 0, Math.PI * 0.32),
    hairMat
  );
  fringe.position.set(0, 0.03, 0.01);
  k.head.add(fringe);

  addBlob(k.g);
  return Object.assign(k, { update: makeKidUpdate(k), kind: "boy" });
}


/* ----------------------------- THE GIRL ------------------------------- */
export function createGirl() {
  const camoTex = makeCamoTexture();
  const camo = std(0xffffff, { map: camoTex, roughness: 1 });
  const camoPants = std(0xffffff, { map: camoTex, roughness: 1 });
  const whiteSock = std(0xf3f0ea, { roughness: 0.85 });
  const buttonMat = std(0x2a2116, { roughness: 0.6 });
  const pocketMat = std(0xffffff, { map: camoTex, roughness: 1 });

  const k = buildKid({
    pants: camoPants,
    torso: camo,
    sleeve: camo,
    sock: whiteSock,
    skin: 0xf0c6a0,
    eye: 0x6b4a2f,
    brow: 0x8a5a34,
  });

  // Military collar
  const collar = mesh(new THREE.TorusGeometry(0.11, 0.03, 10, 20), camo);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.09;
  k.body.add(collar);
  // Buttons down the front
  for (let i = 0; i < 4; i++) {
    const b = mesh(new THREE.SphereGeometry(0.014, 8, 8), buttonMat);
    b.position.set(0, 1.0 - i * 0.09, 0.19);
    k.body.add(b);
  }
  // Chest pockets
  for (const sx of [-1, 1]) {
    const p = mesh(new THREE.BoxGeometry(0.09, 0.09, 0.03), pocketMat);
    p.position.set(sx * 0.09, 0.9, 0.19);
    k.body.add(p);
  }

  // Hair: auburn crown + fringe + ponytail + clips
  const hairMat = std(0xa5673f, { roughness: 0.95 });
  const crown = mesh(
    new THREE.SphereGeometry(0.258, 26, 20, 0, Math.PI * 2, 0, Math.PI * 0.58),
    hairMat
  );
  crown.position.y = 0.01;
  k.head.add(crown);
  const fringe = mesh(
    new THREE.SphereGeometry(0.252, 22, 14, -Math.PI * 0.5, Math.PI, 0, Math.PI * 0.34),
    hairMat
  );
  fringe.position.set(0, 0.02, 0.02);
  fringe.scale.set(1, 1.05, 1);
  k.head.add(fringe);
  // side hair (locks falling by the cheeks)
  for (const sx of [-1, 1]) {
    const lock = mesh(new THREE.CapsuleGeometry(0.05, 0.16, 6, 12), hairMat);
    lock.position.set(sx * 0.215, -0.05, 0.06);
    lock.rotation.z = sx * -0.15;
    k.head.add(lock);
  }
  // Ponytail
  const tail = mesh(new THREE.ConeGeometry(0.09, 0.5, 16), hairMat);
  tail.position.set(0.02, -0.05, -0.22);
  tail.rotation.x = 0.5;
  tail.scale.set(1, 1, 0.7);
  k.head.add(tail);
  const tie = mesh(new THREE.TorusGeometry(0.05, 0.018, 8, 16), std(0xffd34d, { roughness: 0.5 }));
  tie.position.set(0.02, 0.12, -0.17);
  tie.rotation.x = 0.5;
  k.head.add(tie);
  // Hair clips (small silver barrettes on the right side)
  const clipMat = std(0xe9ecf5, { emissive: 0x8899bb, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.3 });
  for (let i = 0; i < 2; i++) {
    const clip = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 8), clipMat);
    clip.position.set(0.17, 0.06 - i * 0.05, 0.13);
    clip.rotation.z = Math.PI / 2;
    k.head.add(clip);
  }

  addBlob(k.g);
  return Object.assign(k, { update: makeKidUpdate(k), kind: "girl" });
}


/* ------------------------------ VICTIMS -------------------------------- */
// A small stylized trapped person with a glowing "!" marker and a halo.
export function createVictim(opts = {}) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const skin = std(0xf0c6a0, { roughness: 0.75 });
  const shirtMat = std(opts.color || 0x4a90d9, { roughness: 0.85 });
  const pantsMat = std(0x2f3542, { roughness: 0.9 });

  for (const sx of [-1, 1]) {
    const leg = capsule(0.09, 0.24, pantsMat);
    leg.position.set(sx * 0.1, 0.5, 0);
    body.add(leg);
  }
  const torso = capsule(0.17, 0.34, shirtMat);
  torso.position.y = 0.78;
  body.add(torso);

  const armL = new THREE.Group();
  armL.position.set(-0.17, 0.95, 0);
  armL.add(capsule(0.06, 0.26, shirtMat)).position.y = -0.18;
  const handL = mesh(new THREE.SphereGeometry(0.06, 10, 10), skin);
  handL.position.y = -0.36;
  armL.add(handL);
  body.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0.17, 0.95, 0);
  armR.add(capsule(0.06, 0.26, shirtMat)).position.y = -0.18;
  const handR = mesh(new THREE.SphereGeometry(0.06, 10, 10), skin);
  handR.position.y = -0.36;
  armR.add(handR);
  body.add(armR);

  const head = new THREE.Group();
  head.position.y = 1.15;
  head.add(mesh(new THREE.SphereGeometry(0.19, 20, 20), skin));
  for (const sx of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.022, 10, 10), std(0x20201a, { roughness: 0.4 }));
    eye.position.set(sx * 0.06, 0.02, 0.16);
    head.add(eye);
  }
  const mouth = mesh(new THREE.SphereGeometry(0.03, 10, 10), std(0xb5606a));
  mouth.scale.set(1, 0.5, 0.5);
  mouth.position.set(0, -0.05, 0.16);
  head.add(mouth);
  const hair = mesh(
    new THREE.SphereGeometry(0.196, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
    std(opts.hair || 0x4a3423, { roughness: 1 })
  );
  head.add(hair);
  body.add(head);

  // Floating "!" marker (glows via bloom)
  const markMat = std(0xffd34d, { emissive: 0xffb020, emissiveIntensity: 1.6, roughness: 0.4 });
  const mark = new THREE.Group();
  const stem = capsule(0.05, 0.16, markMat);
  stem.position.y = 0.12;
  mark.add(stem);
  const dot = mesh(new THREE.SphereGeometry(0.05, 12, 12), markMat);
  dot.position.y = -0.1;
  mark.add(dot);
  mark.position.y = 1.78;
  g.add(mark);

  // Ground halo marking the rescue spot
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.48, 28),
    new THREE.MeshBasicMaterial({
      color: 0x66ffcc,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.03;
  g.add(halo);

  addBlob(g, 0.6);
  const phase = Math.random() * Math.PI * 2;

  function update(time) {
    const t = time + phase;
    armR.rotation.x = -1.1 + Math.sin(t * 3) * 0.45;
    armR.rotation.z = -0.5 + Math.sin(t * 3) * 0.12;
    armL.rotation.x = Math.sin(t * 1.5) * 0.06;
    mark.position.y = 1.78 + Math.sin(t * 2) * 0.09;
    mark.rotation.y = t * 1.6;
    body.position.y = Math.abs(Math.sin(t * 2.2)) * 0.02;
    halo.material.opacity = 0.55 + Math.sin(t * 4) * 0.2;
  }
  return { g, update, halo, mark };
}
