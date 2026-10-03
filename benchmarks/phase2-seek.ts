import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { Simulation } from "../packages/simulation/src/index";
import { earthquake } from "../packages/scenarios/src/earthquake";
import { earthquakeSystemic } from "../packages/scenarios/src/earthquake-systemic";
import { flood } from "../packages/scenarios/src/flood";
import {
  ReplayRecorder,
  VerifiedTimeline,
  replay,
} from "../packages/replay/src/index";
const rows = [];
for (const [profile, content, version] of [
  ["phase1", earthquake, "0.1.0"],
  ["earthquake", earthquakeSystemic, "0.2.0"],
  ["flood", flood, "0.2.0"],
] as const)
  for (const minutes of [10, 20, 30]) {
    const scenario = { ...content, maxTicks: minutes * 60 },
      sim = new Simulation(scenario, "AEGIS-SEEK-2026-001", undefined, version),
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
    const started = performance.now(),
      timeline = new VerifiedTimeline(scenario, recorder.record),
      firstVerificationMs = performance.now() - started;
    for (const fraction of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const target = Math.floor(recorder.record.endTick * fraction),
        coldStarted = performance.now(),
        cold = replay(scenario, recorder.record, target),
        coldMs = performance.now() - coldStarted,
        samples = [];
      for (let n = 0; n < 20; n++) {
        const result = timeline.seekMeasured(target);
        if (result.simulation.hash() !== cold.hash())
          throw new Error("Cold/checkpoint mismatch");
        samples.push(result);
      }
      const times = samples.map((s) => s.totalMs).sort((a, b) => a - b),
        sample = samples[0];
      const row = {
        profile,
        simulationVersion: version,
        scenarioVersion: scenario.version,
        minutes,
        fraction,
        target,
        coldMs,
        firstVerificationMs,
        restoredTick: sample.restoredTick,
        forwardTicks: sample.forwardTicks,
        restoreMs: sample.restoreMs,
        forwardMs: sample.forwardMs,
        p50Ms: times[9],
        p95Ms: times[18],
        samples: 20,
        mismatches: 0,
      };
      rows.push(row);
      writeFileSync(
        "docs/qa/phase2-replay-seek.json",
        JSON.stringify({ complete: false, rows }, null, 2),
      );
      console.log(JSON.stringify(row));
    }
  }
const phase1 = rows.find(
  (r) => r.profile === "phase1" && r.minutes === 30 && r.fraction === 0.95,
)!;
writeFileSync(
  "docs/qa/phase2-replay-seek.json",
  JSON.stringify(
    { complete: true, phase1GatePassed: phase1.p95Ms < 250, rows },
    null,
    2,
  ),
);
if (phase1.p95Ms >= 250)
  throw new Error("Phase 1 30-minute 95% seek p95 exceeded 250ms");
