// Solmar Bay — the SBPD: the wanted level, pursuit interceptors that ram
// the player's car, and officers on foot who open fire at three stars and
// up. Stars fall when Ray stays out of sight; the garage clears them at once.

import * as THREE from 'three';
import { POLICE_TUNING, WORLD } from './config.js';
import { clamp, makeRng, range } from './utils.js';
import { Vehicle } from './vehicles.js';

export class Police {
  constructor(scene, city, audio) {
    this.scene = scene;
    this.city = city;
    this.audio = audio;
    this.rng = makeRng(90210);
    this.stars = 0;
    this.cars = []; // {vehicle, stuck}
    this.officers = []; // {group, pos, heading, shootTimer, health, armL, armR}
    this.unseenTimer = 0;
    this.starFallTimer = 0;
    this.bustTimer = 0;
    this.spawnCooldown = 0;
  }

  addStars(n) {
    const before = this.stars;
    this.stars = clamp(this.stars + n, 0, POLICE_TUNING.maxStars);
    if (this.stars > before) {
      this.audio.wantedUp();
      return true;
    }
    return false;
  }

  setStars(n) {
    this.stars = clamp(n, 0, POLICE_TUNING.maxStars);
  }

  clearStars() {
    this.stars = 0;
    this.unseenTimer = 0;
    this.starFallTimer = 0;
    this.bustTimer = 0;
  }

  get active() {
    return this.stars > 0;
  }

  get nearestCarDistance() {
    return 0;
  }

  spawnCarNear(playerPos) {
    const angle = this.rng() * Math.PI * 2;
    // Spawn outside the 55-unit "seen" radius so a fast driver who keeps
    // moving can actually break contact and lose the heat.
    const dist = range(this.rng, 70, 110);
    let x = clamp(playerPos.x + Math.cos(angle) * dist, -WORLD.halfSize + 8, WORLD.halfSize - 8);
    let z = clamp(playerPos.z + Math.sin(angle) * dist, -WORLD.halfSize + 8, WORLD.waterLine - 12);
    // Snap onto the nearest road so the interceptor starts on asphalt.
    x = Math.round(x / WORLD.roadEvery) * WORLD.roadEvery;
    const spot = this.city.collideCircle(x, z, 2);
    const v = new Vehicle(this.scene, 'police', spot.x, spot.z, this.rng() * Math.PI * 2);
    v.driver = 'police';
    this.cars.push({ vehicle: v, stuck: 0 });
  }

  spawnOfficerNear(playerPos) {
    const angle = this.rng() * Math.PI * 2;
    const dist = range(this.rng, 14, 26);
    const x = clamp(playerPos.x + Math.cos(angle) * dist, -WORLD.halfSize + 4, WORLD.halfSize - 4);
    const z = clamp(playerPos.z + Math.sin(angle) * dist, -WORLD.halfSize + 4, WORLD.waterLine - 6);
    const g = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x1c2f4a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd8a06a });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.82, 0.28), navy);
    legs.position.y = 0.41;
    g.add(legs);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.34), navy);
    torso.position.y = 1.18;
    torso.castShadow = true;
    g.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.36), new THREE.MeshLambertMaterial({ color: 0x0e1a2a }));
    vest.position.y = 1.2;
    g.add(vest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skin);
    head.position.y = 1.74;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), navy);
    cap.position.y = 1.96;
    g.add(cap);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.3, 1.25, 0.3);
    g.add(gun);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.officers.push({
      group: g, pos: new THREE.Vector3(x, 0, z), heading: 0,
      shootTimer: range(this.rng, 0.5, 1.5), health: 100, walkPhase: 0,
    });
  }

  removeCar(i) {
    this.cars[i].vehicle.dispose();
    this.cars.splice(i, 1);
  }

  removeOfficer(i) {
    this.scene.remove(this.officers[i].group);
    this.officers.splice(i, 1);
  }

  /** Every shootable police unit, for the combat raycast. */
  shootables() {
    const out = [];
    for (const o of this.officers) {
      out.push({ kind: 'officer', ref: o, pos: o.pos, radius: 0.9, height: 1.9 });
    }
    for (const c of this.cars) {
      out.push({ kind: 'policeCar', ref: c.vehicle, pos: c.vehicle.position, radius: 2.2, height: 1.6 });
    }
    return out;
  }

  sirenNear(playerPos) {
    for (const c of this.cars) {
      if (Math.hypot(c.vehicle.position.x - playerPos.x, c.vehicle.position.z - playerPos.z) < POLICE_TUNING.sirenRange) return true;
    }
    return false;
  }

  update(dt, player, ctx) {
    this.spawnCooldown -= dt;
    const wantCars = POLICE_TUNING.carsPerStar[this.stars];
    const wantOfficers = POLICE_TUNING.footCopsPerStar[this.stars];

    // Spawn or retire pursuit cars to match the wanted level.
    if (this.cars.length < wantCars && this.spawnCooldown <= 0 && this.stars > 0) {
      this.spawnCarNear(player.position);
      this.spawnCooldown = 0.8;
    }
    while (this.cars.length > wantCars) this.removeCar(this.cars.length - 1);
    while (this.officers.length > wantOfficers) this.removeOfficer(this.officers.length - 1);
    if (this.officers.length < wantOfficers && this.spawnCooldown <= 0 && this.stars > 0) {
      this.spawnOfficerNear(player.position);
      this.spawnCooldown = 1.2;
    }

    // Pursuit driving: full throttle toward Ray, ramming speed.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      const v = c.vehicle;
      if (v.wrecked) {
        // A wrecked interceptor is abandoned after a few seconds.
        c.stuck += dt;
        if (c.stuck > 6) this.removeCar(i);
        continue;
      }
      const steer = v.steerToward(player.position.x, player.position.z);
      const dist = Math.hypot(v.position.x - player.position.x, v.position.z - player.position.z);
      // Ease off right next to Ray on foot so the car can stop beside him.
      const throttle = !player.inCar && dist < 8 ? 0.25 : 1;
      v.drive(dt, { throttle, steer, handbrake: false }, this.city, null);
      if (Math.abs(v.speed) < 0.6) c.stuck += dt;
      else c.stuck = 0;
      if (c.stuck > 4) {
        // Stuck against a wall: teleport back into the chase.
        this.removeCar(i);
        this.spawnCarNear(player.position);
        continue;
      }
      // Ram the player's car: push apart and trade damage.
      if (player.inCar && player.vehicle) {
        const pv = player.vehicle;
        const dx = pv.position.x - v.position.x;
        const dz = pv.position.z - v.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.6 && d > 0.001) {
          const push = (3.6 - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          v.position.x -= nx * push;
          v.position.z -= nz * push;
          pv.position.x += nx * push;
          pv.position.z += nz * push;
          const impact = Math.abs(v.speed - pv.speed);
          if (impact > 5) {
            v.damage(impact * 0.8);
            pv.damage(impact * 0.8);
            v.speed *= 0.6;
            pv.speed *= 0.6;
            if (ctx.onCrash) ctx.onCrash(impact);
          }
          v.group.position.copy(v.position);
          pv.group.position.copy(pv.position);
        }
      }
    }

    // Officers on foot: run at Ray and shoot inside 26 units.
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i];
      if (o.health <= 0) {
        this.removeOfficer(i);
        continue;
      }
      const dx = player.position.x - o.pos.x;
      const dz = player.position.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let diff = want - o.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      o.heading += clamp(diff, -4 * dt, 4 * dt);
      if (d > 14) {
        const nx = o.pos.x + Math.sin(o.heading) * 6.5 * dt;
        const nz = o.pos.z + Math.cos(o.heading) * 6.5 * dt;
        const hit = this.city.collideCircle(nx, nz, 0.5);
        o.pos.x = hit.x;
        o.pos.z = hit.z;
        o.walkPhase += dt * 9;
        o.group.position.y = Math.abs(Math.sin(o.walkPhase)) * 0.06;
      }
      o.group.position.x = o.pos.x;
      o.group.position.z = o.pos.z;
      o.group.rotation.y = o.heading;
      o.shootTimer -= dt;
      if (d < 26 && o.shootTimer <= 0) {
        o.shootTimer = range(this.rng, 0.7, 1.4);
        this.audio.gunshot(false);
        // Cops miss more at range and against a moving car.
        const hitChance = clamp(0.55 - d * 0.012 - (player.inCar ? 0.2 : 0), 0.08, 0.55);
        if (this.rng() < hitChance && ctx.damagePlayer) {
          ctx.damagePlayer(range(this.rng, 6, 12));
        }
        if (ctx.onShotFired) ctx.onShotFired(o.pos);
      }
    }

    if (this.stars === 0) return;

    // Seen? Any unit within 55 units counts, unless Ray is inside the garage.
    const inGarage = Math.hypot(player.position.x - 30, player.position.z - 90) < 16;
    let seen = false;
    if (!inGarage) {
      for (const c of this.cars) {
        if (Math.hypot(c.vehicle.position.x - player.position.x, c.vehicle.position.z - player.position.z) < 55) { seen = true; break; }
      }
      if (!seen) {
        for (const o of this.officers) {
          if (Math.hypot(o.pos.x - player.position.x, o.pos.z - player.position.z) < 55) { seen = true; break; }
        }
      }
    }
    if (seen) {
      this.unseenTimer = 0;
      this.starFallTimer = 0;
    } else {
      this.unseenTimer += dt;
      if (this.unseenTimer > POLICE_TUNING.loseSightSeconds) {
        this.starFallTimer += dt;
        if (this.starFallTimer > POLICE_TUNING.starFallSeconds) {
          this.starFallTimer = 0;
          this.stars -= 1;
          if (ctx.onStarFall) ctx.onStarFall(this.stars);
        }
      }
    }
    if (inGarage && this.stars > 0) {
      this.clearStars();
      if (ctx.onCleared) ctx.onCleared();
    }

    // Busted: on foot, slow, a cop right next to Ray for a few seconds.
    if (!player.inCar) {
      let close = false;
      for (const c of this.cars) {
        if (Math.hypot(c.vehicle.position.x - player.position.x, c.vehicle.position.z - player.position.z) < POLICE_TUNING.bustRange) { close = true; break; }
      }
      if (!close) {
        for (const o of this.officers) {
          if (Math.hypot(o.pos.x - player.position.x, o.pos.z - player.position.z) < POLICE_TUNING.bustRange) { close = true; break; }
        }
      }
      if (close && !player.moving) {
        this.bustTimer += dt;
        if (this.bustTimer > POLICE_TUNING.bustSeconds && ctx.onBusted) ctx.onBusted();
      } else {
        this.bustTimer = 0;
      }
    } else {
      this.bustTimer = 0;
    }
  }
}
