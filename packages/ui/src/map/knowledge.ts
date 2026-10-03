import type { CommandCenterView } from "../../../domain/src/index";
import { mapTheme } from "./theme";
export function operationalAppearance(value: string | undefined) {
  if (value === undefined)
    return { color: mapTheme.label, warning: false, known: false };
  const warning = ["DOWN", "OFFLINE", "DEGRADED", "變電站停機"].includes(value);
  return {
    color: warning ? mapTheme.blocked : mapTheme.comms,
    warning,
    known: true,
  };
}
// A received location is mandatory. Unit roster membership alone cannot place a vehicle.
export function positionedUnits(view: CommandCenterView) {
  const nodes = new Set(view.city.nodes.map((n) => n.id));
  const groups = new Map<string, typeof view.units>();
  for (const u of view.units) {
    const id = u.belief?.claim.nodeId;
    if (id && nodes.has(id)) groups.set(id, [...(groups.get(id) ?? []), u]);
  }
  return groups;
}
export function floodAppearance(estimatedDepth: number | undefined) {
  return {
    color: estimatedDepth === undefined ? 0x586779 : 0x428eb8,
    alpha:
      estimatedDepth === undefined
        ? 0.035
        : Math.min(0.26, 0.06 + estimatedDepth * 0.06),
  };
}
export function incidentCallouts(view: CommandCenterView) {
  const nodes = new Map(view.city.nodes.map((n) => [n.id, n]));
  const placed = new Map<string, { x: number; y: number }>();
  for (const b of view.beliefs
    .filter((b) => b.kind === "INCIDENT")
    .sort((a, b) => a.subjectId.localeCompare(b.subjectId))) {
    const n = nodes.get(b.claim.nodeId ?? "");
    if (!n) continue;
    const candidates = [
      [0, -42],
      [0, -78],
      [-105, -42],
      [105, -42],
      [0, 42],
      [-105, -78],
      [105, -78],
    ];
    const point = candidates
      .map(([dx, dy]) => ({
        x: Math.max(15, Math.min(719, n.x + dx)),
        y: Math.max(15, Math.min(558, n.y + dy)),
      }))
      .find((p) =>
        [...placed.values()].every(
          (q) => Math.abs(p.x - q.x) >= 98 || Math.abs(p.y - q.y) >= 34,
        ),
      ) ?? { x: n.x, y: n.y - 42 };
    placed.set(b.subjectId, point);
  }
  return placed;
}
