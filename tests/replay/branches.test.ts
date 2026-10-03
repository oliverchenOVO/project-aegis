import { it, expect } from "vitest";
import {
  Simulation,
  assertInvariants,
} from "../../packages/simulation/src/index";
import { earthquake } from "../../packages/scenarios/src/earthquake";
import { earthquakeSystemic } from "../../packages/scenarios/src/earthquake-systemic";
import { flood } from "../../packages/scenarios/src/flood";
import {
  ReplayRecorder,
  VerifiedTimeline,
  replay,
  validateReplay,
} from "../../packages/replay/src/index";
import { hash } from "../../packages/shared/src/index";
import { save, load } from "../../packages/persistence/src/index";
import {
  compareBranch,
  outcomeMetrics,
} from "../../packages/counterfactual/src/index";
import { Session } from "../../packages/application/src/session";
function fixture(seed: string) {
  const scenario = {
      ...earthquake,
      version: "1.0.0-branch-test",
      maxTicks: 900,
    },
    sim = new Simulation(scenario, seed),
    recorder = new ReplayRecorder(sim);
  while (!sim.state.completed) {
    if ([0, 90, 300, 301, 600].includes(sim.state.tick))
      recorder.command(sim, { type: "REQUEST_STATUS", target: "H-B" });
    sim.step();
    recorder.checkpoint(sim);
  }
  return { scenario, sim, record: recorder.record };
}
it.each(["branch-a", "branch-b", "branch-c"])(
  "same future commands reproduce the original across exact/near checkpoint forks: %s",
  (seed) => {
    const { scenario, sim, record } = fixture(seed),
      verified = new VerifiedTimeline(scenario, record),
      before = hash(record);
    for (const tick of [0, 299, 300, 301, 600]) {
      const result = verified.fork(
        tick,
        record.commands.filter((c) => c.tick >= tick),
      );
      expect(result.simulation.hash()).toBe(sim.hash());
      expect(hash(result.simulation.state.events)).toBe(hash(sim.state.events));
      expect(result.lineage.parentHash).toBe(sim.hash());
      expect(
        result.record.checkpoints!.some(
          (c) => c.tick === tick && c.canonicalHash === result.lineage.baseHash,
        ),
      ).toBe(true);
      validateReplay(result.record, scenario);
      assertInvariants(result.simulation.state, scenario);
    }
    expect(hash(record)).toBe(before);
  },
);
it("remove/add/replace alternatives and repeated forks are immutable and deterministic", () => {
  const { scenario, sim, record } = fixture("branch-policy"),
    verified = new VerifiedTimeline(scenario, record),
    parentHash = hash(record),
    alternatives = [
      { tick: 300, input: { type: "REQUEST_STATUS" as const, target: "H-A" } },
      { tick: 550, input: { type: "REQUEST_STATUS" as const, target: "RAD" } },
    ];
  const first = verified.fork(300, alternatives),
    second = verified.fork(300, alternatives);
  expect(first.simulation.hash()).toBe(second.simulation.hash());
  expect(hash(first.record)).toBe(hash(second.record));
  expect(first.lineage.branchId).toBe(second.lineage.branchId);
  expect(first.record.commands.filter((c) => c.tick < 300)).toEqual(
    record.commands.filter((c) => c.tick < 300),
  );
  expect(first.record.commands.filter((c) => c.tick >= 300)).toEqual(
    alternatives,
  );
  expect(first.simulation.hash()).not.toBe(sim.hash());
  expect(hash(record)).toBe(parentHash);
  const comparison = compareBranch(sim.state, scenario, first);
  expect(comparison.delta.fatalities).toBe(
    comparison.alternative.fatalities - comparison.original.fatalities,
  );
  expect(comparison.originalHash).toBe(sim.hash());
  alternatives[0].input.target = "H-B";
  first.record.commands[0].input.target = "H-A";
  first.record.checkpoints![0].snapshot.power = false;
  expect(hash(record)).toBe(parentHash);
  expect(
    verified
      .fork(300, [
        { tick: 300, input: { type: "REQUEST_STATUS", target: "H-A" } },
        { tick: 550, input: { type: "REQUEST_STATUS", target: "RAD" } },
      ])
      .simulation.hash(),
  ).toBe(second.simulation.hash());
});
it("branches cold replay, seek, continue and reopen with their lineage intact", () => {
  const { scenario, record } = fixture("branch-container"),
    verified = new VerifiedTimeline(scenario, record),
    branch = verified.fork(301, [
      { tick: 301, input: { type: "REQUEST_STATUS", target: "H-A" } },
    ]);
  expect(replay(scenario, branch.record).hash()).toBe(branch.simulation.hash());
  const saved = load(save(branch.simulation, branch.record));
  expect(saved.replay.lineage).toEqual(branch.lineage);
  expect(saved.simulation.hash()).toBe(branch.simulation.hash());
  const timeline = new VerifiedTimeline(scenario, saved.replay),
    continued = timeline.seek(450);
  continued.step(450);
  expect(continued.hash()).toBe(branch.simulation.hash());
  const nested = timeline.fork(600, []);
  expect(nested.lineage.parentReplayId).toBe(branch.lineage.branchId);
  expect(nested.lineage.parentHash).toBe(branch.simulation.hash());
});
it("fork bounds, unsupported world edits, malformed lineage and invalid command plans fail", () => {
  const { scenario, record } = fixture("branch-validation"),
    verified = new VerifiedTimeline(scenario, record),
    before = hash(record);
  for (const input of [
    [{ tick: 299, input: { type: "REQUEST_STATUS", target: "H-A" } }],
    [{ tick: 901, input: { type: "REQUEST_STATUS", target: "H-A" } }],
    [
      { tick: 400, input: { type: "REQUEST_STATUS", target: "H-A" } },
      { tick: 300, input: { type: "REQUEST_STATUS", target: "H-B" } },
    ],
    [
      {
        tick: 300,
        input: {
          type: "REQUEST_STATUS",
          target: "H-A",
          world: { power: true },
        },
      },
    ],
    [
      {
        tick: 300,
        input: {
          type: "DISPATCH_UNIT",
          target: "AMB-01",
          incidentId: "INC-nonexistent",
        },
      },
    ],
  ])
    expect(() => verified.fork(300, input)).toThrow();
  expect(() => verified.fork(-1, [])).toThrow();
  expect(() =>
    verified.fork(900, [
      { tick: 900, input: { type: "REQUEST_STATUS", target: "H-A" } },
    ]),
  ).toThrow("completion");
  const branch = verified.fork(300, []);
  branch.record.lineage!.baseHash = "0000000000000000";
  expect(() => validateReplay(branch.record, scenario)).toThrow("lineage");
  expect(hash(record)).toBe(before);
});
it.each([earthquakeSystemic, flood])(
  "routed cohort world supports real deterministic alternatives: $id",
  (original) => {
    const scenario = {
        ...original,
        version: `${original.version}-branch-test`,
        maxTicks: 900,
      },
      sim = new Simulation(scenario, "branch-cohort"),
      recorder = new ReplayRecorder(sim);
    while (!sim.state.completed) {
      sim.step();
      recorder.checkpoint(sim);
    }
    const verified = new VerifiedTimeline(scenario, recorder.record),
      branch = verified.fork(300, [
        { tick: 300, input: { type: "REQUEST_STATUS", target: "H-B" } },
      ]);
    expect(replay(scenario, branch.record).hash()).toBe(
      branch.simulation.hash(),
    );
    expect(
      verified
        .fork(300, [
          { tick: 300, input: { type: "REQUEST_STATUS", target: "H-B" } },
        ])
        .simulation.hash(),
    ).toBe(branch.simulation.hash());
    assertInvariants(branch.simulation.state, scenario);
    const result = compareBranch(sim.state, scenario, branch);
    expect(result.original).toEqual(outcomeMetrics(sim.state, scenario));
    expect(result.delta.infrastructureDowntime).toBe(
      result.alternative.infrastructureDowntime -
        result.original.infrastructureDowntime,
    );
    if (original.hazardKind === "FLOOD")
      expect(
        branch.simulation.state.flood!.zones.map((z) => z.waterDepth),
      ).toEqual(sim.state.flood!.zones.map((z) => z.waterDepth));
  },
);
it("session branch generation and branch export leave the original save/replay unchanged", () => {
  const scenario = {
      ...earthquake,
      version: "1.0.0-session-branch",
      maxTicks: 600,
    },
    session = new Session("session-branch", scenario);
  session.step(600);
  const before = session.exportSave();
  const result = session.fork(300, [
      { tick: 300, input: { type: "REQUEST_STATUS", target: "H-A" } },
    ]),
    comparison = result.counterfactual!;
  expect(result.view.completed).toBe(true);
  expect(session.exportSave()).toEqual(before);
  const branch = load(session.exportBranch(comparison.lineage.branchId));
  expect(branch.simulation.hash()).toBe(comparison.alternativeHash);
  expect(branch.replay.lineage!.parentHash).toBe(comparison.originalHash);
  session.seek(100);
  expect(session.update().counterfactual).toEqual(comparison);
  session.returnToAAR();
  expect(session.exportSave()).toEqual(before);
  const live = new Session("unfinished-branch", scenario);
  expect(() => live.fork(0, [])).toThrow("先完成");
});
it("session retains only the four latest exportable branches without changing its parent", () => {
  const scenario = {
      ...earthquake,
      version: "1.0.0-branch-retention",
      maxTicks: 300,
    },
    session = new Session("branch-retention", scenario);
  session.step(300);
  const before = session.exportSave(),
    ids: string[] = [];
  for (let index = 0; index < 5; index++)
    ids.push(
      session.fork(0, [
        { tick: index * 10, input: { type: "REQUEST_STATUS", target: "H-B" } },
      ]).counterfactual!.lineage.branchId,
    );
  expect(() => session.exportBranch(ids[0])).toThrow("分支不存在");
  for (const id of ids.slice(1))
    expect(session.exportBranch(id).length).toBeGreaterThan(0);
  expect(session.exportSave()).toEqual(before);
});
