import type { WorldState, DomainEvent } from "../../domain/src/index";
export function emit(
  w: WorldState,
  type: DomainEvent["type"],
  payload: DomainEvent["payload"],
  causes: (string | undefined)[] = [],
): string {
  const id = `evt-${++w.counters.event}`;
  w.events.push({
    id,
    tick: w.tick,
    type,
    payload,
    causedByEventIds: [...new Set(causes.filter((c): c is string => !!c))],
  });
  return id;
}
