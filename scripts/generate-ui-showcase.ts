import { writeFileSync } from "node:fs";
import { Simulation } from "../packages/simulation/src/index";
import { flood, FLOOD_SHOWCASE_SEED } from "../packages/scenarios/src/flood";
import { ReplayRecorder } from "../packages/replay/src/index";
import { save } from "../packages/persistence/src/index";
import { hash } from "../packages/shared/src/index";
const sim = new Simulation(flood, FLOOD_SHOWCASE_SEED),
  recorder = new ReplayRecorder(sim);
while (!sim.state.completed) {
  if (sim.state.tick === 30)
    for (const target of [
      "AMB-01",
      "AMB-02",
      "AMB-03",
      "AMB-04",
      "AMB-05",
      "AMB-06",
    ])
      recorder.command(sim, {
        type: "DISPATCH_UNIT",
        target,
        incidentId: "INC-1",
      });
  sim.step();
  recorder.checkpoint(sim);
}
writeFileSync(process.argv[2], save(sim, recorder.record));
console.log(
  JSON.stringify({ worldHash: sim.hash(), recordHash: hash(recorder.record) }),
);
