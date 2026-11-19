// Solmar Bay — everything drawn in the DOM over the 3D view: the HUD
// (cash, health, armor, wanted stars, speed, weapon, objective), the
// live minimap, toast messages, the mission title card, and the title,
// pause and wasted/busted menus.

import { money } from './utils.js';

const MAP_SIZE = 180;
const MAP_RANGE = 640; // world units across the whole minimap

export class Hud {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'),
      cash: $('cash'),
      objective: $('objective'),
      stars: $('stars'),
      clock: $('clock'),
      healthFill: $('health-fill'),
      armorFill: $('armor-fill'),
      speed: $('speed'),
      weapon: $('weapon'),
      prompt: $('prompt'),
      crosshair: $('crosshair'),
      messages: $('messages'),
      missionTitle: $('mission-title'),
      missionTitleText: $('mission-title-text'),
      damageFlash: $('damage-flash'),
      holdBar: $('hold-bar'),
      holdFill: $('hold-fill'),
      menuTitle: $('menu-title'),
      menuPause: $('menu-pause'),
      menuEnd: $('menu-end'),
      endTitle: $('end-title'),
      endText: $('end-text'),
      btnContinue: $('btn-continue'),
      saveNote: $('save-note'),
    };
    this.mapCanvas = $('minimap');
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.mapStatic = document.createElement('canvas');
    this.mapStatic.width = MAP_SIZE;
    this.mapStatic.height = MAP_SIZE;
    this.buildStaticMap();
    this.toasts = [];
    this.missionTitleTimer = 0;
    // Callbacks main.js fills in.
    this.onNewGame = null;
    this.onContinue = null;
    this.onResume = null;
    this.onSave = null;
    this.onRestart = null;
    this.onQuit = null;
    this.onRespawn = null;
    this.wireButtons();
  }

  wireButtons() {
    const $ = (id) => document.getElementById(id);
    $('btn-new').addEventListener('click', () => this.onNewGame && this.onNewGame());
    $('btn-continue').addEventListener('click', () => this.onContinue && this.onContinue());
    $('btn-resume').addEventListener('click', () => this.onResume && this.onResume());
    $('btn-save').addEventListener('click', () => this.onSave && this.onSave());
    $('btn-restart').addEventListener('click', () => this.onRestart && this.onRestart());
    $('btn-quit').addEventListener('click', () => this.onQuit && this.onQuit());
    $('btn-respawn').addEventListener('click', () => this.onRespawn && this.onRespawn());
  }

  /** The unchanging part of the minimap: roads, water, the garage and bank. */
  buildStaticMap() {
    const g = this.mapStatic.getContext('2d');
    const s = MAP_SIZE / MAP_RANGE;
    const toMap = (x, z) => [(x + MAP_RANGE / 2) * s, (z + MAP_RANGE / 2) * s];
    g.fillStyle = '#2a2e26';
    g.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Water at the south edge.
    g.fillStyle = '#1e7fa8';
    const [, wy] = toMap(0, 268);
    g.fillRect(0, wy, MAP_SIZE, MAP_SIZE - wy);
    // Roads.
    g.strokeStyle = '#555a52';
    g.lineWidth = 3;
    for (let at = -300; at <= 300; at += 60) {
      const [x1] = toMap(at, 0);
      g.beginPath();
      g.moveTo(x1, 0);
      g.lineTo(x1, MAP_SIZE);
      g.stroke();
      const [, z1] = toMap(0, at);
      g.beginPath();
      g.moveTo(0, z1);
      g.lineTo(MAP_SIZE, z1);
      g.stroke();
    }
    // Garage (orange) and bank (gold) landmarks.
    const dot = (x, z, color) => {
      const [mx, mz] = toMap(x, z);
      g.fillStyle = color;
      g.beginPath();
      g.arc(mx, mz, 3.5, 0, Math.PI * 2);
      g.fill();
    };
    dot(30, 90, '#e8641e');
    dot(-30, -30, '#e8b400');
    dot(-90, -30, '#ffffff');
  }

  drawMinimap(state) {
    const g = this.mapCtx;
    const s = MAP_SIZE / MAP_RANGE;
    const toMap = (x, z) => [(x + MAP_RANGE / 2) * s, (z + MAP_RANGE / 2) * s];
    g.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    g.drawImage(this.mapStatic, 0, 0);
    // Mission target: pulsing yellow diamond.
    if (state.missionTarget) {
      const [mx, mz] = toMap(state.missionTarget.x, state.missionTarget.z);
      const pulse = 4 + Math.sin(performance.now() * 0.006) * 1.5;
      g.fillStyle = '#ffd24a';
      g.beginPath();
      g.moveTo(mx, mz - pulse);
      g.lineTo(mx + pulse, mz);
      g.lineTo(mx, mz + pulse);
      g.lineTo(mx - pulse, mz);
      g.closePath();
      g.fill();
    }
    // Police blips flash red/blue.
    const copColor = Math.floor(performance.now() / 350) % 2 === 0 ? '#ff3b3b' : '#3b7bff';
    g.fillStyle = copColor;
    for (const c of state.policeCars || []) {
      const [mx, mz] = toMap(c.x, c.z);
      g.beginPath();
      g.arc(mx, mz, 3, 0, Math.PI * 2);
      g.fill();
    }
    // Enemies are red dots.
    g.fillStyle = '#ff2222';
    for (const e of state.enemies || []) {
      const [mx, mz] = toMap(e.x, e.z);
      g.beginPath();
      g.arc(mx, mz, 3, 0, Math.PI * 2);
      g.fill();
    }
    // The player: a white triangle pointing along the heading.
    const [px, pz] = toMap(state.playerX, state.playerZ);
    g.save();
    g.translate(px, pz);
    g.rotate(Math.atan2(state.headingX, -state.headingZ));
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111111';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4.5, 5);
    g.lineTo(-4.5, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // North marker.
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = 'bold 11px sans-serif';
    g.fillText('N', MAP_SIZE / 2 - 4, 12);
  }

  message(text, seconds) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    this.el.messages.appendChild(div);
    const toast = { div, left: seconds || 4 };
    this.toasts.push(toast);
    while (this.toasts.length > 3) {
      const old = this.toasts.shift();
      old.div.remove();
    }
  }

  showMissionTitle(name) {
    this.el.missionTitleText.textContent = name;
    this.el.missionTitle.classList.remove('hidden');
    this.missionTitleTimer = 3;
  }

  flashDamage() {
    this.el.damageFlash.classList.remove('hidden');
    setTimeout(() => this.el.damageFlash.classList.add('hidden'), 220);
  }

  setPrompt(text) {
    if (text) {
      this.el.prompt.textContent = text;
      this.el.prompt.classList.remove('hidden');
    } else {
      this.el.prompt.classList.add('hidden');
    }
  }

  setHold(progress) {
    if (progress === null || progress <= 0) {
      this.el.holdBar.classList.add('hidden');
      return;
    }
    this.el.holdBar.classList.remove('hidden');
    this.el.holdFill.style.width = Math.round(progress * 100) + '%';
  }

  showTitle(hasSave) {
    this.el.menuTitle.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.menuPause.classList.add('hidden');
    this.el.menuEnd.classList.add('hidden');
    this.el.btnContinue.style.display = hasSave ? '' : 'none';
    this.el.saveNote.textContent = hasSave
      ? 'Save found — continue where Ray left off.'
      : 'No save yet — start a new story.';
  }

  hideTitle() {
    this.el.menuTitle.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
  }

  showPause() {
    this.el.menuPause.classList.remove('hidden');
  }

  hidePause() {
    this.el.menuPause.classList.add('hidden');
  }

  showEnd(kind, text) {
    this.el.endTitle.textContent = kind === 'wasted' ? 'WASTED' : 'BUSTED';
    this.el.endTitle.className = kind === 'wasted' ? 'end-wasted' : 'end-busted';
    this.el.endText.textContent = text;
    this.el.menuEnd.classList.remove('hidden');
  }

  hideEnd() {
    this.el.menuEnd.classList.add('hidden');
  }

  update(dt, state) {
    // Toast lifetimes.
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.left -= dt;
      if (t.left <= 0) {
        t.div.remove();
        this.toasts.splice(i, 1);
      }
    }
    if (this.missionTitleTimer > 0) {
      this.missionTitleTimer -= dt;
      if (this.missionTitleTimer <= 0) this.el.missionTitle.classList.add('hidden');
    }
    this.el.cash.textContent = money(state.cash);
    this.el.objective.textContent = state.objective;
    // Wanted stars: filled gold, empty dim.
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < state.stars ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.className = state.stars > 0 ? 'stars-hot' : '';
    const totalMinutes = 600 + Math.floor(state.elapsed);
    const hh = Math.floor(totalMinutes / 60) % 24;
    const mm = totalMinutes % 60;
    this.el.clock.textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    this.el.healthFill.style.width = Math.round(state.health) + '%';
    this.el.healthFill.className = 'fill ' + (state.health < 30 ? 'low' : '');
    this.el.armorFill.style.width = Math.round(state.armor) + '%';
    this.el.speed.textContent = state.inCar ? Math.round(state.speedKmh) + ' km/h' : '';
    this.el.weapon.textContent = state.inCar
      ? state.vehicleName
      : state.weaponName + '  ' + state.ammo + ' / ' + state.reserve + (state.reloading ? '  …' : '');
    this.el.crosshair.classList.toggle('hidden', state.inCar || !state.playing);
    this.drawMinimap(state);
  }
}
