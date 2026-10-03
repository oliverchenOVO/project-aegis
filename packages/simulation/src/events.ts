import type { WorldState, DomainEvent } from "../../domain/src/index";
export function emit(
  w: WorldState,
  type: DomainEvent["type"],
  payload: DomainEvent["payload"],
  causes: (string | undefined)[] = [],
): string {
  if (w.counters.eventTick !== w.tick) {
    w.counters.eventTick = w.tick;
    w.counters.eventsThisTick = 0;
  }
  w.counters.eventsThisTick = (w.counters.eventsThisTick ?? 0) + 1;
  if (w.counters.eventsThisTick > 1000 || w.events.length >= 100000)
    throw new Error("Event explosion guard");
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
