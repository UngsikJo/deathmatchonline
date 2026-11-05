import { describe, expect, it } from 'vitest';
import { DevStore, makeAuthenticate } from './services.js';
import { loadConfig } from './config.js';

describe('development participation and settlement', () => {
  it('prevents multiple concurrent participations and stale releases', () => {
    const store = new DevStore();
    expect(store.claim('user', 'room-a')).toBe(true);
    expect(store.claim('user', 'room-b')).toBe(false);
    store.release('user', 'room-b');
    expect(store.claim('user', 'room-b')).toBe(false);
    store.release('user', 'room-a');
    expect(store.claim('user', 'room-b')).toBe(true);
  });
  it('settles once, preserves best streak and excludes void matches', () => {
    const store = new DevStore();
    const participants = [
      { sessionId: 'a', userId: 'u1' },
      { sessionId: 'b', userId: 'u2' },
    ];
    for (let i = 0; i < 10; i++)
      store.settle('match1', participants, { winnerId: 'a', reason: 'ko' });
    expect(store.get('u1')).toMatchObject({ currentStreak: 1, wins: 1 });
    expect(store.get('u2')).toMatchObject({ losses: 1 });
    store.settle('match2', participants, { winnerId: null, reason: 'void' });
    expect(store.get('u1').currentStreak).toBe(1);
    store.settle('match3', participants, { winnerId: 'b', reason: 'ko' });
    expect(store.get('u1')).toMatchObject({ currentStreak: 0, bestStreak: 1, losses: 1 });
  });
  it('fails closed on production startup and invalid guest configuration', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('production');
    expect(() => loadConfig({ ALLOW_DEV_GUESTS: 'false' })).toThrow('Supabase');
    expect(() => loadConfig({ PORT: 'NaN' })).toThrow('PORT');
  });
  it('rejects invalid identity input and never treats an invalid token as a guest', async () => {
    const authenticate = makeAuthenticate(loadConfig({}));
    await expect(authenticate({ guestId: 'bad', nickname: '도전자' })).rejects.toThrow();
    await expect(
      authenticate({ guestId: crypto.randomUUID(), nickname: '<script>' }),
    ).rejects.toThrow();
    await expect(
      authenticate({ guestId: crypto.randomUUID(), nickname: '도전자', token: 'forged' }),
    ).rejects.toThrow();
    await expect(
      authenticate({ guestId: crypto.randomUUID(), nickname: '도전자' }),
    ).resolves.toMatchObject({ mode: 'guest' });
  });
});
