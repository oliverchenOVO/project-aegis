import type { WorldState } from "../../domain/src/index";
export function edge(w: WorldState, a: string, b: string) {
  return w.roads.find(
    (r) => (r.from === a && r.to === b) || (r.from === b && r.to === a),
  );
}
export function cost(r: WorldState["roads"][number]): number {
  return r.travelTicks * (r.state === "DEGRADED" ? 2 : 1);
}
export function route(
  w: WorldState,
  start: string,
  end: string,
): { nodes: string[]; eta: number } | undefined {
  if (start === end) return { nodes: [], eta: 0 };
  const distance = new Map<string, number>([[start, 0]]),
    previous = new Map<string, string>(),
    visited = new Set<string>();
  while (true) {
    const candidate = [...distance]
      .filter(([n]) => !visited.has(n))
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "en"))[0];
    if (!candidate) return undefined;
    const [node, d] = candidate;
    if (node === end) break;
    visited.add(node);
    for (const r of w.roads
      .filter(
        (r) => r.state !== "BLOCKED" && (r.from === node || r.to === node),
      )
      .sort((a, b) => a.id.localeCompare(b.id, "en"))) {
      const next = r.from === node ? r.to : r.from,
        value = d + cost(r);
      if (value < (distance.get(next) ?? Infinity)) {
        distance.set(next, value);
        previous.set(next, node);
      }
    }
  }
  const path = [end];
  while (path[0] !== start) path.unshift(previous.get(path[0])!);
  return { nodes: path.slice(1), eta: distance.get(end)! };
}
