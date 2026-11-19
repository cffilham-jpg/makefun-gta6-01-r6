// Solmar Bay — saving Ray's progress to localStorage: cash, mission,
// position and health. The game autosaves after every mission and whenever
// the player saves from the pause menu.

import { SAVE_KEY } from './config.js';

export function hasSave() {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch (_) {
    return false;
  }
}

export function saveGame(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (_) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch (_) {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (_) { /* storage may be unavailable; the game still runs */ }
}
