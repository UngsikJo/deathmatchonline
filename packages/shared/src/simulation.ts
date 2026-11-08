import {
  ATTACKS,
  PROJECTILES,
  PROJECTILE_RANGE,
  RULES,
  SHOCKWAVE_PUSH,
  SKILLS,
  SKILL_KEYS,
  attackHits,
  bodiesOverlapVertically,
  clampStageX,
  isGrounded,
  projectileHits,
  stepBody,
  type Facing,
  type SkillKey,
  type Vec2,
} from './rules.js';
import type {
  Effect,
  InputMessage,
  MatchResult,
  Phase,
  PlayerSnapshot,
  Projectile,
  Snapshot,
} from './protocol.js';

interface Player extends PlayerSnapshot {
  input: Vec2;
  lastInputAt: number;
  nextSkillAt: number;
  dashDirection: Facing;
}
interface Hit {
  target: Player;
  damage: number;
  slow?: boolean;
  push?: number;
}

/** Pure server-owned combat, using simulation time only. No browser, database or socket APIs. */
export class Simulation {
  phase: Phase = 'waiting';
  time = 0;
  startsAt = 0;
  endsAt = 0;
  result: MatchResult | null = null;
  players = new Map<string, Player>();
  projectiles: Projectile[] = [];
  effects: Effect[] = [];
  private nextId = 1;

  addPlayer(id: string, nickname: string): void {
    if (this.phase !== 'waiting' || this.players.size >= 2 || this.players.has(id)) return;
    const slot = [...this.players.values()].some((p) => p.slot === 0) ? 1 : 0;
    this.players.set(id, {
      id,
      nickname,
      slot,
      x: RULES.spawnX[slot]!,
      y: RULES.groundY,
      vy: 0,
      crouching: false,
      hp: RULES.maxHp,
      facing: slot === 0 ? 1 : -1,
      connected: true,
      ready: false,
      shield: 0,
      shieldUntil: 0,
      slowUntil: 0,
      hitUntil: 0,
      dashUntil: 0,
      cooldowns: Object.fromEntries(SKILL_KEYS.map((key) => [key, 0])) as Record<SkillKey, number>,
      cast: null,
      lastSeq: -1,
      input: { x: 0, y: 0 },
      lastInputAt: 0,
      nextSkillAt: 0,
      dashDirection: slot === 0 ? 1 : -1,
    });
  }

  ready(id: string): void {
    const player = this.players.get(id);
    if (!player || this.phase !== 'waiting') return;
    player.ready = true;
    if (this.players.size === 2 && [...this.players.values()].every((p) => p.ready)) {
      this.phase = 'countdown';
      this.startsAt = this.time + RULES.countdownMs;
      this.endsAt = this.startsAt + RULES.matchMs;
    }
  }

  input(id: string, message: InputMessage): void {
    const player = this.players.get(id);
    if (!player || !player.connected || this.phase !== 'active' || message.seq <= player.lastSeq)
      return;
    player.lastSeq = message.seq;
    player.lastInputAt = this.time;
    player.input = { x: Math.sign(message.x), y: Math.sign(message.y) };
    if (
      !message.skill ||
      player.cast ||
      this.time < player.nextSkillAt ||
      this.time < player.cooldowns[message.skill] ||
      this.time < player.dashUntil ||
      this.time < player.hitUntil
    )
      return;
    const key = message.skill;
    player.cooldowns[key] = this.time + SKILLS[key].cooldownMs;
    player.nextSkillAt = this.time + RULES.globalCooldownMs;
    if (key === 'D') {
      player.dashUntil = this.time + RULES.dashMs;
      player.dashDirection = player.input.x ? (player.input.x as Facing) : player.facing;
      this.effect(player, key, player.dashDirection);
    } else if (key === 'F') {
      player.shield = 20;
      player.shieldUntil = this.time + 1200;
      this.effect(player, key, player.facing);
    } else {
      player.cast = {
        key,
        resolveAt: this.time + SKILLS[key].castMs,
        direction: player.facing,
      };
    }
  }

  setConnected(id: string, connected: boolean): void {
    const player = this.players.get(id);
    if (!player) return;
    player.connected = connected;
    player.input = { x: 0, y: 0 };
  }

  leaveBeforeStart(id: string): void {
    if (this.phase === 'waiting' || this.phase === 'countdown') {
      this.players.delete(id);
      this.phase = 'waiting';
      this.startsAt = this.endsAt = 0;
    }
  }

  forfeit(id: string, reason: 'surrender' | 'disconnect'): void {
    if (this.phase !== 'active' || !this.players.has(id)) return;
    const opponent = [...this.players.values()].find((p) => p.id !== id);
    this.finish(
      opponent && (opponent.connected || reason === 'surrender')
        ? { winnerId: opponent.id, reason }
        : { winnerId: null, reason: 'void' },
    );
  }

  step(dt = RULES.tickMs): void {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 100) throw new Error('Invalid simulation step');
    if (this.phase === 'finished') return;
    this.time += dt;
    this.effects = this.effects.filter((effect) => effect.until > this.time);
    if (this.phase === 'countdown' && this.time >= this.startsAt) this.phase = 'active';
    if (this.phase !== 'active') return;
    const hits: Hit[] = [];
    for (const player of this.players.values()) this.moveBody(player, dt);
    this.separateBodies();
    this.faceOpponents();
    // Attacks resolve after every body has moved, so neither player gets a tick of advantage.
    for (const player of this.players.values()) {
      if (player.cast && this.time >= player.cast.resolveAt) {
        this.resolve(player, hits);
        player.cast = null;
      }
    }
    this.advanceProjectiles(dt, hits);
    for (const hit of hits) {
      const absorbed = Math.min(hit.target.shield, hit.damage);
      hit.target.shield -= absorbed;
      hit.target.hp = Math.max(0, hit.target.hp - hit.damage + absorbed);
      if (absorbed < hit.damage) hit.target.hitUntil = this.time + RULES.hitstunMs;
      if (hit.slow) hit.target.slowUntil = this.time + 1500;
      if (hit.push) hit.target.x = clampStageX(hit.target.x + hit.push);
    }
    const players = [...this.players.values()];
    const dead = players.filter((p) => p.hp <= 0);
    if (dead.length === 2) this.finish({ winnerId: null, reason: 'draw' });
    else if (dead.length === 1)
      this.finish({ winnerId: players.find((p) => p.hp > 0)?.id ?? null, reason: 'ko' });
    else if (this.time >= this.endsAt) {
      const [a, b] = players;
      this.finish(
        !a || !b || a.hp === b.hp
          ? { winnerId: null, reason: 'draw' }
          : { winnerId: a.hp > b.hp ? a.id : b.id, reason: 'timeout' },
      );
    }
  }

  snapshot(): Snapshot {
    return {
      protocol: 2,
      phase: this.phase,
      time: this.time,
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      players: [...this.players.values()].map(
        ({
          input: _input,
          lastInputAt: _at,
          nextSkillAt: _next,
          dashDirection: _direction,
          ...player
        }) => ({
          ...player,
          cooldowns: { ...player.cooldowns },
          cast: player.cast ? { ...player.cast } : null,
        }),
      ),
      projectiles: this.projectiles.map((p) => ({ ...p })),
      effects: this.effects.map((e) => ({ ...e })),
      result: this.result ? { ...this.result } : null,
    };
  }

  private moveBody(player: Player, dt: number): void {
    if (this.time >= player.shieldUntil) player.shield = 0;
    const dashMs = Math.max(
      0,
      Math.min(this.time, player.dashUntil) -
        Math.max(this.time - dt, player.dashUntil - RULES.dashMs),
    );
    if (dashMs > 0)
      player.x = clampStageX(
        player.x + (player.dashDirection * RULES.dashDistance * dashMs) / RULES.dashMs,
      );
    const held = this.time - player.lastInputAt <= RULES.staleInputMs ? player.input : null;
    stepBody(
      player,
      {
        move: held?.x ?? 0,
        jump: (held?.y ?? 0) < 0,
        crouch: (held?.y ?? 0) > 0,
        locked: player.cast !== null || this.time < player.hitUntil,
        slowed: player.slowUntil > this.time,
      },
      dt,
      dt - dashMs,
    );
  }

  /** Bodies block each other unless one clears the other vertically. */
  private separateBodies(): void {
    const [a, b] = this.players.values();
    if (!a || !b || !bodiesOverlapVertically(a, b)) return;
    const minimum = RULES.halfWidth * 2;
    const distance = Math.abs(b.x - a.x);
    if (distance >= minimum) return;
    const side = b.x === a.x ? (a.slot < b.slot ? 1 : -1) : Math.sign(b.x - a.x);
    // Re-derive from the clamped side so a body pinned at the stage edge pushes the other fully.
    a.x = clampStageX(a.x - (side * (minimum - distance)) / 2);
    b.x = clampStageX(a.x + side * minimum);
    a.x = clampStageX(b.x - side * minimum);
  }

  /** Fighters turn to face each other, except mid-air, while casting, or during a dash. */
  private faceOpponents(): void {
    const [a, b] = this.players.values();
    if (!a || !b || a.x === b.x) return;
    for (const [self, other] of [
      [a, b],
      [b, a],
    ] as const) {
      if (isGrounded(self) && !self.cast && this.time >= self.dashUntil)
        self.facing = other.x > self.x ? 1 : -1;
    }
  }

  private finish(result: MatchResult): void {
    if (this.phase === 'finished') return;
    this.phase = 'finished';
    this.result = result;
    this.projectiles = [];
    for (const player of this.players.values()) player.cast = null;
  }

  private effect(player: Player, key: SkillKey, direction: Facing): void {
    this.effects.push({
      id: this.nextId++,
      ownerId: player.id,
      key,
      x: player.x,
      y: player.y,
      direction,
      until: this.time + RULES.effectMs,
    });
  }

  private resolve(player: Player, hits: Hit[]): void {
    const { key, direction } = player.cast!;
    this.effect(player, key, direction);
    if (key === 'S' || key === 'W') {
      this.projectiles.push({
        id: this.nextId++,
        ownerId: player.id,
        key,
        x: player.x,
        y: player.y - PROJECTILES[key].height,
        direction,
        remaining: PROJECTILE_RANGE,
      });
      return;
    }
    if (key === 'D' || key === 'F') return;
    for (const target of this.players.values()) {
      if (target.id === player.id || !attackHits(player, direction, ATTACKS[key], target)) continue;
      hits.push({
        target,
        damage: SKILLS[key].damage,
        ...(key === 'E' ? { push: direction * SHOCKWAVE_PUSH } : {}),
      });
    }
  }

  private advanceProjectiles(dt: number, hits: Hit[]): void {
    this.projectiles = this.projectiles.filter((projectile) => {
      const { speed, radius } = PROJECTILES[projectile.key];
      const distance = Math.min(projectile.remaining, (speed * dt) / 1000);
      const nextX = projectile.x + projectile.direction * distance;
      if (nextX < 0 || nextX > RULES.width) return false;
      const target = [...this.players.values()].find(
        (p) =>
          p.id !== projectile.ownerId &&
          projectileHits(projectile.x, nextX, projectile.y, radius, p),
      );
      if (target) {
        hits.push({ target, damage: SKILLS[projectile.key].damage, slow: projectile.key === 'W' });
        return false;
      }
      projectile.x = nextX;
      projectile.remaining -= distance;
      return projectile.remaining > 0;
    });
  }
}
