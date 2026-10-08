import * as THREE from 'three';
import { CelestialBody } from './CelestialBody.js';

export class StarSystem {
  constructor(scene, systemData, glslNoise, terminatorVertexLogic, terminatorLightMath) {
    this.scene = scene;
    this.systemData = systemData;
    this.bodies = [];
    this.orbits = new Map();
    
    // Light from the central star
    this.sunLight = new THREE.PointLight(0xffffff, 2.5, 800);
    this.scene.add(this.sunLight);

    // Create celestial bodies
    systemData.forEach(config => {
        const body = new CelestialBody(config, glslNoise, terminatorVertexLogic, terminatorLightMath);
        this.bodies.push(body);
        this.scene.add(body.meshGroup);
        
        if (config.id !== 'sun') {
            this.orbits.set(config.id, this.createOrbit(config.dist));
        }
    });
  }

  createOrbit(distance) {
    if (distance === 0) return;
    const geo = new THREE.RingGeometry(distance - 0.1, distance + 0.1, 128);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.05 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    this.scene.add(mesh);
    return mesh;
  }

  getInteractables() {
    return this.bodies.map(b => b.mesh);
  }

  getPlanetsData() {
    return this.systemData.map((data, index) => ({
      ...data,
      bodyRef: this.bodies[index]
    }));
  }

  update(time, delta, activePlanetId, ORBIT_MULTIPLIER, ROTATION_MULTIPLIER, MOON_MULTIPLIER) {
    this.bodies.forEach(body => {
        const isFocused = (activePlanetId === body.id);
        body.update(time, delta, isFocused, ORBIT_MULTIPLIER, ROTATION_MULTIPLIER, MOON_MULTIPLIER);
    });
  }
}
