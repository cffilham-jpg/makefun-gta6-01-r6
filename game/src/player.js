// Solmar Bay — Ray Delgado on foot and behind the wheel: third-person
// movement, jumping, the follow camera, stealing and exiting cars, health
// and armor. Driving itself lives in vehicles.js; this module decides which
// car Ray is in and what the camera does.

import * as THREE from 'three';
import { PLAYER_TUNING, WORLD } from './config.js';
import { clamp, turnToward, wrapAngle } from './utils.js';

export class Player {
  constructor(scene, camera, city, input) {
    this.scene = scene;
    this.camera = camera;
    this.city = city;
    this.input = input;
    this.position = new THREE.Vector3(30, 0, 150);
    this.heading = Math.PI;
    this.vy = 0;
    this.onGround = true;
    this.health = PLAYER_TUNING.maxHealth;
    this.armor = 0;
    this.vehicle = null;
    this.camYaw = Math.PI;
    this.camPitch = 0.42;
    this.camDist = 7.5;
    this.walkPhase = 0;
    this.moving = false;
    this.group = this.buildMesh();
    this.group.position.copy(this.position);
    scene.add(this.group);
  }

  buildMesh() {
    const g = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0xc23b3b });
    const jeans = new THREE.MeshLambertMaterial({ color: 0x2f3a4a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd8a06a });
    const cap = new THREE.MeshLambertMaterial({ color: 0x1c2f4a });

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.82, 0.28), jeans);
    legs.position.y = 0.41;
    g.add(legs);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.34), jacket);
    torso.position.y = 1.18;
    torso.castShadow = true;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skin);
    head.position.y = 1.74;
    head.castShadow = true;
    g.add(head);
    const hat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), cap);
    hat.position.y = 1.96;
    g.add(hat);
    const armGeo = new THREE.BoxGeometry(0.14, 0.64, 0.14);
    this.armL = new THREE.Mesh(armGeo, jacket);
    this.armL.position.set(-0.38, 1.2, 0);
    g.add(this.armL);
    this.armR = new THREE.Mesh(armGeo, jacket);
    this.armR.position.set(0.38, 1.2, 0);
    g.add(this.armR);
    return g;
  }

  get inCar() {
    return this.vehicle !== null;
  }

  get speedKmh() {
    return this.vehicle ? this.vehicle.speedKmh : 0;
  }

  /** Damage goes to armor first, then health. Returns true when Ray dies. */
  damage(amount) {
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount);
      this.armor -= absorbed;
      amount -= absorbed;
    }
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }

  heal(amount) {
    this.health = Math.min(PLAYER_TUNING.maxHealth, this.health + amount);
  }

  addArmor(amount) {
    this.armor = Math.min(PLAYER_TUNING.maxArmor, this.armor + amount);
  }

  respawn(x, z) {
    this.position.set(x, 0, z);
    this.vy = 0;
    this.health = PLAYER_TUNING.maxHealth;
    this.armor = 0;
    this.vehicle = null;
    this.group.visible = true;
    this.group.position.copy(this.position);
  }

  enterCar(vehicle) {
    this.vehicle = vehicle;
    this.group.visible = false;
    this.position.copy(vehicle.position);
  }

  /** Step out of the car to its left side; returns the vehicle left behind. */
  exitCar() {
    const v = this.vehicle;
    if (!v) return null;
    this.vehicle = null;
    const sideX = Math.cos(v.heading);
    const sideZ = -Math.sin(v.heading);
    const spot = this.city.collideCircle(
      v.position.x + sideX * 2.6,
      v.position.z + sideZ * 2.6,
      0.5,
    );
    this.position.set(spot.x, 0, spot.z);
    this.heading = v.heading;
    this.camYaw = v.heading;
    this.group.visible = true;
    this.group.position.copy(this.position);
    return v;
  }

  update(dt, ctx) {
    const input = this.input;
    // Mouse steers the camera whenever the pointer is locked.
    if (input.locked) {
      this.camYaw -= input.mouseDX * 0.0026;
      this.camPitch = clamp(this.camPitch + input.mouseDY * 0.0022, 0.12, 1.1);
    }

    if (this.vehicle) {
      this.updateDriving(dt, ctx);
    } else {
      this.updateOnFoot(dt, ctx);
    }
    this.updateCamera(dt);
  }

  updateOnFoot(dt, ctx) {
    const input = this.input;
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = run ? PLAYER_TUNING.runSpeed : PLAYER_TUNING.walkSpeed;
    let mx = 0;
    let mz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) mz -= 1;
    if (input.down('KeyS') || input.down('ArrowDown')) mz += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
    this.moving = mx !== 0 || mz !== 0;

    if (this.moving) {
      // Movement is relative to the camera yaw. Camera forward on the ground
      // is f = (-sin, -cos) and camera right is r = (cos, -sin).
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      const wx = sin * mz + cos * mx;
      const wz = cos * mz - sin * mx;
      const len = Math.hypot(wx, wz) || 1;
      const wantHeading = Math.atan2(wx / len, wz / len);
      this.heading = turnToward(this.heading, wantHeading, 10 * dt);
      const step = speed * dt;
      const nx = this.position.x + (wx / len) * step;
      const nz = this.position.z + (wz / len) * step;
      const hit = this.city.collideCircle(nx, nz, 0.5);
      this.position.x = clamp(hit.x, -WORLD.halfSize + 2, WORLD.halfSize - 2);
      this.position.z = clamp(hit.z, -WORLD.halfSize + 2, WORLD.waterLine - 3);
      this.walkPhase += dt * speed * 1.6;
      const swing = Math.sin(this.walkPhase) * 0.55;
      this.armL.rotation.x = swing;
      this.armR.rotation.x = -swing;
    } else {
      this.armL.rotation.x *= 0.8;
      this.armR.rotation.x *= 0.8;
    }

    // Jump and gravity.
    if (input.wasPressed('Space') && this.onGround) {
      this.vy = PLAYER_TUNING.jumpSpeed;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.vy -= PLAYER_TUNING.gravity * dt;
      this.position.y += this.vy * dt;
      if (this.position.y <= 0) {
        this.position.y = 0;
        this.vy = 0;
        this.onGround = true;
      }
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
  }

  updateDriving(dt, ctx) {
    const input = this.input;
    const v = this.vehicle;
    let throttle = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) throttle += 1;
    if (input.down('KeyS') || input.down('ArrowDown')) throttle -= 1;
    let steer = 0;
    if (input.down('KeyA') || input.down('ArrowLeft')) steer -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) steer += 1;
    const handbrake = input.down('Space');
    // Camera yaw eases toward the car's heading while driving.
    if (!input.locked) {
      this.camYaw = turnToward(this.camYaw, v.heading, 1.6 * dt);
    }
    v.drive(dt, { throttle, steer, handbrake }, this.city, (impact) => {
      if (ctx.onCrash) ctx.onCrash(impact);
    });
    this.position.copy(v.position);
    // Hitting pedestrians while driving is a crime the police notice.
    if (Math.abs(v.speed) > 2 && ctx.pedestrians) {
      const hit = ctx.pedestrians.checkCarHits(v.position, 2.2);
      if (hit.length > 0 && ctx.onHitPed) ctx.onHitPed(hit.length);
    }
  }

  updateCamera(dt) {
    const targetDist = this.vehicle ? 10.5 : 7.5;
    this.camDist += (targetDist - this.camDist) * Math.min(1, dt * 4);
    const eye = this.vehicle ? this.vehicle.position : this.position;
    const lookY = eye.y + (this.vehicle ? 2.2 : 1.8);
    const cx = eye.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const cz = eye.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const cy = lookY + Math.sin(this.camPitch) * this.camDist;
    // Keep the camera out of buildings: shorten the boom when the camera
    // point lands inside a collider.
    let dist = this.camDist;
    const probe = this.city.collideCircle(cx, cz, 0.4);
    if (probe.hit) dist = Math.max(3, this.camDist * 0.45);
    const fx = eye.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const fz = eye.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const fy = Math.max(1.4, lookY + Math.sin(this.camPitch) * dist);
    this.camera.position.set(fx, fy, fz);
    this.camera.lookAt(eye.x, lookY, eye.z);
  }
}
