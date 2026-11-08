/** Procedural pixel backdrop for the side-view arena, drawn at 1/3 of the world resolution. */

import { RULES } from '@deathmatch/shared';
import { ART_SCALE } from './fighterArt';

export const STAGE_W = RULES.width / ART_SCALE;
export const STAGE_H = RULES.height / ART_SCALE;
const FLOOR_Y = RULES.groundY / ART_SCALE;

const SKY = [0x1b1838, 0x2a1f4c, 0x46275f, 0x74336a, 0xa8445f, 0xd96a4f, 0xf09a56];
const ARCH_SPACING = 64;
const ARCH_HALF_WIDTH = 19;
const WALL_TOP = 88;
const ARCH_TOP = 112;

function mix(a: number, b: number, t: number): number {
  const channel = (shift: number) => {
    const from = (a >> shift) & 255;
    return Math.round(from + (((b >> shift) & 255) - from) * t) << shift;
  };
  return channel(16) | channel(8) | channel(0);
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function dither(x: number, y: number): number {
  return (BAYER[(y % 4) * 4 + (x % 4)]! + 0.5) / 16;
}

function skyColor(x: number, y: number): number {
  const position = (Math.min(y, WALL_TOP) / WALL_TOP) * (SKY.length - 1);
  const band = Math.min(SKY.length - 2, Math.floor(position));
  return position - band > dither(x, y) ? SKY[band + 1]! : SKY[band]!;
}

function ridge(x: number, base: number, amplitude: number, seed: number): number {
  return (
    base +
    Math.sin(x * 0.031 + seed) * amplitude +
    Math.sin(x * 0.083 + seed * 2.3) * amplitude * 0.45 +
    Math.sin(x * 0.19 + seed * 4.1) * amplitude * 0.18
  );
}

function wallPixel(x: number, y: number): number {
  const center = Math.round(x / ARCH_SPACING) * ARCH_SPACING;
  const offset = x - center;
  const archRise = (ARCH_HALF_WIDTH * ARCH_HALF_WIDTH - offset * offset) ** 0.5;
  const insideArch =
    Math.abs(offset) <= ARCH_HALF_WIDTH && y >= ARCH_TOP + ARCH_HALF_WIDTH - archRise;
  if (insideArch) {
    // Deep shadow with a warm bounce of light near the floor.
    const glow = Math.max(0, (y - 132) / (FLOOR_Y - 132));
    return mix(0x120f22, 0x4a2a3a, glow * glow);
  }
  const row = Math.floor((y - WALL_TOP) / 6);
  const brick = (x + (row % 2) * 7) % 14;
  const joint = (y - WALL_TOP) % 6 === 5 || brick === 0;
  const shade = mix(0x4d4a63, 0x2f2c46, (y - WALL_TOP) / (FLOOR_Y - WALL_TOP));
  const edgeOfArch = Math.abs(offset) <= ARCH_HALF_WIDTH + 2 && y >= ARCH_TOP - 2;
  if (edgeOfArch) return joint ? 0x2b2840 : mix(shade, 0x8a7f9c, 0.35);
  return joint ? mix(shade, 0x15132a, 0.55) : shade;
}

function floorPixel(x: number, y: number): number {
  const depth = y - FLOOR_Y;
  if (depth === 0) return 0xe9c98e;
  if (depth === 1) return 0xa98a68;
  // Slab joints fan out from the center to suggest depth.
  const slab = 18 + depth * 1.4;
  const skew = ((x - STAGE_W / 2) * (1 + depth * 0.05)) / slab;
  const joint = Math.abs(skew - Math.round(skew)) * slab < 0.6 || depth % 8 === 7;
  const base = mix(0x6a5a6e, 0x2a2438, depth / (STAGE_H - FLOOR_Y));
  return joint ? mix(base, 0x15111f, 0.5) : base;
}

/** Banners hang between the arches, in each player's color on their own side. */
function bannerPixel(x: number, y: number): number | null {
  const pillar =
    Math.round((x - ARCH_SPACING / 2) / ARCH_SPACING) * ARCH_SPACING + ARCH_SPACING / 2;
  const offset = x - pillar;
  if (Math.abs(offset) > 5 || y < 94 || y > 128) return null;
  const tip = 128 - Math.abs(offset);
  if (y > tip) return null;
  const left = pillar < STAGE_W / 2;
  if (Math.abs(offset) === 5 || y === 94) return 0xf2c14e;
  if (Math.abs(offset) <= 1 && y >= 104 && y <= 114) return 0xf2c14e;
  const base = left ? 0x24a596 : 0xe0742c;
  return offset > 2 ? mix(base, 0x000000, 0.28) : base;
}

export function renderStage(): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(STAGE_W * STAGE_H * 4);
  const sunX = STAGE_W / 2;
  const sunY = 66;
  for (let y = 0; y < STAGE_H; y++) {
    for (let x = 0; x < STAGE_W; x++) {
      let color = skyColor(x, y);
      const sun = Math.hypot(x - sunX, y - sunY);
      if (sun < 30) color = sun < 27 ? 0xffd98a : 0xffb765;
      if (y >= ridge(x, 62, 12, 1.7)) color = 0x3d2a5c;
      if (y >= ridge(x, 76, 9, 4.2)) color = 0x2a2048;
      if (y >= FLOOR_Y) color = floorPixel(x, y);
      else if (y >= WALL_TOP - 6) {
        // Crenellations along the top of the wall.
        if (y >= WALL_TOP || (x + 4) % 16 < 9)
          color = y < WALL_TOP + 1 ? 0x8a7f9c : wallPixel(x, Math.max(y, WALL_TOP));
        if (y >= WALL_TOP) color = bannerPixel(x, y) ?? color;
      }
      const offset = y * STAGE_W * 4 + x * 4;
      rgba[offset] = color >> 16;
      rgba[offset + 1] = (color >> 8) & 255;
      rgba[offset + 2] = color & 255;
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}
