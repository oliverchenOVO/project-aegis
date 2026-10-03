import type { DomainEvent, CausalChain } from "../../domain/src/index";

/** Only recorded, backwards direct edges are accepted. No proximity inference. */
export class CausalIndex {
  readonly events = new Map<string, DomainEvent>();
  readonly children = new Map<string, string[]>();
  constructor(events: readonly DomainEvent[]) {
    for (const event of events) {
      if (this.events.has(event.id)) throw new Error("Duplicate causal event");
      for (const cause of event.causedByEventIds) {
        const parent = this.events.get(cause);
        if (!parent || parent.tick > event.tick)
          throw new Error(`Invalid direct causal edge ${cause} → ${event.id}`);
        const children = this.children.get(cause) ?? [];
        children.push(event.id);
        this.children.set(cause, children);
      }
      this.events.set(event.id, event);
    }
  }
  trace(rootEventId: string, maxDepth = 10, maxNodes = 80): CausalChain {
    if (!this.events.has(rootEventId)) throw new Error("Unknown causal root");
    if (
      !Number.isInteger(maxDepth) ||
      maxDepth < 0 ||
      maxDepth > 50 ||
      !Number.isInteger(maxNodes) ||
      maxNodes < 1 ||
      maxNodes > 500
    )
      throw new Error("Invalid causal display limits");
    const included = new Set<string>(),
      omitted = new Set<string>(),
      pending = [{ id: rootEventId, depth: 0 }];
    for (let cursor = 0; cursor < pending.length; cursor++) {
      const item = pending[cursor];
      if (included.has(item.id)) continue;
      if (included.size >= maxNodes || item.depth > maxDepth) {
        omitted.add(item.id);
        continue;
      }
      included.add(item.id);
      for (const id of this.events.get(item.id)!.causedByEventIds)
        pending.push({ id, depth: item.depth + 1 });
    }
    for (const id of included) omitted.delete(id);
    const nodes = [...this.events.values()].filter((e) => included.has(e.id)),
      edges = nodes.flatMap((e) =>
        e.causedByEventIds
          .filter((id) => included.has(id))
          .map((causeId) => ({ causeId, effectId: e.id })),
      );
    return {
      rootEventId,
      nodes: structuredClone(nodes),
      edges,
      truncated: omitted.size > 0,
      omittedEventIds: [...omitted],
      limits: { maxDepth, maxNodes },
    };
  }
  outcomes(root: string, limit = 4096): { ids: string[]; truncated: boolean } {
    if (!this.events.has(root)) throw new Error("Unknown decision event");
    const visited = new Set([root]),
      queue = [root],
      ids: string[] = [];
    let cursor = 0;
    while (cursor < queue.length && cursor < limit) {
      const id = queue[cursor++];
      if (id !== root && physicalOutcome(this.events.get(id)!)) ids.push(id);
      for (const child of this.children.get(id) ?? [])
        if (!visited.has(child)) {
          visited.add(child);
          queue.push(child);
        }
    }
    return {
      ids: ids.slice(0, 40),
      truncated: cursor < queue.length || ids.length > 40,
    };
  }
}
function physicalOutcome(event: DomainEvent): boolean {
  return [
    "PATIENT_DIED",
    "PATIENT_RECOVERED",
    "PATIENT_TRANSPORTED",
    "PATIENT_ADMITTED",
    "PATIENT_DETERIORATED",
    "CIVILIANS_SHELTERED",
    "CIVILIANS_STRANDED",
    "INCIDENT_RESOLVED",
    "POWER_RESTORED",
    "ROAD_CLEARED",
    "UNIT_DISABLED",
    "AMBULANCE_HANDOVER_COMPLETED",
  ].includes(event.type);
}
