import type { CommandCenterView } from "../../../domain/src/index";
import { districtProfiles, HEIGHTS, type HeightClass } from "./theme";
export interface Identity {
  id: string;
  version: string;
}
export interface Mass {
  id: string;
  x: number;
  y: number;
  w: number;
  d: number;
  heightClass: HeightClass;
  roof: number;
  district: string;
}
export const RIVER = [
  345, 0, 382, 0, 421, 170, 401, 320, 461, 590, 418, 590, 361, 320, 382, 170,
];
export function inRiver(x: number, y: number) {
  let inside = false;
  for (let i = 0, j = RIVER.length - 2; i < RIVER.length; j = i, i += 2) {
    const xi = RIVER[i],
      yi = RIVER[i + 1],
      xj = RIVER[j],
      yj = RIVER[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
export function visualHash(value: string) {
  let result = 2166136261;
  for (const c of value) result = Math.imul(result ^ c.charCodeAt(0), 16777619);
  return result >>> 0;
}
// Explicitly whitelist public cartography. Gameplay seed and received claims are excluded.
export function cityKey(city: CommandCenterView["city"], identity: Identity) {
  return JSON.stringify([
    identity.id,
    identity.version,
    "massing-v1",
    city.nodes.map((n) => [n.id, n.x, n.y, n.district]),
    city.roads.map((r) => [r.id, r.from, r.to]),
    city.facilities.map((f) => [f.id, f.type, f.nodeId]),
    city.hospitals.map((h) => [h.id, h.nodeId]),
    city.districts.map((d) => [d.id, d.name, d.x, d.y]),
    city.communicationNodes?.map((n) => [n.id, n.nodeId, n.role]),
  ]);
}
export function cityLayout(
  city: CommandCenterView["city"],
  identity: Identity,
) {
  const key = cityKey(city, identity),
    masses: Mass[] = [],
    parcels: {
      x: number;
      y: number;
      w: number;
      d: number;
      district: string;
      ground: number;
    }[] = [];
  const xs = [...new Set(city.nodes.map((n) => n.x))].sort((a, b) => a - b);
  const ys = [...new Set(city.nodes.map((n) => n.y))].sort((a, b) => a - b);
  for (let row = 0; row < ys.length - 1; row++)
    for (let col = 0; col < xs.length - 1; col++) {
      const node = city.nodes.find((n) => n.x === xs[col] && n.y === ys[row]);
      if (!node) continue;
      const district =
        node.district in districtProfiles
          ? (node.district as keyof typeof districtProfiles)
          : "D";
      const p = districtProfiles[district],
        x = xs[col] + 13,
        y = ys[row] + 17,
        w = xs[col + 1] - xs[col] - 26,
        d = ys[row + 1] - ys[row] - 32;
      parcels.push({ x, y, w, d, district, ground: p.ground });
      for (let r = 0; r < p.rows; r++)
        for (let c = 0; c < p.cols; c++) {
          const id = `${district}:${row}:${col}:${r}:${c}`,
            hash = visualHash(`${key}:${id}`);
          const heightClass = p.heights[hash % p.heights.length];
          const bw = w / p.cols - 9,
            bd = d / p.rows - 10;
          const bx = x + 6 + (c * w) / p.cols,
            by = y + 10 + (r * d) / p.rows;
          if (
            [
              [bx, by],
              [bx + bw, by],
              [bx, by + bd],
              [bx + bw, by + bd],
            ].some(([a, b]) => inRiver(a, b))
          )
            continue;
          // Keep tall roofs inside parcels: no road or route projection is displaced.
          masses.push({
            id,
            x: bx + 3,
            y: by + 3,
            w: bw - 3,
            d: bd - 3,
            heightClass,
            roof: p.roof,
            district,
          });
        }
    }
  masses.sort((a, b) => a.y + a.d - (b.y + b.d) || a.id.localeCompare(b.id));
  return { key, masses, parcels };
}
export function roofOffset(heightClass: HeightClass) {
  const h = HEIGHTS[heightClass];
  return { x: -h * 0.38, y: -h * 0.68 };
}
export function crossesRiver(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  return Array.from({ length: 21 }, (_, i) =>
    inRiver(a.x + ((b.x - a.x) * i) / 20, a.y + ((b.y - a.y) * i) / 20),
  ).some(Boolean);
}
