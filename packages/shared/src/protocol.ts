import { SKILL_KEYS, type Facing, type SkillKey, type Vec2 } from './rules.js';

export interface InputMessage {
  seq: number;
  x: number;
  y: number;
  skill?: SkillKey;
}
export type Phase = 'waiting' | 'countdown' | 'active' | 'finished';
export type EndReason = 'ko' | 'timeout' | 'draw' | 'surrender' | 'disconnect' | 'void';
export interface MatchResult {
  winnerId: string | null;
  reason: EndReason;
}
export interface PlayerStats {
  currentStreak: number;
  bestStreak: number;
  wins: number;
  losses: number;
  draws: number;
}
export interface Cast {
  key: SkillKey;
  resolveAt: number;
  direction: Facing;
}
export interface PlayerSnapshot extends Vec2 {
  id: string;
  nickname: string;
  slot: number;
  hp: number;
  /** Vertical velocity in px/s, negative while rising. */
  vy: number;
  crouching: boolean;
  facing: Facing;
  connected: boolean;
  ready: boolean;
  shield: number;
  shieldUntil: number;
  slowUntil: number;
  hitUntil: number;
  dashUntil: number;
  cooldowns: Record<SkillKey, number>;
  cast: Cast | null;
  lastSeq: number;
}
export interface Projectile extends Vec2 {
  id: number;
  ownerId: string;
  key: 'S' | 'W';
  direction: Facing;
  remaining: number;
}
export interface Effect extends Vec2 {
  id: number;
  ownerId: string;
  key: SkillKey;
  direction: Facing;
  until: number;
}
export interface Snapshot {
  protocol: 2;
  phase: Phase;
  time: number;
  startsAt: number;
  endsAt: number;
  players: PlayerSnapshot[];
  projectiles: Projectile[];
  effects: Effect[];
  result: MatchResult | null;
}

export function parseInput(value: unknown): InputMessage | null {
  if (!value || typeof value !== 'object') return null;
  const { seq, x, y, skill } = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(seq) ||
    (seq as number) < 0 ||
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    Math.abs(x) > 1 ||
    Math.abs(y) > 1 ||
    (skill !== undefined && !SKILL_KEYS.includes(skill as SkillKey))
  )
    return null;
  return { seq: seq as number, x, y, ...(skill === undefined ? {} : { skill: skill as SkillKey }) };
}

export function emptyStats(): PlayerStats {
  return { currentStreak: 0, bestStreak: 0, wins: 0, losses: 0, draws: 0 };
}

export function applyOutcome(stats: PlayerStats, outcome: 'win' | 'loss' | 'draw'): PlayerStats {
  const next = { ...stats };
  if (outcome === 'win') {
    next.wins++;
    next.currentStreak++;
    next.bestStreak = Math.max(next.bestStreak, next.currentStreak);
  } else {
    next.currentStreak = 0;
    if (outcome === 'loss') next.losses++;
    else next.draws++;
  }
  return next;
}
