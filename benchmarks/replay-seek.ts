import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { Simulation } from "../packages/simulation/src/index";
import { earthquake } from "../packages/scenarios/src/earthquake";
import {
  ReplayRecorder,
  VerifiedTimeline,
  replay,
} from "../packages/replay/src/index";
const results = [];
for (const minutes of [10, 20, 30]) {
  const scenario = { ...earthquake, maxTicks: minutes * 60 },
    sim = new Simulation(scenario, "AEGIS-2026-001"),
    recorder = new ReplayRecorder(sim);
  while (!sim.state.completed) {
    if (sim.state.tick === 90)
      recorder.command(sim, {
        type: "DISPATCH_UNIT",
        target: "ENG-01",
        incidentId: "INC-1",
      });
    sim.step();
    recorder.checkpoint(sim);
  }
  const validationStart = performance.now(),
    verified = new VerifiedTimeline(scenario, recorder.record),
    validationMs = performance.now() - validationStart;
  for (const fraction of [0.05, 0.25, 0.5, 0.75, 0.95]) {
    const target = Math.floor(recorder.record.endTick * fraction),
      coldStart = performance.now(),
      cold = replay(scenario, recorder.record, target),
      coldMs = performance.now() - coldStart;
    const samples = [];
    for (let n = 0; n < 20; n++) {
      const result = verified.seekMeasured(target);
      if (result.simulation.hash() !== cold.hash())
        throw new Error("Seek mismatch");
      samples.push(result);
    }
    const latencies = samples.map((s) => s.totalMs).sort((a, b) => a - b),
      sample = samples[0];
    results.push({
      minutes,
      fraction,
      target,
      coldMs,
      validationMs,
      restoredTick: sample.restoredTick,
      forwardTicks: sample.forwardTicks,
      restoreMs: sample.restoreMs,
      forwardMs: sample.forwardMs,
      totalMs: sample.totalMs,
      p50Ms: latencies[9],
      p95Ms: latencies[18],
      mismatches: 0,
    });
  }
}
writeFileSync(
  "docs/qa/checkpoint-seek.json",
  JSON.stringify({ results }, null, 2),
);
console.log(JSON.stringify({ results }, null, 2));
