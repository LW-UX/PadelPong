const test = require('node:test');
const assert = require('node:assert/strict');
const stats = import('../src/visit-stats.mjs');

function tracker(create, options = {}) {
  let time = 0; const sent = [];
  const instance = create({ visitId: 'visit-1', device: 'desktop', now: () => time, send: body => sent.push(JSON.parse(body)), ...options });
  return { instance, sent, advance: ms => { time += ms; } };
}

test('statistics run only on the published site and respect privacy signals', async () => {
  const { shouldTrack } = await stats;
  assert.equal(shouldTrack({ hostname: 'lw-ux.github.io' }), true);
  assert.equal(shouldTrack({ hostname: 'localhost' }), false);
  assert.equal(shouldTrack({ hostname: 'lw-ux.github.io', doNotTrack: '1' }), false);
  assert.equal(shouldTrack({ hostname: 'lw-ux.github.io', globalPrivacyControl: true }), false);
});

test('only the referring host is kept, never paths or queries of other sites', async () => {
  const { referrerSource } = await stats;
  assert.equal(referrerSource('https://www.Google.com/search?q=padel+pong'), 'www.google.com');
  assert.equal(referrerSource('https://lw-ux.github.io/PadelLiga/spieler/anna?x=1'), 'lw-ux.github.io/padelliga');
  assert.equal(referrerSource('https://lw-ux.github.io/PadelPong/'), null);
  assert.equal(referrerSource(''), null);
  assert.equal(referrerSource('android-app://com.slack'), null);
});

test('visible time, play time and matches per mode are counted', async () => {
  const { createVisitTracker } = await stats;
  const { instance, advance } = tracker(createVisitTracker);
  advance(10000);
  instance.observe({ mode: 'computer', phase: 'playing', variant: 'lob-smash-v1' });
  advance(30000);
  instance.observe({ mode: 'computer', phase: 'active', variant: 'lob-smash-v1' });
  advance(5000);
  instance.observe({ mode: 'computer', phase: 'playing', variant: 'lob-smash-v1' });
  advance(20000);
  instance.observe({ mode: 'computer', phase: 'over', variant: 'lob-smash-v1' });
  instance.observe({ mode: 'computer', phase: 'idle', variant: 'standard' });
  instance.observe({ mode: 'doubles', phase: 'playing', variant: 'standard' });
  advance(4000);
  instance.observe({ mode: 'doubles', phase: 'idle', variant: 'standard' });
  const body = instance.payload();
  assert.equal(body.p_visible_seconds, 69);
  assert.equal(body.p_play_seconds, 54);
  assert.equal(body.p_matches_started, 2);
  assert.equal(body.p_matches_finished, 1);
  assert.equal(body.p_computer_matches, 1);
  assert.equal(body.p_doubles_matches, 1);
  assert.equal(body.p_lob_smash_matches, 1);
});

test('hidden time is not counted and unchanged totals are not sent twice', async () => {
  const { createVisitTracker } = await stats;
  const { instance, sent, advance } = tracker(createVisitTracker);
  instance.observe({ mode: 'online', phase: 'playing', variant: 'standard' });
  advance(3000);
  instance.setVisible(false);
  assert.equal(instance.flush(), true);
  advance(60000);
  assert.equal(instance.flush(), false);
  instance.setVisible(true);
  advance(2000);
  instance.observe({ mode: 'online', phase: 'over', variant: 'standard' });
  assert.deepEqual(sent.map(body => [body.p_visible_seconds, body.p_play_seconds, body.p_matches_finished]), [[3, 3, 0], [5, 5, 1]]);
  assert.deepEqual(Object.keys(sent[0]).sort(), [
    'p_computer_matches', 'p_device', 'p_doubles_matches', 'p_lob_smash_matches', 'p_local_matches', 'p_matches_finished',
    'p_matches_started', 'p_online_matches', 'p_play_seconds', 'p_referrer', 'p_visible_seconds', 'p_visit_id'
  ]);
});

test('a page that was never visible sends nothing', async () => {
  const { createVisitTracker } = await stats;
  const { instance, sent, advance } = tracker(createVisitTracker, { visible: false });
  advance(5000);
  instance.setVisible(false);
  assert.equal(instance.flush(), false);
  assert.equal(sent.length, 0);
});

test('the sender posts with keepalive and swallows network errors', async () => {
  const { createVisitSender } = await stats; const calls = [];
  const send = createVisitSender({ url: 'https://example.test', publishableKey: 'public-key' }, async (url, options) => {
    calls.push({ url, options }); throw new TypeError('offline');
  });
  send('{"p_visit_id":"v"}');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls[0].url, 'https://example.test/rest/v1/rpc/record_pong_visit');
  assert.equal(calls[0].options.keepalive, true);
  assert.equal(calls[0].options.headers.apikey, 'public-key');
  createVisitSender(null, () => { throw new Error('must not be called'); })('{}');
});
