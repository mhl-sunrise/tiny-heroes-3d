// characters.js â€” builds our little firefighter (the only hero) and the
// trapped people, procedurally with Three.js. No external models: everything
// is geometry + PBR materials + small canvas textures, so it stays tiny and
// loads fast.
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
// Cute face used by every character. mood "smile" = hero, "worry" = trapped.
function buildFace(head, { skin, eye = 0x6b4a2f, brow, r = 0.24, mood = "smile" }) {
  const s = r / 0.24; // scale factor so the same code works on smaller heads
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

  // Eyes (large, childlike)
  for (const sx of [-1, 1]) {
    const eyeG = new THREE.Group();
    const white = mesh(new THREE.SphereGeometry(0.055 * s, 20, 20), eyeWhite);
    white.scale.set(1, 1.15, 0.7);
    const iris = mesh(new THREE.SphereGeometry(0.028 * s, 16, 16), irisMat);
    iris.position.z = 0.028 * s;
    const pupil = mesh(
      new THREE.SphereGeometry(0.013 * s, 12, 12),
      std(0x14100c, { roughness: 0.2 })
    );
    pupil.position.z = 0.048 * s;
    const glint = mesh(
      new THREE.SphereGeometry(0.008 * s, 8, 8),
      std(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.9 })
    );
    glint.position.set(0.012 * s, 0.014 * s, 0.056 * s);
    eyeG.add(white, iris, pupil, glint);
    eyeG.position.set(sx * 0.085 * s, (mood === "worry" ? 0.03 : 0.02) * s, r * 0.86);
    head.add(eyeG);
  }

  // Eyebrows (raised inward when worried)
  for (const sx of [-1, 1]) {
    const b = mesh(new THREE.BoxGeometry(0.06 * s, 0.014 * s, 0.012 * s), browMat);
    b.position.set(sx * 0.085 * s, (mood === "worry" ? 0.11 : 0.095) * s, r * 0.88);
    b.rotation.z = sx * (mood === "worry" ? 0.35 : -0.18);
    head.add(b);
  }

  // Nose
  const nose = mesh(new THREE.SphereGeometry(0.02 * s, 12, 12), skinMat);
  nose.position.set(0, -0.02 * s, r * 0.92);
  nose.scale.set(1, 0.8, 0.7);
  head.add(nose);

  // Mouth: a smile, or an open "help!" mouth
  if (mood === "worry") {
    const mouth = mesh(
      new THREE.SphereGeometry(0.03 * s, 12, 12),
      std(0x8e3b47, { roughness: 0.6 })
    );
    mouth.scale.set(1, 1.25, 0.5);
    mouth.position.set(0, -0.06 * s, r * 0.84);
    head.add(mouth);
  } else {
    const smile = mesh(
      new THREE.TorusGeometry(0.045 * s, 0.009 * s, 8, 16, Math.PI),
      lipMat
    );
    smile.position.set(0, -0.05 * s, r * 0.86);
    smile.rotation.set(Math.PI, 0, Math.PI);
    head.add(smile);
  }

  // Rosy cheeks
  for (const sx of [-1, 1]) {
    const cheek = mesh(new THREE.SphereGeometry(0.035 * s, 12, 12), cheekMat);
    cheek.position.set(sx * 0.12 * s, -0.03 * s, r * 0.8);
    cheek.scale.set(1, 0.7, 0.5);
    head.add(cheek);
  }

  // Ears
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.035 * s, 12, 12), skinMat);
    ear.position.set(sx * r * 0.96, -0.01 * s, 0.01 * s);
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
  const footMat = cfg.foot;
  const gloveMat = cfg.glove || skinMat;

  const mkLeg = (sx) => {
    const lg = new THREE.Group();
    lg.position.set(sx * 0.12, 0.6, 0);
    const leg = capsule(0.11, 0.32, pantsMat);
    leg.position.y = -0.27;
    const foot = mesh(new THREE.SphereGeometry(0.1, 14, 14), footMat);
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
    const hand = mesh(new THREE.SphereGeometry(0.085, 14, 14), gloveMat);
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
  buildFace(head, {
    skin: cfg.skin,
    eye: cfg.eye,
    brow: cfg.brow,
    mood: cfg.mood || "smile",
  });
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
    k._amp += ((moving ? 1 : 0) - k._amp) * Math.min(1, dt * 8);
    if (moving) phase += dt * (5.5 + spd * 6);
    const s = Math.sin(phase);
    const amp = 0.55 * k._amp;
    const t = state.time || 0;
    const idle = 1 - k._amp;

    // normal arm + leg swing (walking or idle)
    k.armL.rotation.x = s * amp;
    k.armR.rotation.x = -s * amp;
    k.armL.rotation.y = 0;
    k.armR.rotation.y = 0;
    k.armL.rotation.z = 0.05 + Math.sin(t * 1.5) * 0.05 * idle;
    k.armR.rotation.z = -0.05 - Math.sin(t * 1.5) * 0.05 * idle;
    k.legL.rotation.x = -s * amp * 0.95;
    k.legR.rotation.x = s * amp * 0.95;
    k.torso.rotation.x = 0;

    k.torso.position.y = 0.84 + Math.abs(Math.sin(phase)) * 0.03 * k._amp;
    k.body.position.y =
      Math.abs(Math.sin(phase)) * 0.02 * k._amp + Math.sin(t * 2) * 0.008 * idle;
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

/* --------------------------- coat texture ------------------------------ */
// Navy turnout coat with silver + chartreuse reflective bands. Capsule UVs:
// u = around the body, v = top to bottom, so full-width texture rows wrap
// into reflective bands around the coat.
function makeCoatTexture() {
  const s = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const ctx = cv.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, "#2c3d6b");
  grad.addColorStop(1, "#1b2748");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  // fabric speckle
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 500; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  for (let i = 0; i < 500; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);

  const band = (y, h) => {
    ctx.fillStyle = "#cfd6e4";
    ctx.fillRect(0, y, s, h);
    ctx.fillStyle = "#dfff5e";
    ctx.fillRect(0, y + h * 0.28, s, h * 0.44);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(0, y + 2, s, 2);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, y + h - 2, s, 2);
  };
  band(74, 24); // chest
  band(150, 24); // waist
  band(216, 22); // hem

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/* ----------------------------- THE FIREFIGHTER -------------------------- */
export function createFirefighter() {
  const coatTex = makeCoatTexture();
  const coat = std(0xffffff, { map: coatTex, roughness: 0.6, metalness: 0.05 });
  const navy = std(0x1b2748, { roughness: 0.6 });
  const bootMat = std(0x14161c, { roughness: 0.45, metalness: 0.1 });
  const gloveMat = std(0xf2a444, { roughness: 0.7 });
  const orange = std(0xf5821f, { roughness: 0.5 });
  const orangeDark = std(0xc96511, { roughness: 0.55 });
  const silver = std(0xd9dfe8, { roughness: 0.3, metalness: 0.6 });
  const lime = std(0xc8ff4d, {
    emissive: 0x9dff1f,
    emissiveIntensity: 0.8,
    roughness: 0.5,
  });

  const k = buildKid({
    pants: navy,
    torso: coat,
    sleeve: coat,
    foot: bootMat,
    glove: gloveMat,
    skin: 0xf2c9a0,
    eye: 0x5a3d28,
    brow: 0x7a4b2a,
  });

  // --- Helmet: dome + brim + front peak + crest + shield + lamp + band.
  // All parts are HEAD-LOCAL (the head group sits at y=1.3 in the body).
  // The dome only covers the CROWN: its rim stops just below the brows, so
  // the whole face (eyes/mouth/cheeks) stays clear — a helmet on the head,
  // not a mask over the face. The brim flange rides the dome rim.
  const helmet = new THREE.Group();
  helmet.position.y = 0.02; // sit the shell up on the crown
  const dome = mesh(
    new THREE.SphereGeometry(0.26, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.42),
    orange
  );
  helmet.add(dome);
  // flange: a short, slightly wider ring riding just under the dome rim
  const brim = mesh(new THREE.CylinderGeometry(0.27, 0.285, 0.04, 24), orangeDark);
  brim.position.y = 0.045;
  helmet.add(brim);
  // front peak: half-pipe whose arc covers the +Z (face) side — a real
  // firefighter peak, tucked under the brim, sitting just above the eyes
  const peak = mesh(
    new THREE.CylinderGeometry(0.12, 0.135, 0.03, 18, 1, false, -Math.PI / 2, Math.PI),
    orangeDark
  );
  peak.position.set(0, 0.035, 0.14);
  helmet.add(peak);
  const crest = mesh(new THREE.BoxGeometry(0.06, 0.05, 0.3), orangeDark);
  crest.position.set(0, 0.255, 0.02);
  helmet.add(crest);
  // badge on the front of the dome, well ABOVE the eyes
  const shield = mesh(new THREE.BoxGeometry(0.14, 0.07, 0.03), silver);
  shield.position.set(0, 0.11, 0.23);
  shield.rotation.x = -0.44;
  helmet.add(shield);
  // lime trim ring wrapping the brim flange (rides proud of its surface)
  const band = mesh(new THREE.TorusGeometry(0.275, 0.018, 8, 24), lime);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.045;
  helmet.add(band);
  const lamp = mesh(
    new THREE.SphereGeometry(0.035, 12, 12),
    std(0xfff6d8, { emissive: 0xffe9a8, emissiveIntensity: 2.2, roughness: 0.3 })
  );
  lamp.scale.set(1, 0.8, 0.6);
  lamp.position.set(0, 0.19, 0.17);
  helmet.add(lamp);
  k.head.add(helmet);
  // --- SCBA air tank on the back
  const tank = capsule(0.09, 0.24, silver);
  tank.position.set(0, 0.98, -0.26);
  k.body.add(tank);
  const valve = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 12), orangeDark);
  valve.position.set(0, 1.18, -0.26);
  k.body.add(valve);

  // Shoulder straps holding the tank
  const strapMat = std(0x10131c, { roughness: 0.7 });
  for (const sx of [-1, 1]) {
    const strap = mesh(new THREE.BoxGeometry(0.05, 0.42, 0.03), strapMat);
    strap.position.set(sx * 0.1, 0.95, 0.195);
    strap.rotation.z = sx * 0.16;
    k.body.add(strap);
  }

  // Belt + silver buckle
  const belt = mesh(new THREE.TorusGeometry(0.21, 0.035, 10, 22), strapMat);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.62;
  k.body.add(belt);
  const buckle = mesh(new THREE.BoxGeometry(0.07, 0.06, 0.03), silver);
  buckle.position.set(0, 0.62, 0.2);
  k.body.add(buckle);

  // Epaulettes + chest patch
  for (const sx of [-1, 1]) {
    const ep = mesh(new THREE.BoxGeometry(0.09, 0.03, 0.12), orange);
    ep.position.set(sx * 0.17, 1.13, 0);
    k.body.add(ep);
  }
  const patch = mesh(new THREE.BoxGeometry(0.09, 0.06, 0.02), orange);
  patch.position.set(0.13, 1.06, 0.185);
  k.body.add(patch);

  // Silver reflective rings at cuffs + ankles (the classic safety trim)
  const mkRing = (radius) => {
    const ring = mesh(new THREE.TorusGeometry(radius, 0.014, 8, 18), silver);
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

  addBlob(k.g);
  return Object.assign(k, { update: makeKidUpdate(k), kind: "firefighter" });
}

/* ------------------------------ VICTIMS -------------------------------- */
// A small stylized trapped person with a full cute face, varied hair,
// clothes and accessories, a glowing "!" marker and a ground halo.
const HAIR_COLORS = [0x4a3423, 0x2c1d12, 0xb08a5c, 0xd8a24a, 0x8e3b1f, 0x5a3d28];
const SKIN_TONES = [0xf2c9a0, 0xf0c6a0, 0xd9a06b, 0xc98a55, 0x8d5a3a];

function buildHair(head, style, mat) {
  if (style === "short") {
    const cap = mesh(
      new THREE.SphereGeometry(0.216, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
      mat
    );
    cap.position.y = 0.01;
    head.add(cap);
  } else if (style === "long") {
    const cap = mesh(
      new THREE.SphereGeometry(0.222, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
      mat
    );
    cap.position.y = 0.01;
    head.add(cap);
    for (const sx of [-1, 1]) {
      const lock = capsule(0.055, 0.24, mat);
      lock.position.set(sx * 0.19, -0.14, 0.02);
      lock.rotation.z = sx * -0.12;
      head.add(lock);
    }
  } else if (style === "ponytail") {
    const cap = mesh(
      new THREE.SphereGeometry(0.216, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
      mat
    );
    cap.position.y = 0.01;
    head.add(cap);
    const tail = mesh(new THREE.ConeGeometry(0.07, 0.42, 14), mat);
    tail.position.set(0, -0.06, -0.2);
    tail.rotation.x = 0.55;
    head.add(tail);
    const tie = mesh(
      new THREE.TorusGeometry(0.045, 0.016, 8, 14),
      std(0xffd34d, { roughness: 0.5 })
    );
    tie.position.set(0, 0.1, -0.16);
    tie.rotation.x = 0.55;
    head.add(tie);
  } else {
    // curly: a cluster of puffs
    const cap = mesh(
      new THREE.SphereGeometry(0.214, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
      mat
    );
    cap.position.y = 0.01;
    head.add(cap);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.5;
      const puff = mesh(new THREE.SphereGeometry(0.075, 12, 10), mat);
      puff.position.set(Math.cos(a) * 0.17, 0.13, Math.sin(a) * 0.15 - 0.02);
      head.add(puff);
    }
  }
}

function makeTeddy() {
  const t = new THREE.Group();
  const fur = std(0xa5713f, { roughness: 1 });
  const bodyB = mesh(new THREE.SphereGeometry(0.09, 14, 12), fur);
  bodyB.scale.set(1, 1.15, 0.9);
  t.add(bodyB);
  const headB = mesh(new THREE.SphereGeometry(0.07, 14, 12), fur);
  headB.position.y = 0.14;
  t.add(headB);
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.028, 10, 8), fur);
    ear.position.set(sx * 0.055, 0.2, 0);
    t.add(ear);
  }
  const snout = mesh(
    new THREE.SphereGeometry(0.025, 10, 8),
    std(0xe8c39a, { roughness: 0.9 })
  );
  snout.position.set(0, 0.13, 0.06);
  t.add(snout);
  return t;
}
export function createVictim(opts = {}) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);

  const skinTone = opts.skin ?? SKIN_TONES[(Math.random() * SKIN_TONES.length) | 0];
  const skin = std(skinTone, { roughness: 0.75 });
  const shirtMat = std(opts.color || 0x4a90d9, { roughness: 0.85 });
  const pantsMat = std(
    opts.pants ?? [0x2f3542, 0x3a4a5e, 0x4a3a2e, 0x33424a][(Math.random() * 4) | 0],
    { roughness: 0.9 }
  );
  const shoeMat = std(0x22190f, { roughness: 0.5 });

  // Legs + shoes (hip-pivoted groups so the follow-walk swings look right)
  const mkLeg = (sx) => {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.1, 0.55, 0);
    const c = capsule(0.09, 0.24, pantsMat);
    c.position.y = -0.05;
    leg.add(c);
    const shoe = mesh(new THREE.SphereGeometry(0.085, 14, 12), shoeMat);
    shoe.scale.set(1, 0.7, 1.35);
    shoe.position.set(0, -0.48, 0.04);
    leg.add(shoe);
    body.add(leg);
    return leg;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  // Torso + collar + buttons
  const torso = capsule(0.17, 0.34, shirtMat);
  torso.position.y = 0.78;
  body.add(torso);
  const collar = mesh(
    new THREE.TorusGeometry(0.09, 0.025, 8, 16),
    std(0xf0ece4, { roughness: 0.8 })
  );
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.99;
  body.add(collar);
  for (let i = 0; i < 3; i++) {
    const b = mesh(new THREE.SphereGeometry(0.012, 8, 8), std(0xffffff, { roughness: 0.4 }));
    b.position.set(0, 0.92 - i * 0.08, 0.155);
    body.add(b);
  }

  // Arms (sleeve + skin hand)
  const mkArm = (sx) => {
    const armG = new THREE.Group();
    armG.position.set(sx * 0.17, 0.95, 0);
    const sleeve = capsule(0.06, 0.18, shirtMat);
    sleeve.position.y = -0.14;
    const fore = capsule(0.05, 0.1, skin);
    fore.position.y = -0.3;
    const hand = mesh(new THREE.SphereGeometry(0.055, 12, 10), skin);
    hand.position.y = -0.4;
    armG.add(sleeve, fore, hand);
    body.add(armG);
    return armG;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  // Head with the full cute face + worried expression
  const head = new THREE.Group();
  head.position.y = 1.18;
  const skull = mesh(new THREE.SphereGeometry(0.21, 24, 24), skin);
  skull.scale.set(1, 1.02, 0.98);
  head.add(skull);
  buildFace(head, {
    skin: skinTone,
    eye: opts.eye ?? 0x5a4632,
    brow: opts.hair ?? 0x4a3423,
    r: 0.21,
    mood: "worry",
  });
  const hairStyle =
    opts.hairStyle ?? ["short", "long", "ponytail", "curly"][(Math.random() * 4) | 0];
  const hairMat = std(
    opts.hair ?? HAIR_COLORS[(Math.random() * HAIR_COLORS.length) | 0],
    { roughness: 0.95 }
  );
  buildHair(head, hairStyle, hairMat);
  body.add(head);
  // Accessories: scarf for some, teddy bear for others
  if (opts.teddy || Math.random() < 0.3) {
    const teddy = makeTeddy();
    teddy.position.set(0.2, 0.98, 0.12);
    teddy.rotation.y = -0.4;
    body.add(teddy);
  } else if (opts.scarf || Math.random() < 0.4) {
    const scarfColor = opts.scarfColor ?? 0xd94f30;
    const scarf = mesh(
      new THREE.TorusGeometry(0.1, 0.04, 8, 18),
      std(scarfColor, { roughness: 0.9 })
    );
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.02;
    body.add(scarf);
    const tail = capsule(0.04, 0.14, std(scarfColor, { roughness: 0.9 }));
    tail.position.set(0.06, 0.92, 0.12);
    tail.rotation.z = 0.2;
    body.add(tail);
  }

  // Floating "!" marker (glows via bloom)
  const markMat = std(0xffd34d, { emissive: 0xffb020, emissiveIntensity: 1.6, roughness: 0.4 });
  const mark = new THREE.Group();
  const stem = capsule(0.05, 0.16, markMat);
  stem.position.y = 0.12;
  mark.add(stem);
  const dot = mesh(new THREE.SphereGeometry(0.05, 12, 12), markMat);
  dot.position.y = -0.1;
  mark.add(dot);
  mark.position.y = 1.82;
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
  let walkPhase = 0; // stride clock while following the hero

  function update(time, opts = {}) {
    const t = time + phase;
    const walkDt = opts.walkDt || 0;
    if (walkDt > 0) walkPhase += walkDt * 9;
    const stride = Math.sin(walkPhase);
    if (walkDt > 0) {
      // follow-walk: legs + arms swing in opposition, body bobs with the step
      legL.rotation.x = stride * 0.55;
      legR.rotation.x = -stride * 0.55;
      armL.rotation.x = -stride * 0.5;
      armR.rotation.x = opts.waving ? -1.1 + Math.sin(t * 6) * 0.5 : stride * 0.5;
      armR.rotation.z = 0;
      body.position.y = Math.abs(Math.cos(walkPhase)) * 0.03;
    } else {
      // scared waving + trembling (still trapped)
      legL.rotation.x = 0;
      legR.rotation.x = 0;
      armR.rotation.x = -1.1 + Math.sin(t * 3.2) * 0.5;
      armR.rotation.z = -0.5 + Math.sin(t * 3.2) * 0.14;
      armL.rotation.x = Math.sin(t * 1.7) * 0.1;
      body.position.y = Math.abs(Math.sin(t * 2.2)) * 0.02;
    }
    mark.position.y = 1.82 + Math.sin(t * 2) * 0.09;
    mark.rotation.y = t * 1.6;
    body.position.x = Math.sin(t * 24) * 0.006; // nervous tremble
    body.rotation.z = Math.sin(t * 24) * 0.01;
    halo.material.opacity = 0.55 + Math.sin(t * 4) * 0.2;
  }
  return { g, update, halo, mark, armR, armL, body, head, legL, legR };
}