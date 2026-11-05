import Phaser from 'phaser';
import {
  OBSTACLES,
  RULES,
  SKILL_KEYS,
  move,
  normalize,
  type PlayerSnapshot,
  type SkillKey,
  type Vec2,
} from '@deathmatch/shared';
import { gameSession } from './session';

const COLORS = [0x74e7ce, 0xffa66a];
const SKILL_CODES: Record<string, SkillKey> = Object.fromEntries(
  SKILL_KEYS.map((key) => [`Key${key}`, key]),
);

export class ArenaScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private positions = new Map<string, Vec2>();
  private held = new Set<string>();
  private inputElapsed = 0;
  private lastDirection = '';

  constructor() {
    super('arena');
  }

  create() {
    this.cameras.main.setBackgroundColor('#151e28');
    const floor = this.add.graphics();
    floor.lineStyle(1, 0x24303a, 0.7);
    for (let x = 0; x <= RULES.width; x += 32) floor.lineBetween(x, 0, x, RULES.height);
    for (let y = 0; y <= RULES.height; y += 32) floor.lineBetween(0, y, RULES.width, y);
    floor.lineStyle(2, 0x40505a).strokeRect(12, 12, RULES.width - 24, RULES.height - 24);
    floor.lineStyle(1, 0x52616a, 0.5).strokeCircle(480, 320, 110);
    floor.lineBetween(480, 20, 480, 210).lineBetween(480, 430, 480, 620);
    floor.fillStyle(0x74e7ce, 0.08).fillCircle(150, 320, 48);
    floor.fillStyle(0xffa66a, 0.08).fillCircle(810, 320, 48);
    for (const rect of OBSTACLES) {
      floor.fillStyle(0x080e15, 0.65).fillRect(rect.x + 7, rect.y + 9, rect.width, rect.height);
      floor.fillStyle(0x34424b).fillRect(rect.x, rect.y, rect.width, rect.height);
      floor.fillStyle(0x43545e).fillRect(rect.x, rect.y, rect.width, 7);
      floor.lineStyle(1, 0x5c6e76).strokeRect(rect.x, rect.y, rect.width, rect.height);
    }
    this.add
      .text(480, 320, 'DM', {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: '#34434c',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.graphics = this.add.graphics();
    this.labels = [0, 1].map(() =>
      this.add
        .text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '13px', color: '#dce7e9' })
        .setOrigin(0.5),
    );
    const canvas = this.game.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute(
      'aria-label',
      '대전 경기장. 클릭한 뒤 방향키로 이동하고 A S D F Q W E R로 스킬을 사용하세요.',
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
    const g = this.graphics;
    g.clear();
    this.labels.forEach((label) => label.setVisible(false));
    if (!snapshot) return;
    const now = gameSession.renderTime();
    for (const player of snapshot.players) {
      const mine = player.id === view.sessionId;
      const color = COLORS[player.slot] ?? COLORS[0]!;
      let rendered = this.positions.get(player.id) ?? { x: player.x, y: player.y };
      // Immediate local movement with continuous server correction. Full input replay is a later milestone.
      if (
        mine &&
        view.status === 'connected' &&
        snapshot.phase === 'active' &&
        player.cast?.key !== 'R'
      ) {
        const d = normalize(direction.x, direction.y);
        const speed = RULES.speed * (player.slowUntil > now ? 0.6 : 1);
        rendered = move(rendered, {
          x: (d.x * speed * Math.min(delta, 50)) / 1000,
          y: (d.y * speed * Math.min(delta, 50)) / 1000,
        });
      }
      const blend = mine && snapshot.phase === 'active' ? 0.15 : Math.min(1, delta / 60);
      rendered = {
        x: Phaser.Math.Linear(rendered.x, player.x, blend),
        y: Phaser.Math.Linear(rendered.y, player.y, blend),
      };
      this.positions.set(player.id, rendered);
      if (player.cast) this.telegraph(player, player.cast.key, player.cast.direction, color);
      this.drawPlayer(player, rendered, color, mine, now);
    }
    for (const projectile of snapshot.projectiles) {
      g.fillStyle(projectile.key === 'W' ? 0xba9aff : 0xf3dfa3, 0.16).fillCircle(
        projectile.x,
        projectile.y,
        14,
      );
      g.fillStyle(projectile.key === 'W' ? 0xba9aff : 0xf3dfa3).fillCircle(
        projectile.x,
        projectile.y,
        5,
      );
    }
    for (const effect of snapshot.effects) {
      if (effect.until > now) this.telegraph(effect, effect.key, effect.direction, 0xffffff);
    }
  }

  private telegraph(origin: Vec2, key: SkillKey, direction: Vec2, color: number) {
    const g = this.graphics;
    if (key === 'Q') {
      g.fillStyle(color, 0.08).fillCircle(origin.x, origin.y, 90);
      g.lineStyle(2, color, 0.65).strokeCircle(origin.x, origin.y, 90);
    } else if (key === 'A') {
      const angle = Math.atan2(direction.y, direction.x);
      const points = [{ x: origin.x, y: origin.y }];
      for (let i = 0; i <= 8; i++) {
        const a = angle - Math.PI / 4 + (i * Math.PI) / 16;
        points.push({ x: origin.x + Math.cos(a) * 70, y: origin.y + Math.sin(a) * 70 });
      }
      g.fillStyle(color, 0.2).fillPoints(
        points.map((p) => new Phaser.Math.Vector2(p.x, p.y)),
        true,
      );
    } else if (key === 'E' || key === 'R') {
      const length = key === 'R' ? 300 : 120;
      const half = key === 'R' ? 32 : 30;
      const side = { x: -direction.y * half, y: direction.x * half };
      const end = { x: origin.x + direction.x * length, y: origin.y + direction.y * length };
      const points = [
        { x: origin.x + side.x, y: origin.y + side.y },
        { x: end.x + side.x, y: end.y + side.y },
        { x: end.x - side.x, y: end.y - side.y },
        { x: origin.x - side.x, y: origin.y - side.y },
      ];
      const vectors = points.map((p) => new Phaser.Math.Vector2(p.x, p.y));
      g.fillStyle(color, 0.16).fillPoints(vectors, true);
      g.lineStyle(1, color, 0.7).strokePoints(vectors, true);
    }
  }

  private drawPlayer(
    player: PlayerSnapshot,
    point: Vec2,
    color: number,
    mine: boolean,
    now: number,
  ) {
    const { x, y } = point;
    const g = this.graphics;
    g.fillStyle(0x050a10, 0.5).fillEllipse(x, y + 17, 40, 13);
    if (mine) g.lineStyle(1, color, 0.45).strokeCircle(x, y, 24);
    if (player.shield > 0 && player.shieldUntil > now)
      g.lineStyle(3, 0xaed9ff, 0.9).strokeCircle(x, y, 29);
    if (player.slowUntil > now) g.lineStyle(2, 0xba9aff).strokeEllipse(x, y + 15, 42, 16);
    g.fillStyle(color, player.connected ? 1 : 0.35).fillRoundedRect(x - 14, y - 18, 28, 34, 7);
    g.fillStyle(0x192631).fillRoundedRect(x - 10, y - 12, 20, 12, 3);
    const eyeX = player.facing.x * 3;
    g.fillStyle(0xf6ffff)
      .fillRect(x - 6 + eyeX, y - 8, 4, 3)
      .fillRect(x + 2 + eyeX, y - 8, 4, 3);
    g.lineStyle(3, color).lineBetween(
      x + player.facing.x * 20,
      y + player.facing.y * 20,
      x + player.facing.x * 29,
      y + player.facing.y * 29,
    );
    g.fillStyle(0x0b1118).fillRect(x - 22, y - 32, 44, 4);
    g.fillStyle(color).fillRect(x - 22, y - 32, (44 * player.hp) / RULES.maxHp, 4);
    this.labels[player.slot]
      ?.setPosition(x, y - 46)
      .setText(`${mine ? '◆ ' : ''}${player.nickname}`)
      .setVisible(true);
  }
}
