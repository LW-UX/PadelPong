const test = require('node:test');
const assert = require('node:assert/strict');

// Simulated Realtime: per-channel fan-out with a fixed one-way delay, counting
// billed messages (one sent plus one per receiver) like Supabase does.
async function harness({ latency = 0 } = {}) {
  const { DoublesSession, DOUBLES, seatBody } = await import('../src/online-doubles.mjs');
  let now = 0, pending = [], rooms = [], billed = 0;
  const endpoints = [];
  const connect = (_, callbacks) => {
    const endpoint = { callbacks, channels: new Set(), active: true, online: true };
    endpoints.push(endpoint); pending.push({ at: now, run: () => callbacks.onStatus(true) });
    return {
      join(name) { endpoint.channels.add(name); },
      leave(name) { endpoint.channels.delete(name); },
      send(name, data) {
        if (!endpoint.active || !endpoint.online || !endpoint.channels.has(name)) return false;
        const receivers = endpoints.filter(e => e !== endpoint && e.active && e.online && e.channels.has(name));
        billed += 1 + receivers.length;
        receivers.forEach(e => {
          const copy = structuredClone(data);
          pending.push({ at: now + latency, run: () => { if (e.active && e.online) e.callbacks.onMessage(name, copy); } });
        });
        return true;
      },
      close() { endpoint.active = false; }
    };
  };
  function flush() {
    for (;;) {
      const due = pending.filter(p => p.at <= now);
      if (!due.length) return;
      pending = pending.filter(p => p.at > now);
      due.forEach(p => p.run());
    }
  }
  const inputs = new Map();
  let seed = 11; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  function add(role, id, code = 'K7MX4P') {
    inputs.set(id, { x: 0, y: 0 });
    const room = new DoublesSession({ role, id, code, connect, now: () => now, readInput: () => inputs.get(id), random });
    rooms.push(room); flush(); return room;
  }
  function advance(ms) {
    for (let elapsed = 0; elapsed < ms; elapsed += 10) {
      now += 10; rooms.forEach(r => r.tick()); flush(); rooms.forEach(r => r.advance(.01)); flush();
    }
  }
  function link(room, online) {
    const e = endpoints[rooms.indexOf(room)]; e.online = online; e.callbacks.onStatus(online); flush();
  }
  const host = add('host', 'host'); advance(900);
  return { host, add, advance, flush, link, inputs, DOUBLES, seatBody, billed: () => billed, resetBilled: () => { billed = 0; } };
}
async function fullRoom(options) {
  const h = await harness(options);
  const guests = ['g2', 'g3', 'g4'].map(id => h.add('guest', id));
  h.advance(600);
  return { ...h, guests, all: [h.host, ...guests] };
}
function readyAll(h) { h.all.forEach(r => r.requestReady()); h.advance(50); }

test('four players fill balanced seats; a fifth is rejected', async () => {
  const h = await fullRoom();
  assert.deepEqual(h.host.seats.map(s => s?.id), ['host', 'g3', 'g2', 'g4']);
  assert.deepEqual(h.guests.map(g => g.seat), [2, 1, 3]);
  assert.ok(h.all.every(r => r.stage === 'waiting' && r.playerCount === 4));
  const fifth = h.add('guest', 'g5'); h.advance(600);
  assert.equal(fifth.stage, 'ended'); assert.match(fifth.message, /voll/);
});

test('a match starts only when all four are ready; seat changes clear readiness', async () => {
  const h = await harness();
  const a = h.add('guest', 'a'); h.advance(600);
  h.host.requestReady(); a.requestReady(); h.advance(100);
  assert.equal(h.host.stage, 'waiting');
  const [b, c] = [h.add('guest', 'b'), h.add('guest', 'c')]; h.advance(600);
  b.requestReady(); h.advance(100);
  assert.equal(h.host.stage, 'waiting');
  // Swapping into an occupied seat exchanges both players and resets everyone.
  c.requestSeat(0); h.advance(100);
  assert.equal(c.seat, 0); assert.equal(h.host.seat, 3);
  assert.ok(h.host.seats.every(s => !s.ready));
  [h.host, a, b, c].forEach(r => r.requestReady()); h.advance(100);
  assert.equal(h.host.stage, 'countdown');
  h.advance(h.DOUBLES.countdown + 200);
  assert.ok([h.host, a, b, c].every(r => r.stage === 'playing'));
});

test('each player steers exactly one paddle, rotated correctly for both teams', async () => {
  const h = await fullRoom();
  readyAll(h); h.advance(h.DOUBLES.countdown + 100);
  // g2 sits in Team Korall on the left of its own view: world lane 1.
  h.inputs.set('g2', { x: -1, y: -1 }); h.inputs.set('host', { x: 1, y: 0 });
  h.advance(400);
  const [korall, gelb] = h.host.state.teams;
  assert.ok(korall.players[1].offset > 1, 'Korall left moves to its own left, world +x');
  assert.ok(korall.players[1].y > 3, 'Korall forward moves towards the net');
  assert.equal(korall.players[0].offset, 0); assert.equal(korall.players[0].y, 3);
  assert.ok(gelb.players[0].offset > 1); assert.equal(gelb.players[1].offset, 0);
  const view = h.guests[0].view();
  assert.equal(view.me.lane, 0); assert.equal(view.teams[1].tint, 'korall');
  assert.ok(view.teams[1].players[0].offset < -1, 'own paddle moves left on own screen');
  assert.ok(view.teams[1].players[0].y < 17, 'own paddle moves up on own screen');
});

test('own-paddle prediction stays close to the host despite latency and does not lag behind', async () => {
  const h = await fullRoom({ latency: 60 });
  readyAll(h); h.advance(h.DOUBLES.countdown + 300);
  const guest = h.guests[1]; // Gelb right, world lane 1
  h.inputs.set('g3', { x: 0, y: -1 });
  h.advance(250);
  const predicted = guest.predicted.y, host = h.host.state.teams[1].players[1].y;
  assert.ok(predicted < host, 'prediction leads the delayed host position');
  assert.ok(17 - predicted > 0.9, 'local paddle moved at nearly full speed');
  h.inputs.set('g3', { x: 0, y: 0 }); h.advance(800);
  assert.ok(Math.abs(guest.predicted.y - h.host.state.teams[1].players[1].y) < 0.05, 'converges once still');
  assert.ok(guest.rtt >= 100 && guest.rtt < 260);
});

test('guest view keeps the ball moving between snapshots and stays near the host', async () => {
  const h = await fullRoom({ latency: 40 });
  readyAll(h); h.advance(h.DOUBLES.countdown + 200);
  const guest = h.guests[1];
  const positions = [];
  for (let i = 0; i < 6; i++) { h.advance(20); positions.push(guest.view().ball.y); }
  assert.equal(new Set(positions).size, positions.length, 'ball moves every frame');
  const view = guest.view(), hostBall = h.host.state.ball;
  assert.ok(Math.hypot(view.ball.x - hostBall.x, view.ball.y - hostBall.y) < 1.2);
});

test('pause, lost players and leaving: hold, resume and abort to the lobby', async () => {
  const h = await fullRoom();
  readyAll(h); h.advance(h.DOUBLES.countdown + 500);
  h.guests[2].requestPause(); h.advance(100);
  assert.ok(h.all.every(r => r.stage === 'paused'));
  const time = h.host.state.time; h.advance(500); assert.equal(h.host.state.time, time);
  readyAll(h); h.advance(h.DOUBLES.countdown + 100);
  assert.ok(h.all.every(r => r.stage === 'playing'));
  h.link(h.guests[0], false); h.advance(h.DOUBLES.silence + 100);
  assert.equal(h.host.stage, 'paused'); assert.match(h.host.message, /Spieler 2/);
  h.link(h.guests[0], true); h.advance(700);
  assert.ok(!h.host.interrupted); assert.equal(h.host.stage, 'paused');
  h.guests[1].leave(); h.advance(100);
  assert.equal(h.host.stage, 'waiting'); assert.equal(h.host.playerCount, 3);
  assert.match(h.guests[0].message, /abgebrochen/);
  assert.equal(h.host.state.score.join(), '0,0');
  const late = h.add('guest', 'late'); h.advance(600);
  assert.equal(late.seat, 1); assert.equal(h.host.playerCount, 4);
  h.host.leave(); h.advance(100);
  assert.ok(h.guests.every(g => g === h.guests[1] || g.closed));
});

test('forged or foreign messages cannot move seats, ready players or change state', async () => {
  const h = await fullRoom();
  const before = structuredClone(h.host.seats);
  const topic = h.host.inputTopic('g2');
  h.host.receive(topic, { v: h.DOUBLES.protocol, from: 'g3', to: 'host', type: 'seat', seat: 0 });
  h.host.receive(h.host.mainTopic, { v: h.DOUBLES.protocol, from: 'g2', to: 'host', type: 'ready', epoch: h.host.epoch, value: true });
  h.host.receive(topic, { v: h.DOUBLES.protocol, from: 'g2', to: 'host', type: 'ready', epoch: h.host.epoch - 1, value: true });
  assert.deepEqual(h.host.seats, before);
  const guest = h.guests[0], revision = guest.receivedRevision;
  guest.receive(guest.mainTopic, { v: h.DOUBLES.protocol, from: 'g3', type: 'snapshot', revision: revision + 5 });
  guest.receive(guest.mainTopic, { v: h.DOUBLES.protocol, from: 'host', type: 'snapshot', revision: revision + 5, state: { score: [7, 0] } });
  assert.equal(guest.receivedRevision, revision);
});

test('message budget: a running 2v2 room stays near 100 billed messages per second', async () => {
  const h = await fullRoom({ latency: 30 });
  readyAll(h); h.advance(h.DOUBLES.countdown + 200);
  h.inputs.set('host', { x: 1, y: 0 }); h.inputs.set('g2', { x: -1, y: 0 });
  h.resetBilled(); h.advance(5000);
  const perSecond = h.billed() / 5;
  assert.ok(perSecond < 110, `billed ${perSecond}/s`);
  const size = JSON.stringify(h.host.state).length;
  assert.ok(size < 8000, `snapshot ${size} chars`);
});

test('a finished match offers a rematch with fresh teams', async () => {
  const h = await fullRoom();
  readyAll(h); h.advance(h.DOUBLES.countdown + 100);
  h.host.state.score = [6, 0]; h.host.state.phase = 'rally';
  Object.assign(h.host.state.ball, { lastHit: 0, bounces: 1, feed: false, z: 0.01, vz: -3, y: 15, contactSide: null });
  h.advance(200);
  assert.ok(h.all.every(r => r.stage === 'over'));
  assert.equal(h.guests[0].view().winner, 1, 'Korall view: Korall won');
  assert.equal(h.guests[1].view().winner, 0);
  const partner = () => h.host.seats.find((s, i) => s && s.id !== 'host' && (i < 2) === (h.host.seat < 2)).id;
  for (let i = 0; i < 5; i++) {
    const before = partner();
    h.host.shuffleTeams(); h.advance(100);
    assert.notEqual(partner(), before, 'every shuffle changes the pairing');
  }
  assert.ok(h.host.canChangeSeat);
  readyAll(h); h.advance(100);
  assert.equal(h.host.stage, 'countdown'); assert.equal(h.host.state.score.join(), '0,0');
});

test('doubles physics: only the paddle where a player stands hits, and partners share one team contact', async () => {
  const p = await import('../src/physics.mjs');
  const rally = () => {
    const s = p.createState({ doubles: true }); s.phase = 'rally';
    Object.assign(s.ball, { x: 2.5, y: 15.5, z: 0.6, vx: 0, vy: 6, vz: 0, lastHit: 0, bounces: 1, feed: false, contactSide: null });
    return s;
  };
  const moved = rally();
  moved.teams[1].players[0].y = 19; // left player steps back, right player stays at 17
  Object.assign(moved.ball, { y: 18.2, z: 0.8, vz: 2 });
  p.stepDoubles(moved, [[{ x: 0, y: 0 }, { x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: 0 }]]);
  for (let i = 0; i < 20; i++) p.simulateBall(moved, 1 / 60);
  assert.equal(moved.ball.lastHit, 1, 'the left player still reaches the ball deeper in the court');
  assert.ok(moved.ball.vy < 0);
  const missed = rally();
  missed.teams[1].players[0].offset = 1.8; missed.teams[1].players[1].offset = 1.8; // both shifted right
  Object.assign(missed.ball, { x: 1.2 });
  for (let i = 0; i < 30; i++) p.simulateBall(missed, 1 / 60);
  assert.equal(missed.ball.lastHit, 0, 'no paddle at x 1.2, so the ball passes');
  const double = rally();
  Object.assign(double.ball, { lastHit: 1, x: 7.5 });
  for (let i = 0; i < 20 && double.phase === 'rally'; i++) p.simulateBall(double, 1 / 60);
  assert.equal(double.phase, 'point'); assert.match(double.message, /Doppelkontakt/);
});

test('reset leaves no doubles leftovers when returning to a classic match', async () => {
  const p = await import('../src/physics.mjs');
  const s = Object.assign(p.createState({ doubles: true }), { me: { side: 1, lane: 0 } });
  p.reset(s, { doubles: false });
  assert.equal(s.doubles, undefined); assert.equal(s.me, undefined);
  assert.equal(s.teams[1].players, undefined); assert.equal(s.teams[1].offset, 0);
});
