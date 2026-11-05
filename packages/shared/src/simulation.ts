import {
  RULES,
  SKILLS,
  SKILL_KEYS,
  blocked,
  move,
  normalize,
  pointSegmentDistance,
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
  dashUntil: number;
  dashDirection: Vec2;
}
interface Hit {
  target: Player;
  damage: number;
  slow?: boolean;
  push?: Vec2;
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
      x: slot === 0 ? 150 : 810,
      y: 320,
      hp: RULES.maxHp,
      facing: { x: slot === 0 ? 1 : -1, y: 0 },
      connected: true,
      ready: false,
      shield: 0,
      shieldUntil: 0,
      slowUntil: 0,
      cooldowns: Object.fromEntries(SKILL_KEYS.map((key) => [key, 0])) as Record<SkillKey, number>,
      cast: null,
      lastSeq: -1,
      input: { x: 0, y: 0 },
      lastInputAt: 0,
      nextSkillAt: 0,
      dashUntil: 0,
      dashDirection: { x: 0, y: 0 },
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
    player.input = normalize(message.x, message.y);
    if (player.input.x || player.input.y) player.facing = { ...player.input };
    if (
      !message.skill ||
      player.cast ||
      this.time < player.nextSkillAt ||
      this.time < player.cooldowns[message.skill] ||
      this.time < player.dashUntil
    )
      return;
    const key = message.skill;
    player.cooldowns[key] = this.time + SKILLS[key].cooldownMs;
    player.nextSkillAt = this.time + RULES.globalCooldownMs;
    if (key === 'D') {
      player.dashUntil = this.time + 180;
      player.dashDirection = { ...player.facing };
      this.effect(player, key, player.facing);
    } else if (key === 'F') {
      player.shield = 20;
      player.shieldUntil = this.time + 1200;
      this.effect(player, key, player.facing);
    } else {
      player.cast = {
        key,
        resolveAt: this.time + SKILLS[key].castMs,
        direction: { ...player.facing },
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
    for (const player of this.players.values()) {
      if (this.time >= player.shieldUntil) player.shield = 0;
      const dashMs = Math.max(
        0,
        Math.min(this.time, player.dashUntil) - Math.max(this.time - dt, player.dashUntil - 180),
      );
      const direction =
        this.time - player.lastInputAt <= RULES.staleInputMs ? player.input : { x: 0, y: 0 };
      const speed = RULES.speed * (player.slowUntil > this.time ? 0.6 : 1);
      if (player.cast?.key !== 'R') {
        if (dashMs > 0)
          Object.assign(
            player,
            move(player, {
              x: (player.dashDirection.x * 120 * dashMs) / 180,
              y: (player.dashDirection.y * 120 * dashMs) / 180,
            }),
          );
        Object.assign(
          player,
          move(player, {
            x: (direction.x * speed * (dt - dashMs)) / 1000,
            y: (direction.y * speed * (dt - dashMs)) / 1000,
          }),
        );
      }
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
      if (hit.slow) hit.target.slowUntil = this.time + 1500;
      if (hit.push) Object.assign(hit.target, move(hit.target, hit.push));
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
      protocol: 1,
      phase: this.phase,
      time: this.time,
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      players: [...this.players.values()].map(
        ({
          input: _input,
          lastInputAt: _at,
          nextSkillAt: _next,
          dashUntil: _dash,
          dashDirection: _direction,
          ...player
        }) => ({
          ...player,
          facing: { ...player.facing },
          cooldowns: { ...player.cooldowns },
          cast: player.cast ? { ...player.cast, direction: { ...player.cast.direction } } : null,
        }),
      ),
      projectiles: this.projectiles.map((p) => ({ ...p, direction: { ...p.direction } })),
      effects: this.effects.map((e) => ({ ...e, direction: { ...e.direction } })),
      result: this.result ? { ...this.result } : null,
    };
  }

  private finish(result: MatchResult): void {
    if (this.phase === 'finished') return;
    this.phase = 'finished';
    this.result = result;
    this.projectiles = [];
    for (const player of this.players.values()) player.cast = null;
  }

  private effect(player: Player, key: SkillKey, direction: Vec2): void {
    this.effects.push({
      id: this.nextId++,
      key,
      x: player.x,
      y: player.y,
      direction: { ...direction },
      until: this.time + 220,
    });
  }

  private resolve(player: Player, hits: Hit[]): void {
    const cast = player.cast!;
    const { key, direction } = cast;
    this.effect(player, key, direction);
    if (key === 'S' || key === 'W') {
      this.projectiles.push({
        id: this.nextId++,
        ownerId: player.id,
        key,
        x: player.x,
        y: player.y,
        direction: { ...direction },
        remaining: 480,
      });
      return;
    }
    for (const target of this.players.values()) {
      if (target.id === player.id || blocked(player, target)) continue;
      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const distance = Math.hypot(dx, dy);
      const forward = dx * direction.x + dy * direction.y;
      const side = Math.abs(dx * direction.y - dy * direction.x);
      const hit =
        key === 'A'
          ? distance <= 70 + RULES.radius && (distance === 0 || forward / distance >= Math.SQRT1_2)
          : key === 'Q'
            ? distance <= 90 + RULES.radius
            : key === 'E'
              ? forward >= 0 && forward <= 120 + RULES.radius && side <= 30 + RULES.radius
              : key === 'R'
                ? forward >= 0 && forward <= 300 + RULES.radius && side <= 32 + RULES.radius
                : false;
      if (hit)
        hits.push({
          target,
          damage: SKILLS[key].damage,
          ...(key === 'E' ? { push: { x: direction.x * 60, y: direction.y * 60 } } : {}),
        });
    }
  }

  private advanceProjectiles(dt: number, hits: Hit[]): void {
    this.projectiles = this.projectiles.filter((projectile) => {
      const speed = projectile.key === 'S' ? 520 : 400;
      const distance = Math.min(projectile.remaining, (speed * dt) / 1000);
      const next = {
        x: projectile.x + projectile.direction.x * distance,
        y: projectile.y + projectile.direction.y * distance,
      };
      if (
        blocked(projectile, next) ||
        next.x < 0 ||
        next.x > RULES.width ||
        next.y < 0 ||
        next.y > RULES.height
      )
        return false;
      const target = [...this.players.values()].find(
        (p) =>
          p.id !== projectile.ownerId &&
          pointSegmentDistance(p, projectile, next) <= RULES.radius + 5,
      );
      if (target) {
        hits.push({ target, damage: SKILLS[projectile.key].damage, slow: projectile.key === 'W' });
        return false;
      }
      Object.assign(projectile, next);
      projectile.remaining -= distance;
      return projectile.remaining > 0;
    });
  }
}
