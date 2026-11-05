export const RULES = {
  version: 'prototype-0.1',
  width: 960,
  height: 640,
  radius: 16,
  speed: 180,
  maxHp: 100,
  tickMs: 1000 / 30,
  snapshotMs: 50,
  countdownMs: 3000,
  matchMs: 120_000,
  staleInputMs: 250,
  reconnectMs: 10_000,
  globalCooldownMs: 250,
} as const;

export const SKILL_KEYS = ['A', 'S', 'D', 'F', 'Q', 'W', 'E', 'R'] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];
export const SKILLS: Record<
  SkillKey,
  { name: string; cooldownMs: number; castMs: number; damage: number; description: string }
> = {
  A: { name: '베기', cooldownMs: 700, castMs: 120, damage: 12, description: '전방을 짧게 베기' },
  S: { name: '마력탄', cooldownMs: 3000, castMs: 0, damage: 16, description: '직선 투사체 발사' },
  D: {
    name: '돌진',
    cooldownMs: 5000,
    castMs: 0,
    damage: 0,
    description: '바라보는 방향으로 돌진',
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
    description: '주변 원형 범위 공격',
  },
  W: { name: '속박탄', cooldownMs: 9000, castMs: 0, damage: 8, description: '명중 시 1.5초 둔화' },
  E: {
    name: '충격파',
    cooldownMs: 6000,
    castMs: 200,
    damage: 10,
    description: '전방 공격과 밀치기',
  },
  R: {
    name: '결정타',
    cooldownMs: 20_000,
    castMs: 800,
    damage: 35,
    description: '긴 예고 후 강한 직선 공격',
  },
};

export interface Vec2 {
  x: number;
  y: number;
}
export interface Rect extends Vec2 {
  width: number;
  height: number;
}
export const OBSTACLES: readonly Rect[] = [
  { x: 280, y: 160, width: 72, height: 96 },
  { x: 608, y: 160, width: 72, height: 96 },
  { x: 280, y: 384, width: 72, height: 96 },
  { x: 608, y: 384, width: 72, height: 96 },
];

export function normalize(x: number, y: number): Vec2 {
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}

export function segmentIntersectsRect(from: Vec2, to: Vec2, rect: Rect): boolean {
  let near = 0;
  let far = 1;
  for (const [axis, size] of [
    ['x', 'width'],
    ['y', 'height'],
  ] as const) {
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < 1e-9) {
      if (from[axis] < rect[axis] || from[axis] > rect[axis] + rect[size]) return false;
      continue;
    }
    const a = (rect[axis] - from[axis]) / delta;
    const b = (rect[axis] + rect[size] - from[axis]) / delta;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return false;
  }
  return true;
}

export function blocked(from: Vec2, to: Vec2): boolean {
  return OBSTACLES.some((rect) => segmentIntersectsRect(from, to, rect));
}

export function move(position: Vec2, delta: Vec2): Vec2 {
  const result = { ...position };
  const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y) / 4));
  const valid = (point: Vec2) =>
    point.x >= RULES.radius &&
    point.x <= RULES.width - RULES.radius &&
    point.y >= RULES.radius &&
    point.y <= RULES.height - RULES.radius &&
    !OBSTACLES.some(
      (r) =>
        point.x > r.x - RULES.radius &&
        point.x < r.x + r.width + RULES.radius &&
        point.y > r.y - RULES.radius &&
        point.y < r.y + r.height + RULES.radius,
    );
  for (let i = 0; i < steps; i++) {
    const horizontal = { x: result.x + delta.x / steps, y: result.y };
    if (valid(horizontal)) result.x = horizontal.x;
    const vertical = { x: result.x, y: result.y + delta.y / steps };
    if (valid(vertical)) result.y = vertical.y;
  }
  return result;
}

export function pointSegmentDistance(point: Vec2, from: Vec2, to: Vec2): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared),
        );
  return Math.hypot(point.x - from.x - t * dx, point.y - from.y - t * dy);
}
