// Solmar Bay — combat: four weapons with real ballistics (raycasts against
// people and cars, blocked by buildings), the rival Breakers crew that
// shoots back during the dock fight, and health/armor pickups on the street.

import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER } from './config.js';
import { clamp, makeRng, range } from './utils.js';

const ENEMY_SHIRTS = [0x8a2a2a, 0x5a2a6a, 0x2a4a6a];

export class Combat {
  constructor(scene, camera, audio, input) {
    this.scene = scene;
    this.camera = camera;
    this.audio = audio;
    this.input = input;
    this.rng = makeRng(31337);
    this.current = 'pistol';
    this.ammo = { pistol: 12, smg: 30, shotgun: 6, rifle: 24 };
    this.reserve = { pistol: 60, smg: 120, shotgun: 30, rifle: 90 };
    this.cooldown = 0;
    this.reloading = 0;
    this.enemies = [];
    this.pickups = [];
    this.tracers = [];
    this.sparks = [];
    this.flash = new THREE.PointLight(0xffcc66, 0, 14, 1.5);
    this.scene.add(this.flash);
    this.flashTimer = 0;
    this.spawnPickups();
  }

  get spec() {
    return WEAPONS[this.current];
  }

  switchWeapon(key) {
    const idx = Number(key) - 1;
    if (idx >= 0 && idx < WEAPON_ORDER.length) {
      this.current = WEAPON_ORDER[idx];
      this.reloading = 0;
    }
  }

  reload() {
    const spec = this.spec;
    if (this.reloading > 0 || this.ammo[this.current] >= spec.mag || this.reserve[this.current] <= 0) return;
    this.reloading = 1.1;
  }

  spawnPickups() {
    const spots = [
      { kind: 'health', x: -90, z: -12 },
      { kind: 'health', x: 150, z: 196 },
      { kind: 'health', x: -150, z: 120 },
      { kind: 'armor', x: 30, z: 108 },
      { kind: 'armor', x: -210, z: -60 },
      { kind: 'health', x: 210, z: -120 },
    ];
    for (const s of spots) this.addPickup(s.kind, s.x, s.z);
  }

  addPickup(kind, x, z) {
    const g = new THREE.Group();
    const color = kind === 'health' ? 0x2fd05a : 0x2f7fd0;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.3),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.5 }),
    );
    g.add(box);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.9, 0.34),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    );
    g.add(bar);
    g.position.set(x, 1.2, z);
    this.scene.add(g);
    this.pickups.push({ kind, x, z, group: g, taken: false, respawn: 0 });
  }

  spawnEnemy(x, z) {
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: ENEMY_SHIRTS[this.enemies.length % ENEMY_SHIRTS.length] });
    const pants = new THREE.MeshLambertMaterial({ color: 0x222226 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd8a06a });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.82, 0.28), pants);
    legs.position.y = 0.41;
    g.add(legs);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.34), shirt);
    torso.position.y = 1.18;
    torso.castShadow = true;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skin);
    head.position.y = 1.74;
    g.add(head);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.4), new THREE.MeshLambertMaterial({ color: 0xc23b3b }));
    band.position.y = 1.9;
    g.add(band);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.6), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.3, 1.25, 0.3);
    g.add(gun);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.enemies.push({
      group: g, pos: new THREE.Vector3(x, 0, z), heading: 0,
      shootTimer: range(this.rng, 0.4, 1.2), health: 100, walkPhase: 0,
    });
  }

  get enemiesAlive() {
    return this.enemies.filter((e) => e.health > 0).length;
  }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies = [];
  }

  /** Every shootable thing right now, for the raycast. */
  collectTargets(ctx) {
    const out = [];
    if (ctx.police) out.push(...ctx.police.shootables());
    for (const e of this.enemies) {
      if (e.health > 0) out.push({ kind: 'enemy', ref: e, pos: e.pos, radius: 0.9, height: 1.9 });
    }
    if (ctx.pedestrians) {
      for (const p of ctx.pedestrians.list) {
        if (p.state !== 'down') out.push({ kind: 'ped', ref: p, pos: p.position, radius: 0.7, height: 1.9 });
      }
    }
    if (ctx.traffic) {
      for (const v of ctx.traffic.allVehicles()) {
        if (!v.wrecked && v.driver !== 'player') out.push({ kind: 'car', ref: v, pos: v.position, radius: 2.2, height: 1.6 });
      }
    }
    return out;
  }

  /** Is the ray from origin along dir blocked by a building before distance t? */
  blockedByBuilding(origin, dir, t, city) {
    for (let d = 3; d < t; d += 3) {
      const x = origin.x + dir.x * d;
      const z = origin.z + dir.z * d;
      for (const c of city.colliders) {
        if (x > c.minX - 0.3 && x < c.maxX + 0.3 && z > c.minZ - 0.3 && z < c.maxZ + 0.3) return true;
      }
    }
    return false;
  }

  raycast(origin, dir, maxRange, targets, city) {
    let best = null;
    let bestT = maxRange;
    for (const t of targets) {
      const cx = t.pos.x;
      const cz = t.pos.z;
      const cy = t.height / 2;
      const ox = cx - origin.x;
      const oy = cy - origin.y;
      const oz = cz - origin.z;
      const along = ox * dir.x + oy * dir.y + oz * dir.z;
      if (along < 0.5 || along > bestT) continue;
      const px = origin.x + dir.x * along;
      const py = origin.y + dir.y * along;
      const pz = origin.z + dir.z * along;
      const horiz = Math.hypot(px - cx, pz - cz);
      if (horiz > t.radius) continue;
      if (py < -0.2 || py > t.height + 0.3) continue;
      if (this.blockedByBuilding(origin, dir, along, city)) continue;
      best = t;
      bestT = along;
    }
    return best ? { target: best, t: bestT } : null;
  }

  tryFire(player, ctx) {
    if (this.cooldown > 0 || this.reloading > 0) return;
    if (this.ammo[this.current] <= 0) {
      this.reload();
      return;
    }
    const spec = this.spec;
    this.cooldown = spec.rate;
    this.ammo[this.current] -= 1;
    this.audio.gunshot(this.current === 'shotgun' || this.current === 'rifle');
    // Muzzle flash at the camera.
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.flash.position.copy(this.camera.position).addScaledVector(dir, 1.2);
    this.flash.intensity = 14;
    this.flashTimer = 0.05;

    const origin = this.camera.position.clone();
    const pellets = spec.pellets || 1;
    let hitSomething = false;
    for (let i = 0; i < pellets; i++) {
      const spreadDir = dir.clone();
      spreadDir.x += (this.rng() - 0.5) * 2 * spec.spread;
      spreadDir.y += (this.rng() - 0.5) * 2 * spec.spread;
      spreadDir.z += (this.rng() - 0.5) * 2 * spec.spread;
      spreadDir.normalize();
      const hit = this.raycast(origin, spreadDir, spec.range, this.collectTargets(ctx), ctx.city);
      const endT = hit ? hit.t : spec.range;
      const end = origin.clone().addScaledVector(spreadDir, endT);
      this.addTracer(origin, end);
      if (hit) {
        hitSomething = true;
        this.addSpark(end);
        this.applyHit(hit.target, spec.damage, ctx);
      }
    }
    // Firing a gun in the city draws the law.
    if (ctx.onShoot) ctx.onShoot(hitSomething);
    if (ctx.pedestrians) ctx.pedestrians.scareAll(player.position.x, player.position.z, 30);
    // Recoil nudges the camera up a touch.
    player.camPitch = clamp(player.camPitch + spec.kick * 0.012, 0.12, 1.1);
  }

  applyHit(target, damage, ctx) {
    if (target.kind === 'officer') {
      target.ref.health -= damage;
      if (target.ref.health <= 0 && ctx.onKillCop) ctx.onKillCop();
    } else if (target.kind === 'enemy') {
      target.ref.health -= damage;
      if (target.ref.health <= 0) {
        target.ref.group.rotation.x = -Math.PI / 2;
        target.ref.group.position.y = 0.3;
        if (ctx.onKillEnemy) ctx.onKillEnemy();
      }
    } else if (target.kind === 'ped') {
      target.ref.knockDown();
      if (ctx.onHitPed) ctx.onHitPed(1);
    } else if (target.kind === 'car' || target.kind === 'policeCar') {
      target.ref.damage(damage);
    }
  }

  addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
    if (this.tracers.length > 8) {
      const old = this.tracers.shift();
      this.scene.remove(old.line);
    }
  }

  addSpark(at) {
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd24a }),
    );
    spark.position.copy(at);
    this.scene.add(spark);
    this.sparks.push({ mesh: spark, life: 0.15 });
  }

  update(dt, player, ctx) {
    this.cooldown -= dt;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.intensity = 0;
    }
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const spec = this.spec;
        const need = spec.mag - this.ammo[this.current];
        const take = Math.min(need, this.reserve[this.current]);
        this.ammo[this.current] += take;
        this.reserve[this.current] -= take;
      }
    }
    // Weapon switching and reload keys.
    for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) {
      if (this.input.wasPressed(code)) this.switchWeapon(code.slice(-1));
    }
    if (this.input.wasPressed('KeyR')) this.reload();
    // Firing: automatic weapons hold, others click.
    const wantFire = this.spec.auto ? this.input.mouseDown : this.input.wasClicked();
    if (wantFire && !player.inCar) this.tryFire(player, ctx);

    // Tracers and sparks fade fast.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.mesh.scale.multiplyScalar(0.8);
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.sparks.splice(i, 1);
      }
    }

    // Pickups bob, spin, and get collected.
    for (const p of this.pickups) {
      if (p.taken) {
        p.respawn -= dt;
        if (p.respawn <= 0) {
          p.taken = false;
          p.group.visible = true;
        }
        continue;
      }
      p.group.rotation.y += dt * 1.5;
      p.group.position.y = 1.2 + Math.sin(performance.now() * 0.003 + p.x) * 0.15;
      if (Math.hypot(player.position.x - p.x, player.position.z - p.z) < 1.8 && !player.inCar) {
        p.taken = true;
        p.group.visible = false;
        p.respawn = 45;
        if (p.kind === 'health') player.heal(50);
        else player.addArmor(50);
        this.audio.chime();
        if (ctx.onPickup) ctx.onPickup(p.kind);
      }
    }

    // Breakers: hold their ground and shoot at Ray inside 40 units.
    for (const e of this.enemies) {
      if (e.health <= 0) continue;
      const dx = player.position.x - e.pos.x;
      const dz = player.position.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let diff = want - e.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      e.heading += clamp(diff, -4 * dt, 4 * dt);
      e.group.rotation.y = e.heading;
      if (d > 30) {
        const nx = e.pos.x + Math.sin(e.heading) * 4.5 * dt;
        const nz = e.pos.z + Math.cos(e.heading) * 4.5 * dt;
        const hit = ctx.city.collideCircle(nx, nz, 0.5);
        e.pos.x = hit.x;
        e.pos.z = hit.z;
        e.group.position.x = e.pos.x;
        e.group.position.z = e.pos.z;
      }
      e.shootTimer -= dt;
      if (d < 40 && e.shootTimer <= 0) {
        e.shootTimer = range(this.rng, 0.8, 1.6);
        this.audio.gunshot(false);
        const hitChance = clamp(0.5 - d * 0.01, 0.08, 0.5);
        if (this.rng() < hitChance && ctx.damagePlayer) {
          ctx.damagePlayer(range(this.rng, 5, 11));
        }
      }
    }
  }
}
