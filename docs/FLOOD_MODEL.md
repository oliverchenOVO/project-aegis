# Urban flash flood macro model

`HazardSystem` selects earthquake or flood initialization/updates; both use shared incidents, roads, units, medical, power, intelligence, commands, replay and saves. The frozen engine only handles released legacy timelines. Flood is not a scripted incident schedule or CFD model.

Every 30 simulation seconds, configured rainfall and seeded inflow variation add water; drainage and outflow remove it. Adjacent zones exchange water according to elevation plus previous depth. Transfers use a simultaneous previous-state calculation and bounded deterministic flow. Operating utility responders increase local drainage. Rain ends from scenario configuration; depth continues evolving and receding afterward.

Known geometry has four zones, 35 road nodes, 58 edges, 18 responders and two hospitals. A raised hospital access road subtracts configured road elevation from local water depth. Depth thresholds degrade/close roads, inundate buildings and damage the substation. Flood rise directly causes road/power events; power failures cause hospital backup dependency and communication degradation. No event is linked merely because it occurs nearby in time.

Police/utility, ambulance and fire vehicles have distinct water traversal limits; all obey globally impassable roads. Routes are checked before entering each edge. Invalid routes trigger actual rerouting and delay events; transported patients reference their transport delay. Isolated units eventually reach the existing disabled-state guard instead of hanging indefinitely.

Sensors and civilian observations produce delayed, uncertain depth estimates and severity claims. Public cartography contains zone IDs/node geometry only; authoritative depth, current damage and unobserved power causes never enter normal UI. Received flood reports can conflict or become stale. AAR and tests may reveal historical truth.

Scenario `flood-urban-v1`, scenario version `1.0.0`, lasts at most 40 minutes. Scenario stabilization requires ended rain and receded water as well as shared incident/patient completion. The earthquake's casualty cutoff is not applied to flood. Civilian exposure/evacuation, richer triage and routed communications extend this shared model in the following ordered milestones.
