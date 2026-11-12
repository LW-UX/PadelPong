// Explicit integration check: ephemeral Realtime traffic only, no database writes.
// Run with Node 22+: node tools/check-pong-online-doubles.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { DoublesSession } from '../src/online-doubles.mjs';
import { generateCode } from '../src/online.mjs';
const sandbox = { window: {} };
vm.runInNewContext(await readFile(new URL('../src/supabase-config.js', import.meta.url), 'utf8'), sandbox);
const config = sandbox.window.PADEL_SUPABASE_CONFIG;
const rooms = [];
const host = new DoublesSession({ role: 'host', code: generateCode(), config, readInput: () => ({ x: .4, y: 0 }) }); rooms.push(host);
let previous = performance.now();
const timer = setInterval(() => {
  const now = performance.now(), dt = (now - previous) / 1000; previous = now;
  for (const room of rooms) { room.tick(); room.advance(dt); }
}, 16);
async function until(predicate, label, timeout = 12000) {
  const end = performance.now() + timeout;
  while (!predicate()) {
    if (performance.now() > end) throw new Error(`Zeitüberschreitung: ${label}`);
    await new Promise(r => setTimeout(r, 50));
  }
}
try {
  await until(() => host.stage === 'waiting', 'Host verbinden');
  const guests = [{ x: -.5, y: -.3 }, { x: 0, y: 0 }, { x: .2, y: .2 }].map(input => {
    const guest = new DoublesSession({ role: 'guest', code: host.code, config, readInput: () => input }); rooms.push(guest); return guest;
  });
  await until(() => host.playerCount === 4 && guests.every(g => g.seat !== null), 'Drei Gäste beitreten');
  const fifth = new DoublesSession({ role: 'guest', code: host.code, config }); rooms.push(fifth);
  await until(() => fifth.closed, 'Vollen Raum ablehnen'); assert.match(fifth.message, /voll/);
  guests[2].requestSeat(guests[0].seat);
  await until(() => host.seats.every(s => s && !s.ready) && guests[2].seat === 2, 'Platztausch');
  for (const room of [host, ...guests]) room.requestReady();
  await until(() => [host, ...guests].every(r => r.stage === 'playing'), 'Gemeinsamer Start');
  await until(() => guests[0].state.time > 2, 'Laufende Synchronisierung');
  assert.ok(Math.abs(host.state.time - guests[0].state.time) < .5);
  assert.ok(guests.every(g => g.rtt !== null && g.rtt < 1000), 'Rundlaufzeit gemessen');
  const rtts = guests.map(g => Math.round(g.rtt));
  guests[1].requestPause();
  await until(() => [host, ...guests].every(r => r.stage === 'paused'), 'Gemeinsame Pause');
  guests[0].leave();
  await until(() => host.stage === 'waiting' && host.playerCount === 3, 'Abbruch nach Verlassen');
  host.leave(); await until(() => guests.slice(1).every(g => g.closed), 'Host verlassen');
  console.log(`OK: Live-Realtime 2v2 – Beitritt, voller Raum, Platztausch, Start, Synchronisierung, Pause, Abbruch und Verlassen. Rundlaufzeiten: ${rtts.join(', ')} ms.`);
} finally { clearInterval(timer); for (const room of rooms) room.leave(); }
