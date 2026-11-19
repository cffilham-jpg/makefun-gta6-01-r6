// Solmar Bay — the entry point: builds the renderer, the city and every
// system, runs the game loop, and wires the events between systems (a
// stolen car raises the wanted level, a finished mission pays cash, a dead
// Ray wakes up at St. Marina). States: title, playing, paused, ended.

import * as THREE from 'three';
import { PALETTE, PLAYER_TUNING, START_POS, GARAGE_POS, HOSPITAL_POS } from './config.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { City } from './city.js';
import { Traffic } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { hasSave, saveGame, loadGame, clearSave } from './save.js';
import { shotFromUrl, stageShot } from './shots.js';

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // ?noshadow=1 is a test hook for software renderers (SwiftShader): it
    // skips the shadow map, which is the slowest pass without a GPU. Real
    // players always get shadows.
    this.lowGfx = new URLSearchParams(window.location.search).has('noshadow');
    this.renderer.shadowMap.enabled = !this.lowGfx;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 180, 620);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(30, 40, 220);

    // Sun and sky light; the sun follows Ray so shadows stay crisp.
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
    this.sun.position.set(120, 180, 60);
    this.sun.castShadow = !this.lowGfx;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -100;
    this.sun.shadow.camera.right = 100;
    this.sun.shadow.camera.top = 100;
    this.sun.shadow.camera.bottom = -100;
    this.sun.shadow.camera.far = 500;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));

    this.audio = new AudioEngine();
    this.input = new Input(this.canvas);
    this.city = new City(this.scene);
    this.traffic = new Traffic(this.scene, this.city);
    this.pedestrians = new Pedestrians(this.scene, this.city);
    this.player = new Player(this.scene, this.camera, this.city, this.input);
    this.police = new Police(this.scene, this.city, this.audio);
    this.combat = new Combat(this.scene, this.camera, this.audio, this.input);
    this.missions = new Missions(this.scene);
    this.hud = new Hud();

    this.state = 'title';
    this.cash = 150;
    this.elapsed = 0;
    this.saveTimer = 0;
    this.lastPedStar = -10;
    this.lastShotStar = -10;
    this.titleAngle = 0;
    this.shot = shotFromUrl();
    this.shotStaged = false;

    this.wireHud();
    window.addEventListener('resize', () => this.onResize());
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  wireHud() {
    this.hud.onNewGame = () => this.newGame();
    this.hud.onContinue = () => this.continueGame();
    this.hud.onResume = () => this.resume();
    this.hud.onSave = () => {
      if (this.saveNow()) this.hud.message('Game saved.', 3);
      else this.hud.message('Could not save in this browser.', 3);
    };
    this.hud.onRestart = () => {
      clearSave();
      this.newGame();
    };
    this.hud.onQuit = () => this.toTitle();
    this.hud.onRespawn = () => this.respawnAfterEnd();
    this.hud.showTitle(hasSave());
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Shared start-of-play setup: audio, HUD, camera lock. */
  beginPlay() {
    this.audio.unlock();
    this.audio.musicOn = true;
    this.audio.welcome();
    this.state = 'playing';
    this.hud.hideTitle();
    this.hud.hidePause();
    this.hud.hideEnd();
    this.input.requestLock();
  }

  newGame() {
    clearSave();
    this.cash = 150;
    this.elapsed = 0;
    this.player.respawn(START_POS.x, START_POS.z);
    this.police.clearStars();
    this.combat.clearEnemies();
    this.missions.index = 0;
    this.missions.storyDone = false;
    this.beginPlay();
    this.missions.start(this.missionCtx());
    this.hud.message('Ray Delgado — new in town, broke, and ready.', 5);
  }

  continueGame() {
    const data = loadGame();
    if (!data) {
      this.newGame();
      return;
    }
    this.cash = typeof data.cash === 'number' ? data.cash : 150;
    this.elapsed = typeof data.elapsed === 'number' ? data.elapsed : 0;
    this.player.respawn(data.x ?? START_POS.x, data.z ?? START_POS.z);
    this.player.health = data.health ?? 100;
    this.player.armor = data.armor ?? 0;
    this.police.clearStars();
    this.combat.clearEnemies();
    this.missions.index = data.missionIndex ?? 0;
    this.missions.storyDone = !!data.storyDone;
    this.beginPlay();
    if (!this.missions.storyDone) this.missions.start(this.missionCtx());
    else this.hud.message('Welcome back, Ray. Solmar is still yours.', 4);
  }

  toTitle() {
    this.state = 'title';
    this.input.releaseLock();
    this.hud.showTitle(hasSave());
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.releaseLock();
    this.hud.showPause();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.hidePause();
    this.input.requestLock();
  }

  respawnAfterEnd() {
    this.hud.hideEnd();
    this.police.clearStars();
    this.combat.clearEnemies();
    if (this.endKind === 'wasted') {
      this.player.respawn(HOSPITAL_POS.x, HOSPITAL_POS.z);
      this.hud.message('You woke up at St. Marina Hospital. The bill stings.', 4);
    } else {
      this.player.respawn(GARAGE_POS.x, GARAGE_POS.z - 14);
      this.hud.message('The SBPD let you go. Vera is not impressed.', 4);
    }
    this.state = 'playing';
    this.input.requestLock();
  }

  missionCtx() {
    return {
      hud: this.hud,
      audio: this.audio,
      combat: this.combat,
      police: this.police,
      input: this.input,
      onMissionComplete: (reward, name) => this.onMissionComplete(reward, name),
    };
  }

  onMissionComplete(reward, name) {
    this.cash += reward;
    this.hud.message(`Mission complete: ${name} — +$${reward}`, 5);
    this.saveNow();
  }

  saveNow() {
    return saveGame({
      cash: this.cash,
      missionIndex: this.missions.index,
      storyDone: this.missions.storyDone,
      x: this.player.position.x,
      z: this.player.position.z,
      health: this.player.health,
      armor: this.player.armor,
      elapsed: this.elapsed,
    });
  }

  damagePlayer(amount) {
    if (this.state !== 'playing') return;
    const died = this.player.damage(amount);
    this.hud.flashDamage();
    if (died) {
      this.endKind = 'wasted';
      this.cash = Math.max(0, this.cash - 100);
      this.state = 'ended';
      this.input.releaseLock();
      this.hud.showEnd('wasted', 'Ray went down. The hospital patched him up — for $100.');
    }
  }

  onBusted() {
    if (this.state !== 'playing') return;
    this.endKind = 'busted';
    this.cash = Math.max(0, this.cash - 150);
    this.state = 'ended';
    this.input.releaseLock();
    this.hud.showEnd('busted', 'The SBPD caught Ray. Bail set him back $150.');
  }

  /** Stealing a car: loud if a cop is watching, quiet otherwise. */
  onSteal(vehicle) {
    vehicle.stolen = true;
    let watched = false;
    for (const c of this.police.cars) {
      if (Math.hypot(c.vehicle.position.x - this.player.position.x, c.vehicle.position.z - this.player.position.z) < 70) watched = true;
    }
    for (const o of this.police.officers) {
      if (Math.hypot(o.pos.x - this.player.position.x, o.pos.z - this.player.position.z) < 70) watched = true;
    }
    if (watched || this.police.stars > 0) {
      this.police.addStars(1);
      this.hud.message('Caught stealing! The SBPD is on you.', 4);
    } else {
      this.hud.message(`Stolen: ${vehicle.spec.name}. Keep it quiet.`, 3);
    }
  }

  handleInteract() {
    if (!this.input.wasPressed('KeyE')) return;
    const player = this.player;
    if (player.inCar) {
      const v = player.exitCar();
      if (v) this.traffic.release(v);
      return;
    }
    // A hold-step target takes priority over car entry.
    const step = this.missions.step;
    if (this.missions.active && step && step.type === 'hold') {
      const d = Math.hypot(player.position.x - step.x, player.position.z - step.z);
      if (d < step.radius) return;
    }
    const near = this.traffic.nearestTo(player.position.x, player.position.z, PLAYER_TUNING.enterCarRange);
    if (!near) return;
    if (near.driver === 'traffic' && Math.abs(near.speed) > 6) {
      this.hud.message('Too fast to grab!', 2);
      return;
    }
    this.traffic.claim(near);
    player.enterCar(near);
    player.camYaw = near.heading;
    this.onSteal(near);
  }

  promptText() {
    const player = this.player;
    if (player.inCar) return 'E — Exit car';
    const step = this.missions.step;
    if (this.missions.active && step && step.type === 'hold') {
      const d = Math.hypot(player.position.x - step.x, player.position.z - step.z);
      if (d < step.radius) return 'Hold E — ' + step.text.replace(/^Hold E to /, '');
    }
    const near = this.traffic.nearestTo(player.position.x, player.position.z, PLAYER_TUNING.enterCarRange);
    if (near) return `E — Steal the ${near.spec.name}`;
    return null;
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state === 'title') {
      this.updateTitle(dt);
    } else if (this.state === 'playing') {
      this.updatePlaying(dt);
    }
    // The sun tracks Ray so shadows stay sharp wherever he goes.
    this.sun.position.set(this.player.position.x + 90, 150, this.player.position.z + 50);
    this.sun.target.position.copy(this.player.position);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  updateTitle(dt) {
    this.titleAngle += dt * 0.03;
    const cx = Math.sin(this.titleAngle) * 150;
    const cz = 60 + Math.cos(this.titleAngle) * 150;
    this.camera.position.set(cx, 55, cz);
    this.camera.lookAt(0, 0, 60);
    this.city.update(dt, this.clock.elapsedTime);
    this.traffic.update(dt, { x: 0, z: 60 }, null);
    this.pedestrians.update(dt, { x: 0, z: 60 });
    // A staged screenshot starts the game on its own.
    if (this.shot && this.shot !== 'start' && !this.shotStaged) {
      this.shotStaged = true;
      this.newGame();
      stageShot(this.shot, this);
      window.__solmarShotReady = true;
    }
  }

  updatePlaying(dt) {
    this.elapsed += dt;
    // Pause and mute.
    if (this.input.wasPressed('Escape') || this.input.wasPressed('KeyP')) {
      this.pause();
      return;
    }
    if (this.input.wasPressed('KeyM')) {
      this.audio.setMuted(!this.audio.muted);
      this.hud.message(this.audio.muted ? 'Sound off' : 'Sound on', 2);
    }
    // Clicking the canvas re-locks the mouse.
    if (this.input.wasClicked() && !this.input.locked) this.input.requestLock();

    this.handleInteract();
    this.city.update(dt, this.clock.elapsedTime);
    this.traffic.update(dt, this.player.position, (impact) => this.audio.crash(impact / 30));
    this.pedestrians.update(dt, this.player.position);
    this.player.update(dt, {
      pedestrians: this.pedestrians,
      onCrash: (impact) => this.audio.crash(impact / 30),
      onHitPed: (n) => {
        if (this.elapsed - this.lastPedStar > 3) {
          this.lastPedStar = this.elapsed;
          if (this.police.addStars(1)) this.hud.message('You hit a pedestrian!', 3);
        }
      },
    });
    this.police.update(dt, this.player, {
      damagePlayer: (n) => this.damagePlayer(n),
      onCrash: (impact) => this.audio.crash(impact / 30),
      onBusted: () => this.onBusted(),
      onStarFall: (stars) => {
        if (stars > 0) this.hud.message('The heat is cooling off…', 3);
        else this.hud.message('You lost them.', 3);
      },
      onCleared: () => this.hud.message('Safe in the garage. The SBPD lost the trail.', 4),
    });
    this.combat.update(dt, this.player, {
      police: this.police,
      pedestrians: this.pedestrians,
      traffic: this.traffic,
      city: this.city,
      damagePlayer: (n) => this.damagePlayer(n),
      onShoot: () => {
        if (this.elapsed - this.lastShotStar > 5) {
          this.lastShotStar = this.elapsed;
          this.police.addStars(1);
        }
      },
      onKillCop: () => {
        this.police.addStars(2);
        this.hud.message('You dropped an officer. The whole city is coming.', 4);
      },
      onKillEnemy: () => {
        this.cash += 50;
        this.hud.message('Breaker down — +$50', 2);
      },
      onHitPed: () => {
        if (this.elapsed - this.lastPedStar > 3) {
          this.lastPedStar = this.elapsed;
          this.police.addStars(1);
        }
      },
      onPickup: (kind) => this.hud.message(kind === 'health' ? 'Health +50' : 'Armor +50', 2),
    });
    this.missions.update(dt, this.player, this.missionCtx());

    // Cars that hit Ray on foot knock him down: damage plus a shove away
    // from the car, at most once a second.
    if (!this.player.inCar) {
      this.carHitCooldown = Math.max(0, (this.carHitCooldown || 0) - dt);
      const px = this.player.position.x;
      const pz = this.player.position.z;
      let hitCar = null;
      for (const v of this.traffic.allVehicles()) {
        if (Math.abs(v.speed) > 3 && Math.hypot(v.position.x - px, v.position.z - pz) < 2.1) { hitCar = v; break; }
      }
      if (!hitCar) {
        for (const c of this.police.cars) {
          const v = c.vehicle;
          if (Math.abs(v.speed) > 3 && Math.hypot(v.position.x - px, v.position.z - pz) < 2.1) { hitCar = v; break; }
        }
      }
      if (hitCar && this.carHitCooldown <= 0) {
        this.carHitCooldown = 1;
        const dx = px - hitCar.position.x;
        const dz = pz - hitCar.position.z;
        const d = Math.hypot(dx, dz) || 1;
        this.player.position.x += (dx / d) * 3;
        this.player.position.z += (dz / d) * 3;
        this.audio.crash(0.5);
        this.damagePlayer(12);
      }
    }

    // Engine and siren follow the action; music keeps its soft pulse.
    this.audio.updateEngine(
      this.player.inCar ? Math.abs(this.player.vehicle.speed) / this.player.vehicle.spec.topSpeed : 0,
      this.player.inCar,
    );
    this.audio.updateSiren(dt, this.police.sirenNear(this.player.position));
    this.audio.updateMusic(dt);

    // Autosave every 30 seconds.
    this.saveTimer += dt;
    if (this.saveTimer > 30) {
      this.saveTimer = 0;
      this.saveNow();
    }

    // Hold-step progress bar.
    const step = this.missions.step;
    if (this.missions.active && step && step.type === 'hold' && this.missions.holdProgress > 0) {
      this.hud.setHold(this.missions.holdProgress / step.holdSeconds);
    } else {
      this.hud.setHold(null);
    }
    this.hud.setPrompt(this.promptText());
    this.hud.update(dt, {
      cash: this.cash,
      health: this.player.health,
      armor: this.player.armor,
      stars: this.police.stars,
      speedKmh: this.player.speedKmh,
      inCar: this.player.inCar,
      vehicleName: this.player.vehicle ? this.player.vehicle.spec.name : '',
      weaponName: this.combat.spec.name,
      ammo: this.combat.ammo[this.combat.current],
      reserve: this.combat.reserve[this.combat.current],
      reloading: this.combat.reloading > 0,
      objective: this.missions.objectiveText(this.player.position),
      elapsed: this.elapsed,
      playing: true,
      playerX: this.player.position.x,
      playerZ: this.player.position.z,
      headingX: this.player.inCar ? -Math.sin(this.player.vehicle.heading) : Math.sin(this.player.heading),
      headingZ: this.player.inCar ? -Math.cos(this.player.vehicle.heading) : Math.cos(this.player.heading),
      missionTarget: this.missions.target,
      policeCars: this.police.cars.map((c) => ({ x: c.vehicle.position.x, z: c.vehicle.position.z })),
      enemies: this.combat.enemies.filter((e) => e.health > 0).map((e) => ({ x: e.pos.x, z: e.pos.z })),
    });
  }
}

// Boot the game and expose a read-only handle for play-testing.
const game = new Game();
window.__solmar = game;
