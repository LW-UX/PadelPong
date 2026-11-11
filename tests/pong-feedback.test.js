const test = require('node:test');
const assert = require('node:assert/strict');
const feedback = import('../src/feedback.mjs');

const context = { mode: 'computer', gameplay: 'standard', difficulty: 'easy', device: 'desktop' };

test('feedback text is trimmed, bounded and rejects hidden control characters', async () => {
  const { normalizeFeedback, FEEDBACK_MAX_LENGTH } = await feedback;
  assert.equal(normalizeFeedback('  Super Spiel!\r\nMehr Level bitte.  '), 'Super Spiel!\nMehr Level bitte.');
  assert.equal(normalizeFeedback('Tab\tok'), 'Tab\tok');
  assert.equal(normalizeFeedback('😀'.repeat(FEEDBACK_MAX_LENGTH)).length, FEEDBACK_MAX_LENGTH * 2);
  for (const value of ['', '  ', 'ab', 'a'.repeat(FEEDBACK_MAX_LENGTH + 1), 'Hallo\u0000Welt', 'Hallo\u001bWelt']) {
    assert.throws(() => normalizeFeedback(value));
  }
});

test('feedback retries reuse the same id and send only the anonymous game context', async () => {
  const { createFeedbackApi } = await feedback; const calls = [];
  const api = createFeedbackApi({ url: 'https://example.test', publishableKey: 'public-key' }, async (url, options) => {
    calls.push({ url, options }); return { ok: true, json: async () => ({ saved: true }) };
  });
  const entry = { feedbackId: 'same-feedback', message: '  Der Lob ist zu stark. ', ...context };
  await api.submit(entry); await api.submit(entry);
  assert.equal(calls[0].url, 'https://example.test/rest/v1/rpc/submit_pong_feedback');
  assert.equal(calls[0].options.body, calls[1].options.body);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_feedback_id: 'same-feedback', p_message: 'Der Lob ist zu stark.',
    p_mode: 'computer', p_gameplay: 'standard', p_difficulty: 'easy', p_device: 'desktop'
  });
});

test('invalid feedback is rejected before any request is sent', async () => {
  const { createFeedbackApi } = await feedback; let calls = 0;
  const api = createFeedbackApi({ url: 'https://example.test', publishableKey: 'public-key' }, async () => { calls++; return { ok: true, json: async () => ({}) }; });
  await assert.rejects(api.submit({ feedbackId: 'id', message: 'x', ...context }));
  await assert.rejects(api.submit({ feedbackId: 'id', message: 'Gutes Spiel', ...context, mode: 'league' }));
  await assert.rejects(api.submit({ message: 'Gutes Spiel', ...context }));
  assert.equal(calls, 0);
});

test('server and network errors become readable German messages', async () => {
  const { createFeedbackApi } = await feedback;
  const failing = (status, message) => createFeedbackApi({ url: 'https://example.test', publishableKey: 'k' },
    async () => ({ ok: false, status, json: async () => ({ message }) }));
  const entry = { feedbackId: 'id', message: 'Gutes Spiel', ...context };
  await assert.rejects(failing(400, 'PONG_FEEDBACK_BUSY').submit(entry), /in einer Minute/);
  await assert.rejects(failing(400, 'PONG_FEEDBACK_LENGTH').submit(entry), /3 bis 1000 Zeichen/);
  await assert.rejects(failing(404).submit(entry), /eingerichtet/);
  const offline = createFeedbackApi({ url: 'https://example.test', publishableKey: 'k' }, async () => { throw new TypeError('offline'); });
  await assert.rejects(offline.submit(entry), /Verbindung fehlgeschlagen/);
  await assert.rejects(createFeedbackApi(null).submit(entry), /nicht eingerichtet/);
});
