import type { Belief, CommandCenterView } from "../../../domain/src/index";
import { projectGround, type Point } from "./projection";
import { detailForScale } from "./theme";

export const PLATE = { width: 110, height: 36, gap: 6 };
export interface IncidentGroup {
  key: string;
  members: Belief[];
  anchor: Point;
  x: number;
  y: number;
  severity?: number;
  receivedAge: number;
  categories: string[];
}
const idOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function incidentPriority(selected?: string) {
  return (a: Belief, b: Belief) =>
    Number(b.subjectId === selected) - Number(a.subjectId === selected) ||
    (b.claim.severity ?? -1) - (a.claim.severity ?? -1) ||
    b.receivedTick - a.receivedTick ||
    idOrder(a.subjectId, b.subjectId);
}
// Input contains received knowledge and public cartography only. No world/seed access.
export function clusterIncidents(
  view: Pick<CommandCenterView, "beliefs" | "city" | "tick">,
  camera: Point,
  scale: number,
  width: number,
  height: number,
  selected?: string,
  reserved: Point[] = [],
): IncidentGroup[] {
  const nodes = new Map(view.city.nodes.map((n) => [n.id, n]));
  const priority = incidentPriority(selected);
  const detail = detailForScale(scale);
  const radius = detail === "FAR" ? 125 : detail === "MEDIUM" ? 88 : 24;
  const groups: IncidentGroup[] = [];
  const clamp = (p: Point) => ({
    x: Math.max(8, Math.min(width - PLATE.width - 8, p.x)),
    y: Math.max(8, Math.min(height - PLATE.height - 8, p.y)),
  });
  const overlaps = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) < PLATE.width + PLATE.gap &&
    Math.abs(a.y - b.y) < PLATE.height + PLATE.gap;
  const blocksUnit = (p: Point) =>
    reserved.some(
      (u) =>
        u.x > p.x - 9 &&
        u.x < p.x + PLATE.width + 9 &&
        u.y > p.y - 9 &&
        u.y < p.y + PLATE.height + 9,
    );
  for (const b of view.beliefs
    .filter((b) => b.kind === "INCIDENT")
    .sort(priority)) {
    const n = nodes.get(b.claim.nodeId ?? "");
    const p = n ? projectGround(n.x, n.y) : undefined;
    // Unknown locations remain represented, without inventing a ground coordinate.
    const anchor = p
      ? { x: camera.x + p.x * scale, y: camera.y + p.y * scale }
      : { x: 12, y: height - 12 };
    const candidate = clamp({ x: anchor.x - 20, y: anchor.y - 55 });
    const parent =
      b.subjectId !== selected &&
      groups.find(
        (g) =>
          g.members[0].subjectId !== selected &&
          (Math.hypot(g.anchor.x - anchor.x, g.anchor.y - anchor.y) < radius ||
            overlaps(g, candidate)),
      );
    if (parent) {
      parent.members.push(b);
      continue;
    }
    let position = [
      candidate,
      ...[-1, 1, -2, 2].map((i) =>
        clamp({ x: candidate.x, y: candidate.y + i * 44 }),
      ),
    ].find((p) => !blocksUnit(p) && groups.every((g) => !overlaps(g, p)));
    if (!position) {
      // Deterministic bounded shelf fallback; selected incident is placed first.
      for (let y = 8; y + PLATE.height < height - 8 && !position; y += 44)
        for (let x = 8; x + PLATE.width < width - 8; x += 118)
          if (
            !blocksUnit({ x, y }) &&
            groups.every((g) => !overlaps(g, { x, y }))
          ) {
            position = { x, y };
            break;
          }
    }
    if (!position && groups.some((g) => g.members[0].subjectId !== selected)) {
      groups.find((g) => g.members[0].subjectId !== selected)!.members.push(b);
      continue;
    }
    groups.push({
      key: b.subjectId,
      members: [b],
      anchor,
      ...(position ?? candidate),
      receivedAge: 0,
      categories: [],
    });
  }
  for (const g of groups) {
    g.members.sort(priority);
    g.key = g.members
      .map((b) => b.subjectId)
      .sort(idOrder)
      .join("|");
    const severities = g.members.flatMap((b) =>
      b.claim.severity === undefined ? [] : [b.claim.severity],
    );
    g.severity = severities.length ? Math.max(...severities) : undefined;
    g.receivedAge = Math.max(
      0,
      view.tick - Math.max(...g.members.map((b) => b.receivedTick)),
    );
    g.categories = [
      ...new Set(g.members.map((b) => b.claim.incidentType ?? "UNKNOWN")),
    ].sort(idOrder);
  }
  return groups;
}
