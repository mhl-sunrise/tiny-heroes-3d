// world/truck.js â€” the fire truck parked at the curb with flashing beacons.
import * as THREE from "three";
/* --------------------------- FIRE TRUCK -------------------------------- */
export function buildFireTruck() {
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


