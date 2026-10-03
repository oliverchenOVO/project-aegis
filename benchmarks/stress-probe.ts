import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { ScenarioSchema } from "../packages/domain/src/index";
import { earthquakeSystemic } from "../packages/scenarios/src/earthquake-systemic";
import { Simulation, assertInvariants } from "../packages/simulation/src/index";
const s = ScenarioSchema.parse({
  ...structuredClone(earthquakeSystemic),
  id: "phase2-stress",
  version: "2.3.0-stress",
  maxTicks: 1800,
  hazardSites: earthquakeSystemic.nodes.slice(0, 25).flatMap((n) => [
    {
      nodeId: n.id,
      type: "BUILDING_COLLAPSE",
      severity: 65,
      injuries: 0,
      chance: 1,
    },
    { nodeId: n.id, type: "FIRE", severity: 65, injuries: 0, chance: 1 },
  ]),
});
const sim = new Simulation(s, "phase2-stress-0000"),
  start = performance.now();
while (!sim.state.completed) {
  sim.step();
  if (sim.state.tick % 30 === 0) assertInvariants(sim.state, s);
}
const ms = performance.now() - start,
  result = {
    tick: sim.state.tick,
    incidents: sim.state.incidents.length,
    cohorts: sim.state.cohorts?.length,
    events: sim.state.events.length,
    ms,
    ticksPerSecond: (sim.state.tick / ms) * 1000,
    hash: sim.hash(),
    passed:
      sim.state.incidents.length >= 50 &&
      (sim.state.cohorts?.length ?? 0) >= 100,
  };
writeFileSync(
  "docs/qa/phase2-stress-probe.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
if (!result.passed)
  throw new Error("Stress configuration did not meet requested scale");
