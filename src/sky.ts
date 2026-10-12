import * as THREE from 'three';

const DAY = new THREE.Color('#8ec8f2');
const NIGHT = new THREE.Color('#070b1a');
const DUSK = new THREE.Color('#f0905e');
const WATER_FOG = new THREE.Color('#1d4f8a');

/** Day/night cycle: sky colour, fog, celestial bodies and a global light factor. */
export class Sky {
  readonly group = new THREE.Group();
  readonly color = new THREE.Color();
  light = 1;
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private stars: THREE.Points;

  constructor(scene: THREE.Scene) {
    const sunMat = new THREE.MeshBasicMaterial({ color: '#fff3b0', fog: false });
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), sunMat);
    const moonMat = new THREE.MeshBasicMaterial({ color: '#dfe6f2', fog: false });
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), moonMat);
    const starGeo = new THREE.BufferGeometry();
    const pts: number[] = [];
    let s = 1234567;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 700; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pts.push(r * Math.cos(th) * 380, Math.abs(u) * 380, r * Math.sin(th) * 380);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
    for (const o of [this.sun, this.moon, this.stars]) { o.renderOrder = -1; (o.material as THREE.Material).depthWrite = false; this.group.add(o); }
    scene.add(this.group);
  }

  /** t in [0,1): 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight. */
  update(t: number, camera: THREE.Camera, scene: THREE.Scene, fogNear: number, fogFar: number, underwater: boolean) {
    const a = t * Math.PI * 2;
    const elev = Math.sin(a);
    const day = THREE.MathUtils.smoothstep(elev, -0.18, 0.22);
    this.light = 0.17 + 0.83 * day;
    this.color.copy(NIGHT).lerp(DAY, day);
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.25) * 0.55;
    this.color.lerp(DUSK, dusk);

    this.group.position.copy(camera.position);
    const dist = 300;
    this.sun.position.set(Math.cos(a) * dist, Math.sin(a) * dist, 40);
    this.sun.lookAt(camera.position);
    this.moon.position.set(-Math.cos(a) * dist, -Math.sin(a) * dist, -40);
    this.moon.lookAt(camera.position);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - day * 1.6);
    this.stars.rotation.z = a;

    const bg = underwater ? WATER_FOG.clone().multiplyScalar(0.4 + 0.6 * this.light) : this.color;
    scene.background = bg;
    const fog = scene.fog as THREE.Fog;
    fog.color.copy(bg);
    fog.near = underwater ? 1 : fogNear;
    fog.far = underwater ? 24 : fogFar;
  }
}
