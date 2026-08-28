// world/fire.js â€” the volumetric flame shader + Fire class, and the safe
// exit zone.
import * as THREE from "three";
import { EXIT, PERF } from "../config.js";

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
  float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<${PERF.flameOctaves};i++){ v+=a*noise(p); p=p*2.03+vec2(3.7,1.9); a*=0.5; } return v; }
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
export class Fire {
  constructor(center, scale = 1) {
    this.group = new THREE.Group();
    this.group.position.copy(center);
    this.scale = scale;
    this.mats = [];
    // Crossed shader planes: 3 on desktop, 2 on mobile (fragment budget).
    const planes = PERF.flamePlanes;
    const planeGeo = new THREE.PlaneGeometry(1.6, 2.2);
    for (let i = 0; i < planes; i++) {
      const m = makeFlameMaterial(Math.random() * 10);
      const p = new THREE.Mesh(planeGeo, m);
      p.position.y = 1.0;
      p.rotation.y = (i / planes) * Math.PI;
      p.scale.setScalar(scale);
      p.renderOrder = 5;
      this.group.add(p);
      this.mats.push(m);
    }
    this.light = new THREE.PointLight(0xff7a24, 0, 9, 2);
    this.light.position.set(0, 1.2, 0);
    this.group.add(this.light);
    this.lightMul = 1; // scorch fires dim their light (point-light budget)
    this.intensity = 0;
  }
  update(dt, time, target) {
    this.intensity += (target - this.intensity) * Math.min(1, dt * 1.5);
    const fl = 0.82 + 0.18 * Math.sin(time * 21) * Math.sin(time * 7.3);
    for (const m of this.mats) {
      m.uniforms.uTime.value = time;
      m.uniforms.uIntensity.value = this.intensity * fl;
    }
    this.light.intensity = this.intensity * (22 * fl + Math.random() * 4) * this.lightMul;
  }
}


/* ---------------------------- EXIT / SAFE ZONE ------------------------- */
export function buildExit() {
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
  disc.position.set(EXIT.x, 0.05, EXIT.z);
  g.add(disc);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(EXIT.r - 0.18, EXIT.r, 48),
    new THREE.MeshBasicMaterial({
      color: 0x6ff0c0,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(EXIT.x, 0.06, EXIT.z);
  g.add(ring);

  // NOTE: no vertical light column — the safe zone is a pulsing ring on the
  // ground only.
  g.userData = { ring, disc, t: 0 };
  return g;
}
