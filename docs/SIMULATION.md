# Simulation contract

One tick is one simulated second. The engine is synchronous and headless; playback speed belongs to the UI scheduler, not the model. `Simulation.step` never reads real time.

## Fixed execution order

1. Increment tick; initialize earthquake at tick 1.
2. Resolve ordered scheduled infrastructure damage / aftershock events.
3. Evolve hazards and responder suppression / stabilization.
4. Update hospital generators, power and radio dependencies.
5. Deteriorate / treat patients and record deaths.
6. Move responder units along graph edges, reroute, rescue and transport.
7. Create observations from civilian, official, hospital and unit sources.
8. Transmit/deliver reports through seeded communications.
9. Deliver, validate, acknowledge and execute commands.
10. Check completion; emit completion event and guard event growth.

Named Mulberry32 streams store their unsigned 32-bit states in the snapshot. Fire, earthquake, per-source observation and communications streams are independent. Stable arrays and explicit tie breaking preserve ordering. Systems do not import UI, host APIs, timers or network clients.

## Models

The fictional city has 35 junctions, 58 bidirectional roads, four districts, two hospitals, two fire stations and EMS/police/utility bases. Eighteen units: six engines, six ambulances, four patrols, two utility crews. Dijkstra chooses shortest passable routes using integer edge travel times. Units consume actual ticks on edges, report last confirmed junctions and route/ETA, and never jump directly to a destination. A newly blocked next edge forces recalculation; unreachable routes have a bounded deadlock guard and disable the affected unit.

The earthquake samples configured hazard sites, severity and injury counts. Aftershock timing and road damage derive from the seed. Fires intensify, spread to adjoining nodes and respond to suppression. Collapse, road, power and radio incidents require corresponding capabilities. Patient state is monotonic through waiting / transit / admission / recovery or death. Ambulances carry at most two patients and choose reachable hospitals by travel time, power and capacity. Hospital baseline critical patients also suffer documented consequences of generator failure. Utility repair restores dependent infrastructure.

## Completion and limitations

Ends when all incidents stabilize and no transport remains pending, at catastrophic mortality threshold, or at the scenario's 30-minute maximum. The upper limit is a legitimate fallback, not the sole completion condition. Phase 1 uses aggregate medical deterioration and abstract disaster intensity, not clinical or structural engineering models. Resources and fatigue are modeled at a minimal level; resupply and detailed agency doctrine belong to later phases.

## CLI

`pnpm sim:run urban-earthquake --seed AEGIS-2026-001`

`pnpm benchmark` validates 100 fixed seeds, each with recorded player commands and an independent replay. `pnpm benchmark 1000` runs the extended suite. The benchmark checks invariants every 30 ticks, every 300-tick state hash, final hash, event hash and AAR metrics. Maximum tick/event guards fail with the seed recorded in `docs/qa/benchmark.json`.
