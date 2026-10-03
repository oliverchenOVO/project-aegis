import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { SIM_VERSION } from "../packages/domain/src/index";
import { Simulation } from "../packages/simulation/src/index";
import { earthquake } from "../packages/scenarios/src/earthquake";
import { ReplayRecorder } from "../packages/replay/src/index";
import { save } from "../packages/persistence/src/index";
if (SIM_VERSION !== "0.1.0")
  throw new Error("Legacy capture requires the original v0.1.0 engine");
const root = "tests/fixtures/legacy";
mkdirSync(root, { recursive: true });
const fixtures = [];
for (const [name, ticks] of [
  ["basic", 60],
  ["midincident", 600],
] as const) {
  const path = `${root}/legacy-save-${name}-v1.aegis`;
  if (existsSync(path))
    throw new Error(`Immutable fixture already exists: ${path}`);
  const sim = new Simulation(earthquake, `legacy-${name}-v1`),
    recorder = new ReplayRecorder(sim);
  while (sim.state.tick < ticks) {
    if (sim.state.tick === 90)
      recorder.command(sim, {
        type: "DISPATCH_UNIT",
        target: "ENG-01",
        incidentId: "INC-1",
      });
    if (sim.state.tick === 400)
      recorder.command(sim, { type: "REQUEST_STATUS", target: "H-B" });
    sim.step();
    recorder.checkpoint(sim);
  }
  const bytes = save(sim, recorder.record);
  writeFileSync(path, bytes);
  fixtures.push({
    name: path,
    tick: ticks,
    stateHash: sim.hash(),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
writeFileSync(
  `${root}/manifest.json`,
  JSON.stringify(
    {
      sourceTag: "v0.1.0",
      sourceCommit: "90ce27b500b5e3d66772f9f1da06fb8d14f640e0",
      fixtures,
    },
    null,
    2,
  ),
);
