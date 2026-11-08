import { Client, type Room } from '@colyseus/sdk';
import { emptyStats, type InputMessage, type PlayerStats, type Snapshot } from '@deathmatch/shared';
import { supabase } from '../lib/supabase';

const RECONNECT_KEY = 'deathmatch.reconnect';
const GUEST_KEY = 'deathmatch.guest';
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
interface View {
  status: ConnectionStatus;
  snapshot: Snapshot | null;
  sessionId: string | null;
  stats: PlayerStats;
  error: string;
}

export class GameSession {
  private client = new Client(import.meta.env.VITE_GAME_SERVER_URL || 'http://localhost:2567');
  private room: Room | null = null;
  private listeners = new Set<() => void>();
  private view: View = {
    status: 'idle',
    snapshot: null,
    sessionId: null,
    stats: emptyStats(),
    error: '',
  };
  private epoch = 0;
  private sequence = 0;
  private rendererReady = false;
  private lastReceivedAt = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<View>) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  async connect(nickname: string, restore = false): Promise<void> {
    if (this.view.status === 'connecting' || this.room) return;
    const epoch = ++this.epoch;
    this.update({ status: 'connecting', snapshot: null, error: '' });
    try {
      const savedToken = restore ? sessionStorage.getItem(RECONNECT_KEY) : null;
      if (restore && !savedToken) {
        this.update({ status: 'idle' });
        return;
      }
      const auth = await supabase?.auth.getSession();
      const guestId = sessionStorage.getItem(GUEST_KEY) || crypto.randomUUID();
      sessionStorage.setItem(GUEST_KEY, guestId);
      const room = savedToken
        ? await this.client.reconnect(savedToken)
        : await this.client.joinOrCreate('duel', {
            nickname,
            guestId,
            token: auth?.data.session?.access_token,
          });
      if (epoch !== this.epoch) {
        await room.leave();
        return;
      }
      this.room = room;
      this.sequence = 0;
      // The SDK default of 5s would refuse to reconnect during the first seconds of a match.
      room.reconnection.minUptime = 1000;
      room.onMessage<Snapshot>('snapshot', (snapshot) => {
        if (this.room !== room || snapshot.protocol !== 2) return;
        this.lastReceivedAt = performance.now();
        const mine = snapshot.players.find((p) => p.id === room.sessionId);
        this.sequence = Math.max(this.sequence, (mine?.lastSeq ?? -1) + 1);
        this.update({ snapshot });
        if (snapshot.phase === 'finished') sessionStorage.removeItem(RECONNECT_KEY);
      });
      room.onMessage<{ stats: PlayerStats }>('welcome', ({ stats }) => this.update({ stats }));
      room.onMessage<PlayerStats>('stats', (stats) => this.update({ stats }));
      room.onDrop(() => {
        if (this.room === room) this.update({ status: 'reconnecting' });
      });
      room.onReconnect(() => {
        if (this.room !== room) return;
        sessionStorage.setItem(RECONNECT_KEY, room.reconnectionToken);
        this.update({ status: 'connected' });
        room.send('sync');
      });
      room.onError((_code, message) => {
        if (this.room === room) this.update({ error: message || '연결 오류가 발생했습니다.' });
      });
      room.onLeave(() => {
        if (this.room !== room) return;
        this.room = null;
        sessionStorage.removeItem(RECONNECT_KEY);
        const finished = this.view.snapshot?.phase === 'finished';
        this.update({
          status: finished ? 'idle' : 'error',
          error: finished ? '' : '연결이 종료되었습니다. 서버 상태를 확인한 뒤 다시 참가하세요.',
        });
      });
      sessionStorage.setItem(RECONNECT_KEY, room.reconnectionToken);
      this.update({ status: 'connected', sessionId: room.sessionId });
      room.send('sync');
      if (this.rendererReady) room.send('ready');
    } catch (error) {
      if (epoch !== this.epoch) return;
      sessionStorage.removeItem(RECONNECT_KEY);
      this.update({
        status: 'error',
        error: error instanceof Error ? error.message : '서버에 연결할 수 없습니다.',
      });
    }
  }

  ready() {
    this.rendererReady = true;
    this.room?.send('ready');
  }

  sendInput(x: number, y: number, skill?: InputMessage['skill']) {
    if (this.view.status !== 'connected' || this.view.snapshot?.phase !== 'active') return;
    this.room?.send('input', { seq: this.sequence++, x, y, ...(skill ? { skill } : {}) });
  }

  surrender() {
    this.room?.send('surrender');
  }

  async leave(): Promise<void> {
    ++this.epoch;
    const room = this.room;
    this.room = null;
    sessionStorage.removeItem(RECONNECT_KEY);
    this.update({ status: 'idle', snapshot: null, sessionId: null, error: '' });
    if (room) await room.leave().catch(() => undefined);
  }

  newGuest() {
    if (this.room || this.view.status === 'connecting') return;
    sessionStorage.setItem(GUEST_KEY, crypto.randomUUID());
    this.update({ stats: emptyStats(), snapshot: null });
  }

  renderTime() {
    const snapshot = this.view.snapshot;
    if (!snapshot) return 0;
    return (
      snapshot.time +
      (snapshot.phase === 'active' || snapshot.phase === 'countdown'
        ? Math.min(150, Math.max(0, performance.now() - this.lastReceivedAt))
        : 0)
    );
  }
}

export const gameSession = new GameSession();
