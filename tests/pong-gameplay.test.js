const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const physics = import('../src/physics.mjs');
const gameplay = import('../src/gameplay.mjs');
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('gameplay choice defaults safely, persists and exposes the 85 percent local rate', async () => {
  const g = await gameplay;
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    let stored = null;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => stored, setItem: (_, value) => { stored = value; } } });
    assert.equal(g.readGameplay(), g.GAMEPLAY.standard.id);
    g.saveGameplay(g.GAMEPLAY.lobSmash.id);
    assert.equal(g.readGameplay(), g.GAMEPLAY.lobSmash.id);
    assert.equal(g.gameplayConfig(g.GAMEPLAY.lobSmash.id).simulationRate, 0.85);
    stored = 'unknown'; assert.equal(g.readGameplay(), g.GAMEPLAY.standard.id);
    assert.throws(() => g.requireGameplay('experiment'));
  } finally { if (old) Object.defineProperty(globalThis, 'localStorage', old); else delete globalThis.localStorage; }
});

test('a queued lob reaches 4.5 metres and lands two metres before either back wall', async () => {
  const p = await physics, { GAMEPLAY } = await gameplay;
  for (const side of [0, 1]) {
    const state = p.createState({ variant: GAMEPLAY.lobSmash.id }); state.phase = 'rally';
    Object.assign(state.ball, { x: 5, y: side ? 17 : 3, z: .8, lastHit: 1 - side, feed: false });
    state.pendingLob[side] = true;
    p.hitBall(state, side, 5);
    const apex = state.ball.z + state.ball.vz * state.ball.vz / (2 * p.C.gravity);
    near(apex, 4.5); near(p.predictLanding(state.ball).y, side ? 2 : 18);
    assert.equal(state.ball.shotType, 'lob'); assert.equal(state.lastShot, 'lob');
    assert.equal(state.pendingLob[side], false);
  }
});

function incomingLob(p, GAMEPLAY, { teamY = 13, z = 2.2, vz = -2, pending = false, shotType = 'lob' } = {}) {
  const state = p.createState({ variant: GAMEPLAY.lobSmash.id }); state.phase = 'rally';
  Object.assign(state.teams[1], { y: teamY, offset: 0, vx: 0, vy: 0 });
  Object.assign(state.ball, { x: 2.5, y: teamY - .5, z, vx: 0, vy: 12, vz, lastHit: 0, bounces: 0, feed: false, contactSide: null, shotType });
  state.pendingLob[1] = pending;
  return state;
}

test('a falling lob is smashed only inside the position and height window', async () => {
  const p = await physics, { GAMEPLAY } = await gameplay;
  const valid = incomingLob(p, GAMEPLAY);
  p.simulateBall(valid, .08);
  assert.equal(valid.lastShot, 'smash'); assert.equal(valid.ball.shotType, 'smash'); assert.equal(valid.rallyHits, 1);
  near(p.predictLanding(valid.ball).y, 5, 0.2);

  for (const state of [
    incomingLob(p, GAMEPLAY, { teamY: 14.01 }),
    incomingLob(p, GAMEPLAY, { vz: 2 }),
    incomingLob(p, GAMEPLAY, { shotType: 'normal' })
  ]) {
    p.simulateBall(state, .08);
    assert.equal(state.rallyHits, 0);
    assert.notEqual(state.ball.shotType, 'smash');
  }
});

test('a queued lob takes priority over an automatic smash and waits for normal reach', async () => {
  const p = await physics, { GAMEPLAY } = await gameplay;
  const high = incomingLob(p, GAMEPLAY, { pending: true });
  p.simulateBall(high, .08);
  assert.equal(high.rallyHits, 0); assert.equal(high.pendingLob[1], true);
  Object.assign(high.ball, { y: high.teams[1].y - .3, z: 1.5, vz: -2, contactSide: null });
  p.simulateBall(high, .05);
  assert.equal(high.rallyHits, 1); assert.equal(high.ball.shotType, 'lob'); assert.equal(high.pendingLob[1], false);
});

test('lob state clears after points and pauses while rematches retain the selected variant', async () => {
  const p = await physics, { GAMEPLAY } = await gameplay;
  const state = p.createState({ variant: GAMEPLAY.lobSmash.id }); state.phase = 'rally'; state.pendingLob = [true, true];
  p.pause(state); assert.deepEqual(state.pendingLob, [false, false]);
  p.start(state); state.pendingLob = [true, true]; p.awardPoint(state, 1, 'Test');
  assert.deepEqual(state.pendingLob, [false, false]);
  p.reset(state); assert.equal(state.variant, GAMEPLAY.lobSmash.id);
});

test('scaled simulation reaches 85 percent of standard time identically at 30 and 60 FPS', async () => {
  const p = await physics, { GAMEPLAY, gameplayConfig } = await gameplay;
  function run(variant, fps) {
    const state = p.createState({ variant }); p.start(state);
    const clock = p.createClock(() => p.step(state));
    for (let i = 0; i < fps * 10; i++) clock.advance(1 / fps * gameplayConfig(variant).simulationRate);
    return state.time;
  }
  near(run(GAMEPLAY.standard.id, 30), 10); near(run(GAMEPLAY.standard.id, 60), 10);
  near(run(GAMEPLAY.lobSmash.id, 30), 8.5); near(run(GAMEPLAY.lobSmash.id, 60), 8.5);
});

test('CPU chooses a lob once per incoming shot with difficulty-specific probability', async () => {
  const p = await physics, { GAMEPLAY } = await gameplay;
  const { createComputer } = await import('../src/computer.mjs');
  for (const [difficulty, expected] of [['easy', false], ['hard', true]]) {
    let calls = 0;
    const cpu = createComputer({ difficulty, random: () => { calls++; return .5; } });
    const state = p.createState({ variant: GAMEPLAY.lobSmash.id }); state.phase = 'rally';
    state.teams[1].y = 13; Object.assign(state.ball, { lastHit: 1, feed: false }); state.rallyHits = 1;
    cpu.read(state); cpu.read(state); cpu.read(state);
    assert.equal(state.pendingLob[0], expected); assert.equal(calls, difficulty === 'easy' ? 3 : 1);
  }
});

test('both CPU difficulties track and return a high human lob within their normal limits', async () => {
  const p = await physics, { GAMEPLAY } = await gameplay;
  const { createComputer } = await import('../src/computer.mjs');
  for (const difficulty of ['easy', 'hard']) {
    const state = p.createState({ variant: GAMEPLAY.lobSmash.id }); state.phase = 'rally';
    Object.assign(state.ball, { x: 5, y: 17, z: .8, lastHit: 0, feed: false });
    state.pendingLob[1] = true; p.hitBall(state, 1, 5);
    const cpu = createComputer({ difficulty, random: () => .99 });
    for (let i = 0; i < 600 && state.phase === 'rally' && state.ball.lastHit === 1; i++) p.step(state, { x: 0, y: 0 }, cpu.read(state), cpu.stroke);
    assert.equal(state.phase, 'rally'); assert.equal(state.ball.lastHit, 0); assert.equal(state.rallyHits, 2);
  }
});

test('Lob/Smash wins never create leaderboard entries and online remains Standard-only', async () => {
  const p = await physics, { GAMEPLAY } = await gameplay;
  const { winningEntry } = await import('../src/leaderboard.mjs');
  const { validSnapshot } = await import('../src/online.mjs');
  const special = p.createState({ variant: GAMEPLAY.lobSmash.id });
  Object.assign(special, { phase: 'over', winner: 1, score: [2, 7] });
  assert.equal(winningEntry(special, 'special', 'easy'), null);
  assert.equal(validSnapshot(special), false);
  assert.equal(validSnapshot(p.createState()), true);
});

test('the start menu names the variant Lob/Smash and explains its local controls', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '../src/main.mjs'), 'utf8');
  assert.match(html, /data-start-gameplay="lob-smash-v1"[^>]*>Lob\/Smash</);
  assert.match(main, /onlineButton\.disabled = special/);
  assert.doesNotMatch(html, /Online nur mit Standard/);
  assert.match(html, /Shift merkt den nächsten Lob vor/);
  assert.doesNotMatch(html, />Experiment</);
});
