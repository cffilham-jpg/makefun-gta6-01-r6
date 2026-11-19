// Solmar Bay — cars: the arcade vehicle model, the traffic that fills the
// roads, and the parked cars waiting to be stolen. Seven civilian types plus
// the SBPD interceptor, each with its own speed, grip and paint.

import * as THREE from 'three';
import { VEHICLE_TYPES, WORLD } from './config.js';
import { clamp, makeRng, pick, range, turnToward, wrapAngle } from './utils.js';

const TRAFFIC_COLORS = [0x3f6fb5, 0xc23b3b, 0xd8d8d8, 0x4a7a3a, 0xe8b400, 0x7a4a9a, 0x222226, 0xe8641e, 0x8a8f96];

export class Vehicle {
  constructor(scene, type, x, z, heading, colorOverride) {
    this.scene = scene;
    this.type = type;
    this.spec = VEHICLE_TYPES[type];
    this.position = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steerVisual = 0;
    this.health = 100;
    this.wrecked = false;
    this.driver = null; // 'player' | 'traffic' | 'police' | null (parked)
    this.stolen = false;
    this.flashTimer = 0;
    this.group = this.buildMesh(colorOverride ?? this.spec.body);
    this.group.position.copy(this.position);
    this.group.rotation.y = heading;
    scene.add(this.group);
  }

  buildMesh(color) {
    const g = new THREE.Group();
    const s = this.spec;
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2a34 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1c });

    const body = new THREE.Mesh(new THREE.BoxGeometry(s.wid, 0.75, s.len), bodyMat);
    body.position.y = 0.62;
    body.castShadow = true;
    g.add(body);

    if (this.type === 'pickup') {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(s.wid * 0.92, 0.7, s.len * 0.4), glassMat);
      cab.position.set(0, 1.3, -s.len * 0.18);
      cab.castShadow = true;
      g.add(cab);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(s.wid * 0.9, 0.4, s.len * 0.42), bodyMat);
      bed.position.set(0, 1.05, s.len * 0.24);
      g.add(bed);
    } else if (this.type === 'van') {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(s.wid * 0.94, 1.1, s.len * 0.72), bodyMat);
      cab.position.set(0, 1.5, 0.2);
      cab.castShadow = true;
      g.add(cab);
      const shield = new THREE.Mesh(new THREE.BoxGeometry(s.wid * 0.86, 0.7, 0.1), glassMat);
      shield.position.set(0, 1.45, -s.len * 0.32);
      g.add(shield);
    } else {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(s.wid * 0.86, 0.62, s.len * 0.5), glassMat);
      cab.position.set(0, 1.28, s.len * 0.05);
      cab.castShadow = true;
      g.add(cab);
    }

    // Wheels.
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    this.wheels = [];
    const wx = s.wid / 2 - 0.05;
    const wz = s.len / 2 - 0.7;
    for (const [px, pz] of [[-wx, -wz], [wx, -wz], [-wx, wz], [wx, wz]]) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.position.set(px, 0.36, pz);
      w.castShadow = true;
      g.add(w);
      this.wheels.push(w);
    }

    // Headlights and taillights.
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    const lightGeo = new THREE.BoxGeometry(0.42, 0.18, 0.08);
    for (const px of [-s.wid / 2 + 0.3, s.wid / 2 - 0.3]) {
      const h = new THREE.Mesh(lightGeo, headMat);
      h.position.set(px, 0.62, -s.len / 2 - 0.02);
      g.add(h);
      const t = new THREE.Mesh(lightGeo, tailMat);
      t.position.set(px, 0.62, s.len / 2 + 0.02);
      g.add(t);
    }

    if (this.type === 'taxi') {
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.22, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
      );
      sign.position.set(0, 1.72, 0);
      g.add(sign);
    }

    if (this.type === 'police') {
      const barMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.3), barMat);
      bar.position.set(0, 1.66, 0);
      g.add(bar);
      this.lightRed = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.16, 0.32),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }),
      );
      this.lightRed.position.set(-0.32, 1.78, 0);
      g.add(this.lightRed);
      this.lightBlue = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.16, 0.32),
        new THREE.MeshBasicMaterial({ color: 0x2266ff }),
      );
      this.lightBlue.position.set(0.32, 1.78, 0);
      g.add(this.lightBlue);
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(s.wid + 0.02, 0.3, s.len * 0.9),
        new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
      );
      stripe.position.y = 0.62;
      g.add(stripe);
    }
    return g;
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  /** Arcade drive step. ctrl: {throttle -1..1, steer -1..1, handbrake}. */
  drive(dt, ctrl, city, onCrash) {
    if (this.wrecked) {
      this.speed = 0;
      return;
    }
    const s = this.spec;
    const forward = ctrl.throttle;
    if (forward > 0) this.speed += s.accel * forward * dt;
    else if (forward < 0) {
      if (this.speed > 0.5) this.speed += s.brake * forward * dt; // braking
      else this.speed = Math.max(-s.topSpeed * 0.35, this.speed + s.accel * 0.6 * forward * dt); // reversing
    }
    // Drag and rolling resistance.
    this.speed -= this.speed * (ctrl.handbrake ? 1.4 : 0.35) * dt;
    if (Math.abs(this.speed) < 0.05 && forward === 0) this.speed = 0;
    this.speed = clamp(this.speed, -s.topSpeed * 0.4, s.topSpeed);

    // Steering: sharper at low speed, looser at high speed; handbrake slides.
    const speedFactor = clamp(Math.abs(this.speed) / s.topSpeed, 0, 1);
    const turnRate = s.grip * (1.25 - speedFactor * 0.75) * (ctrl.handbrake ? 1.6 : 1);
    this.heading += ctrl.steer * turnRate * dt * Math.sign(this.speed || 1) * clamp(Math.abs(this.speed) / 4, 0, 1);
    this.steerVisual = ctrl.steer;

    const dx = -Math.sin(this.heading) * this.speed * dt;
    const dz = -Math.cos(this.heading) * this.speed * dt;
    let nx = this.position.x + dx;
    let nz = this.position.z + dz;

    // World bounds and the water line.
    nx = clamp(nx, -WORLD.halfSize + 4, WORLD.halfSize - 4);
    nz = clamp(nz, -WORLD.halfSize + 4, WORLD.waterLine - 5);

    const hit = city.collideCircle(nx, nz, 1.9);
    if (hit.hit && Math.abs(this.speed) > 3) {
      const impact = Math.abs(this.speed);
      this.damage(impact * 1.4);
      this.speed *= -0.25;
      if (onCrash) onCrash(impact);
    }
    this.position.x = hit.x;
    this.position.z = hit.z;

    // Wheels spin and front wheels yaw.
    const spin = (this.speed * dt) / 0.36;
    for (let i = 0; i < this.wheels.length; i++) {
      this.wheels[i].rotation.x += spin;
      if (i < 2) this.wheels[i].rotation.y = this.steerVisual * 0.4;
    }
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;

    if (this.type === 'police') {
      this.flashTimer += dt;
      const on = Math.floor(this.flashTimer * 4) % 2 === 0;
      this.lightRed.visible = on;
      this.lightBlue.visible = !on;
    }
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.wrecked) {
      this.wrecked = true;
      this.speed = 0;
      this.group.children.forEach((c) => {
        if (c.material && c.material.color) c.material.color.multiplyScalar(0.45);
      });
    }
  }

  /** Steering input that drives this car toward a point (police pursuit). */
  steerToward(tx, tz) {
    const want = Math.atan2(-(tx - this.position.x), -(tz - this.position.z));
    const d = wrapAngle(want - this.heading);
    return clamp(d * 2.2, -1, 1);
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

export class Traffic {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(777);
    this.cars = []; // moving traffic, each {vehicle, axis, dir, lane, target}
    this.parked = []; // parked vehicles waiting to be stolen
    this.spawnTraffic(14);
    this.spawnParked(16);
  }

  spawnTraffic(count) {
    const types = ['sedan', 'coupe', 'taxi', 'pickup', 'van', 'sports', 'muscle'];
    for (let i = 0; i < count; i++) {
      const p = this.city.randomRoadPoint(this.rng);
      const axis = this.rng() < 0.5 ? 'x' : 'z';
      const dir = this.rng() < 0.5 ? 1 : -1;
      const lane = (this.rng() < 0.5 ? -1 : 1) * 3.5;
      const type = pick(this.rng, types);
      const heading = axis === 'x' ? (dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (dir > 0 ? Math.PI : 0);
      const v = new Vehicle(this.scene, type, p.x, p.z, heading, pick(this.rng, TRAFFIC_COLORS));
      v.driver = 'traffic';
      this.cars.push({
        vehicle: v, axis, dir, lane,
        cruise: range(this.rng, 9, 14),
        turnCooldown: 0,
      });
    }
  }

  spawnParked(count) {
    const types = ['sedan', 'coupe', 'taxi', 'pickup', 'van', 'sports', 'muscle'];
    const spots = [...this.city.parkSpots];
    // Fisher-Yates shuffle of the spots.
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    for (let i = 0; i < Math.min(count, spots.length); i++) {
      const s = spots[i];
      const type = pick(this.rng, types);
      const v = new Vehicle(this.scene, type, s.x, s.z, s.heading, pick(this.rng, TRAFFIC_COLORS));
      v.driver = null;
      this.parked.push(v);
    }
    // One guaranteed sports car near the garage for mission 2.
    const gt = new Vehicle(this.scene, 'sports', 56, 150, Math.PI / 2, 0xe8641e);
    gt.driver = null;
    gt.missionCar = true;
    this.parked.push(gt);
  }

  allVehicles() {
    return [...this.cars.map((c) => c.vehicle), ...this.parked];
  }

  /** Nearest vehicle (parked or traffic) to a point, within range. */
  nearestTo(x, z, range_) {
    let best = null;
    let bestD = range_;
    for (const v of this.allVehicles()) {
      if (v.wrecked || v.driver === 'player') continue;
      const d = Math.hypot(v.position.x - x, v.position.z - z);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  /** Remove a car from traffic duty (stolen by the player) and keep its Vehicle. */
  claim(vehicle) {
    const i = this.cars.findIndex((c) => c.vehicle === vehicle);
    if (i >= 0) this.cars.splice(i, 1);
    const j = this.parked.indexOf(vehicle);
    if (j >= 0) this.parked.splice(j, 1);
    vehicle.driver = 'player';
  }

  /** A car the player left behind becomes parked again. */
  release(vehicle) {
    vehicle.driver = null;
    if (!this.parked.includes(vehicle)) this.parked.push(vehicle);
  }

  update(dt, playerPos, onCrash) {
    const others = this.allVehicles();
    for (const c of this.cars) {
      const v = c.vehicle;
      if (v.wrecked) continue;
      c.turnCooldown -= dt;
      // At an intersection, sometimes turn onto the crossing road.
      const onX = Math.abs(v.position.x % WORLD.roadEvery) < 2 || Math.abs(v.position.x % WORLD.roadEvery) > WORLD.roadEvery - 2;
      const onZ = Math.abs(v.position.z % WORLD.roadEvery) < 2 || Math.abs(v.position.z % WORLD.roadEvery) > WORLD.roadEvery - 2;
      if (c.turnCooldown <= 0 && onX && onZ && this.rng() < 0.35) {
        c.axis = c.axis === 'x' ? 'z' : 'x';
        c.dir = this.rng() < 0.5 ? 1 : -1;
        c.lane = (this.rng() < 0.5 ? -1 : 1) * 3.5;
        c.turnCooldown = 4;
      }
      // Target point: far ahead along the current road, on our lane.
      let tx;
      let tz;
      if (c.axis === 'x') {
        tx = v.position.x + c.dir * 40;
        tz = Math.round(v.position.z / WORLD.roadEvery) * WORLD.roadEvery + c.lane * (c.dir > 0 ? 1 : -1);
      } else {
        tx = Math.round(v.position.x / WORLD.roadEvery) * WORLD.roadEvery + c.lane * (c.dir > 0 ? -1 : 1);
        tz = v.position.z + c.dir * 40;
      }
      // Slow down for the car ahead.
      let throttle = 0.55;
      for (const o of others) {
        if (o === v || o.wrecked) continue;
        const dx = o.position.x - v.position.x;
        const dz = o.position.z - v.position.z;
        const ahead = -Math.sin(v.heading) * dx + -Math.cos(v.heading) * dz;
        const side = Math.abs(Math.cos(v.heading) * dx - Math.sin(v.heading) * dz);
        if (ahead > 0 && ahead < 11 && side < 2.4) {
          throttle = -0.6;
          break;
        }
      }
      if (v.speed > c.cruise) throttle = Math.min(throttle, 0);
      const steer = v.steerToward(tx, tz);
      v.drive(dt, { throttle, steer, handbrake: false }, this.city, null);
      // Turn around at the map edge.
      if (Math.abs(v.position.x) > WORLD.halfSize - 12 || Math.abs(v.position.z) > WORLD.halfSize - 12 || v.position.z > WORLD.waterLine - 14) {
        c.dir *= -1;
        c.turnCooldown = 3;
      }
    }
    // Car-to-car bumps.
    const all = this.allVehicles();
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        if (a.wrecked && b.wrecked) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.4 && d > 0.001) {
          const push = (3.4 - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          a.position.x -= nx * push;
          a.position.z -= nz * push;
          b.position.x += nx * push;
          b.position.z += nz * push;
          const impact = Math.abs(a.speed - b.speed);
          if (impact > 4) {
            a.damage(impact);
            b.damage(impact);
            a.speed *= 0.5;
            b.speed *= 0.5;
            if ((a.driver === 'player' || b.driver === 'player') && onCrash) onCrash(impact);
          }
          a.group.position.copy(a.position);
          b.group.position.copy(b.position);
        }
      }
    }
    // Respawn traffic that drifted far from the player, so the streets stay busy.
    for (const c of this.cars) {
      const d = Math.hypot(c.vehicle.position.x - playerPos.x, c.vehicle.position.z - playerPos.z);
      if (d > 260) {
        const p = this.city.randomRoadPoint(this.rng);
        // Only respawn reasonably close to the player.
        if (Math.hypot(p.x - playerPos.x, p.z - playerPos.z) < 200) {
          c.vehicle.position.set(p.x, 0, p.z);
          c.vehicle.group.position.copy(c.vehicle.position);
        }
      }
    }
  }
}
