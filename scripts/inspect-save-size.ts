import { unzipSync } from "fflate";
import { Simulation } from "../packages/simulation/src/index";
import { flood } from "../packages/scenarios/src/flood";
import { ReplayRecorder } from "../packages/replay/src/index";
import { save } from "../packages/persistence/src/index";
const sim = new Simulation(flood, "flood-benchmark-0000"),
  recorder = new ReplayRecorder(sim);
while (!sim.state.completed) {
  sim.step();
  recorder.checkpoint(sim);
}
const bytes = save(sim, recorder.record),
  entries: { name: string; bytes: number }[] = [];
unzipSync(bytes, {
  filter: (entry) => {
    entries.push({ name: entry.name, bytes: entry.originalSize });
    return false;
  },
});
console.log(
  JSON.stringify({ compressedBytes: bytes.length, entries }, null, 2),
);
