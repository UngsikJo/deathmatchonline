import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { Client, CloseCode, type Room } from '@colyseus/sdk';
import type { PlayerStats, Snapshot } from '@deathmatch/shared';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('No test port'));
      server.close(() => resolve(address.port));
    });
  });
}
async function until(check: () => boolean, message: string, ms = 8000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(message);
}

const port = await freePort();
const endpoint = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--import', 'tsx', 'apps/game-server/src/index.ts'], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: String(port),
    ALLOW_DEV_GUESTS: 'true',
    SUPABASE_URL: '',
    SUPABASE_PUBLISHABLE_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => {
  output += String(chunk);
});
child.stderr.on('data', (chunk) => {
  output += String(chunk);
});
const rooms: Room[] = [];
try {
  let healthy = false;
  const deadline = Date.now() + 10_000;
  while (!healthy && Date.now() < deadline) {
    try {
      healthy = (await fetch(`${endpoint}/health`)).ok;
    } catch {
      /* booting */
    }
    if (!healthy) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(healthy, `Server did not start:\n${output}`);
  assert.equal(
    (await fetch(`${endpoint}/health`, { headers: { Origin: 'https://untrusted.example' } }))
      .status,
    403,
  );
  const client = new Client(endpoint);
  const guestA = crypto.randomUUID();
  const a = await client.joinOrCreate('duel', { guestId: guestA, nickname: '도전자A' });
  rooms.push(a);
  let snapshotA: Snapshot | undefined;
  let statsA: PlayerStats | undefined;
  a.onMessage<Snapshot>('snapshot', (s) => {
    snapshotA = s;
  });
  a.onMessage('welcome', () => undefined);
  a.onMessage<PlayerStats>('stats', (s) => {
    statsA = s;
  });
  a.send('sync');
  a.send('ready');
  await assert.rejects(
    client.joinOrCreate('duel', { guestId: guestA, nickname: '중복사용자' }),
    /이미/,
  );
  const b = await client.joinOrCreate('duel', {
    guestId: crypto.randomUUID(),
    nickname: '도전자B',
  });
  rooms.push(b);
  let snapshotB: Snapshot | undefined;
  b.onMessage<Snapshot>('snapshot', (s) => {
    snapshotB = s;
  });
  b.onMessage('welcome', () => undefined);
  b.onMessage('stats', () => undefined);
  b.send('sync');
  b.send('ready');
  assert.equal(a.roomId, b.roomId, 'Two clients must join the same match');
  await until(
    () => snapshotA?.phase === 'active' && snapshotB?.phase === 'active',
    'Match did not start',
  );
  const startX = snapshotA!.players.find((p) => p.id === a.sessionId)!.x;
  a.send('input', { seq: 0, x: 1, y: 0 });
  await until(
    () => (snapshotA?.players.find((p) => p.id === a.sessionId)?.x ?? 0) > startX,
    'Movement not reflected',
  );
  a.send('input', { seq: 1, x: 0, y: 0, skill: 'F' });
  await until(
    () => snapshotA?.players.find((p) => p.id === a.sessionId)?.shield === 20,
    'Shield not applied',
  );
  let dropped = false;
  let reconnected = false;
  a.onDrop(() => {
    dropped = true;
  });
  a.onReconnect(() => {
    reconnected = true;
  });
  const sessionBeforeDrop = a.sessionId;
  a.connection.close(CloseCode.MAY_TRY_RECONNECT, 'integration reconnect test');
  await until(() => dropped && reconnected, 'Client did not reconnect within the grace period');
  assert.equal(a.sessionId, sessionBeforeDrop);
  await until(
    () => snapshotB?.players.find((p) => p.id === a.sessionId)?.connected === true,
    'Opponent did not see the restored player',
  );
  b.send('surrender');
  b.send('surrender');
  await until(
    () => snapshotA?.phase === 'finished' && statsA?.wins === 1,
    'Result or stats not received',
  );
  assert.equal(snapshotA!.result?.winnerId, a.sessionId);
  assert.equal(statsA!.currentStreak, 1);
  await a.leave();
  await b.leave();
  const next = await client.joinOrCreate('duel', { guestId: guestA, nickname: '도전자A' });
  rooms.push(next);
  let restored: PlayerStats | undefined;
  next.onMessage('snapshot', () => undefined);
  next.onMessage('stats', () => undefined);
  next.onMessage<{ stats: PlayerStats }>('welcome', (s) => {
    restored = s.stats;
  });
  next.send('sync');
  next.send('ready');
  await until(() => restored?.currentStreak === 1, 'Streak was not preserved between matches');
  console.log(
    'PASS: health, origin, two-client matching, duplicate identity, countdown, movement, shield, reconnection, surrender, once-only settlement, streak preservation',
  );
} catch (error) {
  console.error(output);
  throw error;
} finally {
  await Promise.allSettled(rooms.map((room) => room.leave()));
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 2000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
