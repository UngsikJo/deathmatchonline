import { describe, expect, it } from 'vitest';
import { Simulation } from './simulation.js';
import { RULES, SKILLS, move, normalize } from './rules.js';
import { applyOutcome, emptyStats, parseInput } from './protocol.js';

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
  Object.assign(game.players.get('a')!, { x: 450, y: 320 });
  Object.assign(game.players.get('b')!, { x: 500, y: 320 });
  return game;
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
  it('normalizes diagonal movement and stops stale input', () => {
    expect(Math.hypot(...Object.values(normalize(1, 1)))).toBeCloseTo(1);
    const straight = duel();
    const diagonal = duel();
    straight.input('a', { seq: 0, x: 1, y: 0 });
    diagonal.input('a', { seq: 0, x: 1, y: 1 });
    straight.step();
    diagonal.step();
    const a = straight.players.get('a')!;
    const b = diagonal.players.get('a')!;
    expect(Math.hypot(a.x - 150, a.y - 320)).toBeCloseTo(Math.hypot(b.x - 150, b.y - 320));
    advance(straight, 500);
    const x = a.x;
    advance(straight, 500);
    expect(a.x).toBe(x);
  });
  it('prevents tunneling through walls even during a long displacement', () => {
    const point = move({ x: 250, y: 200 }, { x: 200, y: 0 });
    expect(point.x).toBeLessThanOrEqual(280 - RULES.radius);
    expect(move({ x: 20, y: 20 }, { x: -100, y: -100 }).x).toBeGreaterThanOrEqual(RULES.radius);
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
    expect(started.players.get('a')!.x).toBeGreaterThan(150);
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
  it('moves exactly the dash distance across fixed-tick boundaries', () => {
    const game = duel();
    game.input('a', { seq: 0, x: 0, y: 0, skill: 'D' });
    advance(game, 250);
    expect(game.players.get('a')!.x).toBeCloseTo(270);
  });
  it('does not hit with a projectile through a wall', () => {
    const game = duel();
    Object.assign(game.players.get('a')!, { x: 240, y: 200 });
    Object.assign(game.players.get('b')!, { x: 390, y: 200 });
    game.input('a', { seq: 0, x: 0, y: 0, skill: 'S' });
    advance(game, 1000);
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
    game.input('a', { seq: 0, x: 0, y: 0, skill: 'E' });
    advance(game, 300);
    expect(game.players.get('b')!.x).toBeCloseTo(560);
    expect(game.players.get('b')!.hp).toBe(90);
    game.input('a', { seq: 1, x: 1, y: 0, skill: 'R' });
    const x = game.players.get('a')!.x;
    advance(game, 500);
    expect(game.players.get('a')!.x).toBe(x);
    expect(game.players.get('b')!.hp).toBe(90);
    advance(game, 400);
    expect(game.players.get('b')!.hp).toBe(55);
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
