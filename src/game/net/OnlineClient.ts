import { PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from './protocol';

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/**
 * Browser WebSocket client for the game server: hello handshake, typed messages, RTT pings,
 * automatic reconnect with backoff (the server restores the player's seat by user id).
 */
export class OnlineClient {
  state: ConnectionState = 'idle';
  rtt = 0;
  private ws: WebSocket | null = null;
  private listeners = new Set<(m: ServerMsg) => void>();
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private retries = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private wantOpen = false;

  constructor(private url: string, private getToken: () => Promise<string | null>) {}

  on(fn: (m: ServerMsg) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onState(fn: (s: ConnectionState) => void): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  private setState(s: ConnectionState) {
    this.state = s;
    this.stateListeners.forEach((l) => l(s));
  }

  connect(): void {
    this.wantOpen = true;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.setState(this.retries > 0 ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = async () => {
      const token = await this.getToken();
      ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, token } satisfies ClientMsg));
    };
    ws.onmessage = (e) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(String(e.data)) as ServerMsg;
      } catch {
        return;
      }
      if (m.t === 'welcome') {
        this.retries = 0;
        this.setState('open');
        this.startPing();
      }
      if (m.t === 'pong') this.rtt = this.rtt ? this.rtt * 0.7 + (performance.now() - m.c) * 0.3 : performance.now() - m.c;
      if (m.t === 'error' && (m.code === 'unauthorized' || m.code === 'bad_version' || m.code === 'replaced')) this.wantOpen = false;
      this.listeners.forEach((l) => l(m));
    };
    ws.onclose = () => {
      this.stopPing();
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.wantOpen && this.retries < 8) {
        this.retries++;
        this.setState('reconnecting');
        setTimeout(() => this.connect(), Math.min(8000, 500 * 2 ** (this.retries - 1)));
      } else {
        this.setState('closed');
      }
    };
  }

  send(m: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private startPing() {
    this.stopPing();
    this.send({ t: 'ping', c: performance.now() });
    this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  close(): void {
    this.wantOpen = false;
    this.stopPing();
    this.ws?.close();
    this.ws = null;
    this.setState('closed');
  }
}

/** Game server URL from the environment (defaults to a local dev server). */
export function gameServerUrl(): string {
  const env = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  if (env) return env;
  if (typeof window !== 'undefined') return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:3001/ws`;
  return 'ws://localhost:3001/ws';
}
