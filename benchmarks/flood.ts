import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { Simulation, assertInvariants } from "../packages/simulation/src/index";
import { flood } from "../packages/scenarios/src/flood";
import { ReplayRecorder, replay } from "../packages/replay/src/index";
import { save, load } from "../packages/persistence/src/index";
import { hash } from "../packages/shared/src/index";
const count = Number(process.argv[2] ?? 100);
if (!Number.isInteger(count) || count < 1 || count > 1000)
  throw new Error("Seed count must be 1–1000");
const runtimes: number[] = [],
  failures: { seed: string; message: string }[] = [],
  outcomes: { fatalities: number; resolved: number; incidents: number }[] = [];
let ticks = 0,
  maximumEventCount = 0,
  replayMismatches = 0,
  saveFailures = 0,
  invariantFailures = 0,
  crashes = 0;
for (let n = 0; n < count; n++) {
  const seed = `flood-benchmark-${n.toString().padStart(4, "0")}`;
  try {
    const start = performance.now(),
      sim = new Simulation(flood, seed),
      recorder = new ReplayRecorder(sim);
    let guard = 0;
    while (!sim.state.completed && guard++ <= flood.maxTicks + 1) {
      if (sim.state.tick === 30)
        for (const unit of ["AMB-01", "AMB-02", "ENG-01"])
          recorder.command(sim, {
            type: "DISPATCH_UNIT",
            target: unit,
            incidentId: "INC-1",
          });
      if (sim.state.tick === 420)
        recorder.command(sim, { type: "REQUEST_STATUS", target: "H-B" });
      sim.step();
      recorder.checkpoint(sim);
      if (sim.state.tick % 30 === 0) assertInvariants(sim.state, flood);
    }
    if (!sim.state.completed) throw new Error("No-hang maximum tick guard");
    runtimes.push(performance.now() - start);
    ticks += sim.state.tick;
    maximumEventCount = Math.max(maximumEventCount, sim.state.events.length);
    const reconstructed = replay(flood, recorder.record);
    if (
      sim.hash() !== reconstructed.hash() ||
      hash(sim.state.events) !== hash(reconstructed.state.events) ||
      hash(sim.aar()) !== hash(reconstructed.aar())
    ) {
      replayMismatches++;
      throw new Error("Replay mismatch");
    }
    try {
      if (load(save(sim, recorder.record)).simulation.hash() !== sim.hash())
        throw new Error("Save result mismatch");
    } catch (error) {
      saveFailures++;
      throw error;
    }
    outcomes.push({
      fatalities: sim.aar().fatalities,
      resolved: sim.aar().resolved,
      incidents: sim.state.incidents.length,
    });
  } catch (error) {
    const message = String(error);
    failures.push({ seed, message });
    if (message.includes("Invariant")) invariantFailures++;
    else if (!message.includes("Replay mismatch")) crashes++;
  }
  if ((n + 1) % 10 === 0) console.log(`Validated flood ${n + 1}/${count}`);
}
runtimes.sort((a, b) => a - b);
const report = {
  seedsRequested: count,
  seedsCompleted: count - failures.length,
  crashes,
  invariantFailures,
  replayMismatches,
  saveFailures,
  averageTicksPerSecond: ticks / (runtimes.reduce((a, b) => a + b, 0) / 1000),
  p95RuntimeMs:
    runtimes[
      Math.min(runtimes.length - 1, Math.ceil(runtimes.length * 0.95) - 1)
    ] ?? 0,
  maximumEventCount,
  outcomes,
  failures,
};
writeFileSync(
  process.argv[3] ?? "docs/qa/flood-benchmark.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ ...report, outcomes: undefined }, null, 2));
if (failures.length) process.exitCode = 1;
