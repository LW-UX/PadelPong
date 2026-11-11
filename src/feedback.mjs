export const FEEDBACK_MIN_LENGTH = 3;
export const FEEDBACK_MAX_LENGTH = 1000;
const MODES = ['computer', 'local', 'online'];
const DEVICES = ['desktop', 'mobile'];

// Line breaks and tabs stay allowed; other control characters are rejected,
// matching the server-side check in submit_pong_feedback.
export function normalizeFeedback(value) {
  const message = String(value ?? '').replace(/\r\n?/g, '\n').normalize('NFC').trim();
  const length = [...message].length;
  if (length < FEEDBACK_MIN_LENGTH) throw new Error(`Bitte schreibe mindestens ${FEEDBACK_MIN_LENGTH} Zeichen.`);
  if (length > FEEDBACK_MAX_LENGTH) throw new Error(`Bitte fasse dich kürzer (höchstens ${FEEDBACK_MAX_LENGTH} Zeichen).`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(message)) throw new Error('Das Feedback enthält ungültige Zeichen.');
  return message;
}

export function feedbackPayload({ feedbackId, message, mode, gameplay, difficulty, device }) {
  if (!feedbackId) throw new Error('Feedback-Kennung fehlt.');
  if (!MODES.includes(mode) || !DEVICES.includes(device)) throw new Error('Ungültiger Feedback-Kontext.');
  return {
    p_feedback_id: feedbackId, p_message: normalizeFeedback(message),
    p_mode: mode, p_gameplay: gameplay, p_difficulty: difficulty, p_device: device
  };
}

export function createFeedbackApi(config, fetcher = fetch) {
  return {
    async submit(entry) {
      const body = feedbackPayload(entry);
      if (!config?.url || !config?.publishableKey) throw new Error('Feedback ist noch nicht eingerichtet.');
      let response;
      try {
        response = await fetcher(`${config.url}/rest/v1/rpc/submit_pong_feedback`, {
          method: 'POST', headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(12000)
        });
      } catch { throw new Error('Verbindung fehlgeschlagen. Bitte versuche es erneut.'); }
      if (!response.ok) {
        const error = await response.json?.().catch(() => ({})) || {};
        if (error.message === 'PONG_FEEDBACK_LENGTH') throw new Error(`Bitte schreibe ${FEEDBACK_MIN_LENGTH} bis ${FEEDBACK_MAX_LENGTH} Zeichen.`);
        if (error.message === 'PONG_FEEDBACK_BUSY') throw new Error('Gerade kommt viel Feedback an. Bitte versuche es in einer Minute erneut.');
        throw new Error(response.status === 404 ? 'Feedback wird gerade eingerichtet. Bitte versuche es später erneut.' : 'Feedback konnte nicht gesendet werden. Bitte versuche es erneut.');
      }
      return response.json();
    }
  };
}

export function mountFeedback({ pauseGame, getContext, onOpen = () => {}, api = createFeedbackApi(window.PADEL_SUPABASE_CONFIG) }) {
  const dialog = document.getElementById('feedback-dialog');
  const form = document.getElementById('feedback-form');
  const text = document.getElementById('feedback-text');
  const count = document.getElementById('feedback-count');
  const message = document.getElementById('feedback-message');
  const submit = document.getElementById('feedback-submit');
  const thanks = document.getElementById('feedback-thanks');
  // One id per drafted message: a retry after a lost response cannot store it twice.
  let feedbackId = crypto.randomUUID(), sending = false, returnFocus = null;

  function setMessage(value = '', type = '') {
    message.textContent = value;
    message.classList.toggle('is-error', type === 'error');
  }
  function updateCount() {
    const length = [...text.value].length;
    count.textContent = `${length}/${FEEDBACK_MAX_LENGTH}`;
    count.classList.toggle('is-over', length > FEEDBACK_MAX_LENGTH);
  }
  function showForm() {
    form.hidden = false; thanks.hidden = true; submit.disabled = false; setMessage(); updateCount();
  }
  function open() {
    onOpen(); pauseGame();
    returnFocus = document.activeElement;
    if (!thanks.hidden) { text.value = ''; feedbackId = crypto.randomUUID(); }
    showForm();
    dialog.showModal();
    text.focus();
  }
  function close() { dialog.close(); }

  text.addEventListener('input', () => { updateCount(); if (message.textContent) setMessage(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    let entry;
    try { entry = { feedbackId, message: normalizeFeedback(text.value), ...getContext() }; }
    catch (error) { setMessage(error.message, 'error'); text.focus(); return; }
    sending = true; submit.disabled = true; setMessage('Wird gesendet …');
    try {
      await api.submit(entry);
      form.hidden = true; thanks.hidden = false; setMessage();
      document.getElementById('feedback-done').focus();
    } catch (error) {
      setMessage(error.message, 'error'); submit.disabled = false;
    } finally { sending = false; }
  });
  document.getElementById('feedback-cancel').addEventListener('click', close);
  document.getElementById('feedback-close').addEventListener('click', close);
  document.getElementById('feedback-done').addEventListener('click', close);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  dialog.addEventListener('close', () => {
    if (returnFocus?.isConnected && !returnFocus.closest('dialog:not([open])')) returnFocus.focus({ preventScroll: true });
    else document.getElementById('court')?.focus({ preventScroll: true });
  });
  document.getElementById('feedback-open').addEventListener('click', open);
  return { open, close, get isOpen() { return dialog.open; } };
}
