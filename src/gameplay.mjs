export const GAMEPLAY = Object.freeze({
  standard: Object.freeze({ id: 'standard', label: 'Standard', simulationRate: 1 }),
  lobSmash: Object.freeze({ id: 'lob-smash-v1', label: 'Lob/Smash', simulationRate: 0.85 })
});

const STORAGE_KEY = 'pong-gameplay-variant';

export function requireGameplay(value) {
  if (!Object.values(GAMEPLAY).some(variant => variant.id === value)) throw new Error('Ungültige Spielvariante.');
  return value;
}

export function gameplayConfig(value) {
  const id = requireGameplay(value);
  return Object.values(GAMEPLAY).find(variant => variant.id === id);
}

export function readGameplay() {
  try { return requireGameplay(localStorage.getItem(STORAGE_KEY) || GAMEPLAY.standard.id); }
  catch { return GAMEPLAY.standard.id; }
}

export function saveGameplay(value) {
  const id = requireGameplay(value);
  try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  return id;
}
