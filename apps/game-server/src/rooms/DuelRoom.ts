import { Client, Room, ServerError } from '@colyseus/core';
import { RULES, Simulation, parseInput } from '@deathmatch/shared';
import type { Identity, DevStore } from '../services.js';

export function makeDuelRoom(
  store: DevStore,
  authenticate: (options: unknown) => Promise<Identity>,
) {
  return class DuelRoom extends Room {
    maxClients = 2;
    patchRate = null;
    private game = new Simulation();
    private identities = new Map<string, Identity>();
    private disconnects = new Map<string, { used: number; droppedAt: number | null }>();
    private messageWindows = new Map<string, { start: number; count: number }>();
    private finalized = false;

    onCreate(): void {
      this.setFixedTimestep(() => {
        this.game.step();
        this.finalize();
      }, 30);
      this.clock.setInterval(
        () => this.broadcast('snapshot', this.game.snapshot()),
        RULES.snapshotMs,
      );
      this.onMessage('sync', (client) => {
        const identity = this.identities.get(client.sessionId);
        if (!identity) return;
        client.send('welcome', {
          userId: identity.userId,
          stats: store.get(identity.userId),
          mode: 'local-memory',
        });
        client.send('snapshot', this.game.snapshot());
      });
      this.onMessage('ready', (client) => this.game.ready(client.sessionId));
      this.onMessage('input', (client, value: unknown) => {
        if (!this.withinRate(client)) return;
        const input = parseInput(value);
        if (input) this.game.input(client.sessionId, input);
      });
      this.onMessage('surrender', (client) => {
        this.game.forfeit(client.sessionId, 'surrender');
        this.finalize();
      });
    }

    async onAuth(_client: Client, options: unknown): Promise<Identity> {
      return authenticate(options);
    }

    onJoin(client: Client): void {
      const identity = client.auth as Identity;
      if (!store.claim(identity.userId, this.roomId))
        throw new ServerError(409, '이미 대기 중이거나 경기에 참여 중입니다.');
      this.identities.set(client.sessionId, identity);
      this.disconnects.set(client.sessionId, { used: 0, droppedAt: null });
      this.game.addPlayer(client.sessionId, identity.nickname);
      // Idle tabs must not reserve an opponent forever.
      this.clock.setTimeout(() => {
        const player = this.game.players.get(client.sessionId);
        if (player && !player.ready && this.game.phase === 'waiting') client.leave(4000);
      }, 15_000);
    }

    onDrop(client: Client): void {
      this.game.setConnected(client.sessionId, false);
      if (this.game.phase !== 'active') return;
      const budget = this.disconnects.get(client.sessionId)!;
      budget.droppedAt = Date.now();
      const remaining = Math.max(0, RULES.reconnectMs - budget.used);
      if (remaining > 0)
        void this.allowReconnection(client, remaining / 1000).catch(() => undefined);
    }

    onReconnect(client: Client): void {
      const budget = this.disconnects.get(client.sessionId)!;
      budget.used += budget.droppedAt === null ? 0 : Date.now() - budget.droppedAt;
      budget.droppedAt = null;
      this.game.setConnected(client.sessionId, true);
    }

    onLeave(client: Client): void {
      if (this.game.phase === 'active') {
        this.game.setConnected(client.sessionId, false);
        this.game.forfeit(client.sessionId, 'disconnect');
        this.finalize();
      } else if (this.game.phase !== 'finished') {
        this.game.leaveBeforeStart(client.sessionId);
      }
      const identity = this.identities.get(client.sessionId);
      if (identity) store.release(identity.userId, this.roomId);
      if (!this.finalized) this.identities.delete(client.sessionId);
      this.disconnects.delete(client.sessionId);
      this.messageWindows.delete(client.sessionId);
    }

    onDispose(): void {
      for (const identity of this.identities.values()) store.release(identity.userId, this.roomId);
    }

    private finalize(): void {
      if (!this.game.result || this.finalized) return;
      this.finalized = true;
      void this.lock();
      store.settle(
        this.roomId,
        [...this.identities].map(([sessionId, identity]) => ({
          sessionId,
          userId: identity.userId,
        })),
        this.game.result,
      );
      for (const client of this.clients) {
        const identity = this.identities.get(client.sessionId);
        if (identity) client.send('stats', store.get(identity.userId));
      }
      this.broadcast('snapshot', this.game.snapshot());
      // Keep the result available briefly for reconnect/slow clients, then release resources.
      this.clock.setTimeout(() => void this.disconnect(), 60_000);
    }

    private withinRate(client: Client): boolean {
      const now = Date.now();
      let window = this.messageWindows.get(client.sessionId);
      if (!window || now - window.start >= 1000) {
        window = { start: now, count: 0 };
        this.messageWindows.set(client.sessionId, window);
      }
      return ++window.count <= 90;
    }
  };
}
