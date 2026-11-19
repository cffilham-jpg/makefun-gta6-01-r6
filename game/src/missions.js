// Solmar Bay — the story: six missions for Ray Delgado, from his first day
// in town to the big score at Solmar Bay Trust. Each mission is a list of
// steps — go somewhere, steal a car, hold E to grab something, lose the cops,
// clear out the Breakers — with a light beacon marking the current goal.

import * as THREE from 'three';

export const MISSION_DEFS = [
  {
    id: 'welcome',
    name: 'Welcome to Solmar',
    reward: 200,
    intro: ['Vera: Ray! You made it. Get over to my garage —', 'we have a city to take, and a car with your name on it.'],
    steps: [
      { type: 'goto', x: 30, z: 104, radius: 8, text: 'Drive or walk to Vera\'s Garage' },
    ],
  },
  {
    id: 'hotwheels',
    name: 'Hot Wheels',
    reward: 400,
    intro: ['Vera: There is a Falcon GT parked east of here.', 'Borrow it. Permanently. Bring it to the garage.'],
    steps: [
      { type: 'goto', x: 56, z: 150, radius: 7, text: 'Find the Falcon GT parked on Marina Row' },
      { type: 'enterCar', missionCar: true, text: 'Get in the Falcon GT (E)' },
      { type: 'goto', x: 30, z: 104, radius: 9, inCar: true, text: 'Deliver the Falcon GT to Vera\'s Garage' },
    ],
  },
  {
    id: 'harborrun',
    name: 'Harbor Run',
    reward: 600,
    intro: ['Vera: A package is waiting at the docks. Grab it,', 'then get it to the warehouse — fast. Ninety seconds.'],
    steps: [
      { type: 'goto', x: 60, z: 252, radius: 8, text: 'Go to the docks pickup point' },
      { type: 'hold', x: 60, z: 252, radius: 6, holdSeconds: 2, text: 'Hold E to grab the package' },
      { type: 'goto', x: 150, z: 196, radius: 9, inCar: false, timeLimit: 90, text: 'Deliver the package to the warehouse' },
    ],
  },
  {
    id: 'heatwave',
    name: 'Heat Wave',
    reward: 800,
    intro: ['Vera: The Trust has a little alarm problem tonight.', 'Trip it, then vanish. Lose the cops and come home.'],
    steps: [
      { type: 'goto', x: -30, z: -14, radius: 9, text: 'Reach the bank plaza', onArrive: 'alarm' },
      { type: 'loseWanted', text: 'Lose the cops — stay out of sight' },
      { type: 'goto', x: 30, z: 104, radius: 9, text: 'Get back to Vera\'s Garage' },
    ],
  },
  {
    id: 'dockside',
    name: 'Dockside Trouble',
    reward: 1200,
    intro: ['Vera: The Breakers are leaning on my dock crew.', 'Go down there and lean back. Harder.'],
    steps: [
      { type: 'goto', x: 60, z: 240, radius: 10, text: 'Head down to the docks' },
      {
        type: 'eliminate', text: 'Clear out the Breakers (4)',
        spawn: [
          { x: 48, z: 246 }, { x: 72, z: 250 }, { x: 60, z: 232 }, { x: 84, z: 240 },
        ],
      },
      { type: 'goto', x: 30, z: 104, radius: 9, text: 'Report back to Vera\'s Garage' },
    ],
  },
  {
    id: 'bigscore',
    name: 'The Big Score',
    reward: 2500,
    intro: ['Vera: One last job, Ray. The Trust vault.', 'Get in, grab the cash, and outrun the whole city.'],
    steps: [
      { type: 'goto', x: -30, z: -14, radius: 9, text: 'Get to Solmar Bay Trust' },
      { type: 'hold', x: -30, z: -14, radius: 7, holdSeconds: 4, text: 'Hold E to crack the vault' },
      { type: 'goto', x: 30, z: 104, radius: 9, text: 'Escape to Vera\'s Garage — the whole SBPD is coming', onStart: 'heat4' },
    ],
  },
];

export class Missions {
  constructor(scene) {
    this.scene = scene;
    this.index = 0; // current mission in MISSION_DEFS
    this.stepIndex = 0;
    this.active = false;
    this.holdProgress = 0;
    this.stepTimer = 0;
    this.storyDone = false;
    this.beacon = this.buildBeacon();
    this.beacon.visible = false;
    scene.add(this.beacon);
  }

  buildBeacon() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.7, 34, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd24a, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    beam.position.y = 17;
    g.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.0, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    g.add(ring);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.0),
      new THREE.MeshBasicMaterial({ color: 0xffe89a }),
    );
    diamond.position.y = 5;
    g.add(diamond);
    this.diamond = diamond;
    return g;
  }

  get def() {
    return MISSION_DEFS[this.index];
  }

  get step() {
    return this.def ? this.def.steps[this.stepIndex] : null;
  }

  get target() {
    const s = this.step;
    if (!s) return null;
    if (s.type === 'goto' || s.type === 'hold') return { x: s.x, z: s.z };
    return null;
  }

  start(ctx) {
    if (this.index >= MISSION_DEFS.length) {
      this.storyDone = true;
      return;
    }
    this.active = true;
    this.stepIndex = 0;
    this.holdProgress = 0;
    this.beginStep(ctx);
    if (ctx.hud) {
      ctx.hud.showMissionTitle(this.def.name);
      for (const line of this.def.intro) ctx.hud.message(line, 5);
    }
  }

  beginStep(ctx) {
    const s = this.step;
    if (!s) return;
    this.holdProgress = 0;
    this.stepTimer = s.timeLimit || 0;
    if (s.type === 'eliminate' && ctx.combat) {
      for (const p of s.spawn) ctx.combat.spawnEnemy(p.x, p.z);
    }
    if (s.onStart === 'heat4' && ctx.police) {
      ctx.police.setStars(4);
      if (ctx.hud) ctx.hud.message('The whole SBPD is on you — RUN!', 4);
    }
    const t = this.target;
    if (t) {
      this.beacon.position.set(t.x, 0, t.z);
      this.beacon.visible = true;
    } else {
      this.beacon.visible = false;
    }
    if (ctx.hud) ctx.hud.message(s.text, 4);
  }

  fail(ctx, reason) {
    if (ctx.hud) ctx.hud.message(reason || 'Mission failed — try again', 4);
    if (ctx.combat) ctx.combat.clearEnemies();
    this.stepIndex = 0;
    this.beginStep(ctx);
  }

  completeMission(ctx) {
    // Capture the reward first: the index moves below, and the save the
    // completion callback writes must already hold the NEW state.
    const reward = this.def.reward;
    const name = this.def.name;
    this.active = false;
    this.beacon.visible = false;
    this.index += 1;
    if (this.index >= MISSION_DEFS.length) {
      this.storyDone = true;
    }
    if (ctx.audio) ctx.audio.missionComplete();
    if (ctx.onMissionComplete) ctx.onMissionComplete(reward, name);
    if (this.storyDone) {
      if (ctx.hud) {
        ctx.hud.showMissionTitle('SOLMAR IS YOURS');
        ctx.hud.message('Every mission complete. The city is your playground now.', 6);
      }
      return;
    }
    // A short breather, then the next job starts.
    this.nextTimer = 4;
  }

  advance(ctx) {
    this.stepIndex += 1;
    if (this.stepIndex >= this.def.steps.length) {
      this.completeMission(ctx);
      return;
    }
    this.beginStep(ctx);
  }

  update(dt, player, ctx) {
    // Spin the beacon diamond.
    if (this.beacon.visible) {
      this.diamond.rotation.y += dt * 2;
      this.diamond.position.y = 5 + Math.sin(performance.now() * 0.002) * 0.5;
    }
    if (this.nextTimer !== undefined && this.nextTimer > 0) {
      this.nextTimer -= dt;
      if (this.nextTimer <= 0) {
        this.nextTimer = undefined;
        this.start(ctx);
      }
      return;
    }
    if (!this.active) return;
    const s = this.step;
    if (!s) return;

    // Timed steps fail when the clock runs out.
    if (s.timeLimit) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.fail(ctx, 'Too slow! The deal fell through — try again.');
        return;
      }
    }

    const px = player.position.x;
    const pz = player.position.z;
    if (s.type === 'goto') {
      const d = Math.hypot(px - s.x, pz - s.z);
      if (d < s.radius && (!s.inCar || player.inCar)) {
        if (s.onArrive === 'alarm' && ctx.police) {
          ctx.police.setStars(3);
          if (ctx.hud) ctx.hud.message('ALARM! The SBPD is on its way!', 4);
        }
        this.advance(ctx);
      }
    } else if (s.type === 'enterCar') {
      if (player.inCar && (!s.missionCar || player.vehicle.missionCar)) {
        this.advance(ctx);
      }
    } else if (s.type === 'hold') {
      const d = Math.hypot(px - s.x, pz - s.z);
      if (d < s.radius && ctx.input && ctx.input.down('KeyE') && !player.inCar) {
        this.holdProgress += dt;
        if (this.holdProgress >= s.holdSeconds) this.advance(ctx);
      } else {
        this.holdProgress = Math.max(0, this.holdProgress - dt * 2);
      }
    } else if (s.type === 'loseWanted') {
      if (ctx.police && ctx.police.stars === 0) this.advance(ctx);
    } else if (s.type === 'eliminate') {
      if (ctx.combat && ctx.combat.enemiesAlive === 0) this.advance(ctx);
    }
  }

  /** The objective line the HUD shows, with distance when there is a target. */
  objectiveText(playerPos) {
    if (!this.active || !this.step) {
      return this.storyDone ? 'Story complete — free roam Solmar Bay' : 'No active mission';
    }
    let text = this.step.text;
    const t = this.target;
    if (t && playerPos) {
      const d = Math.round(Math.hypot(playerPos.x - t.x, playerPos.z - t.z));
      text += `  •  ${d}m`;
    }
    if (this.step.timeLimit) {
      text += `  •  ${Math.max(0, Math.ceil(this.stepTimer))}s`;
    }
    return text;
  }
}
