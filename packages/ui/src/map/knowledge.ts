import type { CommandCenterView } from "../../../domain/src/index";
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
