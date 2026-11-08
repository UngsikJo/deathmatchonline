import Phaser from 'phaser';
import {
  ATTACKS,
  PROJECTILES,
  RULES,
  SKILL_KEYS,
  isGrounded,
  stepBody,
  type AttackBox,
  type BodyState,
  type Effect,
  type Facing,
  type PlayerSnapshot,
  type SkillKey,
  type Snapshot,
  type Vec2,
} from '@deathmatch/shared';
import {
  ANCHOR_X,
  ANCHOR_Y,
  ART_SCALE,
  FRAME_H,
  FRAME_NAMES,
  FRAME_W,
  PLAYER_SLOTS,
  renderFighterFrames,
} from './fighterArt';
import { STAGE_H, STAGE_W, renderStage } from './stageArt';
import { gameSession } from './session';

const COLORS = [0x74e7ce, 0xffa66a];
const SKILL_COLORS: Record<SkillKey, number> = {
  A: 0xe6f2ff,
  S: 0xf3dfa3,
  D: 0xbcd7ff,
  F: 0xaed9ff,
  Q: 0xff9a4d,
  W: 0xba9aff,
  E: 0xe9c98e,
  R: 0xff5a5a,
};
const SKILL_CODES: Record<string, SkillKey> = Object.fromEntries(
  SKILL_KEYS.map((key) => [`Key${key}`, key]),
);
const WIND_UP_FRAME: Partial<Record<SkillKey, string>> = {
  A: 'slashWind',
  S: 'castRelease',
  W: 'castRelease',
  Q: 'burstWind',
  E: 'stabWind',
};
const RELEASE_FRAME: Partial<Record<SkillKey, string>> = {
  S: 'castRelease',
  W: 'castRelease',
  Q: 'burstRelease',
  E: 'stabRelease',
  R: 'lunge',
};
const LABEL_HEIGHT = 182;
const CROUCH_LABEL_HEIGHT = 132;
const KO_LABEL_HEIGHT = 62;
const CHEST_HEIGHT = 92;
const WALK_START_SPEED = 40;
/** How long client and server may disagree about being airborne before we adopt the server. */
const AIR_MISMATCH_MS = 220;
const FLASH_MS = 90;

interface Fighter {
  playerId: string | null;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  body: BodyState;
  renderedX: number;
  airMismatchMs: number;
  lastHitUntil: number;
  flashUntil: number;
}
interface Spark extends Vec2 {
  vx: number;
  vy: number;
  life: number;
  color: number;
}

export class ArenaScene extends Phaser.Scene {
  private telegraphs!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private fighters: Fighter[] = [];
  private sparks: Spark[] = [];
  private held = new Set<string>();
  private inputElapsed = 0;
  private lastDirection = '';

  constructor() {
    super('arena');
  }

  create() {
    this.createTextures();
    this.add.image(0, 0, 'stage').setOrigin(0).setScale(ART_SCALE);
    this.telegraphs = this.add.graphics();
    this.fighters = Array.from({ length: PLAYER_SLOTS }, (_, slot) => this.createFighter(slot));
    this.overlay = this.add.graphics();
    const canvas = this.game.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute(
      'aria-label',
      '대전 경기장. 클릭한 뒤 좌우 방향키로 이동하고 위쪽 키로 점프, 아래쪽 키로 앉으며 A S D F Q W E R로 스킬을 사용하세요.',
    );
    canvas.addEventListener('keydown', this.keyDown);
    canvas.addEventListener('keyup', this.keyUp);
    canvas.addEventListener('blur', this.release);
    canvas.addEventListener('pointerdown', this.focus);
    window.addEventListener('blur', this.release);
    document.addEventListener('visibilitychange', this.release);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      canvas.removeEventListener('keydown', this.keyDown);
      canvas.removeEventListener('keyup', this.keyUp);
      canvas.removeEventListener('blur', this.release);
      canvas.removeEventListener('pointerdown', this.focus);
      window.removeEventListener('blur', this.release);
      document.removeEventListener('visibilitychange', this.release);
      this.release();
    });
    gameSession.ready();
  }

  private createTextures() {
    const stage = this.textures.createCanvas('stage', STAGE_W, STAGE_H)!;
    stage.context.putImageData(new ImageData(toImageBuffer(renderStage()), STAGE_W, STAGE_H), 0, 0);
    stage.refresh();
    for (let slot = 0; slot < PLAYER_SLOTS; slot++) {
      const sheet = this.textures.createCanvas(
        `fighter${slot}`,
        FRAME_W * FRAME_NAMES.length,
        FRAME_H,
      )!;
      renderFighterFrames(slot).forEach((pixels, index) => {
        const x = index * FRAME_W;
        sheet.context.putImageData(new ImageData(toImageBuffer(pixels), FRAME_W, FRAME_H), x, 0);
        sheet.add(FRAME_NAMES[index]!, 0, x, 0, FRAME_W, FRAME_H);
      });
      sheet.refresh();
    }
  }

  private createFighter(slot: number): Fighter {
    return {
      playerId: null,
      sprite: this.add
        .sprite(0, 0, `fighter${slot}`, 'idle0')
        .setScale(ART_SCALE)
        .setVisible(false),
      label: this.add
        .text(0, 0, '', {
          fontFamily: 'sans-serif',
          fontSize: '14px',
          color: '#f4f7f8',
          stroke: '#10131f',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(1)
        .setVisible(false),
      body: { x: 0, y: RULES.groundY, vy: 0, crouching: false },
      renderedX: 0,
      airMismatchMs: 0,
      lastHitUntil: 0,
      flashUntil: 0,
    };
  }

  private focus = () => this.game.canvas.focus();
  private keyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code.startsWith('Arrow') || SKILL_CODES[event.code]) event.preventDefault();
    this.held.add(event.code);
    if (!event.repeat && SKILL_CODES[event.code]) {
      const { x, y } = this.direction();
      gameSession.sendInput(x, y, SKILL_CODES[event.code]);
    }
    if (event.code === 'Escape') this.game.canvas.blur();
  };
  private keyUp = (event: KeyboardEvent) => {
    this.held.delete(event.code);
  };
  private release = () => {
    this.held.clear();
    gameSession.sendInput(0, 0);
  };
  private direction(): Vec2 {
    return {
      x: Number(this.held.has('ArrowRight')) - Number(this.held.has('ArrowLeft')),
      y: Number(this.held.has('ArrowDown')) - Number(this.held.has('ArrowUp')),
    };
  }

  update(_time: number, delta: number) {
    const view = gameSession.getSnapshot();
    const snapshot = view.snapshot;
    const direction = this.direction();
    const directionKey = `${direction.x},${direction.y}`;
    this.inputElapsed += delta;
    if (this.inputElapsed >= RULES.tickMs || this.lastDirection !== directionKey) {
      gameSession.sendInput(direction.x, direction.y);
      this.inputElapsed = 0;
      this.lastDirection = directionKey;
    }
    this.telegraphs.clear();
    this.overlay.clear();
    this.advanceSparks(delta);
    const present = new Set(snapshot?.players.map((player) => player.slot));
    this.fighters.forEach((fighter, slot) => {
      if (present.has(slot)) return;
      fighter.sprite.setVisible(false);
      fighter.label.setVisible(false);
    });
    if (!snapshot) return;
    const now = gameSession.renderTime();
    const step = Math.min(delta, 50);
    for (const player of snapshot.players) {
      const fighter = this.fighters[player.slot];
      if (!fighter) continue;
      const mine = player.id === view.sessionId;
      this.resetIfNewPlayer(fighter, player);
      const predicted = mine && view.status === 'connected' && snapshot.phase === 'active';
      this.advanceBody(fighter, player, snapshot, predicted, direction, step, now);
      this.drawTelegraph(player, fighter);
      this.drawFighter(fighter, player, snapshot, mine, step, now);
    }
    for (const projectile of snapshot.projectiles) {
      const speed = PROJECTILES[projectile.key].speed;
      const travelled = Math.min(
        projectile.remaining,
        (speed * Math.max(0, now - snapshot.time)) / 1000,
      );
      this.drawProjectile(
        projectile.x + projectile.direction * travelled,
        projectile.y,
        projectile.direction,
        SKILL_COLORS[projectile.key],
      );
    }
    for (const effect of snapshot.effects)
      if (effect.until > now) this.drawEffect(effect, 1 - (effect.until - now) / RULES.effectMs);
    this.drawSparks();
  }

  private resetIfNewPlayer(fighter: Fighter, player: PlayerSnapshot) {
    if (fighter.playerId === player.id) return;
    fighter.playerId = player.id;
    fighter.body = { x: player.x, y: player.y, vy: player.vy, crouching: player.crouching };
    fighter.renderedX = player.x;
    fighter.airMismatchMs = 0;
    fighter.lastHitUntil = player.hitUntil;
    fighter.flashUntil = 0;
  }

  /** Own fighter runs the shared physics locally; the opponent is smoothed toward snapshots. */
  private advanceBody(
    fighter: Fighter,
    player: PlayerSnapshot,
    snapshot: Snapshot,
    predicted: boolean,
    direction: Vec2,
    step: number,
    now: number,
  ) {
    const { body } = fighter;
    if (snapshot.phase === 'finished') {
      // The server freezes on the final tick; let a mid-air fighter finish falling.
      stepBody(body, { move: 0, jump: false, crouch: false, locked: true, slowed: false }, step);
      body.x = Phaser.Math.Linear(body.x, player.x, 0.15);
      return;
    }
    if (!predicted) {
      const blend = Math.min(1, step / 60);
      body.x = Phaser.Math.Linear(body.x, player.x, blend);
      body.y = Phaser.Math.Linear(body.y, player.y, blend);
      body.vy = player.vy;
      body.crouching = player.crouching;
      return;
    }
    stepBody(
      body,
      {
        move: direction.x,
        jump: direction.y < 0,
        crouch: direction.y > 0,
        locked: player.cast !== null || now < player.hitUntil,
        slowed: player.slowUntil > now,
      },
      step,
    );
    body.x = Phaser.Math.Linear(body.x, player.x, 0.15);
    // Latency alone keeps the two a little out of step around takeoff and landing, so only a
    // sustained disagreement means the prediction was wrong.
    if (isGrounded(body) === isGrounded(player)) {
      fighter.airMismatchMs = 0;
    } else if ((fighter.airMismatchMs += step) > AIR_MISMATCH_MS) {
      body.y = player.y;
      body.vy = player.vy;
      fighter.airMismatchMs = 0;
    }
  }

  private drawFighter(
    fighter: Fighter,
    player: PlayerSnapshot,
    snapshot: Snapshot,
    mine: boolean,
    step: number,
    now: number,
  ) {
    const { body, sprite, label } = fighter;
    const velocity = ((body.x - fighter.renderedX) / step) * 1000;
    fighter.renderedX = body.x;
    const color = COLORS[player.slot] ?? COLORS[0]!;
    if (player.hitUntil > fighter.lastHitUntil) {
      this.spawnSparks(body.x, body.y - CHEST_HEIGHT, color);
      fighter.flashUntil = this.time.now + FLASH_MS;
      this.cameras.main.shake(90, 0.006);
    }
    fighter.lastHitUntil = player.hitUntil;

    const altitude = RULES.groundY - body.y;
    const shadowScale = Math.max(0.4, 1 - altitude / 320);
    this.telegraphs
      .fillStyle(0x0a0a18, 0.45)
      .fillEllipse(body.x, RULES.groundY + 3, 92 * shadowScale, 15 * shadowScale);

    const flip = player.facing < 0;
    const anchor = ANCHOR_X / FRAME_W;
    sprite
      .setVisible(true)
      .setAlpha(player.connected ? 1 : 0.45)
      .setOrigin(flip ? 1 - anchor : anchor, ANCHOR_Y / FRAME_H)
      .setPosition(Math.round(body.x), Math.round(body.y))
      .setFlipX(flip)
      .setFrame(this.frameFor(player, body, snapshot, velocity, now));
    if (this.time.now < fighter.flashUntil)
      sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else sprite.clearTint();

    if (player.shield > 0 && player.shieldUntil > now) {
      const strength = 0.35 + (player.shield / 20) * 0.5;
      this.overlay
        .lineStyle(ART_SCALE, 0xaed9ff, strength)
        .strokeEllipse(body.x, body.y - 74, 128, 178)
        .fillStyle(0xaed9ff, 0.08)
        .fillEllipse(body.x, body.y - 74, 128, 178);
    }
    if (player.slowUntil > now) {
      const wobble = Math.sin(this.time.now / 90) * 4;
      this.overlay
        .lineStyle(ART_SCALE, 0xba9aff, 0.9)
        .strokeEllipse(body.x, body.y - 6, 86 + wobble, 18)
        .strokeEllipse(body.x, body.y - 22, 64 - wobble, 12);
    }
    label
      .setPosition(
        body.x,
        body.y -
          (player.hp <= 0 ? KO_LABEL_HEIGHT : body.crouching ? CROUCH_LABEL_HEIGHT : LABEL_HEIGHT),
      )
      .setText(`${mine ? '▼ ' : ''}${player.nickname}`)
      .setColor(mine ? '#ffe9a8' : '#f4f7f8')
      .setVisible(true);
  }

  private frameFor(
    player: PlayerSnapshot,
    body: BodyState,
    snapshot: Snapshot,
    velocity: number,
    now: number,
  ): string {
    const clock = this.time.now;
    if (snapshot.phase === 'finished') {
      if (player.hp <= 0) return 'ko';
      if (snapshot.result?.winnerId === player.id) return `win${Math.floor(clock / 260) % 2}`;
    }
    const released = snapshot.effects.find(
      (effect) => effect.ownerId === player.id && effect.until > now && effect.key !== 'D',
    );
    if (released && released.key !== 'F') {
      if (released.key === 'A')
        return released.until - now > RULES.effectMs / 2 ? 'slashHit' : 'slashFollow';
      return RELEASE_FRAME[released.key]!;
    }
    if (player.cast) {
      if (player.cast.key === 'R') return `charge${Math.floor(clock / 80) % 2}`;
      return WIND_UP_FRAME[player.cast.key] ?? 'idle0';
    }
    if (now < player.hitUntil) return 'hit';
    if (now < player.dashUntil) return 'dash';
    if (!isGrounded(body)) return body.vy < 0 ? 'jumpUp' : 'jumpFall';
    if (body.crouching) return 'crouch';
    if (Math.abs(velocity) > WALK_START_SPEED) {
      const step = Math.floor(clock / 85) % 6;
      return `walk${Math.sign(velocity) === player.facing ? step : 5 - step}`;
    }
    return `idle${Math.floor(clock / 160) % 4}`;
  }

  private attackRect(origin: Vec2, facing: Facing, box: AttackBox) {
    const near = origin.x + facing * box.from;
    const far = origin.x + facing * box.to;
    return {
      x: Math.min(near, far),
      y: origin.y - box.top,
      width: Math.abs(far - near),
      height: box.top - box.bottom,
    };
  }

  /** Warns with the exact box the server will test, from the fighter's displayed position. */
  private drawTelegraph(player: PlayerSnapshot, fighter: Fighter) {
    const cast = player.cast;
    if (!cast || cast.key === 'S' || cast.key === 'W' || cast.key === 'D' || cast.key === 'F')
      return;
    const rect = this.attackRect(fighter.body, cast.direction, ATTACKS[cast.key]);
    const pulse = 0.14 + Math.abs(Math.sin(this.time.now / 70)) * 0.12;
    this.telegraphs
      .fillStyle(SKILL_COLORS[cast.key], pulse)
      .fillRect(rect.x, rect.y, rect.width, rect.height)
      .lineStyle(ART_SCALE, SKILL_COLORS[cast.key], 0.75)
      .strokeRect(rect.x, rect.y, rect.width, rect.height);
  }

  private block(x: number, y: number, size: number, color: number, alpha = 1) {
    const snap = (value: number) => Math.round(value / ART_SCALE) * ART_SCALE;
    this.overlay.fillStyle(color, alpha).fillRect(snap(x), snap(y), size, size);
  }

  private drawProjectile(x: number, y: number, direction: Facing, color: number) {
    const unit = ART_SCALE;
    for (let i = 4; i >= 1; i--)
      this.block(x - direction * i * 11, y - unit, unit * 2, color, 0.5 - i * 0.1);
    this.overlay.fillStyle(color, 0.25).fillCircle(x, y, 18);
    this.block(x - unit * 2, y - unit * 2, unit * 4, color);
    this.block(x - unit, y - unit, unit * 2, 0xffffff);
  }

  private drawEffect(effect: Effect, progress: number) {
    const color = SKILL_COLORS[effect.key];
    const fade = 1 - progress;
    if (effect.key === 'A') {
      const reach = ATTACKS.A.to + 10;
      const centerY = effect.y - 118;
      const sweep = Math.min(1, progress * 2.2);
      for (let i = 0; i <= 26; i++) {
        const t = i / 26;
        if (t > sweep) break;
        const angle = (-70 + t * 125) * (Math.PI / 180);
        const inner = Math.sin(t * Math.PI) * 26;
        const px = effect.x + effect.direction * Math.cos(angle) * reach;
        const py = centerY + Math.sin(angle) * reach * 0.72;
        this.block(px, py, ART_SCALE * 2, 0xffffff, fade);
        for (let d = ART_SCALE; d < inner; d += ART_SCALE)
          this.block(
            px - effect.direction * Math.cos(angle) * d,
            py - Math.sin(angle) * d,
            ART_SCALE * 2,
            color,
            fade * (1 - d / (inner + 6)) * 0.8,
          );
      }
    } else if (effect.key === 'Q') {
      const rect = this.attackRect(effect, effect.direction, ATTACKS.Q);
      this.overlay
        .fillStyle(color, fade * 0.42)
        .fillRect(rect.x, rect.y, rect.width, rect.height)
        .fillStyle(0xffffff, fade * 0.35)
        .fillRect(rect.x + 24, rect.y + 30, rect.width - 48, rect.height - 30);
      for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * Math.PI * 2;
        const distance = 30 + progress * 90;
        this.block(
          effect.x + Math.cos(angle) * distance,
          effect.y - 80 + Math.sin(angle) * distance,
          ART_SCALE * 2,
          i % 2 ? color : 0xffffff,
          fade,
        );
      }
    } else if (effect.key === 'E') {
      const { to, top } = ATTACKS.E;
      const front = progress * to * 1.15;
      for (let d = 18; d < Math.min(front, to); d += ART_SCALE * 4) {
        const height = top * (1 - (front - d) / (to * 1.15)) * (0.65 + 0.35 * Math.sin(d));
        this.overlay
          .fillStyle(color, 0.9)
          .fillRect(
            effect.x + effect.direction * d - ART_SCALE * 2,
            effect.y - height,
            ART_SCALE * 3,
            height,
          );
      }
    } else if (effect.key === 'R') {
      const rect = this.attackRect(effect, effect.direction, ATTACKS.R);
      const inset = progress * rect.height * 0.45;
      this.overlay
        .fillStyle(color, fade * 0.8)
        .fillRect(rect.x, rect.y + inset, rect.width, rect.height - inset * 2)
        .fillStyle(0xffffff, fade)
        .fillRect(rect.x, rect.y + rect.height * 0.38, rect.width, rect.height * 0.24);
    } else if (effect.key === 'D') {
      for (let i = 0; i < 6; i++) {
        const y = effect.y - 20 - i * 22;
        const length = 40 + ((i * 37) % 60);
        this.overlay
          .fillStyle(color, fade * 0.7)
          .fillRect(
            effect.direction > 0 ? effect.x - length - 10 : effect.x + 10,
            y,
            length,
            ART_SCALE,
          );
      }
    } else if (effect.key === 'S' || effect.key === 'W') {
      const y = effect.y - PROJECTILES[effect.key].height;
      this.overlay
        .fillStyle(color, fade * 0.7)
        .fillCircle(effect.x + effect.direction * 66, y, 26 * fade);
    }
  }

  private spawnSparks(x: number, y: number, color: number) {
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 160 + Math.random() * 320;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 200 + Math.random() * 160,
        color: i % 3 === 0 ? 0xffffff : color,
      });
    }
  }

  private advanceSparks(delta: number) {
    const seconds = delta / 1000;
    for (const spark of this.sparks) {
      spark.x += spark.vx * seconds;
      spark.y += spark.vy * seconds;
      spark.vy += RULES.gravity * 0.5 * seconds;
      spark.life -= delta;
    }
    this.sparks = this.sparks.filter((spark) => spark.life > 0);
  }

  private drawSparks() {
    for (const spark of this.sparks)
      this.block(spark.x, spark.y, ART_SCALE * 2, spark.color, Math.min(1, spark.life / 150));
  }
}

/** ImageData requires a buffer that is definitely not a SharedArrayBuffer. */
function toImageBuffer(pixels: Uint8ClampedArray): ImageDataArray {
  return new Uint8ClampedArray(pixels);
}
