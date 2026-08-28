// world/smoke.js â€” the GPU-driven smoke column and the rising embers.
import * as THREE from "three";
/* ------------------------------ SMOKE ---------------------------------- */
const SMOKE_VERT = `
  uniform float uTime;
  uniform float uGlobal;
  uniform float uRise;
  attribute float aSize;
  attribute float aSeed;
  attribute float aBorn;
  varying float vAlpha;
  void main(){
    float life = fract(uTime*0.09 + aSeed);
    vec3 p = position;
    p.y += life * uRise;
    p.x += sin((uTime*0.5) + aSeed*10.0) * 0.7 * life;
    p.z += cos((uTime*0.4) + aSeed*8.0) * 0.7 * life;
    float appear = step(aBorn, uTime);
    vec4 mv = modelViewMatrix * vec4(p,1.0);
    gl_PointSize = aSize * (0.6 + life*2.8) * (300.0 / -mv.z);
    vAlpha = smoothstep(0.0,0.12,life) * (1.0 - smoothstep(0.5,1.0,life))
             * 0.40 * appear * uGlobal;
    gl_Position = projectionMatrix * mv;
  }`;
const SMOKE_FRAG = `
  varying float vAlpha;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.04, d);
    gl_FragColor = vec4(vec3(0.34,0.30,0.28), a * vAlpha);
  }`;

export function buildSmoke() {
  const N = 140;
  const pos = new Float32Array(N * 3);
  const aSize = new Float32Array(N);
  const aSeed = new Float32Array(N);
  const aBorn = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // spread over the footprint, biased to the back where the fire is
    pos[i * 3] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 1] = 1.5 + Math.random() * 2.5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 12 - 2;
    aSize[i] = 2.0 + Math.random() * 3.0;
    aSeed[i] = Math.random();
    aBorn[i] = Math.random() * 40;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
  geo.setAttribute("aBorn", new THREE.BufferAttribute(aBorn, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uGlobal: { value: 0 }, uRise: { value: 8.0 } },
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
export function buildEmbers(spots, yOff = 0) {
  const N = 110;
  const pos = new Float32Array(N * 3);
  const vel = [];
  const life = [];
  for (let i = 0; i < N; i++) {
    respawn(pos, vel, life, i, spots, true, yOff);
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
        respawn(pos, vel, life, i, spots, false, yOff);
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
function respawn(pos, vel, life, i, spots, init, yOff) {
  const s = spots[(Math.random() * spots.length) | 0];
  pos[i * 3] = s.x + (Math.random() - 0.5) * 1.2;
  pos[i * 3 + 1] = yOff + Math.random() * 0.5 + 0.2;
  pos[i * 3 + 2] = s.z + (Math.random() - 0.5) * 1.2;
  vel[i] = {
    vx: (Math.random() - 0.5) * 0.4,
    vy: 1.2 + Math.random() * 1.6,
    vz: (Math.random() - 0.5) * 0.4,
    max: 1.5 + Math.random() * 2,
  };
  life[i] = init ? Math.random() * 2 : 0;
}

