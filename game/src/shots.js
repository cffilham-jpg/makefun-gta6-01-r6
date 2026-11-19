// Solmar Bay — screenshot staging. The maker takes the entry's screenshots
// with ?shot=<scene> in the URL, which drops Ray into a real, playable
// moment of the game: driving down the main avenue, mid police chase, or a
// mission in progress. The staged scenes use the game's own systems — no
// fake renders, just a starting position and a wanted level.

import { GARAGE_POS } from './config.js';

export const SHOT_NAMES = ['start', 'drive', 'chase', 'mission'];

export function shotFromUrl() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  return SHOT_NAMES.includes(shot) ? shot : null;
}

/**
 * Stage a scene after the game has started. Called once, right after the
 * first frame, so every system is live and the shot shows the real game.
 */
export function stageShot(shot, game) {
  if (shot === 'start') return; // the title screen is the shot
  const { player, traffic, police, missions, hud } = game;
  if (shot === 'drive' || shot === 'chase' || shot === 'mission') {
    // Put Ray in the Falcon GT, rolling down a main avenue. The mission
    // shot starts near the docks so the yellow beacon is in frame.
    const car = traffic.parked.find((v) => v.missionCar) || traffic.parked[0];
    if (car) {
      const startX = shot === 'mission' ? 60 : 0;
      const startZ = shot === 'mission' ? 200 : 60;
      car.position.set(startX, 0, startZ);
      car.heading = Math.PI;
      car.speed = shot === 'mission' ? 10 : 14;
      car.group.position.copy(car.position);
      car.group.rotation.y = car.heading;
      traffic.claim(car);
      player.enterCar(car);
      player.camYaw = Math.PI;
      player.camPitch = 0.35;
    }
  }
  if (shot === 'chase') {
    police.setStars(3);
    // Two interceptors ahead of Ray, converging on him head-on, so the
    // chase is in frame at once with their light bars flashing.
    police.spawnCarNear({ x: player.position.x, z: player.position.z - 30 });
    police.spawnCarNear({ x: player.position.x + 20, z: player.position.z - 40 });
    const spots = [{ x: 5, z: 85 }, { x: -5, z: 100 }];
    for (let i = 0; i < police.cars.length && i < spots.length; i++) {
      const v = police.cars[i].vehicle;
      v.position.set(spots[i].x, 0, spots[i].z);
      v.heading = 0; // facing Ray, head-on
      v.group.position.copy(v.position);
      v.group.rotation.y = v.heading;
    }
    hud.message('The SBPD is on your tail!', 4);
  }
  if (shot === 'mission') {
    missions.index = 2; // Harbor Run
    missions.start({
      hud, audio: game.audio, combat: game.combat, police, input: game.input,
      onMissionComplete: game.onMissionComplete.bind(game),
    });
    hud.message('Harbor Run — grab the package at the docks', 5);
  }
  if (shot === 'drive') {
    hud.message('Solmar Bay — the whole city is yours', 5);
  }
  void GARAGE_POS;
}
