// world/sky.js â€” the night sky: gradient dome, stars, glowing moon,
// drifting clouds and the distant city skyline.
import * as THREE from "three";
/* --------------------------- sky & stars ------------------------------- */
export function buildSky() {
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

/* ------------------------ moon, clouds, skyline ------------------------ */
function makeGlowTexture(inner, outer) {
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(cv);
}

export function buildMoon() {
  const g = new THREE.Group();
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff3d6 })
  );
  moon.position.set(-48, 36, -72);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture("rgba(255,244,214,0.5)", "rgba(255,244,214,0)"),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  halo.scale.setScalar(24);
  halo.position.copy(moon.position);
  g.add(moon, halo);
  return g;
}

export function buildClouds() {
  const tex = makeGlowTexture("rgba(196,205,228,0.55)", "rgba(196,205,228,0)");
  const g = new THREE.Group();
  const clouds = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.42, depthWrite: false })
    );
    s.position.set((Math.random() - 0.5) * 170, 15 + Math.random() * 16, -60 - Math.random() * 40);
    s.scale.set(15 + Math.random() * 20, 5 + Math.random() * 5, 1);
    s.userData.v = 0.25 + Math.random() * 0.45;
    g.add(s);
    clouds.push(s);
  }
  function update(dt) {
    for (const c of clouds) {
      c.position.x += c.userData.v * dt;
      if (c.position.x > 95) c.position.x = -95;
    }
  }
  return { g, update };
}

function makeSkylineTexture() {
  const w = 64, h = 128;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#1d2438";
  ctx.fillRect(0, 0, w, h);
  for (let y = 6; y < h - 4; y += 10) {
    for (let x = 6; x < w - 6; x += 10) {
      if (Math.random() < 0.26) {
        ctx.fillStyle = Math.random() < 0.8 ? "rgba(255,214,140,0.9)" : "rgba(180,220,255,0.8)";
        ctx.fillRect(x, y, 5, 6);
      }
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Distant city silhouette ring with lit windows (unlit basic material =
// cheap, and it reads perfectly against the night sky).
export function buildSkyline() {
  const g = new THREE.Group();
  const tex = makeSkylineTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.25;
    const r = 55 + Math.random() * 30;
    const w = 6 + Math.random() * 9;
    const h = 8 + Math.random() * 20;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    b.position.set(Math.cos(a) * r, h / 2 - 0.05, Math.sin(a) * r);
    b.rotation.y = -a;
    g.add(b);
  }
  return g;
}