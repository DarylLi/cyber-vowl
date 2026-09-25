import type { SimNode } from "./vowl";

export interface Pt {
  x: number;
  y: number;
}

/** half-extents of a datatype rectangle (VOWL renders literals as rectangles) */
export function datatypeHalf(label: string): { w: number; h: number } {
  return { w: Math.max(label.length * 7.4 + 22, 46), h: 22 };
}

export function nodeHalf(n: SimNode): { w: number; h: number } {
  return n.kind === "datatype" ? datatypeHalf(n.label) : { w: n.radius, h: n.radius };
}

function circleBorder(n: SimNode, toward: Pt): Pt {
  const dx = toward.x - n.x;
  const dy = toward.y - n.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: n.x + (dx / len) * n.radius, y: n.y + (dy / len) * n.radius };
}

/** intersection of the segment node->toward with the node's rectangle border */
function rectBorder(n: SimNode, toward: Pt): Pt {
  const { w, h } = nodeHalf(n);
  const dx = toward.x - n.x;
  const dy = toward.y - n.y;
  if (dx === 0 && dy === 0) return { x: n.x, y: n.y };
  const tx = dx !== 0 ? w / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? h / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: n.x + dx * t, y: n.y + dy * t };
}

export function borderPoint(n: SimNode, toward: Pt): Pt {
  return n.kind === "datatype" ? rectBorder(n, toward) : circleBorder(n, toward);
}

export function bezier(t: number, p0: Pt, pc: Pt, p2: Pt): Pt {
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  return { x: a * p0.x + b * pc.x + c * p2.x, y: a * p0.y + b * pc.y + c * p2.y };
}

export interface ArcGeom {
  d: string;
  p0: Pt;
  pc: Pt;
  p2: Pt;
  mid: Pt;
  angle: number; // degrees, normalized to [-90, 90]
}

function normalizeAngle(deg: number): number {
  let a = deg;
  while (a > 90) a -= 180;
  while (a < -90) a += 180;
  return a;
}

/** quadratic bezier arc between two node borders, curved perpendicular to the link */
export function arcGeometry(s: SimNode, t: SimNode, curve: number): ArcGeom {
  const p0 = borderPoint(s, { x: t.x, y: t.y });
  const p2 = borderPoint(t, { x: s.x, y: s.y });
  const mx = (p0.x + p2.x) / 2;
  const my = (p0.y + p2.y) / 2;
  const dx = p2.x - p0.x;
  const dy = p2.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pc = { x: mx + nx * curve, y: my + ny * curve };
  const mid = bezier(0.5, p0, pc, p2);
  const angle = normalizeAngle((Math.atan2(dy, dx) * 180) / Math.PI);
  return { d: `M ${p0.x} ${p0.y} Q ${pc.x} ${pc.y} ${p2.x} ${p2.y}`, p0, pc, p2, mid, angle };
}

export interface LoopGeom {
  d: string;
  label: Pt;
  angle: number;
}

/** self-loop arc bulging out to the right of the node (WebVOWL loop style) */
export function loopGeometry(n: SimNode): LoopGeom {
  const r = n.kind === "datatype" ? Math.max(nodeHalf(n).w, nodeHalf(n).h) : n.radius;
  const a1 = -2.35;
  const a2 = 2.35;
  const p0 = { x: n.x + r * Math.cos(a1), y: n.y + r * Math.sin(a1) };
  const p2 = { x: n.x + r * Math.cos(a2), y: n.y + r * Math.sin(a2) };
  const bulge = r + 130;
  const c1 = { x: n.x + bulge * Math.cos(-1.1), y: n.y + bulge * Math.sin(-1.1) };
  const c2 = { x: n.x + bulge * Math.cos(1.1), y: n.y + bulge * Math.sin(1.1) };
  return {
    d: `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`,
    label: { x: n.x + r + 118, y: n.y },
    angle: 0,
  };
}

/** arc length-ish curve offset; pair-edges alternate sides like WebVOWL */
export function curveFor(pairIndex: number, len: number): number {
  const sign = pairIndex % 2 === 0 ? 1 : -1;
  const tier = Math.floor(pairIndex / 2);
  return sign * len * (0.14 + tier * 0.12);
}

/** cubic point on a loop path (for card/label placement) */
export function cubic(t: number, p0: Pt, c1: Pt, c2: Pt, p3: Pt): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
  };
}

export function compact(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "G";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
