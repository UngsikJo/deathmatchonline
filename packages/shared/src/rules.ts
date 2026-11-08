export const RULES = {
  version: 'prototype-0.2',
  width: 960,
  height: 540,
  /** World y of the floor. A body's y is its feet, so standing means y === groundY. */
  groundY: 471,
  spawnX: [300, 660],
  halfWidth: 28,
  standHeight: 140,
  crouchHeight: 92,
  speed: 180,
  airSpeedMultiplier: 1.4,
  jumpSpeed: 900,
  gravity: 2400,
  maxHp: 100,
  tickMs: 1000 / 30,
  snapshotMs: 50,
  countdownMs: 3000,
  matchMs: 120_000,
  staleInputMs: 250,
  reconnectMs: 10_000,
  globalCooldownMs: 250,
  hitstunMs: 180,
  dashMs: 180,
  dashDistance: 120,
  effectMs: 220,
  slowMultiplier: 0.6,
} as const;

export const SKILL_KEYS = ['A', 'S', 'D', 'F', 'Q', 'W', 'E', 'R'] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];
export const SKILLS: Record<
  SkillKey,
  { name: string; cooldownMs: number; castMs: number; damage: number; description: string }
> = {
  A: {
    name: '베기',
    cooldownMs: 700,
    castMs: 120,
    damage: 12,
    description: '전방 상단 베기 · 앉으면 회피',
  },
  S: {
    name: '마력탄',
    cooldownMs: 3000,
    castMs: 0,
    damage: 16,
    description: '중단 직선 투사체 · 점프로 회피',
  },
  D: {
    name: '돌진',
    cooldownMs: 5000,
    castMs: 0,
    damage: 0,
    description: '누른 좌우 방향으로 돌진, 입력이 없으면 상대 쪽으로',
  },
  F: {
    name: '보호막',
    cooldownMs: 8000,
    castMs: 0,
    damage: 0,
    description: '1.2초 동안 피해 20 흡수',
  },
  Q: {
    name: '폭발',
    cooldownMs: 7000,
    castMs: 500,
    damage: 22,
    description: '주변 범위 공격 · 범위 밖으로 벗어나 회피',
  },
  W: {
    name: '속박탄',
    cooldownMs: 9000,
    castMs: 0,
    damage: 8,
    description: '상단 탄, 명중 시 1.5초 둔화 · 앉으면 회피',
  },
  E: {
    name: '충격파',
    cooldownMs: 6000,
    castMs: 200,
    damage: 10,
    description: '지면 충격파와 밀치기 · 점프로 회피',
  },
  R: {
    name: '결정타',
    cooldownMs: 20_000,
    castMs: 800,
    damage: 35,
    description: '긴 예고 후 강한 직선 공격 · 점프로 회피',
  },
};

export interface Vec2 {
  x: number;
  y: number;
}
export type Facing = 1 | -1;

/** Offsets in world px: from/to along the attacker's facing, bottom/top above the attacker's feet. */
export interface AttackBox {
  from: number;
  to: number;
  bottom: number;
  top: number;
}
export const ATTACKS: Record<'A' | 'Q' | 'E' | 'R', AttackBox> = {
  A: { from: 0, to: 100, bottom: 96, top: 170 },
  Q: { from: -110, to: 110, bottom: 0, top: 200 },
  E: { from: 0, to: 130, bottom: 0, top: 60 },
  R: { from: 0, to: 300, bottom: 40, top: 130 },
};
export const PROJECTILES: Record<'S' | 'W', { speed: number; height: number; radius: number }> = {
  S: { speed: 520, height: 80, radius: 6 },
  W: { speed: 400, height: 124, radius: 6 },
};
export const PROJECTILE_RANGE = 480;
export const SHOCKWAVE_PUSH = 60;

export interface BodyState extends Vec2 {
  vy: number;
  crouching: boolean;
}
export interface BodyControl {
  move: number;
  jump: boolean;
  crouch: boolean;
  /** Casting or in hitstun: no walking, jumping or crouching. Gravity still applies. */
  locked: boolean;
  slowed: boolean;
}

export function clampStageX(x: number): number {
  return Math.min(RULES.width - RULES.halfWidth, Math.max(RULES.halfWidth, x));
}

export function isGrounded(body: Vec2): boolean {
  return body.y >= RULES.groundY;
}

export function bodyHeight(body: { crouching: boolean }): number {
  return body.crouching ? RULES.crouchHeight : RULES.standHeight;
}

/**
 * One fixed step of side-view movement, shared by the server and client prediction.
 * `walkMs` lets a tick that is partly spent dashing walk for only the remainder.
 */
export function stepBody(body: BodyState, control: BodyControl, dtMs: number, walkMs = dtMs): void {
  const grounded = isGrounded(body);
  body.crouching = grounded && control.crouch && !control.locked;
  if (grounded && control.jump && !control.locked && !control.crouch) body.vy = -RULES.jumpSpeed;
  if (!control.locked && !body.crouching) {
    const speed =
      RULES.speed *
      (control.slowed ? RULES.slowMultiplier : 1) *
      (grounded ? 1 : RULES.airSpeedMultiplier);
    body.x = clampStageX(body.x + (Math.sign(control.move) * speed * walkMs) / 1000);
  }
  const dt = dtMs / 1000;
  // Exact parabola, so the jump arc does not depend on the caller's step size.
  const y = body.y + body.vy * dt + 0.5 * RULES.gravity * dt * dt;
  if (y >= RULES.groundY) {
    body.y = RULES.groundY;
    body.vy = 0;
  } else {
    body.y = y;
    body.vy += RULES.gravity * dt;
  }
}

function overlaps(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax && bMin < aMax;
}

export function bodiesOverlapVertically(
  a: Vec2 & { crouching: boolean },
  b: Vec2 & { crouching: boolean },
): boolean {
  return overlaps(a.y - bodyHeight(a), a.y, b.y - bodyHeight(b), b.y);
}

export function attackHits(
  attacker: Vec2,
  facing: Facing,
  box: AttackBox,
  target: Vec2 & { crouching: boolean },
): boolean {
  const near = attacker.x + facing * box.from;
  const far = attacker.x + facing * box.to;
  return (
    overlaps(
      Math.min(near, far),
      Math.max(near, far),
      target.x - RULES.halfWidth,
      target.x + RULES.halfWidth,
    ) &&
    overlaps(attacker.y - box.top, attacker.y - box.bottom, target.y - bodyHeight(target), target.y)
  );
}

/** Horizontal sweep of a projectile moving from fromX to toX at a fixed height. */
export function projectileHits(
  fromX: number,
  toX: number,
  y: number,
  radius: number,
  target: Vec2 & { crouching: boolean },
): boolean {
  return (
    overlaps(
      Math.min(fromX, toX) - radius,
      Math.max(fromX, toX) + radius,
      target.x - RULES.halfWidth,
      target.x + RULES.halfWidth,
    ) && overlaps(y - radius, y + radius, target.y - bodyHeight(target), target.y)
  );
}
