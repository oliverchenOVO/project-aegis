# Simulation contract

One tick is one simulated second. The engine is synchronous and headless; playback speed belongs to the UI scheduler, not the model. `Simulation.step` never reads real time.

## Phase 2 fixed execution order

1. Increment tick; evolve hazards and ordered scheduled damage.
2. Apply civilian exposure, evacuation and shelter movement.
3. Update infrastructure and hospital generators.
4. Update communication-node power, fuel and flood dependencies.
5. Deteriorate/treat patients and process hospital queues.
6. Move responders, reroute, rescue, transport and hand over patients.
7. Refresh counted hospital census and synchronize civilian patient states.
8. Observe through source capabilities; transmit/advance routed messages.
9. Execute delivered commands; clean terminal packets.
10. Check completion and event-growth guards.

Named Mulberry32 streams store their unsigned 32-bit states in the snapshot. Fire, earthquake, per-source observation and communications streams are independent. Stable arrays and explicit tie breaking preserve ordering. Systems do not import UI, host APIs, timers or network clients.

## Models

The fictional city has 35 junctions, 58 bidirectional roads, four districts, two hospitals, two fire stations and EMS/police/utility bases. Eighteen units: six engines, six ambulances, four patrols, two utility crews. Dijkstra chooses shortest passable routes using integer edge travel times. Units consume actual ticks on edges, report last confirmed junctions and route/ETA, and never jump directly to a destination. A newly blocked next edge forces recalculation; unreachable routes have a bounded deadlock guard and disable the affected unit.

The earthquake samples configured hazard sites, severity and injury counts. Aftershock timing and road damage derive from the seed. Fires intensify, spread to adjoining nodes and respond to suppression. Flood updates zone depth every 30 ticks from rain, drainage, elevation and simultaneous previous-depth transfers; shared road, power, civilian and responder systems consume the resulting impacts. No seed-specific outcomes exist.

Each systemic scenario initializes 100 civilian cohorts plus counted hospital population. Splits preserve origin counts; deaths, sheltering, injury and recovery do not create people. Patient cohorts move through waiting, transport, queue, admission and recovery/death; deterioration can trigger re-triage. Ambulances carry at most two actual people and stay occupied during counted hospital handover. Hospitals have finite ED/ICU/trauma capacities, staff, throughput, queues, diversion and power dependency. Queue pressure and power emergency durations can overlap. See [flood](FLOOD_MODEL.md), [civilians](CIVILIAN_MODEL.md), [medical](MEDICAL_MODEL.md) and [communications](COMMUNICATION_NETWORK.md).

## Completion and limitations

Systemic scenarios end when all incidents stabilize and no waiting/transport/queued patients remain, or at the scenario maximum (earthquake 1,800 seconds; flood 2,400). Flood stabilization additionally requires rain ended and all zones below 0.2 m. The old catastrophic absolute death threshold applies only to non-cohort legacy-style scenarios. Frozen simulation 0.1 retains the original released rules. Hydrology and clinical care remain deterministic macro models rather than engineering/clinical predictors.

Explicit bounds fail instead of truncating authoritative data: 1,000 emitted events per tick, 100,000 total events, 20,000 pending/scheduled records and 4,096 cohort splits. The benchmark records failures and seeds. AAR disclosure occurs only after completion.

## CLI

`pnpm sim:run urban-earthquake --seed AEGIS-2026-001`

`pnpm benchmark` preserves the Phase 1 regression benchmark. `pnpm exec tsx benchmarks/phase2.ts 100` checks 100 systemic earthquake and 100 flood seeds plus a 50-incident stress profile. Each run verifies invariants every 30 ticks, independent cold replay/events/AAR, checkpoint seek, original save reload, repeated command-only branch, branch cold replay/save and parent immutability. Evidence resumes only with an identical engine/benchmark fingerprint and count. `benchmarks/phase2-seek.ts` measures cold/restore/forward and first verification separately for frozen Phase 1 and both systemic scenarios.
