import { C, clamp, createState, createClock, start, pause, reset, stepDoubles, moveTeam, simulateBall, captureOrigins } from './physics.mjs?v=2026-11-12-doubles';
import { connectRealtimeChannels } from './realtime.mjs?v=2026-11-12-doubles';
import { ONLINE, cleanInput, normalizeCode, onlineSnapshot, validSnapshot } from './online.mjs?v=2026-11-12-doubles';

const ZERO = Object.freeze({ x: 0, y: 0 });
const EMPTY_INPUTS = () => [[ZERO, ZERO], [ZERO, ZERO]];
// Message budget: one 2v2 room plays at roughly 12.5 host snapshots per second
// (four billed messages each) plus change-driven inputs on private channels.
export const DOUBLES = Object.freeze({
  seats: 4, protocol: 1, prefix: 'pong-2v2',
  snapshotInterval: 80, lobbyInterval: 500,
  inputInterval: 80, inputKeepalive: 250, inputStale: 700, pingInterval: 500,
  silence: ONLINE.silence, expiry: ONLINE.expiry, joinTimeout: ONLINE.joinTimeout, countdown: ONLINE.countdown,
  smoothing: 0.08, snapDistance: 2.5, reconcileSnap: 1.5, reconcileRate: 0.35, historyLength: 90
});
// Seats 0–1 belong to Team Gelb (court side 1), seats 2–3 to Team Korall
// (court side 0). "Links/Rechts" is named from the seat holder's own view;
// Korall sees the court rotated, so its left paddle is world lane 1.
export const SEAT_ORDER = Object.freeze([0, 2, 1, 3]);
export function seatBody(seat) { return seat < 2 ? { team: 1, lane: seat } : { team: 0, lane: 3 - seat }; }
export const seatTeamName = seat => seat < 2 ? 'Gelb' : 'Korall';
export const seatLaneName = seat => seat % 2 === 0 ? 'Links' : 'Rechts';
const validId = id => typeof id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(id);
const quantize = v => Math.round(v * 10) / 10 || 0;
const rotate = (input, team) => team === 0 ? { x: -input.x || 0, y: -input.y || 0 } : input;
const REJECTIONS = Object.freeze({ full: 'Das Spiel ist bereits voll.', running: 'Die Partie läuft bereits. Versucht es nach dem Spiel erneut.' });

// Rotate the court for one team. Team colours stay fixed for every viewer,
// while the viewer's own team is always drawn at the bottom (side 1).
export function doublesPerspective(state, team) {
  const view = structuredClone(state);
  view.teams.forEach(t => { t.tint = t.side ? 'gelb' : 'korall'; });
  if (team === 0) {
    view.score.reverse();
    view.winner = view.winner === null ? null : 1 - view.winner;
    view.teams.reverse();
    view.teams.forEach((t, i) => {
      t.side = i;
      t.players.reverse();
      t.players.forEach(p => Object.assign(p, { side: i, offset: -p.offset, y: C.length - p.y, vx: -p.vx, vy: -p.vy }));
    });
    Object.assign(view.ball, { x: C.width - view.ball.x, y: C.length - view.ball.y, vx: -view.ball.vx, vy: -view.ball.vy, lastHit: 1 - view.ball.lastHit, contactSide: view.ball.contactSide == null ? null : 1 - view.ball.contactSide });
    view.effects.forEach(e => Object.assign(e, { x: C.width - e.x, y: C.length - e.y }));
  }
  if (['point', 'over'].includes(view.phase)) view.message = `${view.winner === 1 ? 'Euer Punkt' : 'Punkt Gegner'} · ${view.message.split(' · ').slice(1).join(' · ')}`;
  return view;
}
export function doublesSnapshot(state) {
  const snapshot = onlineSnapshot(state);
  // Sounds only need fresh effects; older ones would just inflate every message.
  snapshot.effects = snapshot.effects.filter(e => e.age < 1);
  return snapshot;
}
export const validDoublesSnapshot = s => validSnapshot(s, { doubles: true });
function validSeats(seats) {
  return Array.isArray(seats) && seats.length === DOUBLES.seats && seats.every(s => s === null || (
    s && validId(s.id) && Number.isInteger(s.n) && s.n >= 1 && s.n <= 4 && typeof s.ready === 'boolean' && typeof s.away === 'boolean'
    && Number.isInteger(s.seq) && s.seq >= -1 && Number.isFinite(s.age) && s.age >= 0 && s.age < 1e6));
}

// The host is the sole authority for seats, readiness, physics and score.
// Guests send inputs on their own private channel and predict their own paddle;
// everything else is extrapolated from the latest host snapshot and smoothed.
export class DoublesSession {
  constructor({ role, code, config, onChange = () => {}, readInput = () => ZERO, now = () => performance.now(), connect = connectRealtimeChannels, id = crypto.randomUUID(), random = Math.random }) {
    if (!validId(id)) throw new Error('Ungültige Sitzungskennung.');
    this.doubles = true; this.role = role; this.code = normalizeCode(code); this.id = id;
    this.now = now; this.onChange = onChange; this.readInput = readInput; this.random = random;
    this.mainTopic = `${DOUBLES.prefix}-${this.code}`;
    this.state = createState({ doubles: true }); this.stage = 'connecting'; this.message = 'Verbindung wird aufgebaut …';
    this.seats = Array(DOUBLES.seats).fill(null); this.seat = null;
    this.round = 0; this.epoch = 0; this.revision = 0; this.receivedRevision = -1;
    this.connected = false; this.host = null; this.lastHost = null; this.startedAt = now();
    this.visible = true; this.suspended = false; this.closed = false; this.countdownUntil = 0; this.countdown = 0;
    this.lastSnapshotAt = -Infinity; this.lastPing = -Infinity; this.lastJoin = -Infinity;
    this.inputSequence = 0; this.lastInputSent = -Infinity; this.lastInputValue = null; this.sendTimes = new Map();
    this.predicted = null; this.history = []; this.sim = null; this.error = null; this.rtt = null;
    this.members = new Map();
    if (role === 'host') {
      this.members.set(id, this.member(id, 1, 0));
      this.host = id; this.seat = 0;
    }
    this.clock = createClock(() => this.physicsTick());
    this.transport = connect(config, { onMessage: (topic, m) => this.receive(topic, m), onStatus: ok => this.connection(ok) });
    this.transport.join(this.mainTopic);
    if (role === 'guest') this.transport.join(this.inputTopic(id));
    this.refreshSeats();
  }
  member(id, n, seat) {
    return { id, n, seat, ready: false, visible: true, suspended: false, lastSeen: this.now(), input: ZERO, inputAt: -Infinity, inputSeq: -1, ackAt: this.now() };
  }
  inputTopic(id) { return `${this.mainTopic}-${id}`; }
  get self() { return this.members.get(this.id); }
  get playerCount() { return this.seats.filter(Boolean).length; }
  get ready() { return this.seat === null ? false : Boolean(this.seats[this.seat]?.ready); }
  get team() { return this.seat === null ? 1 : seatBody(this.seat).team; }
  get interrupted() { return this.suspended || (this.role === 'host' && [...this.members.values()].some(m => m.suspended)); }
  get canChangeSeat() { return ['waiting', 'over'].includes(this.stage) && !this.closed; }
  emit() { if (this.role === 'host') this.refreshSeats(); this.onChange(this); }
  sendMain(type, data = {}, to = null) { return this.transport?.send(this.mainTopic, { v: DOUBLES.protocol, from: this.id, to, type, ...data }); }
  sendHost(type, data = {}) {
    if (!this.host || this.role !== 'guest') return false;
    return this.transport?.send(this.inputTopic(this.id), { v: DOUBLES.protocol, from: this.id, to: this.host, type, ...data });
  }
  connection(ok) {
    if (this.closed) return;
    this.connected = ok;
    if (ok) {
      if (this.stage === 'connecting' && this.role === 'host') { this.probeUntil = this.now() + 800; this.sendMain('probe'); }
      else if (this.role === 'guest' && !this.host) { this.sendMain('join'); this.lastJoin = this.now(); }
      else if (this.role === 'guest') this.sendHost('ping', { visible: this.visible });
    } else if (['playing', 'countdown'].includes(this.stage)) this.hold('Verbindung unterbrochen. Wir warten auf die Rückkehr …');
    this.emit();
  }

  // ---------- Lobby (host) ----------
  refreshSeats() {
    if (this.role !== 'host') return;
    const now = this.now(), seats = Array(DOUBLES.seats).fill(null);
    for (const m of this.members.values()) seats[m.seat] = {
      id: m.id, n: m.n, ready: m.ready, away: !m.visible || m.suspended,
      seq: m.id === this.id ? -1 : m.inputSeq, age: m.id === this.id ? 0 : Math.max(0, Math.round(now - m.ackAt))
    };
    this.seats = seats; this.seat = this.self?.seat ?? null;
  }
  lobbyMessage() {
    const count = this.members.size;
    return count < DOUBLES.seats ? `${count} von 4 Spielern. Teilt den Raumcode.` : 'Alle Plätze besetzt. Seid ihr bereit?';
  }
  admit(id) {
    if (this.stage === 'connecting') return;
    const existing = this.members.get(id);
    if (existing) { this.sendMain('accepted', { seat: existing.seat, revision: this.revision + 1 }, id); this.broadcast(); return; }
    const taken = new Set([...this.members.values()].map(m => m.seat));
    const seat = SEAT_ORDER.find(s => !taken.has(s));
    if (seat === undefined) { this.sendMain('reject', { reason: 'full' }, id); return; }
    if (!['waiting', 'over'].includes(this.stage)) { this.sendMain('reject', { reason: 'running' }, id); return; }
    const used = new Set([...this.members.values()].map(m => m.n));
    const member = this.member(id, [2, 3, 4].find(n => !used.has(n)), seat);
    this.members.set(id, member);
    this.transport.join(this.inputTopic(id));
    if (this.stage === 'over') this.toLobby();
    this.message = this.lobbyMessage();
    // Older snapshots in flight do not list this guest yet; they must be ignored.
    this.sendMain('accepted', { seat, revision: this.revision + 1 }, id);
    this.broadcast(); this.emit();
  }
  clearReady() { for (const m of this.members.values()) m.ready = false; }
  // Back to the lobby with a fresh match, e.g. after a player left mid-match.
  toLobby() {
    reset(this.state); this.round++; this.epoch++; this.stage = 'waiting'; this.clock.reset(); this.clearReady();
    for (const m of this.members.values()) { m.input = ZERO; m.inputSeq = -1; }
  }
  moveSeat(member, seat) {
    if (!this.canChangeSeat || !Number.isInteger(seat) || seat < 0 || seat >= DOUBLES.seats || member.seat === seat) return;
    const other = [...this.members.values()].find(m => m.seat === seat);
    if (other) other.seat = member.seat;
    member.seat = seat;
    this.clearReady(); this.epoch++;
    this.message = 'Teams geändert. Alle müssen erneut bereit sein.';
    this.broadcast(); this.emit();
  }
  shuffleTeams() {
    if (this.role !== 'host' || !this.canChangeSeat || this.members.size < 2) return;
    const members = [...this.members.values()];
    // Team pairing as a comparable key; a shuffle must visibly change it.
    const pairing = seatOf => [0, 1].map(team => members.filter(m => seatBody(seatOf(m)).team === team).map(m => m.id).sort().join()).sort().join('|');
    const before = pairing(m => m.seat);
    let seats = [0, 1, 2, 3];
    for (let attempt = 0; attempt < 20; attempt++) {
      seats = [0, 1, 2, 3];
      for (let i = seats.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [seats[i], seats[j]] = [seats[j], seats[i]]; }
      if (pairing(m => seats[members.indexOf(m)]) !== before) break;
    }
    members.forEach((m, i) => { m.seat = seats[i]; });
    this.clearReady(); this.epoch++;
    this.message = 'Teams gemischt. Alle müssen erneut bereit sein.';
    this.broadcast(); this.emit();
  }
  removeMember(member, reason) {
    if (!this.members.has(member.id) || member.id === this.id) return;
    this.members.delete(member.id);
    this.transport.leave(this.inputTopic(member.id));
    const aborted = ['countdown', 'playing', 'paused'].includes(this.stage);
    if (aborted || this.stage === 'over') this.toLobby(); else { this.clearReady(); this.epoch++; }
    this.message = `${reason}${aborted ? ' Die Partie wurde abgebrochen.' : ''} ${this.lobbyMessage()}`;
    this.broadcast(); this.emit();
  }
  canStart() {
    return this.connected && this.members.size === DOUBLES.seats && [...this.members.values()].every(m => m.visible && !m.suspended);
  }
  setReady(member, value) {
    if (this.closed || !this.connected || !['waiting', 'paused', 'over'].includes(this.stage)) return;
    if (value && !member.visible) return;
    member.ready = value;
    this.maybeStart();
    this.broadcast(); this.emit();
  }
  maybeStart() {
    if (!['waiting', 'paused', 'over'].includes(this.stage) || !this.canStart() || ![...this.members.values()].every(m => m.ready)) return;
    if (this.stage === 'over') { reset(this.state); this.round++; for (const m of this.members.values()) { m.input = ZERO; m.inputSeq = -1; } }
    this.stage = 'countdown'; this.countdownUntil = this.now() + DOUBLES.countdown;
    this.clock.reset(); this.message = 'Gleich geht’s los …';
  }
  broadcast() {
    if (this.role !== 'host' || this.closed || this.stage === 'connecting') return;
    this.refreshSeats(); this.lastSnapshotAt = this.now();
    this.sendMain('snapshot', {
      state: doublesSnapshot(this.state), stage: this.stage, message: this.message, seats: this.seats,
      round: this.round, epoch: this.epoch, revision: ++this.revision,
      countdown: this.stage === 'countdown' ? Math.max(0, this.countdownUntil - this.now()) : 0
    });
  }

  // ---------- Messages ----------
  receive(topic, m) {
    if (this.closed || !m || m.v !== DOUBLES.protocol || !validId(m.from) || m.from === this.id || (m.to && m.to !== this.id)) return;
    if (this.role === 'host') this.receiveHost(topic, m); else this.receiveGuest(topic, m);
  }
  receiveHost(topic, m) {
    if (topic === this.mainTopic) {
      if (m.type === 'probe') { if (this.stage !== 'connecting' || this.id < m.from) this.sendMain('occupied', {}, m.from); }
      else if (m.type === 'occupied' && this.stage === 'connecting') this.end('Dieser Code ist bereits vergeben. Bitte erstelle ein neues Spiel.');
      else if (m.type === 'join') this.admit(m.from);
      return;
    }
    const member = this.members.get(m.from);
    // Each guest may speak only on its own channel; the channel name is the lease.
    if (!member || topic !== this.inputTopic(m.from) || m.to !== this.id) return;
    const known = { ping: typeof m.visible === 'boolean', input: m.round === this.round && Number.isInteger(m.seq) && m.seq > member.inputSeq && Number.isFinite(m.input?.x) && Number.isFinite(m.input?.y),
      ready: m.epoch === this.epoch && typeof m.value === 'boolean', pause: m.epoch === this.epoch, seat: Number.isInteger(m.seat), leave: true };
    if (!known[m.type]) return;
    member.lastSeen = this.now();
    if (member.suspended) {
      member.suspended = false;
      if (!this.interrupted && this.stage === 'paused') this.message = 'Wieder verbunden. Alle müssen bereit sein.';
      this.broadcast();
    }
    if (typeof m.visible === 'boolean' && member.visible !== m.visible) {
      member.visible = m.visible;
      if (!m.visible) member.ready = false;
      if (!m.visible && ['playing', 'countdown'].includes(this.stage)) this.hold(`Spieler ${member.n} ist abwesend. Partie pausiert.`);
      else this.broadcast();
    }
    if (m.type === 'input') {
      member.input = cleanInput(m.input); member.inputSeq = m.seq; member.inputAt = this.now(); member.ackAt = this.now();
    } else if (m.type === 'ready') this.setReady(member, m.value);
    else if (m.type === 'pause') { if (['playing', 'countdown'].includes(this.stage)) this.hold(`Spieler ${member.n} hat pausiert. Alle müssen bereit sein.`); }
    else if (m.type === 'seat') this.moveSeat(member, m.seat);
    else if (m.type === 'leave') { this.removeMember(member, `Spieler ${member.n} hat den Raum verlassen.`); return; }
    this.emit();
  }
  receiveGuest(topic, m) {
    if (topic !== this.mainTopic) return;
    if (!this.host) {
      if (m.to !== this.id) return;
      if (m.type === 'reject') this.end(REJECTIONS[m.reason] || REJECTIONS.full);
      else if (m.type === 'accepted') {
        if (!Number.isInteger(m.revision) || m.revision < 1) return;
        this.host = m.from; this.lastHost = this.now(); this.stage = 'waiting'; this.message = 'Beigetreten. Wählt eure Plätze.';
        this.receivedRevision = Math.max(this.receivedRevision, m.revision - 1);
        this.sendHost('ping', { visible: this.visible }); this.emit();
      }
      return;
    }
    if (m.from !== this.host) return;
    if (m.type === 'snapshot') this.applySnapshot(m);
    else if (m.type === 'leave') this.end('Der Host hat das Spiel verlassen.');
  }
  applySnapshot(m) {
    if (!Number.isInteger(m.epoch) || m.epoch < this.epoch || !Number.isInteger(m.revision) || m.revision <= this.receivedRevision
      || !Number.isInteger(m.round) || m.round < this.round || !['waiting', 'countdown', 'playing', 'paused', 'over'].includes(m.stage)
      || !validSeats(m.seats) || !Number.isFinite(m.countdown) || typeof m.message !== 'string' || m.message.length > 200 || !validDoublesSnapshot(m.state)) return;
    const seat = m.seats.findIndex(s => s?.id === this.id);
    this.lastHost = this.now(); this.receivedRevision = m.revision;
    if (seat < 0) { this.end('Du bist nicht mehr im Raum. Bitte tritt erneut bei.'); return; }
    const previous = this.state;
    const discontinuity = this.round !== m.round || this.seat !== seat || previous.phase !== m.state.phase || previous.score.some((n, i) => n !== m.state.score[i]);
    const shown = this.sim && !discontinuity ? this.displayWorld() : null;
    this.state = m.state; this.round = m.round; this.epoch = m.epoch; this.stage = m.stage; this.message = m.message;
    this.seats = m.seats; this.seat = seat; this.countdown = m.countdown; this.countdownUntil = this.now() + m.countdown;
    if (this.connected) this.suspended = false;
    this.reconcile(m.seats[seat], discontinuity);
    this.resetSimulation(shown);
    this.emit();
  }

  // ---------- Guest prediction and smoothing ----------
  ownBody(state = this.state) { const { team, lane } = seatBody(this.seat); return state.teams[team].players[lane]; }
  predicting() { return this.role === 'guest' && this.seat !== null && this.stage === 'playing' && !this.suspended && this.state.phase === 'rally'; }
  // Compare the host's position with where this paddle was one round trip ago,
  // then shift the prediction by that error. Moving no longer drags it backwards.
  reconcile(ack, discontinuity) {
    const auth = this.ownBody();
    if (!this.predicted || discontinuity || !this.predicting()) { this.predicted = { ...auth }; this.history = []; return; }
    const sentAt = this.sendTimes.get(ack.seq);
    let past = null;
    if (sentAt !== undefined) {
      this.rtt = clamp(this.now() - sentAt - ack.age, 0, 1000);
      const target = this.now() - this.rtt;
      for (const entry of this.history) if (!past || Math.abs(entry.t - target) < Math.abs(past.t - target)) past = entry;
    }
    const base = past || this.predicted;
    const ex = auth.offset - base.offset, ey = auth.y - base.y;
    const rate = Math.hypot(ex, ey) > DOUBLES.reconcileSnap ? 1 : past ? DOUBLES.reconcileRate : 0.15;
    const dx = ex * rate, dy = ey * rate;
    const { team } = seatBody(this.seat);
    this.predicted.offset = clamp(this.predicted.offset + dx, -C.maxOffset, C.maxOffset);
    this.predicted.y = clamp(this.predicted.y + dy, team ? 10.9 : 0.65, team ? 19.35 : 9.1);
    for (const entry of this.history) { entry.offset += dx; entry.y += dy; }
  }
  resetSimulation(shown) {
    if (!this.predicting()) { this.sim = null; this.error = null; return; }
    const sim = structuredClone(this.state);
    sim.variant = 'standard'; sim.pendingLob = [false, false];
    Object.assign(this.ownBody(sim), this.predicted);
    const error = { ball: { x: 0, y: 0, z: 0 }, bodies: [[{ offset: 0, y: 0 }, { offset: 0, y: 0 }], [{ offset: 0, y: 0 }, { offset: 0, y: 0 }]] };
    if (shown) {
      const ball = { x: shown.ball.x - sim.ball.x, y: shown.ball.y - sim.ball.y, z: shown.ball.z - sim.ball.z };
      if (Math.hypot(ball.x, ball.y, ball.z) < DOUBLES.snapDistance) error.ball = ball;
      sim.teams.forEach((t, side) => t.players.forEach((p, lane) => {
        const old = shown.teams[side].players[lane], e = { offset: old.offset - p.offset, y: old.y - p.y };
        if (Math.hypot(e.offset, e.y) < DOUBLES.snapDistance) error.bodies[side][lane] = e;
      }));
    }
    this.sim = sim; this.error = error;
  }
  predictionTick() {
    if (!this.predicting() || !this.predicted) return;
    const { team, lane } = seatBody(this.seat);
    const input = rotate(this.visible ? this.localInput() : ZERO, team);
    moveTeam(this.predicted, input, C.step);
    this.history.push({ t: this.now(), offset: this.predicted.offset, y: this.predicted.y });
    if (this.history.length > DOUBLES.historyLength) this.history.shift();
    const sim = this.sim;
    if (sim?.phase === 'rally') {
      const origins = captureOrigins(sim);
      sim.teams.forEach((t, side) => t.players.forEach((p, l) => {
        if (side === team && l === lane) Object.assign(p, this.predicted);
        // Dead reckoning: other players keep their last reported velocity.
        else moveTeam(p, { x: p.vx / C.speed, y: p.vy / C.speed }, C.step);
      }));
      simulateBall(sim, C.step, origins);
    }
    if (this.error) {
      const decay = Math.exp(-C.step / DOUBLES.smoothing);
      for (const key of ['x', 'y', 'z']) this.error.ball[key] *= decay;
      this.error.bodies.forEach(team => team.forEach(e => { e.offset *= decay; e.y *= decay; }));
    }
  }
  displayWorld() {
    const world = structuredClone(this.state);
    if (!this.sim) return world;
    const { ball, bodies } = this.error;
    Object.assign(world.ball, { x: this.sim.ball.x + ball.x, y: this.sim.ball.y + ball.y, z: Math.max(0, this.sim.ball.z + ball.z), vx: this.sim.ball.vx, vy: this.sim.ball.vy, vz: this.sim.ball.vz, bounces: this.sim.ball.bounces });
    world.teams.forEach((t, side) => t.players.forEach((p, lane) => {
      const source = this.sim.teams[side].players[lane], e = bodies[side][lane];
      Object.assign(p, { offset: source.offset + e.offset, y: source.y + e.y, vx: source.vx, vy: source.vy });
    }));
    Object.assign(this.ownBody(world), this.predicted);
    return world;
  }
  localInput() {
    const input = cleanInput(this.readInput());
    return { x: quantize(input.x), y: quantize(input.y) };
  }

  // ---------- Simulation and timers ----------
  physicsTick() {
    if (this.role !== 'host') { this.predictionTick(); return; }
    const now = this.now(), inputs = EMPTY_INPUTS();
    for (const m of this.members.values()) {
      const { team, lane } = seatBody(m.seat);
      const input = m.id === this.id ? (this.visible ? cleanInput(this.readInput()) : ZERO) : now - m.inputAt < DOUBLES.inputStale ? m.input : ZERO;
      inputs[team][lane] = rotate(input, team);
    }
    stepDoubles(this.state, inputs);
  }
  hold(message) {
    if (this.closed) return;
    if (this.role === 'host' && (['playing', 'countdown'].includes(this.stage) || [...this.members.values()].some(m => m.ready))) this.epoch++;
    if (['playing', 'countdown'].includes(this.stage)) { pause(this.state); this.stage = 'paused'; this.clock.reset(); this.sim = null; }
    if (this.role === 'host') this.clearReady();
    this.message = message;
    this.broadcast(); this.emit();
  }
  requestReady() {
    if (this.role === 'host') { const self = this.self; if (self) this.setReady(self, !self.ready); }
    else this.sendHost('ready', { epoch: this.epoch, value: !this.ready });
  }
  requestPause() {
    if (!['playing', 'countdown'].includes(this.stage)) return;
    if (this.role === 'host') this.hold('Partie pausiert. Alle müssen bereit sein.');
    else { this.sendHost('pause', { epoch: this.epoch }); this.hold('Pause wird angefordert …'); }
  }
  requestSeat(seat) {
    if (!this.canChangeSeat) return;
    if (this.role === 'host') { const self = this.self; if (self) this.moveSeat(self, seat); }
    else this.sendHost('seat', { seat });
  }
  setVisible(value) {
    this.visible = value;
    if (!value) this.requestPause();
    if (this.role === 'host') {
      const self = this.self;
      if (self && self.visible !== value) { self.visible = value; if (!value) self.ready = false; this.broadcast(); this.emit(); }
    } else this.sendHost('ping', { visible: value });
  }
  tick() {
    if (this.closed) return;
    const now = this.now();
    if (this.role === 'host') this.hostTimers(now); else this.guestTimers(now);
  }
  hostTimers(now) {
    if (this.stage === 'connecting') {
      if (this.connected && now >= this.probeUntil) { this.stage = 'waiting'; this.message = this.lobbyMessage(); this.broadcast(); this.emit(); }
      else if (now - this.startedAt > DOUBLES.joinTimeout) { this.end('Keine Verbindung möglich. Bitte versuche es erneut.'); return; }
      return;
    }
    for (const m of [...this.members.values()]) {
      if (m.id === this.id) continue;
      const silent = now - m.lastSeen;
      if (silent > DOUBLES.expiry) { this.removeMember(m, `Spieler ${m.n} ist nicht zurückgekehrt.`); continue; }
      if (silent > DOUBLES.silence && !m.suspended) {
        m.suspended = true; m.ready = false;
        if (['playing', 'countdown'].includes(this.stage)) this.hold(`Verbindung zu Spieler ${m.n} unterbrochen. Wir warten …`);
        else { this.broadcast(); this.emit(); }
      }
    }
    if (this.stage === 'countdown' && now >= this.countdownUntil && !this.interrupted && this.connected) {
      start(this.state); this.stage = 'playing'; this.message = 'Ihr spielt 2 gegen 2.'; this.clearReady(); this.clock.reset();
      this.broadcast(); this.emit();
    }
    const interval = ['playing', 'countdown'].includes(this.stage) ? DOUBLES.snapshotInterval : DOUBLES.lobbyInterval;
    if (now - this.lastSnapshotAt >= interval - 1) this.broadcast();
  }
  guestTimers(now) {
    if (!this.host) {
      if (now - this.startedAt > DOUBLES.joinTimeout) {
        this.end(this.connected ? 'Kein offenes 2v2-Spiel gefunden. Prüfe den Code und ob der Host noch wartet.' : 'Keine Verbindung möglich. Bitte versuche es erneut.'); return;
      }
      if (this.connected && now - this.lastJoin >= DOUBLES.pingInterval) { this.lastJoin = now; this.sendMain('join'); }
      return;
    }
    if (now - this.lastHost > DOUBLES.expiry) { this.end('Die Verbindung wurde nicht wiederhergestellt. Bitte erstellt ein neues Spiel.'); return; }
    if ((!this.connected || now - this.lastHost > DOUBLES.silence) && !this.suspended) {
      this.suspended = true; this.hold('Verbindung unterbrochen. Wir warten auf die Rückkehr …');
    }
    if (this.stage === 'playing' && !this.suspended && this.seat !== null) {
      const input = this.visible ? this.localInput() : ZERO, last = this.lastInputValue;
      const changed = !last || last.x !== input.x || last.y !== input.y;
      if ((changed && now - this.lastInputSent >= DOUBLES.inputInterval - 1) || now - this.lastInputSent >= DOUBLES.inputKeepalive) {
        const seq = ++this.inputSequence;
        if (this.sendHost('input', { round: this.round, seq, input, visible: this.visible })) {
          this.sendTimes.set(seq, now);
          if (this.sendTimes.size > 60) this.sendTimes.delete(this.sendTimes.keys().next().value);
        }
        this.lastInputSent = now; this.lastInputValue = input; this.lastPing = now;
      }
    } else if (now - this.lastPing >= DOUBLES.pingInterval) { this.lastPing = now; this.sendHost('ping', { visible: this.visible }); }
  }
  advance(dt) {
    if (this.closed || this.stage !== 'playing' || this.interrupted) return;
    this.clock.advance(dt);
    if (this.role === 'host' && this.state.phase === 'over') {
      this.stage = 'over'; this.message = 'Partie beendet. Bereit zur Revanche? Ihr könnt die Teams jetzt neu mischen.'; this.clearReady(); this.epoch++;
      this.broadcast(); this.emit();
    }
  }
  view() {
    const team = this.team;
    const world = this.role === 'guest' && this.predicting() && this.sim ? this.displayWorld() : this.state;
    const view = doublesPerspective(world, team);
    if (this.seat !== null) { const { lane } = seatBody(this.seat); view.me = { side: 1, lane: team === 0 ? 1 - lane : lane }; }
    return view;
  }
  end(message) {
    if (this.closed) return;
    this.closed = true; this.stage = 'ended'; this.message = message; pause(this.state); this.transport?.close(); this.emit();
  }
  leave() {
    if (this.role === 'host') this.sendMain('leave'); else this.sendHost('leave');
    this.end('Du hast das Spiel verlassen.');
  }
}
