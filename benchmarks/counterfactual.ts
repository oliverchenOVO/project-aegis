import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { Simulation, assertInvariants } from "../packages/simulation/src/index";
import { flood, FLOOD_SHOWCASE_SEED } from "../packages/scenarios/src/flood";
import {
  ReplayRecorder,
  VerifiedTimeline,
  replay,
} from "../packages/replay/src/index";
import { compareBranch } from "../packages/counterfactual/src/index";
import { save, load } from "../packages/persistence/src/index";
import { hash } from "../packages/shared/src/index";
const count = Number(process.argv[2] ?? 3);
if (!Number.isInteger(count) || count < 1 || count > 20)
  throw new Error("Counterfactual seed count must be 1–20");
const rows = [];
for (let n = 0; n < count; n++) {
  const seed = n === 0 ? FLOOD_SHOWCASE_SEED : `counterfactual-flood-${n}`,
    sim = new Simulation(flood, seed),
    recorder = new ReplayRecorder(sim);
  const originalStart = performance.now();
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
    if (sim.state.tick % 30 === 0) assertInvariants(sim.state, flood);
  }
  const originalMs = performance.now() - originalStart,
    parentRecordHash = hash(recorder.record),
    verificationStart = performance.now(),
    timeline = new VerifiedTimeline(flood, recorder.record),
    verificationMs = performance.now() - verificationStart;
  const atRescue = timeline.seek(350),
    incident = atRescue
      .view()
      .beliefs.find(
        (b) =>
          b.kind === "INCIDENT" &&
          b.claim.nodeId === "N23" &&
          [
            "FLOOD",
            "STRANDED_CIVILIANS",
            "MASS_CASUALTY",
            "FIRE",
            "BUILDING_COLLAPSE",
          ].includes(b.claim.incidentType ?? ""),
      );
  if (!incident)
    throw new Error(
      `Showcase has no received N23 incident at rescue tick: ${seed}`,
    );
  const alternatives = recorder.record.commands.filter(
    (c) => c.tick >= 30 && !["AMB-05", "AMB-06"].includes(c.input.target),
  );
  for (const target of ["AMB-05", "AMB-06"])
    alternatives.push({
      tick: 350,
      input: { type: "DISPATCH_UNIT", target, incidentId: incident.subjectId },
    });
  const branchStart = performance.now(),
    branch = timeline.fork(30, alternatives),
    branchMs = performance.now() - branchStart,
    comparison = compareBranch(sim.state, flood, branch);
  assertInvariants(branch.simulation.state, flood);
  const repeat = timeline.fork(30, alternatives);
  if (
    repeat.simulation.hash() !== branch.simulation.hash() ||
    hash(repeat.record) !== hash(branch.record)
  )
    throw new Error("Branch deterministic mismatch");
  if (
    replay(flood, branch.record).hash() !== branch.simulation.hash() ||
    load(save(branch.simulation, branch.record)).simulation.hash() !==
      branch.simulation.hash()
  )
    throw new Error("Branch replay/save mismatch");
  if (hash(recorder.record) !== parentRecordHash)
    throw new Error("Branch mutated its parent");
  rows.push({
    seed,
    originalMs,
    verificationMs,
    branchMs,
    rescueIncident: incident.subjectId,
    rescueIncidentType: incident.claim.incidentType,
    commands: alternatives,
    comparison,
    diagnostics: {
      rescueIncident: atRescue.state.incidents.find(
        (i) => i.id === incident.subjectId,
      ),
      patientsAtRescue: atRescue.state.patients
        .filter((p) => p.incidentId === incident.subjectId)
        .map((p) => ({
          id: p.id,
          state: p.state,
          health: p.health,
          count: p.count,
        })),
      reservedUnits: branch.simulation.state.units.filter((u) =>
        ["AMB-05", "AMB-06"].includes(u.id),
      ),
      reservedCommands: branch.simulation.state.commands.filter((c) =>
        ["AMB-05", "AMB-06"].includes(c.target),
      ),
      corridorAtRescue: atRescue.state.roads.filter(
        (r) =>
          ["N21", "N22", "N23"].includes(r.from) &&
          ["N21", "N22", "N23"].includes(r.to),
      ),
      transported: branch.simulation.state.events.filter(
        (e) => e.type === "PATIENT_TRANSPORTED",
      ).length,
    },
    branchMismatch: 0,
    parentMutation: 0,
    replayMismatch: 0,
    saveFailure: 0,
  });
  console.log(
    JSON.stringify({
      seed,
      fatalityDelta: comparison.delta.fatalities,
      hospitalOverloadDelta: comparison.delta.hospitalOverloadTicks,
      originalMs,
      branchMs,
    }),
  );
}
const evidence = { seedsCompleted: rows.length, rows };
writeFileSync(
  "docs/qa/counterfactual-showcase.json",
  JSON.stringify(evidence, null, 2),
);
if (rows[0].comparison.delta.fatalities >= 0)
  throw new Error(
    "Reproducible reserve-ambulance showcase did not improve actual fatality outcome",
  );
