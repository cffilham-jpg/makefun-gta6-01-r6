// Solmar Bay — the city itself: a procedural coastal grid of roads, blocks
// of buildings with lit windows, a marina with docks and boats, palms and
// street lamps. Built once from a fixed seed, so every player sees the same
// city. Also owns the collision boxes and the road graph traffic drives on.

import * as THREE from 'three';
import { WORLD, PALETTE } from './config.js';
import { makeRng, pick, range } from './utils.js';

function windowTexture(baseColor, litColor, rng) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) {
    for (let x = 5; x < 58; x += 11) {
      const lit = rng() < 0.28;
      g.fillStyle = lit ? litColor : '#2a3138';
      g.fillRect(x, y, 7, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.rng = makeRng(WORLD.seed);
    /** Building and wall hitboxes: {minX,maxX,minZ,maxZ}. */
    this.colliders = [];
    /** Road center lines traffic follows: {axis:'x'|'z', at, from, to}. */
    this.roads = [];
    /** Parked-car spots along road edges. */
    this.parkSpots = [];
    /** Pedestrian sidewalk waypoints. */
    this.walkSpots = [];
    this.boats = [];
    this.landmarks = {};
    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
    this.buildMarina();
    this.buildPalmsAndLamps();
    this.buildLandmarks();
  }

  addCollider(minX, maxX, minZ, maxZ) {
    this.colliders.push({ minX, maxX, minZ, maxZ });
  }

  /**
   * Push a ground circle out of every collider it overlaps.
   * Returns {x, z, hit} with the corrected position.
   */
  collideCircle(x, z, r) {
    let hit = false;
    for (const c of this.colliders) {
      const nx = Math.max(c.minX, Math.min(x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - nx;
      const dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 0.000001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        // Center is inside the box: push out along the smallest penetration.
        const pushL = x - c.minX + r;
        const pushR = c.maxX - x + r;
        const pushT = z - c.minZ + r;
        const pushB = c.maxZ - z + r;
        const m = Math.min(pushL, pushR, pushT, pushB);
        if (m === pushL) x = c.minX - r;
        else if (m === pushR) x = c.maxX + r;
        else if (m === pushT) z = c.minZ - r;
        else z = c.maxZ + r;
      }
    }
    return { x, z, hit };
  }

  /** True when the point is on a road (within half the road width of a grid line). */
  isOnRoad(x, z) {
    const half = WORLD.roadWidth / 2;
    const near = (v) => {
      const m = Math.abs(((v % WORLD.roadEvery) + WORLD.roadEvery) % WORLD.roadEvery);
      return m < half || m > WORLD.roadEvery - half;
    };
    return near(x) || near(z);
  }

  buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.halfSize * 2 + 80, WORLD.halfSize * 2 + 80),
      new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, 0);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Sand strip along the marina edge.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.halfSize * 2 + 80, 26),
      new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.02, WORLD.waterLine - 8);
    sand.receiveShadow = true;
    this.scene.add(sand);
  }

  buildRoads() {
    const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
    const sideMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
    const size = WORLD.halfSize * 2;
    const roadGeoX = new THREE.PlaneGeometry(size, WORLD.roadWidth);
    const roadGeoZ = new THREE.PlaneGeometry(WORLD.roadWidth, size);
    const sideGeoX = new THREE.PlaneGeometry(size, WORLD.roadWidth + WORLD.sidewalk * 2);
    const sideGeoZ = new THREE.PlaneGeometry(WORLD.roadWidth + WORLD.sidewalk * 2, size);
    // Roads sit exactly on multiples of 60: traffic, police spawns and
    // parking all navigate by that grid, so the paint must match it.
    for (let at = -300; at <= 300; at += WORLD.roadEvery) {
      const sx = new THREE.Mesh(sideGeoX, sideMat);
      sx.rotation.x = -Math.PI / 2;
      sx.position.set(0, 0.0, at);
      sx.receiveShadow = true;
      this.scene.add(sx);
      const sz = new THREE.Mesh(sideGeoZ, sideMat);
      sz.rotation.x = -Math.PI / 2;
      sz.position.set(at, 0.0, 0);
      sz.receiveShadow = true;
      this.scene.add(sz);
      const rx = new THREE.Mesh(roadGeoX, roadMat);
      rx.rotation.x = -Math.PI / 2;
      rx.position.set(0, 0.05, at);
      rx.receiveShadow = true;
      this.scene.add(rx);
      const rz = new THREE.Mesh(roadGeoZ, roadMat);
      rz.rotation.x = -Math.PI / 2;
      rz.position.set(at, 0.05, 0);
      rz.receiveShadow = true;
      this.scene.add(rz);
      this.roads.push({ axis: 'z', at, from: -WORLD.halfSize, to: WORLD.waterLine - 30 });
      // An east-west road past the marina is under water: drawn, never driven.
      if (at < WORLD.waterLine - 20) {
        this.roads.push({ axis: 'x', at, from: -WORLD.halfSize, to: WORLD.halfSize });
      }
      // Dashed center lines, as small white strips.
      const dashGeo = new THREE.PlaneGeometry(4, 0.5);
      const dashMat = new THREE.MeshBasicMaterial({ color: 0xe8e4d8 });
      for (let d = -WORLD.halfSize + 10; d < WORLD.halfSize; d += 12) {
        const dx = new THREE.Mesh(dashGeo, dashMat);
        dx.rotation.x = -Math.PI / 2;
        dx.position.set(d, 0.08, at);
        this.scene.add(dx);
        if (d < WORLD.waterLine - 30) {
          const dz = new THREE.Mesh(dashGeo, dashMat);
          dz.rotation.x = -Math.PI / 2;
          dz.rotation.z = Math.PI / 2;
          dz.position.set(at, 0.08, d);
          this.scene.add(dz);
        }
      }
    }
  }

  buildBlocks() {
    const rng = this.rng;
    // Block centers are the midpoints between roads: -270, -210, …, 270.
    // Landmark blocks stay empty: the garage, bank, hospital and warehouse
    // are built there by hand in buildLandmarks.
    const landmarkBlocks = ['30,90', '-30,-30', '-90,-30', '150,210'];
    const blockCenters = [];
    for (let bx = -270; bx <= 270; bx += WORLD.roadEvery) {
      for (let bz = -270; bz < 240; bz += WORLD.roadEvery) {
        if (landmarkBlocks.includes(`${bx},${bz}`)) continue;
        blockCenters.push({ x: bx, z: bz });
      }
    }
    for (const block of blockCenters) {
      const distCenter = Math.hypot(block.x, block.z);
      const downtown = 1 - Math.min(1, distCenter / 320);
      const count = rng() < 0.3 ? 1 : rng() < 0.6 ? 2 : 4;
      const slots = count === 1
        ? [{ dx: 0, dz: 0, w: 34, d: 34 }]
        : count === 2
          ? [{ dx: -9, dz: 0, w: 15, d: 34 }, { dx: 9, dz: 0, w: 15, d: 34 }]
          : [
            { dx: -9, dz: -9, w: 15, d: 15 }, { dx: 9, dz: -9, w: 15, d: 15 },
            { dx: -9, dz: 9, w: 15, d: 15 }, { dx: 9, dz: 9, w: 15, d: 15 },
          ];
      for (const s of slots) {
        const h = 7 + downtown * range(rng, 10, 48) + range(rng, 0, 8);
        const side = pick(rng, PALETTE.buildingSides);
        const tex = windowTexture('#' + new THREE.Color(side).getHexString(), '#ffd98a', rng);
        tex.repeat.set(Math.max(1, Math.round(s.w / 12)), Math.max(1, Math.round(h / 12)));
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        const sideMat = new THREE.MeshLambertMaterial({ map: tex });
        const topMat = new THREE.MeshLambertMaterial({ color: pick(rng, PALETTE.buildingTops) });
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(s.w, h, s.d),
          [sideMat, sideMat, topMat, topMat, sideMat, sideMat],
        );
        const x = block.x + s.dx;
        const z = block.z + s.dz;
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.addCollider(x - s.w / 2, x + s.w / 2, z - s.d / 2, z + s.d / 2);
        // A rooftop box on taller towers, for skyline variety.
        if (h > 26 && rng() < 0.6) {
          const roof = new THREE.Mesh(
            new THREE.BoxGeometry(s.w * 0.4, 3, s.d * 0.4),
            new THREE.MeshLambertMaterial({ color: 0x9a938a }),
          );
          roof.position.set(x, h + 1.5, z);
          roof.castShadow = true;
          this.scene.add(roof);
        }
      }
      // Parked-car spots on the block's south edge, and walk spots on its corners.
      if (rng() < 0.75) {
        this.parkSpots.push({ x: block.x + range(rng, -14, 14), z: block.z + WORLD.roadEvery / 2 - 2, heading: Math.PI / 2 });
      }
      this.walkSpots.push({ x: block.x - 22, z: block.z - 22 });
      this.walkSpots.push({ x: block.x + 22, z: block.z + 22 });
    }
  }

  buildMarina() {
    // Water: a big plane south of the sand, slightly below ground level.
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.halfSize * 2 + 200, 140),
      new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.92 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.12, WORLD.waterLine + 62);
    this.scene.add(water);
    this.water = water;

    // Wooden docks reaching into the water.
    const dockMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
    for (const dx of [-180, -60, 60, 180]) {
      const dock = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 46), dockMat);
      dock.position.set(dx, 0.6, WORLD.waterLine + 18);
      dock.castShadow = true;
      dock.receiveShadow = true;
      this.scene.add(dock);
      this.addCollider(dx - 3, dx + 3, WORLD.waterLine - 4, WORLD.waterLine + 40);
      // A moored boat beside each dock.
      const boat = this.makeBoat(dx + 9, WORLD.waterLine + 26);
      this.boats.push(boat);
      this.scene.add(boat);
    }
    // A long pier with a crane near the east docks.
    const pier = new THREE.Mesh(new THREE.BoxGeometry(90, 1.4, 8), dockMat);
    pier.position.set(150, 0.7, WORLD.waterLine + 6);
    pier.castShadow = true;
    this.scene.add(pier);
    this.addCollider(105, 195, WORLD.waterLine + 2, WORLD.waterLine + 10);

    // Shipping containers stacked on the sand near the docks.
    const containerColors = [0xc23b3b, 0x3f6fb5, 0x4a7a3a, 0xe8b400, 0x7a4a9a];
    const rng = this.rng;
    for (let i = 0; i < 10; i++) {
      const w = 12;
      const h = 2.6;
      const d = 2.6;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color: pick(rng, containerColors) }),
      );
      const x = 120 + (i % 5) * 16;
      const z = WORLD.waterLine - 14 - Math.floor(i / 5) * 6;
      box.position.set(x, h / 2 + (i % 3 === 0 ? h : 0), z);
      box.castShadow = true;
      this.scene.add(box);
      this.addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
    }
  }

  makeBoat(x, z) {
    const group = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.4, 9),
      new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
    );
    hull.position.y = 0.5;
    hull.castShadow = true;
    group.add(hull);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.6, 3.4),
      new THREE.MeshLambertMaterial({ color: 0x2f6f8f }),
    );
    cabin.position.set(0, 1.8, -1);
    cabin.castShadow = true;
    group.add(cabin);
    group.position.set(x, 0, z);
    return group;
  }

  buildPalmsAndLamps() {
    const rng = this.rng;
    const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
    const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
    const leafGeo = new THREE.ConeGeometry(2.6, 2.4, 6);
    const spots = [];
    for (let x = -290; x <= 290; x += 29) spots.push({ x, z: WORLD.waterLine - 14 });
    for (let i = 0; i < 26; i++) {
      // Palms sit on the sidewalk, just off the road's edge.
      const side = rng() < 0.5 ? -1 : 1;
      spots.push({
        x: Math.floor(range(rng, -5, 5)) * WORLD.roadEvery + side * range(rng, 8.5, 11),
        z: Math.floor(range(rng, -5, 5)) * WORLD.roadEvery + side * range(rng, 8.5, 11),
      });
    }
    for (const s of spots) {
      const palm = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 3;
      trunk.castShadow = true;
      palm.add(trunk);
      const leaves = new THREE.Mesh(leafGeo, leafMat);
      leaves.position.y = 7;
      leaves.castShadow = true;
      palm.add(leaves);
      palm.position.set(s.x, 0, s.z);
      palm.rotation.y = rng() * Math.PI * 2;
      this.scene.add(palm);
    }
    // Street lamps on the sidewalk corners where avenues cross.
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x44484e });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    const bulbGeo = new THREE.SphereGeometry(0.5, 8, 8);
    for (let at = -240; at <= 240; at += 60) {
      for (const d of [-180, -60, 60, 180]) {
        const lamp = new THREE.Group();
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 3.5;
        lamp.add(pole);
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.y = 7.2;
        lamp.add(bulb);
        lamp.position.set(at + 8, 0, d);
        this.scene.add(lamp);
      }
    }
  }

  buildLandmarks() {
    // Vera's Garage — the safehouse, a low wide building with a bright sign band.
    const garage = new THREE.Group();
    const hall = new THREE.Mesh(
      new THREE.BoxGeometry(22, 7, 14),
      new THREE.MeshLambertMaterial({ color: 0xd8d2c4 }),
    );
    hall.position.y = 3.5;
    hall.castShadow = true;
    hall.receiveShadow = true;
    garage.add(hall);
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(22.4, 1.6, 14.4),
      new THREE.MeshLambertMaterial({ color: 0xe8641e }),
    );
    band.position.y = 6.2;
    garage.add(band);
    garage.position.set(30, 0, 90);
    this.scene.add(garage);
    this.addCollider(19, 41, 83, 97);
    this.landmarks.garage = { x: 30, z: 90 };

    // Solmar Bay Trust — the tall bank tower downtown.
    const bank = new THREE.Mesh(
      new THREE.BoxGeometry(26, 52, 26),
      new THREE.MeshLambertMaterial({ color: 0x9fb8c8 }),
    );
    bank.position.set(-30, 26, -30);
    bank.castShadow = true;
    bank.receiveShadow = true;
    this.scene.add(bank);
    this.addCollider(-43, -17, -43, -17);
    const bankTop = new THREE.Mesh(
      new THREE.BoxGeometry(10, 4, 10),
      new THREE.MeshLambertMaterial({ color: 0xe8b400 }),
    );
    bankTop.position.set(-30, 54, -30);
    this.scene.add(bankTop);
    this.landmarks.bank = { x: -30, z: -30 };

    // St. Marina Hospital — white block with a red cross band.
    const hosp = new THREE.Mesh(
      new THREE.BoxGeometry(30, 16, 20),
      new THREE.MeshLambertMaterial({ color: 0xf0f0ea }),
    );
    hosp.position.set(-90, 8, -30);
    hosp.castShadow = true;
    this.scene.add(hosp);
    this.addCollider(-105, -75, -40, -20);
    const cross = new THREE.Mesh(
      new THREE.BoxGeometry(6, 6, 1),
      new THREE.MeshBasicMaterial({ color: 0xc23b3b }),
    );
    cross.position.set(-90, 12, -19.4);
    this.scene.add(cross);
    this.landmarks.hospital = { x: -90, z: -30 };

    // Harbor warehouse near the docks.
    const wh = new THREE.Mesh(
      new THREE.BoxGeometry(30, 9, 18),
      new THREE.MeshLambertMaterial({ color: 0x7a8a9a }),
    );
    wh.position.set(150, 4.5, 210);
    wh.castShadow = true;
    this.scene.add(wh);
    this.addCollider(135, 165, 201, 219);
    this.landmarks.warehouse = { x: 150, z: 210 };
    this.landmarks.docks = { x: 60, z: WORLD.waterLine - 6 };
  }

  /** A random point on a road, for traffic and police spawns. */
  randomRoadPoint(rng) {
    const road = pick(rng, this.roads);
    const along = range(rng, road.from + 20, road.to - 20);
    if (road.axis === 'x') return { x: along, z: road.at };
    return { x: road.at, z: along };
  }

  update(dt, time) {
    for (let i = 0; i < this.boats.length; i++) {
      this.boats[i].position.y = Math.sin(time * 0.7 + i * 1.7) * 0.15;
      this.boats[i].rotation.z = Math.sin(time * 0.5 + i) * 0.02;
    }
    if (this.water) {
      this.water.material.opacity = 0.9 + Math.sin(time * 0.4) * 0.03;
    }
  }
}
