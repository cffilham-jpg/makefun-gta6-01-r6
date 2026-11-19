// Solmar Bay — tuning constants, palettes, vehicle and weapon tables.
// Everything the designers tweak lives here, in one place.

export const WORLD = {
  halfSize: 310, // city spans -310..310 on x and z
  roadEvery: 60, // roads sit on multiples of 60
  roadWidth: 14,
  sidewalk: 5,
  blockSize: 60 - 14 - 10, // buildable ground inside one block
  waterLine: 268, // z beyond this is the marina water
  seed: 20261119,
};

export const PALETTE = {
  sky: 0x87c5e8,
  fog: 0x9fd0e8,
  ground: 0x8a8f7a,
  road: 0x3a3f46,
  sidewalk: 0xb8b0a0,
  sand: 0xe8d9a8,
  water: 0x1e7fa8,
  buildingTops: [0xd8d2c4, 0xc8b8a0, 0xb0c0c8, 0xd8c0b0, 0xc0c8b0],
  buildingSides: [0xe8e0d0, 0xd8c8b8, 0xc8d4dc, 0xe0d0c0, 0xd0d8c8, 0xc8b8c8],
  palmTrunk: 0x7a5a38,
  palmLeaf: 0x2f8f4e,
};

export const VEHICLE_TYPES = {
  sedan:   { name: 'Solmar Sedan',   topSpeed: 26, accel: 14, brake: 30, grip: 2.4, body: 0x3f6fb5, len: 4.4, wid: 1.9, seats: 4 },
  coupe:   { name: 'Azzurra Coupe',  topSpeed: 30, accel: 17, brake: 32, grip: 2.8, body: 0xc23b3b, len: 4.2, wid: 1.85, seats: 2 },
  taxi:    { name: 'Bay Cab',        topSpeed: 25, accel: 13, brake: 30, grip: 2.4, body: 0xe8b400, len: 4.4, wid: 1.9, seats: 4 },
  pickup:  { name: 'Dune Pickup',    topSpeed: 24, accel: 13, brake: 28, grip: 2.2, body: 0x4a7a3a, len: 4.8, wid: 2.0, seats: 2 },
  van:     { name: 'Harbor Van',     topSpeed: 21, accel: 11, brake: 26, grip: 2.0, body: 0xd8d8d8, len: 5.0, wid: 2.0, seats: 3 },
  sports:  { name: 'Falcon GT',      topSpeed: 38, accel: 22, brake: 36, grip: 3.2, body: 0xe8641e, len: 4.3, wid: 1.9, seats: 2 },
  muscle:  { name: 'V8 Bruiser',     topSpeed: 33, accel: 19, brake: 30, grip: 2.5, body: 0x222226, len: 4.7, wid: 2.0, seats: 2 },
  police:  { name: 'SBPD Interceptor', topSpeed: 34, accel: 20, brake: 38, grip: 3.0, body: 0x1c2f4a, len: 4.5, wid: 1.95, seats: 4 },
};

export const WEAPONS = {
  pistol:  { name: 'P9 Pistol',   damage: 34, rate: 0.28, range: 60, spread: 0.012, mag: 12, auto: false, kick: 0.5 },
  smg:     { name: 'K9 SMG',      damage: 16, rate: 0.09, range: 45, spread: 0.05,  mag: 30, auto: true,  kick: 0.25 },
  shotgun: { name: 'M870 Scatter', damage: 14, rate: 0.8,  range: 28, spread: 0.11,  mag: 6,  auto: false, kick: 1.4, pellets: 6 },
  rifle:   { name: 'AR-7 Carbine', damage: 45, rate: 0.16, range: 110, spread: 0.02, mag: 24, auto: true,  kick: 0.7 },
};

export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle'];

export const PLAYER_TUNING = {
  walkSpeed: 5.2,
  runSpeed: 8.6,
  jumpSpeed: 7.5,
  gravity: 20,
  maxHealth: 100,
  maxArmor: 100,
  enterCarRange: 3.4,
  interactRange: 3.2,
};

export const POLICE_TUNING = {
  maxStars: 5,
  carsPerStar: [0, 2, 3, 4, 5, 6],
  footCopsPerStar: [0, 0, 0, 2, 3, 4],
  loseSightSeconds: 9, // unseen this long before stars start to fall
  starFallSeconds: 7, // then one star falls every this many seconds
  bustRange: 5.5,
  bustSeconds: 3,
  sirenRange: 90,
};

export const SAVE_KEY = 'solmar-bay-save-v1';

export const START_POS = { x: 60, z: 150 };
export const GARAGE_POS = { x: 30, z: 90 };
export const HOSPITAL_POS = { x: -90, z: -10 };
