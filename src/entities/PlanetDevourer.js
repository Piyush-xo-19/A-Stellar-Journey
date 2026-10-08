import * as THREE from 'three';

const SWALLOW_SECONDS = 2.8;
const DIGEST_SECONDS = 1.2;
const MOVE_SPEED = 24;
const EAT_REACH = 10;
const ARENA_RADIUS = 210;

/** Player movement and eating rules, independent of browser input and UI. */
export class PlanetDevourer {
  constructor(scene, starSystem) {
    this.starSystem = starSystem;
    this.prey = starSystem.bodies.filter(body => body.id !== 'sun' && !body.isStar);
    this.group = new THREE.Group();
    this.group.name = 'Cosmic Devourer';
    this.group.visible = false;
    scene.add(this.group);
    this.state = 'idle';
    this.paused = false;
    this.eaten = 0;
    this.elapsed = 0;
    this.animationTime = 0;
    this.onChange = null;
    this.onConsume = null;
    this.savedBodies = new Map();
    this.movement = new THREE.Vector3();
    this.selectedTarget = null;
    this.lastStatus = '';
    this.preyStart = new THREE.Vector3();
    this.destination = new THREE.Vector3();
    this.mouthPosition = new THREE.Vector3();
    this.lookHelper = new THREE.Object3D();
    this.createCreature();
    this.createParticles(scene);
  }

  get active() {
    return this.state !== 'idle';
  }

  get target() {
    return this.selectedTarget;
  }

  get distanceToEat() {
    return this.target ? Math.max(0, this.group.position.distanceTo(this.target.meshGroup.position)
      - this.target.radius - EAT_REACH) : Infinity;
  }

  get canEat() {
    return this.state === 'playing' && !this.paused && this.target !== null && this.distanceToEat === 0;
  }

  setMovement(x, z) {
    this.movement.set(x, 0, z).clampLength(0, 1);
  }

  findNearestPlanet() {
    this.selectedTarget = this.prey.filter(body => !body.isConsumed).reduce((nearest, body) => {
      const distance = this.group.position.distanceTo(body.meshGroup.position) - body.radius;
      return !nearest || distance < this.group.position.distanceTo(nearest.meshGroup.position) - nearest.radius
        ? body : nearest;
    }, null);
  }

  eat() {
    if (this.state !== 'playing' || this.paused) return false;
    this.findNearestPlanet();
    if (!this.canEat) return false;
    this.state = 'swallow';
    this.elapsed = 0;
    this.target.isBeingConsumed = true;
    this.preyStart.copy(this.target.meshGroup.position);
    this.creatureScale = Math.max(this.creatureScale, this.target.radius / 1.7);
    this.group.scale.setScalar(this.creatureScale);
    // Turn toward the chosen world only after the player requests a bite.
    this.lookHelper.position.copy(this.group.position);
    this.lookHelper.lookAt(this.preyStart);
    this.group.quaternion.copy(this.lookHelper.quaternion);
    this.group.updateMatrixWorld(true);
    this.mouthPosition.set(0, 0, 1.6).applyMatrix4(this.group.matrixWorld);
    this.particles.visible = true;
    this.notify();
    return true;
  }

  createCreature() {
    const skin = new THREE.MeshStandardMaterial({
      color: 0x281b46, emissive: 0x33134f, emissiveIntensity: 0.45,
      metalness: 0.35, roughness: 0.42, side: THREE.DoubleSide,
    });
    const glow = new THREE.MeshBasicMaterial({ color: 0xbb77ff });
    const teeth = new THREE.MeshStandardMaterial({
      color: 0xe4faff, emissive: 0x538caa, emissiveIntensity: 0.5, roughness: 0.3,
    });
    const back = new THREE.Mesh(new THREE.SphereGeometry(3.1, 40, 24), skin);
    back.scale.set(1, 0.95, 0.85);
    back.position.z = -1.6;
    this.group.add(back);

    this.upperJaw = new THREE.Group();
    this.lowerJaw = new THREE.Group();
    this.group.add(this.upperJaw, this.lowerJaw);
    for (const [jaw, thetaStart] of [[this.upperJaw, 0], [this.lowerJaw, Math.PI / 2]]) {
      jaw.add(new THREE.Mesh(new THREE.SphereGeometry(3.2, 48, 24, 0, Math.PI * 2, thetaStart, Math.PI / 2), skin));
      const upper = jaw === this.upperJaw;
      for (let i = 0; i < 9; i++) {
        const angle = (i + 0.5) / 9 * Math.PI + (upper ? 0 : Math.PI);
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.85, 8), teeth);
        tooth.position.set(Math.cos(angle) * 2.55, Math.sin(angle) * 2.1, 1.8);
        tooth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(-Math.cos(angle), -Math.sin(angle), 0).normalize());
        jaw.add(tooth);
      }
    }

    const throat = new THREE.Mesh(new THREE.SphereGeometry(2.5, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x080310 }));
    throat.scale.set(1, 1, 0.3);
    throat.position.z = 0.5;
    this.group.add(throat);
    this.throatRing = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 8, 48), glow);
    this.throatRing.position.z = 1.3;
    this.group.add(this.throatRing);

    for (const side of [-1, 1]) {
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.72, 24, 16), skin);
      socket.position.set(side * 1.48, 1.65, 2.15);
      this.upperJaw.add(socket);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.43, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0x8affde }));
      eye.position.copy(socket.position).add(new THREE.Vector3(0, 0.05, 0.5));
      eye.scale.set(1, 0.65, 0.6);
      this.upperJaw.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0x05121b }));
      pupil.position.copy(eye.position).add(new THREE.Vector3(0, 0, 0.23));
      pupil.scale.set(0.4, 1.2, 0.5);
      this.upperJaw.add(pupil);
    }

    this.tentacles = [];
    const segmentGeo = new THREE.CylinderGeometry(0.28, 0.36, 1.6, 8);
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * Math.PI * 2;
      const root = new THREE.Group();
      root.position.set(Math.cos(angle) * 2.1, Math.sin(angle) * 2.1, -2.8);
      this.group.add(root);
      const segments = [];
      let parent = root;
      for (let j = 0; j < 6; j++) {
        const pivot = new THREE.Group();
        pivot.position.z = j === 0 ? 0 : -1.45;
        const segment = new THREE.Mesh(segmentGeo, j === 5 ? glow : skin);
        segment.rotation.x = Math.PI / 2;
        segment.position.z = -0.72;
        segment.scale.setScalar(1 - j * 0.12);
        pivot.add(segment);
        parent.add(pivot);
        segments.push(pivot);
        parent = pivot;
      }
      this.tentacles.push(segments);
    }
  }

  createParticles(scene) {
    this.particlePositions = new Float32Array(180 * 3);
    this.particleSeeds = Array.from({ length: 180 }, (_, i) => ({
      angle: i * 2.399963, radius: 0.3 + (i % 17) / 17, offset: i / 180,
    }));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.particles = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0xa7ffe6, size: 0.12, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.particles.visible = false;
    // The particle stream moves across the system; its initial bounds are stale.
    this.particles.frustumCulled = false;
    scene.add(this.particles);
  }

  notify() {
    this.onChange?.({ state: this.state, paused: this.paused,
      eaten: this.eaten, total: this.prey.length, target: this.target?.name,
      canEat: this.canEat, distance: Math.ceil(this.distanceToEat) });
  }

  start() {
    this.restore(false);
    if (!this.prey.length) return;
    for (const body of this.prey) {
      this.savedBodies.set(body.id, {
        position: body.meshGroup.position.clone(), scale: body.meshGroup.scale.clone(),
        visible: body.meshGroup.visible,
        orbitVisible: this.starSystem.orbits.get(body.id)?.visible,
      });
    }
    this.group.visible = true;
    this.group.position.copy(this.prey[0].meshGroup.position).add(new THREE.Vector3(0, 0, 16));
    this.group.rotation.set(0, Math.PI, 0);
    this.creatureScale = 1.3;
    this.group.scale.setScalar(this.creatureScale);
    this.state = 'playing';
    this.findNearestPlanet();
    this.notify();
  }

  togglePause() {
    if (!this.active || this.state === 'complete') return;
    this.paused = !this.paused;
    this.setMovement(0, 0);
    this.onResetInput?.();
    this.notify();
  }

  restore(emit = true) {
    for (const body of this.prey) {
      const saved = this.savedBodies.get(body.id);
      if (!saved) continue;
      body.meshGroup.position.copy(saved.position);
      body.meshGroup.scale.copy(saved.scale);
      body.meshGroup.visible = saved.visible;
      body.isBeingConsumed = false;
      body.isConsumed = false;
      const orbit = this.starSystem.orbits.get(body.id);
      if (orbit) orbit.visible = saved.orbitVisible;
    }
    this.savedBodies.clear();
    this.state = 'idle';
    this.paused = false;
    this.eaten = 0;
    this.elapsed = 0;
    this.selectedTarget = null;
    this.setMovement(0, 0);
    this.lastStatus = '';
    this.onResetInput?.();
    this.group.visible = false;
    this.particles.visible = false;
    if (emit) this.notify();
  }

  update(delta) {
    if (!this.active || this.paused) return;
    this.animationTime += delta;
    this.elapsed += delta;
    const time = this.animationTime;
    this.tentacles.forEach((segments, i) => segments.forEach((pivot, j) => {
      pivot.rotation.x = Math.sin(time * 2.5 - j * 0.6 + i) * 0.16;
      pivot.rotation.y = Math.cos(time * 2 - j * 0.5 + i) * 0.2;
    }));
    this.throatRing.rotation.z = time;
    this.throatRing.scale.setScalar(1 + Math.sin(time * 5) * 0.08);

    if (this.state === 'playing') {
      this.group.position.addScaledVector(this.movement, MOVE_SPEED * delta);
      this.group.position.clampLength(0, ARENA_RADIUS);
      if (this.movement.lengthSq() > 0) {
        this.destination.copy(this.group.position).add(this.movement);
        this.lookHelper.position.copy(this.group.position);
        this.lookHelper.lookAt(this.destination);
        this.group.quaternion.slerp(this.lookHelper.quaternion, 1 - Math.exp(-delta * 12));
      }
      this.findNearestPlanet();
      this.upperJaw.rotation.x = -0.12;
      this.lowerJaw.rotation.x = 0.12;
      const status = `${this.target?.id}:${Math.ceil(this.distanceToEat)}:${this.canEat}`;
      if (status !== this.lastStatus) {
        this.lastStatus = status;
        this.notify();
      }
    } else if (this.state === 'swallow') {
      const progress = Math.min(1, this.elapsed / SWALLOW_SECONDS);
      const pulled = progress * progress;
      const body = this.target;
      body.meshGroup.position.lerpVectors(this.preyStart, this.mouthPosition, pulled);
      body.meshGroup.scale.copy(this.savedBodies.get(body.id).scale).multiplyScalar(Math.max(0.001, 1 - pulled));
      const jawOpen = 0.67 * (1 - Math.pow(progress, 4));
      this.upperJaw.rotation.x = -jawOpen;
      this.lowerJaw.rotation.x = jawOpen;
      this.updateParticles(progress, body.radius);
      if (progress === 1) {
        body.meshGroup.visible = false;
        body.isConsumed = true;
        body.isBeingConsumed = false;
        const orbit = this.starSystem.orbits.get(body.id);
        if (orbit) orbit.visible = false;
        this.onConsume?.(body);
        this.eaten++;
        this.state = 'digest';
        this.elapsed = 0;
        this.particles.visible = false;
        this.notify();
      }
    } else if (this.state === 'digest') {
      const chew = Math.sin(this.elapsed * 12) * 0.09;
      this.upperJaw.rotation.x = -Math.abs(chew);
      this.lowerJaw.rotation.x = Math.abs(chew);
      if (this.elapsed >= DIGEST_SECONDS) {
        this.state = this.eaten === this.prey.length ? 'complete' : 'playing';
        this.elapsed = 0;
        this.findNearestPlanet();
        this.notify();
      }
    } else if (this.state === 'complete') {
      this.upperJaw.rotation.x = -0.1;
      this.lowerJaw.rotation.x = 0.1;
    }
  }

  updateParticles(progress, radius) {
    this.particles.material.opacity = Math.sin(progress * Math.PI) * 0.9;
    this.particles.material.size = Math.max(0.06, radius * 0.09);
    for (let i = 0; i < this.particleSeeds.length; i++) {
      const seed = this.particleSeeds[i];
      const flow = (progress * 1.6 + seed.offset) % 1;
      const spread = (1 - flow) * radius * seed.radius;
      const angle = seed.angle + progress * 10;
      const idx = i * 3;
      this.particlePositions[idx] = THREE.MathUtils.lerp(this.preyStart.x, this.mouthPosition.x, flow) + Math.cos(angle) * spread;
      this.particlePositions[idx + 1] = THREE.MathUtils.lerp(this.preyStart.y, this.mouthPosition.y, flow) + Math.sin(angle) * spread;
      this.particlePositions[idx + 2] = THREE.MathUtils.lerp(this.preyStart.z, this.mouthPosition.z, flow);
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  getCameraFrame(aspect = 1) {
    // Fixed compass orientation keeps WASD consistent even as the creature turns.
    const distance = Math.max(32, this.creatureScale * 17) * Math.max(1, 1 / aspect);
    const offset = new THREE.Vector3(0, distance, distance * 0.8);
    const look = this.group.position.clone();
    return { position: look.clone().add(offset), look };
  }
}
