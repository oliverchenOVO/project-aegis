import { it, expect } from "vitest";
import { Simulation } from "../../packages/simulation/src/index";
import { earthquakeSystemic } from "../../packages/scenarios/src/earthquake-systemic";
import { flood } from "../../packages/scenarios/src/flood";
import {
  IntelClasses,
  type IntelReport,
  type DomainEvent,
} from "../../packages/domain/src/index";
import { auditIntelligence } from "../../packages/after-action/src/index";
import { CausalIndex } from "../../packages/after-action/src/causal";
import { ReplayRecorder, replay } from "../../packages/replay/src/index";
import { hash } from "../../packages/shared/src/index";

function report(id: string, overrides: Partial<IntelReport> = {}): IntelReport {
  return {
    id,
    sourceId: "SENSOR-A",
    subjectId: "F-C",
    subjectKind: "FLOOD",
    claim: { value: "積水", nodeId: "N23", estimatedDepth: 0.6 },
    observedTick: 30,
    transmittedTick: 31,
    deliveryTick: 40,
    receivedTick: 40,
    expiry: 180,
    sourceReliability: 0.9,
    observationConfidence: 0.8,
    status: "RECEIVED",
    truthRef: { value: "積水", receivedValue: "積水" },
    createdEventId: "evt-1",
    ...overrides,
  };
}
it("seven classifications distinguish observation error, changed truth, missing fields and delivery loss", () => {
  const w = new Simulation(flood, "audit-classes").state;
  w.reports = [
    report("RPT-1", {
      receivedTick: 200,
      deliveryTick: 200,
      truthRef: { value: "積水", receivedValue: "深度淹水" },
    }),
    report("RPT-2", {
      sourceId: "CIV-A",
      claim: { value: "無積水" },
      receivedTick: 201,
      deliveryTick: 201,
    }),
    report("RPT-3", { status: "EXPIRED", receivedTick: undefined }),
  ];
  const before = hash(w),
    audits = auditIntelligence(w);
  expect(audits[0].classifications).toEqual([
    "STALE",
    "DELAYED",
    "UNCORROBORATED",
  ]);
  expect(audits[0].classifications).not.toContain("FALSE");
  expect(audits[1].classifications).toEqual([
    "STALE",
    "FALSE",
    "INCOMPLETE",
    "DELAYED",
    "CONFLICTED",
    "UNCORROBORATED",
  ]);
  expect(audits[1].conflictingReportIds).toEqual(["RPT-1"]);
  expect(audits[2].classifications).toEqual(["LOST"]);
  expect(new Set(audits.flatMap((a) => a.classifications))).toEqual(
    new Set(IntelClasses),
  );
  expect(hash(w)).toBe(before);
});
it("corroboration uses only earlier received independent sources and matching claim identities", () => {
  const w = new Simulation(flood, "audit-prefix").state;
  w.reports = [
    report("RPT-1"),
    report("RPT-2", { sourceId: "SENSOR-B", receivedTick: 41 }),
    report("RPT-3", {
      subjectId: "F-B",
      sourceId: "SENSOR-B",
      receivedTick: 42,
    }),
    report("RPT-4", { receivedTick: 39 }),
  ];
  const audits = auditIntelligence(w);
  expect(audits[0].corroboratingReportIds).toEqual([]);
  expect(audits[1].corroboratingReportIds).toEqual(["RPT-4", "RPT-1"]);
  expect(audits[1].classifications).not.toContain("UNCORROBORATED");
  expect(audits[2].corroboratingReportIds).toEqual([]);
  expect(audits[3].classifications).toContain("UNCORROBORATED");
});
function event(id: string, tick: number, causes: string[] = []): DomainEvent {
  return {
    id,
    tick,
    type: "POWER_NODE_FAILED",
    payload: {},
    causedByEventIds: causes,
  };
}
it("causal display includes only direct recorded edges, explicitly bounds depth and node count", () => {
  const events = [
      event("a", 0),
      event("unrelated", 0),
      event("b", 0, ["a"]),
      event("c", 1, ["b"]),
    ],
    graph = new CausalIndex(events),
    full = graph.trace("c");
  expect(full.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
  expect(full.edges).toEqual([
    { causeId: "a", effectId: "b" },
    { causeId: "b", effectId: "c" },
  ]);
  expect(full.truncated).toBe(false);
  for (const bounded of [graph.trace("c", 0), graph.trace("c", 10, 1)]) {
    expect(bounded.nodes.map((n) => n.id)).toEqual(["c"]);
    expect(bounded.truncated).toBe(true);
    expect(bounded.omittedEventIds).toEqual(["b"]);
  }
  full.nodes[0].payload.edited = true;
  expect(events[0].payload).toEqual({});
});
it("missing, future, self, duplicate and reversed-time causal links fail", () => {
  for (const events of [
    [event("a", 1, ["missing"])],
    [event("a", 1, ["b"]), event("b", 1)],
    [event("a", 1, ["a"])],
    [event("a", 0), event("a", 1)],
    [event("a", 2), event("b", 1, ["a"])],
  ])
    expect(() => new CausalIndex(events)).toThrow();
});
it("decision outcomes follow descendants and never nearby timestamps", () => {
  const events = [
      event("issue", 0),
      { ...event("death-unrelated", 1), type: "PATIENT_DIED" as const },
      {
        ...event("transport", 2, ["issue"]),
        type: "PATIENT_TRANSPORTED" as const,
      },
      {
        ...event("recovery", 3, ["transport"]),
        type: "PATIENT_RECOVERED" as const,
      },
    ],
    graph = new CausalIndex(events);
  expect(graph.outcomes("issue")).toEqual({
    ids: ["transport", "recovery"],
    truncated: false,
  });
  expect(graph.outcomes("issue", 1).truncated).toBe(true);
});
it.each([earthquakeSystemic, flood])(
  "AAR2 is pure and exactly reproduced by cold replay: $id",
  (original) => {
    const scenario = {
        ...original,
        version: `${original.version}-aar-test`,
        maxTicks: 600,
      },
      sim = new Simulation(scenario, "aar-replay"),
      recorder = new ReplayRecorder(sim);
    recorder.command(sim, { type: "REQUEST_STATUS", target: "H-B" });
    while (!sim.state.completed) {
      sim.step();
      recorder.checkpoint(sim);
    }
    const before = sim.hash(),
      aar = sim.aar(),
      reconstructed = replay(scenario, recorder.record);
    expect(aar.systemic!.version).toBe(2);
    expect(aar.systemic!.metrics.fatalities).toBe(aar.fatalities);
    expect(aar.systemic!.decisions[0].command).toEqual(sim.state.commands[0]);
    expect(aar.systemic!.hospitals.map((h) => h.peakCensus)).toEqual(
      sim.state.hospitals.map((h) => h.peakCensus),
    );
    expect(aar.systemic!.criticalChains.length).toBeGreaterThan(0);
    expect(reconstructed.aar()).toEqual(aar);
    expect(sim.hash()).toBe(before);
  },
);
