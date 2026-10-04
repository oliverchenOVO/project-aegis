// Fixed orthographic oblique view. Public simulation/pathfinding XY never changes.
export const PROJECTION = {
  a: 1,
  b: 0.16,
  c: -0.32,
  d: 0.68,
  zScale: 1.12,
  revision: "oblique-v1",
} as const;
export interface Point {
  x: number;
  y: number;
}
export function projectGround(x: number, y: number): Point {
  return {
    x: PROJECTION.a * x + PROJECTION.c * y,
    y: PROJECTION.b * x + PROJECTION.d * y,
  };
}
export function projectPoint(x: number, y: number, z: number): Point {
  const p = projectGround(x, y);
  return { x: p.x, y: p.y - PROJECTION.zScale * z };
}
export function unprojectGround(x: number, y: number): Point {
  const det = PROJECTION.a * PROJECTION.d - PROJECTION.b * PROJECTION.c;
  return {
    x: (PROJECTION.d * x - PROJECTION.c * y) / det,
    y: (-PROJECTION.b * x + PROJECTION.a * y) / det,
  };
}
// Express a real projected XYZ point in the ground container's local XY frame.
// Its fixed Pixi matrix then produces precisely projectPoint(x,y,z).
export function groundFramePoint(x: number, y: number, z: number): Point {
  const p = projectPoint(x, y, z);
  return unprojectGround(p.x, p.y);
}
export const CITY_BOUNDS = {
  minX: -130,
  maxX: 770,
  minY: 8,
  maxY: 510,
} as const;
export function cityFit(width: number, height: number) {
  return Math.max(
    0.1,
    Math.min(
      (width - 40) / (CITY_BOUNDS.maxX - CITY_BOUNDS.minX),
      (height - 32) / (CITY_BOUNDS.maxY - CITY_BOUNDS.minY),
    ),
  );
}
export function cityCamera(
  width: number,
  height: number,
  scale: number,
  pan: Point,
): Point {
  return {
    x: width / 2 - ((CITY_BOUNDS.minX + CITY_BOUNDS.maxX) / 2) * scale + pan.x,
    y: height / 2 - ((CITY_BOUNDS.minY + CITY_BOUNDS.maxY) / 2) * scale + pan.y,
  };
}
export function pointerGround(
  point: Point,
  camera: Point,
  scale: number,
): Point {
  return unprojectGround(
    (point.x - camera.x) / scale,
    (point.y - camera.y) / scale,
  );
}
export function buildingDepth(b: {
  x: number;
  y: number;
  w: number;
  d: number;
}) {
  return projectGround(b.x + b.w, b.y + b.d).y;
}
