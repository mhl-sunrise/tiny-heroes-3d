// world.js — builds the night scene: a cutaway dollhouse-style building that
// is catching fire (glowing windows, flame spots, rising smoke), a fire truck,
// the ground/road, and the safe "exit" zone.
import * as THREE from "three";

export const BOUNDS = { minX: -9.6, maxX: 9.6, minZ: -6.2, maxZ: 6.2 };
export const EXIT = { x: 0, z: 5.8, r: 2.3 };

const WALL_H = 9.6;
const STORY = 3.2;

/* ------------------------------ textures ------------------------------- */
function makeBrickTexture() {
  const w = 256, h = 256;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#4a4038";
  ctx.fillRect(0, 0, w, h);
  const bh = 32, bw = 64;
  for (let y = 0; y < h; y += bh) {
    const off = ((y / bh) % 2) * (bw / 2);
    for (let x = -bw; x < w + bw; x += bw) {
      const shade = 0.85 + Math.random() * 0.35;
      const r = Math.floor(150 * shade), g = Math.floor(122 * shade), b = Math.floor(112 * shade);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
    }
  }
  ctx.fillStyle = "rgba(255,180,120,0.06)";
  for (let i = 0; i < 400; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeAsphaltTexture() {
  const s = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#2c364e";
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 4000; i++) {
    const v = 52 + Math.random() * 40;
    ctx.fillStyle = `rgba(${v},${v + 4},${v + 14},0.6)`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 8);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* --------------------------- sky & stars ------------------------------- */
function buildSky() {
  const g = new THREE.Group();
  const skyGeo = new THREE.SphereGeometry(120, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vP;
      void main(){
        float h = normalize(vP).y;
        vec3 top = vec3(0.10,0.13,0.24);
        vec3 mid = vec3(0.16,0.20,0.34);
        vec3 horizon = vec3(0.35,0.24,0.28);
        vec3 col = mix(horizon, mid, smoothstep(-0.1,0.25,h));
        col = mix(col, top, smoothstep(0.2,0.9,h));
        col += vec3(0.5,0.2,0.07) * pow(max(0.0,1.0-abs(h)*2.0),3.0)*0.7;
        gl_FragColor = vec4(col,1.0);
      }`
  });
  g.add(new THREE.Mesh(skyGeo, skyMat));

  const n = 500;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 110;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.random() * Math.PI * 0.5;
    pos[i * 3] = r * Math.cos(th) * Math.cos(ph);
    pos[i * 3 + 1] = r * Math.sin(ph) + 5;
    pos[i * 3 + 2] = r * Math.sin(th) * Math.cos(ph);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: 0xbfd0ff,
      size: 0.7,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
    })
  );
  g.add(stars);
  g.userData.skyMat = skyMat;
  return g;
}

/* ------------------------- ground, road, building ---------------------- */
function buildEnvironment() {
  const g = new THREE.Group();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.MeshStandardMaterial({
      map: makeAsphaltTexture(),
      color: 0xffffff,
      roughness: 0.95,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  g.add(ground);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 6),
    new THREE.MeshStandardMaterial({ color: 0x20222b, roughness: 1 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, 11);
  g.add(road);
  for (let i = -3; i <= 3; i++) {
    const dash = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xf5d76b, emissive: 0x332a00, roughness: 1 })
    );
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(i * 3, 0.012, 11);
    g.add(dash);
  }

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(22.4, 0.4, 14.4),
    new THREE.MeshStandardMaterial({ color: 0x4a4e58, roughness: 0.9 })
  );
  slab.position.y = -0.2;
  g.add(slab);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 14),
    new THREE.MeshStandardMaterial({ color: 0x454a58, roughness: 0.6, metalness: 0.1 })
  );
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);

  const brick = makeBrickTexture();
  brick.repeat.set(4, 2);
  const wallMat = new THREE.MeshStandardMaterial({ map: brick, roughness: 0.95 });

  const farWall = new THREE.Mesh(new THREE.BoxGeometry(22.4, WALL_H, 0.5), wallMat);
  farWall.position.set(0, WALL_H / 2, -7.2);
  g.add(farWall);

  const sideMat = wallMat.clone();
  const lWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, WALL_H, 14.4), sideMat);
  lWall.position.set(-11.2, WALL_H / 2, 0);
  const rWall = lWall.clone();
  rWall.position.x = 11.2;
  g.add(lWall, rWall);

  const ledgeMat = new THREE.MeshStandardMaterial({ color: 0x1c1e26, roughness: 0.9 });
  for (const y of [STORY, STORY * 2]) {
    const fl = new THREE.Mesh(new THREE.BoxGeometry(22.6, 0.3, 0.7), ledgeMat);
    fl.position.set(0, y, -7.1);
    const ll = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 14.6), ledgeMat);
    ll.position.set(-11.1, y, 0);
    const rl = ll.clone();
    rl.position.x = 11.1;
    g.add(fl, ll, rl);
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(23, 0.6, 15), ledgeMat);
  roof.position.set(0, WALL_H + 0.3, 0);
  g.add(roof);
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(23, 0.7, 0.5), ledgeMat);
  parapet.position.set(0, WALL_H + 0.6, -7.2);
  g.add(parapet);

  return g;
}


/* ------------------------- windows (fire showpiece) -------------------- */
function buildWindows() {
  const g = new THREE.Group();
  const windows = [];
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.8 });
  const xs = [-9, -6, -3, 0, 3, 6, 9];
  const ys = [1.6, 4.8, 8.0];
  const zc = [-5, -2, 1, 4];

  function addWindow(x, y, z, ry) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 0.12), frameMat);
    frame.position.set(x, y, z);
    frame.rotation.y = ry;
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 1.75),
      new THREE.MeshStandardMaterial({
        color: 0x18243a,
        emissive: 0x000000,
        emissiveIntensity: 1,
        roughness: 0.35,
        metalness: 0.0,
      })
    );
    glass.position.set(x, y, z);
    glass.rotation.y = ry;
    // push glass slightly proud of frame
    glass.position.x += Math.sin(ry) * 0.07;
    glass.position.z += Math.cos(ry) * 0.07;
    g.add(frame, glass);
    windows.push({ glass, mat: glass.material, threshold: 0.08 + Math.random() * 0.86, on: false, ph: Math.random() * 6 });
  }

  for (const y of ys) for (const x of xs) addWindow(x, y, -6.95, 0);
  for (const y of ys) for (const z of zc) {
    addWindow(-10.95, y, z, Math.PI / 2);
    addWindow(10.95, y, z, -Math.PI / 2);
  }

  // a few interior lights on the ground-floor windows to warm the room
  const lights = [];
  for (const x of [-6, 6]) {
    const l = new THREE.PointLight(0xff7a2a, 0, 14, 2);
    l.position.set(x, 2.2, -5.5);
    g.add(l);
    lights.push({ l, ph: Math.random() * 6, base: 14 });
  }

  return { g, windows, lights };
}

/* --------------------------- FLAME (shader) ---------------------------- */
const FLAME_VERT = `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }`;
const FLAME_FRAG = `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSeed;
  varying vec2 vUv;
  float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
  float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    float a=hash(i),b=hash(i+vec2(1.,0.)),c=hash(i+vec2(0.,1.)),d=hash(i+vec2(1.,1.));
    return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
  float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.03+vec2(3.7,1.9); a*=0.5; } return v; }
  void main(){
    vec2 uv = vUv; // vUv.y = 0 at the fuel base, 1 at the tips (fire is a vertical plane)
    float t = uTime * 1.7 + uSeed;
    float base = 1.0 - uv.y;            // hottest at the base (bottom), cooling toward the tips

    // Two-stage domain warp -> organic, licking tongues (this is the realism).
    vec2 p = uv * vec2(2.7, 3.1);
    vec2 q = vec2(fbm(p - vec2(0.0, t)),
                  fbm(p + vec2(7.3, 2.1) - vec2(0.0, t*0.9)));
    vec2 r = vec2(fbm(p + 3.2*q + vec2(3.1, 9.4) - vec2(0.0, t*0.55)),
                  fbm(p + 3.2*q + vec2(8.6, 3.9) - vec2(0.0, t*0.7)));
    float f = fbm(p + 3.4*r);

    // Fire body: turbulence concentrated into a rising column of tongues.
    float fire = f * (0.30 + 1.35*base);
    fire *= smoothstep(0.24, 0.66, f);
    float cx = abs(uv.x - 0.5);
    fire *= smoothstep(0.5, 0.04, cx * (0.55 + uv.y*1.7));   // narrow the tips
    fire *= smoothstep(1.0, 0.30, uv.y + 0.4*(f - 0.5));      // wispy top

    // Temperature ramp: mostly orange/red, pale-yellow hot core (not blown-out white).
    float heat = clamp(fire, 0.0, 1.0);
    vec3 col = vec3(0.05, 0.0, 0.0);
    col = mix(col, vec3(0.50, 0.04, 0.0),  smoothstep(0.05, 0.30, heat));
    col = mix(col, vec3(1.0,  0.28, 0.02), smoothstep(0.28, 0.50, heat));
    col = mix(col, vec3(1.0,  0.62, 0.12), smoothstep(0.52, 0.74, heat));
    col = mix(col, vec3(1.0,  0.90, 0.55), smoothstep(0.76, 0.95, heat));
    col = mix(col, vec3(1.0,  0.98, 0.86), smoothstep(0.93, 1.0,  heat));

    float alpha = smoothstep(0.04, 0.42, fire) * uIntensity;
    float glow  = fire * (0.35 + 0.55*base) * uIntensity;
    gl_FragColor = vec4(col * (0.45 + 1.05*glow), alpha);
  }`;

function makeFlameMaterial(seed) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uSeed: { value: seed },
    },
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// A volumetric-looking flame: three crossed shader planes + flickering light.
class Fire {
  constructor(center, scale = 1) {
    this.group = new THREE.Group();
    this.group.position.copy(center);
    this.scale = scale;
    this.mats = [];
    const planeGeo = new THREE.PlaneGeometry(1.6, 2.2);
    for (let i = 0; i < 3; i++) {
      const m = makeFlameMaterial(Math.random() * 10);
      const p = new THREE.Mesh(planeGeo, m);
      p.position.y = 1.0;
      p.rotation.y = (i / 3) * Math.PI;
      p.scale.setScalar(scale);
      p.renderOrder = 5;
      this.group.add(p);
      this.mats.push(m);
    }
    this.light = new THREE.PointLight(0xff7a24, 0, 9, 2);
    this.light.position.set(0, 1.2, 0);
    this.group.add(this.light);
    this.intensity = 0;
  }
  update(dt, time, target) {
    this.intensity += (target - this.intensity) * Math.min(1, dt * 1.5);
    const fl = 0.82 + 0.18 * Math.sin(time * 21) * Math.sin(time * 7.3);
    for (const m of this.mats) {
      m.uniforms.uTime.value = time;
      m.uniforms.uIntensity.value = this.intensity * fl;
    }
    this.light.intensity = this.intensity * (22 * fl + Math.random() * 4);
  }
}


/* ------------------------------ SMOKE ---------------------------------- */
const SMOKE_VERT = `
  uniform float uTime;
  uniform float uGlobal;
  attribute float aSize;
  attribute float aSeed;
  attribute float aBorn;
  varying float vAlpha;
  void main(){
    float life = fract(uTime*0.09 + aSeed);
    vec3 p = position;
    p.y += life * (6.0 + aSeed*5.0);
    p.x += sin((uTime*0.5) + aSeed*10.0) * 0.7 * life;
    p.z += cos((uTime*0.4) + aSeed*8.0) * 0.7 * life;
    float appear = step(aBorn, uTime);
    vec4 mv = modelViewMatrix * vec4(p,1.0);
    gl_PointSize = aSize * (0.6 + life*2.8) * (300.0 / -mv.z);
    vAlpha = smoothstep(0.0,0.12,life) * (1.0 - smoothstep(0.5,1.0,life))
             * 0.55 * appear * uGlobal;
    gl_Position = projectionMatrix * mv;
  }`;
const SMOKE_FRAG = `
  varying float vAlpha;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.04, d);
    gl_FragColor = vec4(vec3(0.34,0.30,0.28), a * vAlpha);
  }`;

function buildSmoke() {
  const N = 140;
  const pos = new Float32Array(N * 3);
  const aSize = new Float32Array(N);
  const aSeed = new Float32Array(N);
  const aBorn = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // spread over the footprint, biased to the back where the fire is
    pos[i * 3] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 1] = 1 + Math.random() * 2;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 12 - 2;
    aSize[i] = 2.5 + Math.random() * 3.5;
    aSeed[i] = Math.random();
    aBorn[i] = Math.random() * 40;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
  geo.setAttribute("aBorn", new THREE.BufferAttribute(aBorn, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uGlobal: { value: 0 } },
    vertexShader: SMOKE_VERT,
    fragmentShader: SMOKE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 8;
  return { points, mat };
}

/* ------------------------------ EMBERS --------------------------------- */
function buildEmbers(spots) {
  const N = 110;
  const pos = new Float32Array(N * 3);
  const vel = [];
  const life = [];
  for (let i = 0; i < N; i++) {
    respawn(pos, vel, life, i, spots, true);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffb04a,
    size: 0.1,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 9;

  function update(dt, active) {
    for (let i = 0; i < N; i++) {
      life[i] += dt;
      if (life[i] > vel[i].max || !active) {
        respawn(pos, vel, life, i, spots, false);
        continue;
      }
      pos[i * 3] += vel[i].vx * dt;
      pos[i * 3 + 1] += vel[i].vy * dt;
      pos[i * 3 + 2] += vel[i].vz * dt;
      vel[i].vy += dt * 0.6;
    }
    geo.attributes.position.needsUpdate = true;
  }
  return { points, update };
}
function respawn(pos, vel, life, i, spots, init) {
  const s = spots[(Math.random() * spots.length) | 0];
  pos[i * 3] = s.x + (Math.random() - 0.5) * 1.2;
  pos[i * 3 + 1] = Math.random() * 0.5 + 0.2;
  pos[i * 3 + 2] = s.z + (Math.random() - 0.5) * 1.2;
  vel[i] = {
    vx: (Math.random() - 0.5) * 0.4,
    vy: 1.2 + Math.random() * 1.6,
    vz: (Math.random() - 0.5) * 0.4,
    max: 1.5 + Math.random() * 2,
  };
  life[i] = init ? Math.random() * 2 : 0;
}

/* --------------------------- FIRE TRUCK -------------------------------- */
function buildFireTruck() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xc1272d, roughness: 0.4, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x181b22, roughness: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd6e0, roughness: 0.25, metalness: 0.8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 4.4), red);
  body.position.y = 1.1;
  g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 1.4), red);
  cab.position.set(0, 1.5, 1.9);
  g.add(cab);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.7, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x24343f, roughness: 0.15, metalness: 0.5 })
  );
  glass.position.set(0, 1.72, 2.6);
  g.add(glass);

  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.42, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const sx of [-1, 1])
    for (const sz of [-1.4, 1.4]) {
      const w = new THREE.Mesh(wheelGeo, dark);
      w.position.set(sx * 1.05, 0.5, sz);
      g.add(w);
    }

  // ladder on the back
  for (const sx of [-0.4, 0.4]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.6), chrome);
    rail.position.set(sx, 1.95, -0.4);
    g.add(rail);
  }

  // flashing light bar
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.22, 0.42), dark);
  bar.position.set(0, 2.32, 1.9);
  g.add(bar);
  const beaconMatR = new THREE.MeshStandardMaterial({ color: 0xff2b2b, emissive: 0xff2b2b, emissiveIntensity: 2 });
  const beaconMatB = new THREE.MeshStandardMaterial({ color: 0x2b6bff, emissive: 0x2b6bff, emissiveIntensity: 2 });
  const beaconR = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), beaconMatR);
  beaconR.position.set(-0.5, 2.5, 1.9);
  const beaconB = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), beaconMatB);
  beaconB.position.set(0.5, 2.5, 1.9);
  g.add(beaconR, beaconB);

  g.position.set(-6, 0, 11.5);
  g.rotation.y = Math.PI;
  g.userData = { beaconR, beaconB, beaconMatR, beaconMatB };
  return g;
}


/* ---------------------------- EXIT / SAFE ZONE ------------------------- */
function buildExit() {
  const g = new THREE.Group();
  const safeMat = new THREE.MeshBasicMaterial({
    color: 0x38e1a0,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(EXIT.r, 40), safeMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(EXIT.x, 0.03, EXIT.z);
  g.add(disc);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(EXIT.r - 0.14, EXIT.r, 48),
    new THREE.MeshBasicMaterial({ color: 0x5fe0b0, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(EXIT.x, 0.04, EXIT.z);
  g.add(ring);

  // soft vertical light column
  const colMat = new THREE.MeshBasicMaterial({
    color: 0x38e1a0,
    transparent: true,
    opacity: 0.05,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const col = new THREE.Mesh(new THREE.CylinderGeometry(EXIT.r, EXIT.r, 6, 24, 1, true), colMat);
  col.position.set(EXIT.x, 3, EXIT.z);
  g.add(col);

  g.userData = { ring, col, disc, t: 0 };
  return g;
}

// Floor fire spots: where flames erupt on the stage as the fire spreads.
const SPOTS = [
  { x: -7, z: -4, at: 0.02, scale: 1.1 },
  { x: 6.5, z: -4.5, at: 0.28, scale: 1.0 },
  { x: -2.5, z: 1.5, at: 0.52, scale: 1.0 },
  { x: 8, z: 2, at: 0.7, scale: 0.9 },
  { x: 0, z: -5.5, at: 0.85, scale: 1.2 },
];


/* ----------------------------- ASSEMBLY -------------------------------- */
function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function createWorld(scene) {
  const world = new THREE.Group();
  scene.add(world);

  const sky = buildSky();
  world.add(sky);
  world.add(buildEnvironment());
  const win = buildWindows();
  world.add(win.g);

  const fires = SPOTS.map((s) => {
    const fire = new Fire(new THREE.Vector3(s.x, 0, s.z), s.scale);
    world.add(fire.group);
    return { ...s, fire };
  });

  const smoke = buildSmoke();
  world.add(smoke.points);
  const embers = buildEmbers(SPOTS);
  world.add(embers.points);

  const truck = buildFireTruck();
  world.add(truck);
  const exit = buildExit();
  world.add(exit);

  const fireColor = new THREE.Color(0xff6a1e);

  function update(dt, time, fireLevel) {
    for (const s of fires) {
      const target = smooth(s.at, s.at + 0.12, fireLevel);
      s.fire.update(dt, time, target);
    }

    smoke.mat.uniforms.uTime.value = time;
    smoke.mat.uniforms.uGlobal.value = 0.28 + fireLevel * 0.95;
    embers.update(dt, fireLevel > 0.03);

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

    // truck beacons
    const on = Math.sin(time * 9) > 0;
    truck.userData.beaconMatR.emissiveIntensity = on ? 3.2 : 0.2;
    truck.userData.beaconMatB.emissiveIntensity = on ? 0.2 : 3.2;

    // exit pulse
    const u = exit.userData;
    u.t += dt;
    const p = 1 + Math.sin(u.t * 3) * 0.06;
    u.ring.scale.setScalar(p);
    u.col.material.opacity = 0.1 + Math.sin(u.t * 2) * 0.04;
  }

  return { group: world, fires, smoke, embers, truck, exit, windows: win.windows, windowLights: win.lights, update };
}
