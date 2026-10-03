import { Simulation, assertInvariants } from "../packages/simulation/src/index";
import { ReplayRecorder } from "../packages/replay/src/index";
import { earthquakeSystemic } from "../packages/scenarios/src/earthquake-systemic";
import { flood, FLOOD_SHOWCASE_SEED } from "../packages/scenarios/src/flood";
import { hash } from "../packages/shared/src/index";
export const fixtureProfiles = [
  ...[
    "phase2-earthquake-0000",
    "phase2-earthquake-0001",
    "phase2-earthquake-0002",
  ].map((seed) => ({ scenario: earthquakeSystemic, seed })),
  ...[FLOOD_SHOWCASE_SEED, "phase2-flood-0000", "phase2-flood-0001"].map(
    (seed) => ({ scenario: flood, seed }),
  ),
];
export function fixtureRun(profile: (typeof fixtureProfiles)[number]) {
  const sim = new Simulation(profile.scenario, profile.seed),
    recorder = new ReplayRecorder(sim);
  while (!sim.state.completed) {
    if (sim.state.tick === 30)
      for (const target of ["ENG-01", "AMB-01", "AMB-02"])
        recorder.command(sim, {
          type: "DISPATCH_UNIT",
          target,
          incidentId: "INC-1",
        });
    if (sim.state.tick === 420)
      recorder.command(sim, { type: "REQUEST_STATUS", target: "H-B" });
    if (sim.state.tick === 900)
      recorder.command(sim, { type: "RECALL_UNIT", target: "AMB-02" });
    sim.step();
    recorder.checkpoint(sim);
    if (sim.state.tick % 30 === 0)
      assertInvariants(sim.state, profile.scenario);
  }
  return {
    sim,
    recorder,
    summary: {
      scenarioId: profile.scenario.id,
      scenarioVersion: profile.scenario.version,
      simulationVersion: sim.state.version,
      seed: profile.seed,
      endTick: sim.state.tick,
      worldHash: sim.hash(),
      eventsHash: hash(sim.state.events),
      aarHash: hash(sim.aar()),
      commands: recorder.record.commands,
      checkpoints: recorder.record.hashes,
    },
  };
}
