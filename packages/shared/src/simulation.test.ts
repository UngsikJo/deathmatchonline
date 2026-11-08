import { describe, expect, it } from 'vitest';
import { Simulation } from './simulation.js';
import { RULES, SKILLS, stepBody, type BodyState } from './rules.js';
import { applyOutcome, emptyStats, parseInput } from './protocol.js';

const GROUND = RULES.groundY;

function duel() {
  const game = new Simulation();
  game.addPlayer('a', '도전자A');
  game.addPlayer('b', '도전자B');
  game.ready('a');
  game.ready('b');
  for (let i = 0; i < 91; i++) game.step();
  return game;
}
function advance(game: Simulation, ms: number) {
  for (let i = 0; i < Math.ceil(ms / RULES.tickMs); i++) game.step();
}
function nearby() {
  const game = duel();
  Object.assign(game.players.get('a')!, { x: 440 });
  Object.assign(game.players.get('b')!, { x: 520 });
  return game;
}
/** Keeps a held input fresh, as a real client does at the tick rate. */
function hold(game: Simulation, id: string, x: number, y: number, ms: number, seq = 0) {
  for (let i = 0; i < Math.ceil(ms / RULES.tickMs); i++) {
    game.input(id, { seq: seq + i, x, y });
    game.step();
  }
}

describe('input boundary and movement', () => {
  it('rejects malformed, infinite, oversized and unknown skill inputs', () => {
    for (const input of [
      null,
      {},
      { seq: 0, x: Infinity, y: 0 },
      { seq: 0, x: 100, y: 0 },
      { seq: 0.1, x: 0, y: 0 },
      { seq: 0, x: 0, y: 0, skill: 'X' },
    ]) {
      expect(parseInput(input)).toBeNull();
    }
    expect(parseInput({ seq: 1, x: -1, y: 1, skill: 'R', hp: 999 })).toEqual({
      seq: 1,
      x: -1,
      y: 1,
      skill: 'R',
    });
  });
  it('walks along the ground only and stops on stale input', () => {
    const game = duel();
    const a = game.players.get('a')!;
    game.input('a', { seq: 0, x: 1, y: 0 });
    game.step();
    expect(a.x).toBeCloseTo(RULES.spawnX[0] + RULES.speed * (RULES.tickMs / 1000));
    expect(a.y).toBe(GROUND);
    advance(game, 500);
    const x = a.x;
    advance(game, 500);
    expect(a.x).toBe(x);
  });
  it('jumps in an arc, lands on the floor, and cannot jump again in the air', () => {
    const game = duel();
    const a = game.players.get('a')!;
    game.input('a', { seq: 0, x: 0, y: -1 });
    game.step();
    expect(a.y).toBeLessThan(GROUND);
    advance(game, 150);
    const rising = a.vy;
    expect(rising).toBeLessThan(0);
    game.input('a', { seq: 1, x: 0, y: -1 });
    game.step();
    expect(a.vy).toBeGreaterThan(rising);
    advance(game, 1000);
    expect(a.y).toBe(GROUND);
    expect(a.vy).toBe(0);
  });
  it('produces the same jump height at client and server step sizes', () => {
    const apex = (dt: number) => {
      const body: BodyState = { x: 100, y: GROUND, vy: 0, crouching: false };
      const control = { move: 0, jump: true, crouch: false, locked: false, slowed: false };
      let top = GROUND;
      stepBody(body, control, dt);
      for (let i = 0; i < 1000 && body.vy < 0; i++) {
        stepBody(body, { ...control, jump: false }, dt);
        top = Math.min(top, body.y);
      }
      return GROUND - top;
    };
    expect(Math.abs(apex(1000 / 30) - apex(1000 / 120))).toBeLessThan(3);
  });
  it('crouches in place and stands back up', () => {
    const game = duel();
    const a = game.players.get('a')!;
    hold(game, 'a', 1, 1, 200);
    expect(a.crouching).toBe(true);
    expect(a.x).toBe(RULES.spawnX[0]);
    expect(a.y).toBe(GROUND);
    hold(game, 'a', 0, 0, 100, 100);
    expect(a.crouching).toBe(false);
  });
  it('keeps fighters inside the stage', () => {
    const game = duel();
    const a = game.players.get('a')!;
    a.x = RULES.halfWidth + 1;
    hold(game, 'a', -1, 0, 300);
    expect(a.x).toBe(RULES.halfWidth);
  });
  it('blocks walking through the opponent but allows jumping over and turns around', () => {
    const walled = nearby();
    const [a1, b1] = [walled.players.get('a')!, walled.players.get('b')!];
    hold(walled, 'a', 1, 0, 1000);
    expect(b1.x - a1.x).toBeGreaterThanOrEqual(RULES.halfWidth * 2 - 1e-6);
    expect(a1.x).toBeLessThan(b1.x);

    const game = nearby();
    const [a, b] = [game.players.get('a')!, game.players.get('b')!];
    b.x = a.x + 126;
    expect(a.facing).toBe(1);
    hold(game, 'a', 1, -1, 700);
    hold(game, 'a', 0, 0, 500, 100);
    expect(a.y).toBe(GROUND);
    expect(a.x).toBeGreaterThan(b.x);
    expect(a.facing).toBe(-1);
    expect(b.facing).toBe(1);
  });
  it('locks input during countdown and rejects old sequence numbers', () => {
    const game = new Simulation();
    game.addPlayer('a', '도전자A');
    game.input('a', { seq: 0, x: 1, y: 0, skill: 'F' });
    expect(game.players.get('a')!.shield).toBe(0);
    const started = duel();
    started.input('a', { seq: 2, x: 1, y: 0 });
    started.input('a', { seq: 1, x: -1, y: 0 });
    started.step();
    expect(started.players.get('a')!.x).toBeGreaterThan(RULES.spawnX[0]);
  });
});

describe('combat and outcomes', () => {
  it('applies a melee hit only once and enforces its cooldown', () => {
    const game = nearby();
    game.input('a', { seq: 0, x: 0, y: 0, skill: 'A' });
    advance(game, 200);
    expect(game.players.get('b')!.hp).toBe(100 - SKILLS.A.damage);
    game.input('a', { seq: 1, x: 0, y: 0, skill: 'A' });
    advance(game, 300);
    expect(game.players.get('b')!.hp).toBe(88);
  });
  it('dodges a high slash by crouching and is rooted while casting', () => {
    const game = nearby();
    const a = game.players.get('a')!;
    hold(game, 'b', 0, 1, 66);
    game.input('b', { seq: 50, x: 0, y: 1 });
    game.input('a', { seq: 0, x: 1, y: 0, skill: 'A' });
    const x = a.x;
    advance(game, 66);
    expect(a.x).toBe(x);
    game.input('b', { seq: 51, x: 0, y: 1 });
    advance(game, 150);
    expect(game.players.get('b')!.hp).toBe(100);
  });
  it('matches each attack height: crouch beats highs, jump beats lows and mids', () => {
    const outcome = (skill: 'S' | 'W' | 'E', stance: 'crouch' | 'jump') => {
      const game = nearby();
      const b = game.players.get('b')!;
      if (stance === 'crouch') b.crouching = true;
      else Object.assign(b, { y: GROUND - 150 });
      // Holding the pose stops gravity or a stand-up from changing the stance mid-test.
      const pin = () => (stance === 'crouch' ? game.input('b', { seq: seq++, x: 0, y: 1 }) : null);
      let seq = 0;
      pin();
      game.input('a', { seq: 0, x: 0, y: 0, skill });
      for (let i = 0; i < 12; i++) {
        pin();
        if (stance === 'jump') Object.assign(b, { y: GROUND - 150, vy: 0 });
        game.step();
      }
      return b.hp;
    };
    expect(outcome('S', 'crouch')).toBe(100 - SKILLS.S.damage);
    expect(outcome('W', 'crouch')).toBe(100);
    expect(outcome('S', 'jump')).toBe(100);
    expect(outcome('E', 'jump')).toBe(100);
    expect(outcome('E', 'crouch')).toBe(100 - SKILLS.E.damage);
  });
  it('freezes the target briefly on a damaging hit, but not when the shield absorbs it', () => {
    const game = nearby();
    const b = game.players.get('b')!;
    game.input('a', { seq: 0, x: 0, y: 0, skill: 'A' });
    advance(game, 150);
    expect(b.hitUntil).toBeGreaterThan(game.time);
    const x = b.x;
    game.input('b', { seq: 0, x: 1, y: 0, skill: 'F' });
    game.step();
    expect(b.x).toBe(x);
    expect(b.shield).toBe(0);

    const shielded = nearby();
    const c = shielded.players.get('b')!;
    shielded.input('b', { seq: 0, x: 0, y: 0, skill: 'F' });
    shielded.input('a', { seq: 0, x: 0, y: 0, skill: 'A' });
    advance(shielded, 150);
    expect(c.hp).toBe(100);
    expect(c.hitUntil).toBe(0);
  });
  it('absorbs shield damage and applies slow independently', () => {
    const game = nearby();
    game.input('b', { seq: 0, x: 0, y: 0, skill: 'F' });
    game.input('a', { seq: 0, x: 0, y: 0, skill: 'W' });
    advance(game, 150);
    const target = game.players.get('b')!;
    expect(target.hp).toBe(100);
    expect(target.shield).toBe(12);
    expect(target.slowUntil).toBeGreaterThan(game.time);
  });
  it('resolves same-tick lethal attacks as a draw', () => {
    const game = nearby();
    game.players.get('a')!.hp = 12;
    game.players.get('b')!.hp = 12;
    game.input('a', { seq: 0, x: 0, y: 0, skill: 'A' });
    game.input('b', { seq: 0, x: 0, y: 0, skill: 'A' });
    advance(game, 200);
    expect(game.result).toEqual({ winnerId: null, reason: 'draw' });
  });
  it('moves exactly the dash distance toward the opponent or the held direction', () => {
    const forward = duel();
    forward.input('a', { seq: 0, x: 0, y: 0, skill: 'D' });
    advance(forward, 250);
    expect(forward.players.get('a')!.x).toBeCloseTo(RULES.spawnX[0] + RULES.dashDistance);
    const back = duel();
    back.input('a', { seq: 0, x: -1, y: 0, skill: 'D' });
    advance(back, RULES.staleInputMs + RULES.dashMs + 100);
    const x = back.players.get('a')!.x;
    expect(x).toBeLessThanOrEqual(RULES.spawnX[0] - RULES.dashDistance);
  });
  it('removes a projectile once it passes the end of its range', () => {
    const game = duel();
    Object.assign(game.players.get('a')!, { x: 100 });
    Object.assign(game.players.get('b')!, { x: 900 });
    game.input('a', { seq: 0, x: 0, y: 0, skill: 'S' });
    advance(game, 1500);
    expect(game.players.get('b')!.hp).toBe(100);
    expect(game.projectiles).toHaveLength(0);
  });
  it('delays the area explosion until its telegraph completes', () => {
    const game = nearby();
    game.input('a', { seq: 0, x: 0, y: 0, skill: 'Q' });
    advance(game, 300);
    expect(game.players.get('b')!.hp).toBe(100);
    advance(game, 300);
    expect(game.players.get('b')!.hp).toBe(78);
  });
  it('pushes a target with shockwave and locks movement during ultimate windup', () => {
    const game = nearby();
    const b = game.players.get('b')!;
    game.input('a', { seq: 0, x: 0, y: 0, skill: 'E' });
    advance(game, 300);
    expect(b.x).toBeCloseTo(580);
    expect(b.hp).toBe(90);
    game.input('a', { seq: 1, x: 1, y: 0, skill: 'R' });
    const x = game.players.get('a')!.x;
    advance(game, 500);
    expect(game.players.get('a')!.x).toBe(x);
    expect(b.hp).toBe(90);
    advance(game, 400);
    expect(b.hp).toBe(55);
  });
  it('uses HP for timeout and never overwrites a final result', () => {
    const game = duel();
    game.players.get('b')!.hp = 50;
    game.endsAt = game.time + RULES.tickMs;
    game.step();
    game.forfeit('a', 'surrender');
    expect(game.result).toEqual({ winnerId: 'a', reason: 'timeout' });
  });
  it('voids a disconnect outcome if neither player is connected', () => {
    const game = duel();
    game.setConnected('a', false);
    game.setConnected('b', false);
    game.forfeit('a', 'disconnect');
    expect(game.result).toEqual({ winnerId: null, reason: 'void' });
  });
  it('does not expose mutable simulation internals in snapshots', () => {
    const game = duel();
    const snapshot = game.snapshot();
    snapshot.players[0]!.hp = 0;
    snapshot.players[0]!.cooldowns.A = 999;
    expect(game.players.get('a')!.hp).toBe(100);
    expect(game.players.get('a')!.cooldowns.A).toBe(0);
    expect(snapshot.players[0]).not.toHaveProperty('input');
  });
  it('preserves the best streak after defeat and ends current streak on draws', () => {
    let stats = emptyStats();
    for (let i = 0; i < 4; i++) stats = applyOutcome(stats, 'win');
    expect(applyOutcome(stats, 'loss')).toMatchObject({
      currentStreak: 0,
      bestStreak: 4,
      wins: 4,
      losses: 1,
    });
    expect(applyOutcome(stats, 'draw')).toMatchObject({
      currentStreak: 0,
      bestStreak: 4,
      draws: 1,
    });
  });
});
