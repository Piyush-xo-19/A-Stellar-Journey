import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlanetDevourer } from '../src/entities/PlanetDevourer.js';
import { CelestialBody } from '../src/entities/CelestialBody.js';
import { solarSystemData } from '../src/data/solarSystem.js';
import { DevourerInput } from '../src/engine/DevourerInput.js';

function setup() {
  const scene = new THREE.Scene();
  const bodies = solarSystemData.map(config => {
    const meshGroup = new THREE.Group();
    meshGroup.position.set(config.dist, 0, 0);
    scene.add(meshGroup);
    return { id: config.id, name: config.name, radius: config.r, meshGroup };
  });
  const orbits = new Map(bodies.slice(1).map(body => [body.id, new THREE.Object3D()]));
  const system = { bodies, orbits };
  return { scene, system, devourer: new PlanetDevourer(scene, system) };
}

function advanceUntil(devourer, predicate) {
  for (let i = 0; i < 6000 && !predicate(); i++) devourer.update(1 / 60);
  assert.ok(predicate(), 'The feeding sequence should reach the expected phase');
}

function bite(devourer, body) {
  devourer.group.position.copy(body.meshGroup.position).add(new THREE.Vector3(0, 0, body.radius + 9));
  devourer.setMovement(0, 0);
  assert.equal(devourer.eat(), true);
}

test('player can eat every world in any order and win without eating the Sun', () => {
  const { system, devourer } = setup();
  const eaten = [];
  devourer.onConsume = body => eaten.push(body.id);
  devourer.start();
  const route = [...devourer.prey].reverse();
  for (const body of route) {
    bite(devourer, body);
    assert.equal(devourer.eat(), false, 'A second bite cannot interrupt swallowing');
    advanceUntil(devourer, () => ['playing', 'complete'].includes(devourer.state));
  }
  assert.equal(devourer.state, 'complete');
  assert.deepEqual(eaten, route.map(body => body.id));
  assert.equal(devourer.eaten, 9);
  assert.equal(system.bodies[0].meshGroup.visible, true);
  assert.ok(system.bodies.slice(1).every(body => body.isConsumed && !body.meshGroup.visible));
  assert.ok([...system.orbits.values()].every(orbit => !orbit.visible));
  for (let i = 0; i < 120; i++) devourer.update(1 / 60);
  assert.equal(eaten.length, 9, 'Completion does not restart or consume the Sun');
});

test('pause freezes a partially swallowed world and resume finishes only that bite', () => {
  const { devourer } = setup();
  devourer.start();
  bite(devourer, devourer.prey[0]);
  devourer.update(0.8);
  const body = devourer.target;
  assert.ok(body.meshGroup.scale.x < 1 && body.meshGroup.scale.x > 0);
  const position = body.meshGroup.position.clone();
  const scale = body.meshGroup.scale.clone();
  const elapsed = devourer.elapsed;
  devourer.togglePause();
  devourer.update(10);
  assert.equal(devourer.elapsed, elapsed);
  assert.ok(body.meshGroup.position.equals(position));
  assert.ok(body.meshGroup.scale.equals(scale));
  devourer.togglePause();
  advanceUntil(devourer, () => devourer.state === 'playing');
  devourer.update(100);
  assert.equal(devourer.eaten, 1, 'Other worlds require another explicit bite');
});

test('restores original transforms and visibility during swallowing, then supports replay', () => {
  const { system, devourer } = setup();
  system.bodies[1].meshGroup.scale.set(1.2, 1.3, 1.4);
  system.orbits.get('neptune').visible = false;
  const original = system.bodies.slice(1).map(body => ({
    position: body.meshGroup.position.clone(), scale: body.meshGroup.scale.clone(),
  }));
  devourer.start();
  for (const body of devourer.prey.slice(0, 2)) {
    bite(devourer, body);
    advanceUntil(devourer, () => devourer.state === 'playing');
  }
  bite(devourer, devourer.prey[2]);
  devourer.update(1);
  devourer.togglePause();
  devourer.restore();
  assert.equal(devourer.state, 'idle');
  assert.equal(devourer.paused, false);
  assert.equal(devourer.group.visible, false);
  assert.equal(devourer.particles.visible, false);
  system.bodies.slice(1).forEach((body, index) => {
    assert.ok(body.meshGroup.position.equals(original[index].position));
    assert.ok(body.meshGroup.scale.equals(original[index].scale));
    assert.equal(body.meshGroup.visible, true);
    assert.equal(body.isConsumed, false);
    assert.equal(body.isBeingConsumed, false);
  });
  assert.equal(system.orbits.get('neptune').visible, false);
  assert.equal(system.orbits.get('mercury').visible, true);
  devourer.start();
  bite(devourer, devourer.prey[0]);
  advanceUntil(devourer, () => devourer.state === 'playing');
  devourer.start();
  assert.equal(devourer.target.id, 'mercury');
  assert.equal(devourer.eaten, 0);
  assert.ok(system.bodies.slice(1).every(body => body.meshGroup.visible));
});

test('movement is frame-rate independent, diagonals are normalized, and eating needs proximity', () => {
  const { devourer } = setup();
  devourer.start();
  const initial = devourer.group.position.clone();
  devourer.update(100);
  assert.ok(devourer.group.position.equals(initial), 'The monster never hunts automatically');
  assert.equal(devourer.eat(), false, 'A distant planet cannot be eaten');
  devourer.setMovement(0, -1);
  for (let i = 0; i < 60; i++) devourer.update(1 / 60);
  assert.ok(Math.abs(initial.distanceTo(devourer.group.position) - 24) < 1e-8);
  const second = setup().devourer;
  second.start();
  const diagonalStart = second.group.position.clone();
  second.setMovement(1, -1);
  for (let i = 0; i < 30; i++) second.update(1 / 30);
  assert.ok(Math.abs(diagonalStart.distanceTo(second.group.position) - 24) < 1e-8);
  second.togglePause();
  const paused = second.group.position.clone();
  second.update(1);
  assert.ok(second.group.position.equals(paused));
  second.togglePause();
  second.setMovement(1, 0);
  second.update(100);
  assert.ok(second.group.position.length() <= 210.000001, 'Player stays within the arena');
});

test('WASD and Enter map to gameplay, repeated Enter is ignored, and focus loss clears movement', () => {
  const { devourer } = setup();
  const events = new EventTarget();
  const doc = new EventTarget();
  new DevourerInput(devourer, events, doc);
  const key = (type, code, repeat = false) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, repeat });
    events.dispatchEvent(event);
    return event;
  };
  devourer.start();
  assert.equal(key('keydown', 'KeyW').defaultPrevented, true);
  devourer.update(0.25);
  key('keyup', 'KeyW');
  assert.equal(devourer.movement.length(), 0);
  key('keydown', 'Enter', true);
  assert.equal(devourer.state, 'playing');
  key('keydown', 'Enter');
  assert.equal(devourer.state, 'swallow');
  events.dispatchEvent(new Event('blur'));
  assert.equal(devourer.paused, true);
  assert.equal(devourer.movement.length(), 0);
  devourer.restore();
  assert.equal(key('keydown', 'KeyD').defaultPrevented, false);
});

test('celestial updates preserve the transform owned by the devourer', () => {
  const body = new CelestialBody({ id: 'mercury', name: 'Mercury', r: 0.3, dist: 18, orbit: 1, color: 0x999999 }, '', '', '');
  body.meshGroup.position.set(4, 5, 6);
  body.isBeingConsumed = true;
  body.update(100, 1 / 60, false, 4000, 12, 10);
  assert.deepEqual(body.meshGroup.position.toArray(), [4, 5, 6]);
  body.isBeingConsumed = false;
  body.isConsumed = true;
  body.update(100, 1 / 60, false, 4000, 12, 10);
  assert.deepEqual(body.meshGroup.position.toArray(), [4, 5, 6]);
  body.isConsumed = false;
  body.update(100, 1 / 60, false, 4000, 12, 10);
  assert.notDeepEqual(body.meshGroup.position.toArray(), [4, 5, 6]);
});

test('camera frames are finite and widen for portrait screens', () => {
  const { devourer } = setup();
  devourer.start();
  const wide = devourer.getCameraFrame(1.8);
  const portrait = devourer.getCameraFrame(0.5);
  assert.ok([...wide.position.toArray(), ...portrait.look.toArray()].every(Number.isFinite));
  assert.ok(portrait.position.distanceTo(portrait.look) > wide.position.distanceTo(wide.look));
});
