// Solmar Bay — the people on the sidewalks: walkers with simple wander AI
// who stroll between corners, flee from gunfire and police chases, and fall
// down (then get back up) when a car clips them.

import * as THREE from 'three';
import { WORLD } from './config.js';
import { clamp, makeRng, pick, range } from './utils.js';

const SHIRT_COLORS = [0xc23b3b, 0x3f6fb5, 0x4a7a3a, 0xe8b400, 0x7a4a9a, 0xe8641e, 0xd8d8d8, 0x2f8f6f];
const PANTS_COLORS = [0x222226, 0x3a4a5a, 0x5a4a3a, 0x6a6a72];
const SKIN_COLORS = [0xf2c89a, 0xd8a06a, 0xa06a42, 0x8a5a34, 0xe8b88a];

export class Pedestrian {
  constructor(scene, x, z, rng) {
    this.scene = scene;
    this.position = new THREE.Vector3(x, 0, z);
    this.heading = rng() * Math.PI * 2;
    this.speed = range(rng, 1.1, 1.9);
    this.target = null;
    this.state = 'walk'; // walk | flee | down
    this.stateTimer = 0;
    this.health = 100;
    this.walkPhase = rng() * Math.PI * 2;
    this.group = this.buildMesh(rng);
    this.group.position.copy(this.position);
    scene.add(this.group);
  }

  buildMesh(rng) {
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, SHIRT_COLORS) });
    const pants = new THREE.MeshLambertMaterial({ color: pick(rng, PANTS_COLORS) });
    const skin = new THREE.MeshLambertMaterial({ color: pick(rng, SKIN_COLORS) });

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.26), pants);
    legs.position.y = 0.4;
    g.add(legs);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), shirt);
    torso.position.y = 1.15;
    torso.castShadow = true;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), skin);
    head.position.y = 1.7;
    head.castShadow = true;
    g.add(head);
    const armGeo = new THREE.BoxGeometry(0.13, 0.62, 0.13);
    this.armL = new THREE.Mesh(armGeo, shirt);
    this.armL.position.set(-0.36, 1.18, 0);
    g.add(this.armL);
    this.armR = new THREE.Mesh(armGeo, shirt);
    this.armR.position.set(0.36, 1.18, 0);
    g.add(this.armR);
    return g;
  }

  pickTarget(walkSpots, rng) {
    this.target = pick(rng, walkSpots);
  }

  fleeFrom(x, z) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.stateTimer = range(Math.random, 2.5, 4.5);
    const dx = this.position.x - x;
    const dz = this.position.z - z;
    const d = Math.hypot(dx, dz) || 1;
    this.target = {
      x: clamp(this.position.x + (dx / d) * 30, -WORLD.halfSize + 6, WORLD.halfSize - 6),
      z: clamp(this.position.z + (dz / d) * 30, -WORLD.halfSize + 6, WORLD.waterLine - 8),
    };
  }

  knockDown() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.stateTimer = 4;
    this.health = Math.max(0, this.health - 60);
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = 0.3;
  }

  update(dt, city, walkSpots, rng) {
    if (this.state === 'down') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = 'walk';
        this.group.rotation.x = 0;
        this.group.position.y = 0;
        this.pickTarget(walkSpots, rng);
      }
      return;
    }
    if (!this.target) this.pickTarget(walkSpots, rng);
    const dx = this.target.x - this.position.x;
    const dz = this.target.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 2) {
      this.pickTarget(walkSpots, rng);
      return;
    }
    const want = Math.atan2(dx, dz);
    let diff = want - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += clamp(diff, -2.4 * dt, 2.4 * dt);
    const speed = this.state === 'flee' ? this.speed * 2.6 : this.speed;
    const nx = this.position.x + Math.sin(this.heading) * speed * dt;
    const nz = this.position.z + Math.cos(this.heading) * speed * dt;
    const hit = city.collideCircle(nx, nz, 0.5);
    this.position.x = hit.x;
    this.position.z = hit.z;
    if (hit.hit) this.pickTarget(walkSpots, rng);
    this.walkPhase += dt * speed * 3.2;
    const swing = Math.sin(this.walkPhase) * 0.5;
    this.armL.rotation.x = swing;
    this.armR.rotation.x = -swing;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
    if (this.state === 'flee') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = 'walk';
        this.pickTarget(walkSpots, rng);
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

export class Pedestrians {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(4242);
    this.list = [];
    for (let i = 0; i < 26; i++) {
      const s = pick(this.rng, city.walkSpots);
      this.list.push(new Pedestrian(scene, s.x + range(this.rng, -6, 6), s.z + range(this.rng, -6, 6), this.rng));
    }
  }

  update(dt, playerPos) {
    for (const p of this.list) {
      // Peds near the player keep walking; far ones teleport closer so the
      // streets around the player always feel alive.
      const d = Math.hypot(p.position.x - playerPos.x, p.position.z - playerPos.z);
      if (d > 240) {
        const s = pick(this.rng, this.city.walkSpots);
        if (Math.hypot(s.x - playerPos.x, s.z - playerPos.z) < 160) {
          p.position.set(s.x, 0, s.z);
          p.pickTarget(this.city.walkSpots, this.rng);
        }
      }
      p.update(dt, this.city, this.city.walkSpots, this.rng);
    }
  }

  /** Everyone within range runs away from a point (gunfire, sirens). */
  scareAll(x, z, radius) {
    for (const p of this.list) {
      if (Math.hypot(p.position.x - x, p.position.z - z) < radius) p.fleeFrom(x, z);
    }
  }

  /** Check a car against every ped: returns the peds it just hit. */
  checkCarHits(carPos, radius) {
    const hit = [];
    for (const p of this.list) {
      if (p.state === 'down') continue;
      if (Math.hypot(p.position.x - carPos.x, p.position.z - carPos.z) < radius) {
        p.knockDown();
        hit.push(p);
      }
    }
    return hit;
  }
}
