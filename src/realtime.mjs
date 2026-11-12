// Supabase's documented Phoenix 1.0 JSON protocol. No database or auth session.
// https://supabase.com/docs/guides/realtime/protocol
export function connectRealtime(config, code, { onMessage, onStatus }, Socket = WebSocket) {
  if (!config?.url || !config?.publishableKey) throw new Error('Online-Spiele sind noch nicht eingerichtet.');
  const url = new URL('/realtime/v1/websocket', config.url);
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  url.searchParams.set('apikey', config.publishableKey);
  url.searchParams.set('vsn', '1.0.0');
  const topic = `realtime:pong-v1-${code}`;
  let socket, closed = false, joined = false, ref = 0, retry, heartbeat, timeout, pendingHeartbeat;
  function stopTimers() { clearTimeout(timeout); clearInterval(heartbeat); }
  function send(event, payload, channel = topic) {
    if (socket?.readyState !== 1 || socket.bufferedAmount > 65536) return false;
    socket.send(JSON.stringify({ topic: channel, event, payload, ref: String(++ref), ...(channel === topic ? { join_ref: '1' } : {}) }));
    return String(ref);
  }
  function open() {
    if (closed) return;
    ref = 0; joined = false; pendingHeartbeat = null;
    socket = new Socket(url.href);
    const current = socket;
    timeout = setTimeout(() => current.close(), 8000);
    current.onopen = () => send('phx_join', { config: { broadcast: { ack: false, self: false }, presence: { enabled: false }, private: false } });
    current.onmessage = event => {
      if (closed || current !== socket || typeof event.data !== 'string' || event.data.length > 32768) return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (!message || typeof message !== 'object') return;
      if (message.topic === 'phoenix' && message.ref === pendingHeartbeat) { pendingHeartbeat = null; return; }
      if (message.topic !== topic) return;
      if (message.event === 'phx_reply' && message.ref === '1' && !joined) {
        if (message.payload?.status !== 'ok') { current.close(); return; }
        clearTimeout(timeout); joined = true;
        heartbeat = setInterval(() => {
          if (pendingHeartbeat) { current.close(); return; }
          pendingHeartbeat = send('heartbeat', {}, 'phoenix');
        }, 20000);
        onStatus(true);
      } else if (message.event === 'broadcast' && message.payload?.event === 'game' && joined) {
        onMessage(message.payload.payload);
      } else if (message.event === 'phx_error' || message.event === 'phx_close') current.close();
    };
    current.onerror = () => current.close();
    current.onclose = () => {
      if (current !== socket) return;
      joined = false; stopTimers();
      if (!closed) { onStatus(false); retry = setTimeout(open, 1000); }
    };
  }
  open();
  return {
    send(payload) { return joined && Boolean(send('broadcast', { type: 'broadcast', event: 'game', payload })); },
    close() { closed = true; joined = false; clearTimeout(retry); stopTimers(); socket?.close(); }
  };
}

const CHANNEL_CONFIG = Object.freeze({ config: { broadcast: { ack: false, self: false }, presence: { enabled: false }, private: false } });
// Several broadcast channels multiplexed over one socket. The first channel
// joined is the main room; the connection counts as online only while it is
// joined. Further channels carry traffic for a single recipient, so a message
// is billed for one receiver instead of every room member.
export function connectRealtimeChannels(config, { onMessage, onStatus }, Socket = WebSocket) {
  if (!config?.url || !config?.publishableKey) throw new Error('Online-Spiele sind noch nicht eingerichtet.');
  const url = new URL('/realtime/v1/websocket', config.url);
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  url.searchParams.set('apikey', config.publishableKey);
  url.searchParams.set('vsn', '1.0.0');
  const channels = new Map(), byTopic = new Map();
  let socket, closed = false, ref = 0, retry, heartbeat, timeout, pendingHeartbeat, mainName = null, online = false;
  function frame(topic, event, payload, joinRef) {
    if (socket?.readyState !== 1 || socket.bufferedAmount > 65536) return false;
    const current = String(++ref);
    socket.send(JSON.stringify({ topic, event, payload, ref: current, join_ref: joinRef === undefined ? current : joinRef }));
    return current;
  }
  function join(channel) {
    channel.joined = false; clearTimeout(channel.retry);
    channel.joinRef = frame(channel.topic, 'phx_join', CHANNEL_CONFIG) || null;
  }
  function rejoinLater(channel) {
    channel.joined = false; clearTimeout(channel.retry);
    channel.retry = setTimeout(() => { if (!closed && channels.get(channel.name) === channel) join(channel); }, 1000);
  }
  function setOnline(value) { if (online !== value) { online = value; onStatus(value); } }
  function stopTimers() { clearTimeout(timeout); clearInterval(heartbeat); }
  function open() {
    if (closed) return;
    ref = 0; pendingHeartbeat = null;
    socket = new Socket(url.href);
    const current = socket;
    timeout = setTimeout(() => current.close(), 8000);
    current.onopen = () => { for (const channel of channels.values()) join(channel); };
    current.onmessage = event => {
      if (closed || current !== socket || typeof event.data !== 'string' || event.data.length > 32768) return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (!message || typeof message !== 'object') return;
      if (message.topic === 'phoenix' && message.ref === pendingHeartbeat) { pendingHeartbeat = null; return; }
      const channel = byTopic.get(message.topic);
      if (!channel) return;
      const main = channel.name === mainName;
      if (message.event === 'phx_reply' && message.ref === channel.joinRef && !channel.joined) {
        if (message.payload?.status !== 'ok') { if (main) current.close(); else rejoinLater(channel); return; }
        channel.joined = true;
        if (main) {
          clearTimeout(timeout); clearInterval(heartbeat);
          heartbeat = setInterval(() => {
            if (pendingHeartbeat) { current.close(); return; }
            pendingHeartbeat = frame('phoenix', 'heartbeat', {}, null);
          }, 20000);
          setOnline(true);
        }
      } else if (message.event === 'broadcast' && message.payload?.event === 'game' && channel.joined) {
        onMessage(channel.name, message.payload.payload);
      } else if (message.event === 'phx_error' || message.event === 'phx_close') {
        if (main) current.close(); else rejoinLater(channel);
      }
    };
    current.onerror = () => current.close();
    current.onclose = () => {
      if (current !== socket) return;
      for (const channel of channels.values()) { channel.joined = false; clearTimeout(channel.retry); }
      stopTimers(); setOnline(false);
      if (!closed) retry = setTimeout(open, 1000);
    };
  }
  open();
  return {
    join(name) {
      if (closed || channels.has(name)) return;
      const channel = { name, topic: `realtime:${name}`, joined: false, joinRef: null, retry: null };
      channels.set(name, channel); byTopic.set(channel.topic, channel);
      mainName ??= name;
      if (socket?.readyState === 1) join(channel);
    },
    leave(name) {
      const channel = channels.get(name);
      if (!channel || name === mainName) return;
      clearTimeout(channel.retry);
      if (channel.joined) frame(channel.topic, 'phx_leave', {}, channel.joinRef);
      channels.delete(name); byTopic.delete(channel.topic);
    },
    send(name, payload) {
      const channel = channels.get(name);
      return Boolean(channel?.joined && online && frame(channel.topic, 'broadcast', { type: 'broadcast', event: 'game', payload }, channel.joinRef));
    },
    close() {
      closed = true; clearTimeout(retry); stopTimers();
      for (const channel of channels.values()) clearTimeout(channel.retry);
      channels.clear(); byTopic.clear(); socket?.close();
    }
  };
}
