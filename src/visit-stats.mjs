// Anonymous visit statistics. One random id per page load lives only in memory:
// no cookies, no browser storage, no names. Totals are sent when the tab is
// hidden and after each finished match; the server keeps the largest values.
export const PRODUCTION_HOST = 'lw-ux.github.io';
const OWN_PATH_SEGMENT = 'padelpong';
const MODES = ['computer', 'local', 'online', 'doubles'];
const DEVICES = ['desktop', 'mobile'];
const PHASES = ['idle', 'active', 'playing', 'over'];
const SECONDS_LIMIT = 86400;
const MATCH_LIMIT = 1000;

export function shouldTrack({ hostname, doNotTrack, globalPrivacyControl } = {}) {
  return hostname === PRODUCTION_HOST && doNotTrack !== '1' && globalPrivacyControl !== true;
}

// Only the referring host is kept. On the own GitHub Pages host the first path
// segment tells sibling projects apart (e.g. the league); reloads count as direct.
export function referrerSource(referrer, ownHost = PRODUCTION_HOST) {
  let url;
  try { url = new URL(referrer); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  if (!/^[a-z0-9.-]{1,100}$/.test(host)) return null;
  if (host !== ownHost) return host;
  const segment = url.pathname.split('/')[1]?.toLowerCase() ?? '';
  if (!segment || segment === OWN_PATH_SEGMENT || !/^[a-z0-9._-]{1,60}$/.test(segment)) return null;
  return `${host}/${segment}`;
}

function seconds(ms) { return Math.min(SECONDS_LIMIT, Math.max(0, Math.round(ms / 1000))); }
function count(value) { return Math.min(MATCH_LIMIT, value); }

export function createVisitTracker({ visitId, device, referrer = null, visible = true, now, send }) {
  if (!visitId) throw new Error('Besuchskennung fehlt.');
  if (!DEVICES.includes(device)) throw new Error('Ungültiger Gerätetyp.');
  let isVisible = Boolean(visible), seenVisible = isVisible, phase = 'idle', match = null;
  let last = now(), visibleMs = 0, playMs = 0, lastSent = '';
  const totals = { started: 0, finished: 0, lobSmash: 0, computer: 0, local: 0, online: 0, doubles: 0 };

  function settle() {
    const current = now(), elapsed = Math.max(0, current - last);
    last = current;
    if (!isVisible) return;
    visibleMs += elapsed;
    if (phase === 'playing') playMs += elapsed;
  }

  function payload() {
    settle();
    return {
      p_visit_id: visitId, p_device: device, p_referrer: referrer,
      p_visible_seconds: seconds(visibleMs), p_play_seconds: seconds(playMs),
      p_matches_started: count(totals.started), p_matches_finished: count(totals.finished),
      p_computer_matches: count(totals.computer), p_local_matches: count(totals.local),
      p_online_matches: count(totals.online), p_doubles_matches: count(totals.doubles),
      p_lob_smash_matches: count(totals.lobSmash)
    };
  }

  function flush() {
    // Prerendered or never-shown pages are not visits.
    if (!seenVisible) return false;
    const body = JSON.stringify(payload());
    if (body === lastSent) return false;
    lastSent = body;
    send(body);
    return true;
  }

  return {
    payload, flush,
    setVisible(value) {
      settle();
      isVisible = Boolean(value);
      seenVisible ||= isVisible;
    },
    observe({ mode, phase: next, variant }) {
      if (!MODES.includes(mode) || !PHASES.includes(next)) return;
      if (next === phase) return;
      settle();
      phase = next;
      if (next === 'playing' && !match) {
        match = { mode };
        totals.started++; totals[mode]++;
        if (variant === 'lob-smash-v1') totals.lobSmash++;
      } else if (next === 'over' && match) {
        match = null; totals.finished++;
        flush();
      } else if (next === 'idle') {
        match = null;
      }
    }
  };
}

export function createVisitSender(config, fetcher = fetch) {
  return body => {
    if (!config?.url || !config?.publishableKey) return;
    try {
      // keepalive lets the request finish while the tab is closing.
      fetcher(`${config.url}/rest/v1/rpc/record_pong_visit`, {
        method: 'POST', keepalive: true, body,
        headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' }
      }).catch(() => {});
    } catch { /* statistics never disturb the game */ }
  };
}

export function mountVisitStats({ getDevice }) {
  const tracked = shouldTrack({
    hostname: location.hostname,
    doNotTrack: navigator.doNotTrack,
    globalPrivacyControl: navigator.globalPrivacyControl
  });
  if (!tracked) return { observe() {} };
  const tracker = createVisitTracker({
    visitId: crypto.randomUUID(),
    device: getDevice(),
    referrer: referrerSource(document.referrer),
    visible: document.visibilityState === 'visible',
    now: () => performance.now(),
    send: createVisitSender(window.PADEL_SUPABASE_CONFIG)
  });
  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible';
    tracker.setVisible(visible);
    if (!visible) tracker.flush();
  });
  window.addEventListener('pagehide', () => { tracker.setVisible(false); tracker.flush(); });
  return tracker;
}
