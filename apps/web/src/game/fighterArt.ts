/**
 * Original pixel-art fighter, generated from joint poses instead of image files.
 * Every frame is rasterized once into palette indices and recolored per player slot.
 * Art faces right; the renderer flips it for a left-facing fighter.
 */

export const ART_SCALE = 3;
export const FRAME_W = 112;
export const FRAME_H = 84;
export const ANCHOR_X = 40;
export const ANCHOR_Y = 81;

type Point = readonly [number, number];
interface Pose {
  hip: Point;
  chest: Point;
  head: Point;
  fHand: Point;
  bHand: Point;
  fFoot: Point;
  bFoot: Point;
  /** Blade direction in degrees: 0 forward, -90 up, 90 down. */
  sword: number;
  swordInBackHand?: boolean;
  /** Head rotation in degrees, positive tips the face downward. */
  headTilt?: number;
  /** Scarf tail direction in degrees from straight back; positive droops. */
  scarf?: number;
  eyes?: 'open' | 'shut';
}

const enum C {
  Empty,
  Outline,
  Skin,
  SkinS,
  Hair,
  HairL,
  Jacket,
  JacketS,
  JacketL,
  Pants,
  PantsS,
  Boot,
  BootS,
  Glove,
  GloveS,
  Metal,
  MetalS,
  Gold,
  Scarf,
  ScarfS,
  White,
  Pupil,
}

// Index order must match the C enum. Colors are 0xRRGGBB, index 0 is transparent.
const PALETTES: readonly (readonly number[])[] = [
  [
    0, 0x121522, 0xf2c6a0, 0xc98f70, 0x232a4a, 0x3d4a7e, 0x24a596, 0x14706f, 0x6fe6cd, 0x2c3448,
    0x1d2233, 0x6a4630, 0x48301f, 0xe8e2d0, 0xa8a18f, 0xe6f2ff, 0x8ea4bd, 0xf2c14e, 0xe5484d,
    0xa02a3c, 0xffffff, 0x1b2036,
  ],
  [
    0, 0x1a1218, 0xe8b48c, 0xb67c5c, 0xd7dbe8, 0xffffff, 0xe0742c, 0xa04a1c, 0xffb06e, 0x35303c,
    0x231f2a, 0x3c3f55, 0x282a3b, 0x2d2f40, 0x1c1d2a, 0xffeee0, 0xbfa090, 0xf2c14e, 0x5a4ad0,
    0x382c94, 0xffffff, 0x3a1a1a,
  ],
];

const SWORD_LENGTH = 28;
const THIGH = 10;
const SHIN = 11;
const UPPER_ARM = 8;
const FOREARM = 9;

class Raster {
  readonly pixels = new Uint8Array(FRAME_W * FRAME_H);
  private readonly layer = new Uint8Array(FRAME_W * FRAME_H);

  /** Draws one body part with its own dark outline, so overlapping limbs stay readable. */
  part(draw: (plot: Plot) => void): void {
    this.layer.fill(C.Empty);
    draw(new Plot(this.layer));
    const { layer, pixels } = this;
    for (let y = 0; y < FRAME_H; y++) {
      for (let x = 0; x < FRAME_W; x++) {
        const i = y * FRAME_W + x;
        if (layer[i] !== C.Empty) continue;
        const edge =
          (x > 0 && layer[i - 1] !== C.Empty) ||
          (x < FRAME_W - 1 && layer[i + 1] !== C.Empty) ||
          (y > 0 && layer[i - FRAME_W] !== C.Empty) ||
          (y < FRAME_H - 1 && layer[i + FRAME_W] !== C.Empty);
        if (edge) pixels[i] = C.Outline;
      }
    }
    for (let i = 0; i < layer.length; i++) if (layer[i] !== C.Empty) pixels[i] = layer[i]!;
  }
}

class Plot {
  constructor(private readonly layer: Uint8Array) {}

  set(x: number, y: number, color: C): void {
    const col = Math.round(x + ANCHOR_X);
    const row = Math.round(y + ANCHOR_Y);
    if (col >= 0 && col < FRAME_W && row >= 0 && row < FRAME_H)
      this.layer[row * FRAME_W + col] = color;
  }

  /** Tapered limb from a to b; the underside gets the shade color. */
  capsule(a: Point, b: Point, ra: number, rb: number, color: C, shade: C = color): void {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy || 1;
    const length = Math.sqrt(lengthSquared);
    // Perpendicular that points downward on screen, so light always reads from above.
    let nx = -dy / length;
    let ny = dx / length;
    if (ny < 0 || (ny === 0 && nx > 0)) {
      nx = -nx;
      ny = -ny;
    }
    const pad = Math.ceil(Math.max(ra, rb)) + 1;
    for (
      let y = Math.floor(Math.min(a[1], b[1])) - pad;
      y <= Math.ceil(Math.max(a[1], b[1])) + pad;
      y++
    ) {
      for (
        let x = Math.floor(Math.min(a[0], b[0])) - pad;
        x <= Math.ceil(Math.max(a[0], b[0])) + pad;
        x++
      ) {
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSquared));
        const r = ra + (rb - ra) * t;
        const ox = x - (a[0] + dx * t);
        const oy = y - (a[1] + dy * t);
        if (ox * ox + oy * oy > r * r) continue;
        this.set(x, y, ox * nx + oy * ny > r * 0.3 ? shade : color);
      }
    }
  }

  /** Fills every pixel near `center` that `shade` assigns a color, in a frame rotated by `degrees`. */
  shape(center: Point, radius: number, degrees: number, shade: (u: number, v: number) => C): void {
    const angle = (degrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        const color = shade(x * cos + y * sin, -x * sin + y * cos);
        if (color !== C.Empty) this.set(center[0] + x, center[1] + y, color);
      }
    }
  }
}

function add(a: Point, x: number, y: number): Point {
  return [a[0] + x, a[1] + y];
}

/** Coat flap tip, kept above the floor so low stances do not clip through it. */
function flap(hip: Point, x: number, y: number): Point {
  return [hip[0] + x, Math.min(hip[1] + y, -4)];
}

/** Two-bone IK. `bend` picks which side the joint folds toward (+1 is the art's forward-down). */
function joint(from: Point, to: Point, upper: number, lower: number, bend: number): Point {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const distance = Math.min(upper + lower - 0.01, Math.max(0.01, Math.hypot(dx, dy)));
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const ux = dx / (Math.hypot(dx, dy) || 1);
  const uy = dy / (Math.hypot(dx, dy) || 1);
  return [from[0] + ux * along - uy * height * bend, from[1] + uy * along + ux * height * bend];
}

function inTriangle(u: number, v: number, a: Point, b: Point, c: Point): boolean {
  const side = (p: Point, q: Point) => (u - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (v - q[1]);
  const d1 = side(a, b);
  const d2 = side(b, c);
  const d3 = side(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

const HAIR_SPIKES: readonly (readonly [Point, Point, Point])[] = [
  [
    [-12, -3],
    [-5, -7],
    [-5, 1],
  ],
  [
    [-11, -11],
    [-7, -4],
    [-1, -7],
  ],
  [
    [-4, -14],
    [-6, -6],
    [2, -7],
  ],
  [
    [4, -13],
    [-2, -7],
    [6, -6],
  ],
  [
    [10, -8],
    [2, -8],
    [7, -2],
  ],
];

function headPixel(u: number, v: number, eyes: 'open' | 'shut'): C {
  const inSkull = u * u + v * v <= 7.4 * 7.4;
  const spike = HAIR_SPIKES.some(([a, b, c]) => inTriangle(u, v, a, b, c));
  if (!inSkull && !spike) return C.Empty;
  const bang = v < -3 + (Math.abs(((u + 20) % 4) - 2) - 1) * 0.8;
  if (!inSkull || u < -2.5 || bang) {
    const lit = v < -6 && u > -7 && u < 3;
    return lit ? C.HairL : C.Hair;
  }
  if (eyes === 'shut') {
    if (v === 0 && u >= 2 && u <= 5) return C.Pupil;
  } else {
    if (u >= 2 && u <= 3 && v >= -2 && v <= 1) return C.White;
    if (u >= 4 && u <= 5 && v >= -2 && v <= 1) return C.Pupil;
  }
  if (u >= 3 && u <= 5 && v === 4) return C.SkinS;
  return u < 0 || v > 4 ? C.SkinS : C.Skin;
}

function drawFighter(pose: Pose): Uint8Array {
  const raster = new Raster();
  const { hip, chest, head, fHand, bHand, fFoot, bFoot } = pose;
  const fShoulder = add(chest, 2, -2);
  const bShoulder = add(chest, -3, -2);
  const fHipJoint = add(hip, 2, 1);
  const bHipJoint = add(hip, -2, 1);
  const neck = add(chest, 0, -5);
  const scarfAngle = ((pose.scarf ?? 15) * Math.PI) / 180;

  const leg = (from: Point, foot: Point, sleeve: C, shade: C, boot: C, bootShade: C) => {
    const ankle = add(foot, -1, -3);
    const knee = joint(from, ankle, THIGH, SHIN, -1);
    raster.part((p) => {
      p.capsule(from, knee, 3.4, 2.9, sleeve, shade);
      p.capsule(knee, ankle, 2.9, 2.4, sleeve, shade);
    });
    raster.part((p) => {
      p.capsule(add(ankle, 0, -3), ankle, 2.8, 2.8, boot, bootShade);
      p.capsule(add(foot, -2, -2), add(foot, 3, -2), 2.2, 1.9, boot, bootShade);
    });
  };
  const arm = (
    shoulder: Point,
    hand: Point,
    sleeve: C,
    shade: C,
    glove: C,
    gloveShade: C,
    bend: number,
  ) => {
    const elbow = joint(shoulder, hand, UPPER_ARM, FOREARM, bend);
    raster.part((p) => {
      p.capsule(shoulder, elbow, 3, 2.5, sleeve, shade);
      p.capsule(elbow, hand, 2.5, 2.1, sleeve, shade);
    });
    raster.part((p) => p.capsule(hand, hand, 2.6, 2.6, glove, gloveShade));
  };
  const sword = (hand: Point) => {
    const angle = (pose.sword * Math.PI) / 180;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    raster.part((p) => {
      p.capsule(
        add(hand, ux * 3, uy * 3),
        add(hand, ux * SWORD_LENGTH, uy * SWORD_LENGTH),
        1.7,
        0.6,
        C.Metal,
        C.MetalS,
      );
      p.capsule(add(hand, -ux * 4, -uy * 4), hand, 1, 1, C.BootS, C.BootS);
    });
    raster.part((p) =>
      p.capsule(
        add(hand, -uy * 4 + ux, ux * 4 + uy),
        add(hand, uy * 4 + ux, -ux * 4 + uy),
        1,
        1,
        C.Gold,
      ),
    );
  };

  // Scarf tails stream out behind the neck.
  raster.part((p) => {
    let a: Point = add(neck, -3, 0);
    for (let i = 0; i < 4; i++) {
      const bend = scarfAngle + i * 0.18;
      const b = add(a, -Math.cos(bend) * 6, Math.sin(bend) * 6);
      p.capsule(a, b, 2.4 - i * 0.3, 2.1 - i * 0.35, C.Scarf, C.ScarfS);
      a = b;
    }
  });
  arm(bShoulder, bHand, C.JacketS, C.JacketS, C.GloveS, C.GloveS, 1);
  if (pose.swordInBackHand) sword(bHand);
  leg(bHipJoint, bFoot, C.PantsS, C.PantsS, C.BootS, C.BootS);
  raster.part((p) => p.capsule(add(hip, -3, 1), flap(hip, -7, 9), 2.6, 3.2, C.JacketS, C.JacketS));
  raster.part((p) => {
    p.capsule(hip, chest, 5.2, 6.6, C.Jacket, C.JacketS);
    // Diagonal strap across the chest, then the belt and buckle.
    p.capsule(add(chest, 4, -4), add(hip, -3, -2), 0.7, 0.7, C.JacketL);
    p.capsule(add(hip, -5, 0), add(hip, 5, 0), 1.3, 1.3, C.PantsS);
    p.capsule(add(hip, 3, 0), add(hip, 3, 0), 1.2, 1.2, C.Gold);
  });
  leg(fHipJoint, fFoot, C.Pants, C.PantsS, C.Boot, C.BootS);
  raster.part((p) => p.capsule(add(hip, 3, 1), flap(hip, 4, 8), 2.2, 2.8, C.Jacket, C.JacketS));
  raster.part((p) => p.capsule(add(neck, -4, 0), add(neck, 4, 1), 3.1, 3.1, C.Scarf, C.ScarfS));
  raster.part((p) =>
    p.shape(head, 15, pose.headTilt ?? 0, (u, v) => headPixel(u, v, pose.eyes ?? 'open')),
  );
  if (!pose.swordInBackHand) sword(fHand);
  arm(fShoulder, fHand, C.Jacket, C.JacketS, C.Glove, C.GloveS, 1);
  return raster.pixels;
}

const STANCE: Pose = {
  hip: [-1, -20],
  chest: [2, -32],
  head: [5, -43],
  fHand: [15, -30],
  bHand: [6, -25],
  fFoot: [10, 0],
  bFoot: [-10, 0],
  sword: -55,
};

function shifted(pose: Pose, y: number, scarf: number): Pose {
  return {
    ...pose,
    hip: add(pose.hip, 0, y),
    chest: add(pose.chest, 0, y),
    head: add(pose.head, 0, y),
    fHand: add(pose.fHand, 0, y),
    bHand: add(pose.bHand, 0, y),
    scarf,
  };
}

function walkPose(step: number, total: number): Pose {
  const phase = (step / total) * Math.PI * 2;
  const swing = Math.cos(phase);
  const lift = Math.sin(phase);
  return {
    ...shifted(STANCE, -Math.abs(lift) + 1, 10 + 10 * lift),
    fFoot: [swing * 11, -Math.max(0, lift) * 5],
    bFoot: [-swing * 11, -Math.max(0, -lift) * 5],
  };
}

const IDLE_BOB = [0, 1, 2, 1];
const WALK_FRAMES = 6;

const POSES: Readonly<Record<string, Pose>> = {
  ...Object.fromEntries(
    IDLE_BOB.map((y, i) => [`idle${i}`, shifted(STANCE, y, 22 + Math.sin((i / 4) * 6.28) * 10)]),
  ),
  ...Object.fromEntries(
    Array.from({ length: WALK_FRAMES }, (_, i) => [`walk${i}`, walkPose(i, WALK_FRAMES)]),
  ),
  crouch: {
    hip: [-2, -9],
    chest: [4, -17],
    head: [9, -26],
    fHand: [19, -15],
    bHand: [10, -12],
    fFoot: [11, 0],
    bFoot: [-11, 0],
    sword: -18,
    scarf: 40,
  },
  jumpUp: {
    hip: [0, -24],
    chest: [2, -36],
    head: [5, -47],
    fHand: [14, -43],
    bHand: [-7, -31],
    fFoot: [8, -10],
    bFoot: [-6, -3],
    sword: -75,
    scarf: 55,
  },
  jumpFall: {
    hip: [0, -22],
    chest: [2, -34],
    head: [5, -45],
    fHand: [16, -37],
    bHand: [-9, -39],
    fFoot: [10, -3],
    bFoot: [-8, -7],
    sword: -30,
    scarf: -25,
  },
  slashWind: {
    hip: [-3, -20],
    chest: [-3, -32],
    head: [0, -43],
    fHand: [-8, -44],
    bHand: [-2, -33],
    fFoot: [11, 0],
    bFoot: [-9, 0],
    sword: -150,
    headTilt: -5,
    scarf: 30,
  },
  slashHit: {
    hip: [2, -18],
    chest: [8, -29],
    head: [12, -40],
    fHand: [23, -30],
    bHand: [-6, -29],
    fFoot: [16, 0],
    bFoot: [-12, 0],
    sword: 5,
    headTilt: 8,
    scarf: 5,
  },
  slashFollow: {
    hip: [3, -17],
    chest: [9, -28],
    head: [13, -39],
    fHand: [21, -20],
    bHand: [-8, -27],
    fFoot: [16, 0],
    bFoot: [-12, 0],
    sword: 42,
    headTilt: 10,
    scarf: -5,
  },
  castRelease: {
    hip: [-2, -20],
    chest: [1, -32],
    head: [4, -43],
    fHand: [22, -35],
    bHand: [-5, -25],
    fFoot: [11, 0],
    bFoot: [-11, 0],
    sword: 135,
    swordInBackHand: true,
    scarf: 5,
  },
  burstWind: {
    hip: [0, -15],
    chest: [2, -26],
    head: [4, -37],
    fHand: [7, -21],
    bHand: [-3, -21],
    fFoot: [12, 0],
    bFoot: [-12, 0],
    sword: -88,
    headTilt: 14,
    scarf: 50,
  },
  burstRelease: {
    hip: [0, -22],
    chest: [0, -34],
    head: [1, -46],
    fHand: [18, -44],
    bHand: [-18, -44],
    fFoot: [13, 0],
    bFoot: [-13, 0],
    sword: -62,
    headTilt: -12,
    scarf: -35,
  },
  stabWind: {
    hip: [1, -19],
    chest: [5, -30],
    head: [9, -41],
    fHand: [15, -42],
    bHand: [11, -37],
    fFoot: [12, 0],
    bFoot: [-10, 0],
    sword: 88,
    scarf: 25,
  },
  stabRelease: {
    hip: [3, -11],
    chest: [9, -20],
    head: [13, -30],
    fHand: [19, -25],
    bHand: [15, -21],
    fFoot: [15, 0],
    bFoot: [-11, 0],
    sword: 88,
    headTilt: 12,
    scarf: 45,
  },
  charge0: {
    hip: [-3, -18],
    chest: [-5, -30],
    head: [-3, -41],
    fHand: [-13, -21],
    bHand: [-12, -24],
    fFoot: [13, 0],
    bFoot: [-12, 0],
    sword: 176,
    headTilt: 6,
    scarf: -20,
  },
  charge1: {
    hip: [-3, -17],
    chest: [-6, -29],
    head: [-4, -40],
    fHand: [-14, -20],
    bHand: [-13, -23],
    fFoot: [13, 0],
    bFoot: [-12, 0],
    sword: 176,
    headTilt: 6,
    scarf: -45,
  },
  lunge: {
    hip: [8, -15],
    chest: [17, -24],
    head: [22, -34],
    fHand: [36, -26],
    bHand: [3, -23],
    fFoot: [23, 0],
    bFoot: [-15, 0],
    sword: 0,
    headTilt: 10,
    scarf: 0,
  },
  dash: {
    hip: [0, -15],
    chest: [10, -23],
    head: [15, -32],
    fHand: [19, -17],
    bHand: [-12, -25],
    fFoot: [12, -1],
    bFoot: [-20, -6],
    sword: 165,
    headTilt: 12,
    scarf: -2,
  },
  hit: {
    hip: [-4, -19],
    chest: [-9, -30],
    head: [-13, -40],
    fHand: [7, -38],
    bHand: [-21, -23],
    fFoot: [9, 0],
    bFoot: [-8, 0],
    sword: -20,
    headTilt: -22,
    eyes: 'shut',
    scarf: 45,
  },
  ko: {
    hip: [2, -5],
    chest: [-12, -6],
    head: [-25, -7],
    fHand: [-4, -3],
    bHand: [-16, -3],
    fFoot: [24, -1],
    bFoot: [20, -1],
    sword: 4,
    headTilt: -90,
    eyes: 'shut',
    scarf: 80,
  },
  win0: {
    hip: [0, -21],
    chest: [1, -33],
    head: [2, -44],
    fHand: [8, -54],
    bHand: [-8, -28],
    fFoot: [9, 0],
    bFoot: [-9, 0],
    sword: -82,
    headTilt: -8,
    scarf: 20,
  },
  win1: {
    hip: [0, -22],
    chest: [1, -34],
    head: [2, -45],
    fHand: [8, -55],
    bHand: [-8, -29],
    fFoot: [9, 0],
    bFoot: [-9, 0],
    sword: -82,
    headTilt: -8,
    scarf: 45,
  },
};

export const FRAME_NAMES = Object.keys(POSES);
export const PLAYER_SLOTS = PALETTES.length;

/** Returns RGBA pixels for every frame, one entry per name in FRAME_NAMES, for the given slot. */
export function renderFighterFrames(slot: number): Uint8ClampedArray[] {
  const palette = PALETTES[slot] ?? PALETTES[0]!;
  return FRAME_NAMES.map((name) => {
    const indexed = drawFighter(POSES[name]!);
    const rgba = new Uint8ClampedArray(indexed.length * 4);
    indexed.forEach((index, i) => {
      if (index === C.Empty) return;
      const color = palette[index]!;
      rgba[i * 4] = color >> 16;
      rgba[i * 4 + 1] = (color >> 8) & 255;
      rgba[i * 4 + 2] = color & 255;
      rgba[i * 4 + 3] = 255;
    });
    return rgba;
  });
}
