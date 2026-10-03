import { performance } from "node:perf_hooks";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { Simulation, assertInvariants } from "../packages/simulation/src/index";
import { earthquakeSystemic } from "../packages/scenarios/src/earthquake-systemic";
import { flood } from "../packages/scenarios/src/flood";
import {
  ReplayRecorder,
  VerifiedTimeline,
  replay,
} from "../packages/replay/src/index";
import { save, load } from "../packages/persistence/src/index";
import { hash } from "../packages/shared/src/index";
import { ScenarioSchema, type Scenario } from "../packages/domain/src/index";

const count = Number(process.argv[2] ?? 100);
if (!Number.isInteger(count) || count < 1 || count > 1000)
  throw new Error("Seed count must be 1–1000 per scenario");
const output = process.argv[3] ?? "docs/qa/phase2-benchmark.json";
const files = execFileSync(
  "git",
  [
    "ls-files",
    "packages/domain",
    "packages/shared",
    "packages/simulation",
    "packages/scenarios",
    "packages/replay",
    "packages/persistence",
    "packages/after-action",
    "packages/counterfactual",
    "packages/legacy-v1",
  ],
  { encoding: "utf8" },
)
  .trim()
  .split(/\r?\n/)
  .sort();
const digest = createHash("sha256");
for (const file of files) digest.update(file).update(readFileSync(file));
digest.update(readFileSync("benchmarks/phase2.ts"));
const fingerprint = digest.digest("hex");
type Row = {
  profile: string;
  seed: string;
  passed: boolean;
  stage: string;
  message?: string;
  ticks?: number;
  ms?: number;
  ticksPerSecond?: number;
  events?: number;
  incidents?: number;
  cohorts?: number;
  worldHash?: string;
  aarHash?: string;
  peakPending?: number;
  peakScheduled?: number;
  replayMismatch?: number;
  branchMismatch?: number;
  saveFailure?: number;
  invariantFailure?: number;
  parentMutation?: number;
  totalMs: number;
};
const prior = existsSync(output)
  ? (JSON.parse(readFileSync(output, "utf8")) as {
      fingerprint: string;
      count: number;
      rows: Row[];
    })
  : undefined;
if (prior && (prior.fingerprint !== fingerprint || prior.count !== count))
  throw new Error(
    "Existing evidence uses different engine content/count; choose a fresh output file",
  );
const rows: Row[] = prior?.rows ?? [];
const stress = ScenarioSchema.parse({
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
function persist(complete = false) {
  const successful = rows.filter((r) => r.passed),
    ticks = successful.reduce((n, r) => n + (r.ticks ?? 0), 0),
    ms = successful.reduce((n, r) => n + (r.ms ?? 0), 0);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(
    output,
    JSON.stringify(
      {
        fingerprint,
        sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        count,
        complete,
        seedsCompleted: rows.filter((r) => r.profile !== "stress" && r.passed)
          .length,
        failures: rows.filter((r) => !r.passed).length,
        minimumTicksPerSecond: successful.length
          ? Math.min(...successful.map((r) => r.ticksPerSecond ?? 0))
          : null,
        aggregateTicksPerSecond: ms ? (ticks / ms) * 1000 : null,
        targetTicksPerSecond: 500,
        floorTicksPerSecond: 200,
        rows,
      },
      null,
      2,
    ),
  );
}
function run(s: Scenario, profile: string, seed: string) {
  if (rows.some((r) => r.profile === profile && r.seed === seed)) return;
  const started = performance.now(),
    row: Row = {
      profile,
      seed,
      passed: false,
      stage: "simulation",
      totalMs: 0,
    };
  try {
    const sim = new Simulation(s, seed),
      recorder = new ReplayRecorder(sim),
      start = performance.now();
    let peakPending = 0,
      peakScheduled = 0;
    while (!sim.state.completed) {
      if (sim.state.tick > s.maxTicks)
        throw new Error("Completion guard exceeded");
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
      if (sim.state.tick % 30 === 0) {
        row.stage = "invariants";
        assertInvariants(sim.state, s);
        row.stage = "simulation";
      }
      peakPending = Math.max(
        peakPending,
        sim.state.network?.messages.length ?? 0,
      );
      peakScheduled = Math.max(peakScheduled, sim.state.schedule.length);
    }
    const ms = performance.now() - start;
    Object.assign(row, {
      ticks: sim.state.tick,
      ms,
      ticksPerSecond: (sim.state.tick / ms) * 1000,
      events: sim.state.events.length,
      incidents: sim.state.incidents.length,
      cohorts: sim.state.cohorts?.length ?? 0,
      worldHash: sim.hash(),
      aarHash: hash(sim.aar()),
      peakPending,
      peakScheduled,
    });
    if (
      profile === "stress" &&
      (sim.state.incidents.length < 50 ||
        (sim.state.cohorts?.length ?? 0) < 100)
    )
      throw new Error("Stress profile did not reach 50 incidents/100 cohorts");
    row.stage = "replay";
    const cold = replay(s, recorder.record);
    if (
      cold.hash() !== sim.hash() ||
      hash(cold.state.events) !== hash(sim.state.events) ||
      hash(cold.aar()) !== row.aarHash
    )
      throw new Error("Independent cold replay/events/AAR mismatch");
    row.replayMismatch = 0;
    const timeline = new VerifiedTimeline(s, recorder.record),
      target = Math.floor(sim.state.tick * 0.75);
    if (
      timeline.seek(target).hash() !== replay(s, recorder.record, target).hash()
    )
      throw new Error("Checkpoint seek mismatch");
    row.stage = "save";
    if (load(save(sim, recorder.record)).simulation.hash() !== sim.hash())
      throw new Error("Original save reopen mismatch");
    row.stage = "branch";
    const parentHash = hash(recorder.record),
      forkTick = Math.max(0, Math.floor((sim.state.tick - 300) / 300) * 300),
      plan = recorder.record.commands.filter((c) => c.tick >= forkTick);
    plan.push({
      tick: forkTick + 10,
      input: { type: "REQUEST_STATUS", target: "H-A" },
    });
    const branch = timeline.fork(forkTick, plan),
      repeated = timeline.fork(forkTick, plan);
    assertInvariants(branch.simulation.state, s);
    if (
      branch.simulation.hash() !== repeated.simulation.hash() ||
      hash(branch.record) !== hash(repeated.record)
    )
      throw new Error("Repeated branch mismatch");
    if (replay(s, branch.record).hash() !== branch.simulation.hash())
      throw new Error("Branch cold replay mismatch");
    if (hash(recorder.record) !== parentHash)
      throw new Error("Parent record mutation");
    row.branchMismatch = 0;
    row.parentMutation = 0;
    row.stage = "save";
    if (
      load(save(branch.simulation, branch.record)).simulation.hash() !==
      branch.simulation.hash()
    )
      throw new Error("Branch save reopen mismatch");
    row.saveFailure = 0;
    row.invariantFailure = 0;
    row.passed = true;
    row.stage = "complete";
  } catch (error) {
    row.message = String(error);
  }
  row.totalMs = performance.now() - started;
  rows.push(row);
  persist();
  console.log(JSON.stringify(row));
}
for (const [profile, scenario] of [
  ["earthquake", earthquakeSystemic],
  ["flood", flood],
] as const)
  for (let n = 0; n < count; n++)
    run(scenario, profile, `phase2-${profile}-${String(n).padStart(4, "0")}`);
run(stress, "stress", "phase2-stress-0000");
persist(rows.length === 2 * count + 1 && rows.every((r) => r.passed));
if (rows.some((r) => !r.passed)) process.exitCode = 1;
if (rows.some((r) => r.passed && (r.ticksPerSecond ?? 0) < 200)) {
  console.error("Performance floor failed");
  process.exitCode = 1;
}
