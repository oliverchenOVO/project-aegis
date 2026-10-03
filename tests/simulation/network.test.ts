import { it, expect } from "vitest";
import { ScenarioSchema, type Scenario } from "../../packages/domain/src/index";
import {
  Simulation,
  assertInvariants,
} from "../../packages/simulation/src/index";
import { flood } from "../../packages/scenarios/src/flood";
import { earthquakeSystemic } from "../../packages/scenarios/src/earthquake-systemic";
import {
  report,
  transmit,
  unitReport,
} from "../../packages/simulation/src/intelligence";
import {
  networkPath,
  updateNetworkPower,
} from "../../packages/simulation/src/network";
import {
  ReplayRecorder,
  replay,
  VerifiedTimeline,
} from "../../packages/replay/src/index";
function reliable(s: Scenario): Scenario {
  const copy = structuredClone(s);
  copy.version += "-network-test";
  for (const e of copy.communications!.edges) {
    e.reliability = 1;
    e.capacity = 1;
  }
  return ScenarioSchema.parse(copy);
}
it("source capabilities and local subjects prevent impossible observations", () => {
  const sim = new Simulation(flood, "network-capabilities"),
    w = sim.state,
    before = w.reports.length;
  report(
    w,
    flood,
    "SENSOR-F-A",
    "H-A",
    "HOSPITAL",
    { value: "known" },
    "known",
  );
  report(w, flood, "H-A", "H-B", "HOSPITAL", { value: "known" }, "known");
  report(w, flood, "SENSOR-F-A", "F-B", "FLOOD", { value: "known" }, "known");
  report(
    w,
    flood,
    "FD-OBSERVER-N1",
    "INC-unknown",
    "INCIDENT",
    { value: "known", nodeId: "N1", incidentType: "MASS_CASUALTY" },
    "known",
  );
  report(w, flood, "AMB-01", "AMB-02", "UNIT", { value: "known" }, "known");
  expect(w.reports.length).toBe(before);
  sim.step(120);
  expect(
    w.reports.some(
      (r) =>
        r.subjectKind === "CIVILIANS" &&
        r.claim.estimatedPopulation !== undefined,
    ),
  ).toBe(true);
  expect(
    w.reports.some(
      (r) =>
        r.subjectKind === "HOSPITAL" && r.claim.emergencyQueue !== undefined,
    ),
  ).toBe(true);
  assertInvariants(w, flood);
});
it("bandwidth limits actual hop departures and a burst creates measurable queue delay", () => {
  const s = reliable(flood),
    sim = new Simulation(s, "network-burst");
  for (let i = 0; i < 80; i++) unitReport(sim.state, s, "AMB-04");
  sim.step(100);
  assertInvariants(sim.state, s);
  const groups = new Map<string, number>();
  for (const e of sim.state.events.filter(
    (e) => e.type === "MESSAGE_HOP_SENT",
  )) {
    const key = `${e.tick}:${e.payload.edgeId}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  expect(Math.max(...groups.values())).toBe(1);
  expect(sim.state.network!.peakQueued).toBeGreaterThan(80);
  expect(
    sim.state.events.some(
      (e) =>
        e.type === "MESSAGE_DELIVERED" && Number(e.payload.queueDelay) > 10,
    ),
  ).toBe(true);
  for (const r of sim.state.reports.filter((r) => r.receivedTick !== undefined))
    expect(r.receivedTick!).toBeGreaterThanOrEqual(r.transmittedTick!);
});
it("a delivered command remains unknown to the player until its actual return ACK", () => {
  const s = reliable(earthquakeSystemic),
    sim = new Simulation(s, "network-ack");
  sim.step();
  const c = sim.issue({
    type: "DISPATCH_UNIT",
    target: "AMB-04",
    incidentId: "INC-1",
  });
  while (c.receivedTick === undefined && sim.state.tick < 100) sim.step();
  expect(c.receivedTick).toBeDefined();
  expect(c.acknowledgementTick).toBeUndefined();
  expect(sim.view().commands[0].deliveryStatus).toBe("SENT");
  expect(sim.view().commands[0].executionStatus).toBe("PENDING");
  while (c.acknowledgementTick === undefined && sim.state.tick < 200)
    sim.step();
  expect(c.acknowledgementTick).toBeGreaterThan(c.receivedTick!);
  expect(c.knownExecutionStatus).toBeDefined();
  expect(
    sim.state.events.some(
      (e) =>
        e.type === "MESSAGE_DELIVERED" &&
        e.payload.kind === "ACK" &&
        e.payload.referenceId === c.id,
    ),
  ).toBe(true);
  assertInvariants(sim.state, s);
});
it("grid backup exhaustion removes the repeater while an independent EMS circuit remains reachable", () => {
  const sim = new Simulation(flood, "network-backup"),
    w = sim.state;
  while (w.power && w.tick < 300) sim.step();
  const repeater = w.network!.nodes.find((n) => n.id === "NET-RAD")!;
  expect(w.power).toBe(false);
  expect(repeater.status).toBe("DEGRADED");
  sim.step(180);
  expect(repeater.status).toBe("DOWN");
  expect(repeater.backupFuel).toBe(0);
  const path = networkPath(w, "NET-DC", "NET-EMS")!;
  expect(path).toBeDefined();
  expect(
    path.some((id) => {
      const e = w.network!.edges.find((e) => e.id === id)!;
      return [e.from, e.to].includes("NET-RAD");
    }),
  ).toBe(false);
  const change = w.events.find((e) => e.id === repeater.cause)!;
  expect(change.causedByEventIds).toContain(w.powerCause);
  const before = w.events.length;
  sim.issue({ type: "REQUEST_STATUS", target: "AMB-04" });
  sim.step(40);
  const backup = w.events
    .slice(before)
    .find(
      (e) => e.type === "MESSAGE_HOP_SENT" && e.payload.backupRoute === true,
    )!;
  expect(backup).toBeDefined();
  expect(backup.causedByEventIds).toContain(change.id);
  assertInvariants(w, flood);
});
it("isolated sources wait in a bounded queue and expire with a factual loss event", () => {
  const sim = new Simulation(flood, "network-isolation"),
    w = sim.state,
    net = w.network!;
  net.maxMessageAge = 10;
  net.edges = net.edges.filter(
    (e) => e.from !== "NET-Z-F-A" && e.to !== "NET-Z-F-A",
  );
  report(
    w,
    flood,
    "SENSOR-F-A",
    "F-A",
    "FLOOD",
    { value: "低度積水", estimatedDepth: 0 },
    "低度積水",
  );
  const r = w.reports.at(-1)!;
  for (let n = 0; n < 12; n++) {
    w.tick++;
    updateNetworkPower(w);
    transmit(w, flood);
  }
  expect(r.status).toBe("EXPIRED");
  expect(r.receivedTick).toBeUndefined();
  expect(
    w.events.some(
      (e) =>
        e.type === "MESSAGE_LOST" &&
        e.payload.referenceId === r.id &&
        e.payload.reason === "TTL_EXPIRED",
    ),
  ).toBe(true);
  expect(sim.view().reports.some((p) => p.id === r.id)).toBe(false);
});
it("received knowledge ignores later network/hospital/cohort truth changes", () => {
  const sim = new Simulation(flood, "network-fog");
  sim.step();
  const c = sim.issue({ type: "REQUEST_STATUS", target: "H-B" });
  sim.step(199);
  const before = sim.view();
  sim.state.network!.nodes[0].status = "DOWN";
  sim.state.network!.peakQueued += 1000;
  sim.state.hospitals[0].currentPatients += 100;
  sim.state.cohorts![0].population += 10;
  c.executionStatus = "FAILED";
  c.deliveryStatus = "FAILED";
  c.failure = "unreceived failure";
  expect(sim.view()).toEqual(before);
  expect(JSON.stringify(before)).not.toContain("backupFuel");
  expect(JSON.stringify(before)).not.toContain("peakQueued");
});
it("malformed initial topology and combined pending-message guards fail before mutation", () => {
  const scenario = structuredClone(flood);
  scenario.communications!.edges[0].from = "unknown";
  expect(() => new Simulation(scenario, "bad-network")).toThrow(
    "Invalid communication topology",
  );
  const sim = new Simulation(flood, "network-guard"),
    before = sim.state.reports.length;
  sim.state.schedule = Array.from({ length: 20000 }, () => ({
    tick: 10,
    kind: "RADIO_DAMAGE",
    target: "RAD",
    cause: sim.state.events[0].id,
  }));
  expect(() => unitReport(sim.state, flood, "AMB-04")).toThrow(
    "Network queue explosion guard",
  );
  expect(sim.state.reports.length).toBe(before);
});
it("pending hops and ACKs are deterministic across checkpoint restore and continuation", () => {
  const sim = new Simulation(earthquakeSystemic, "network-checkpoint"),
    recorder = new ReplayRecorder(sim);
  while (sim.state.tick < 600) {
    if (sim.state.tick === 298)
      recorder.command(sim, { type: "REQUEST_STATUS", target: "H-B" });
    sim.step();
    recorder.checkpoint(sim);
  }
  const checkpoint = recorder.record.checkpoints!.find((c) => c.tick === 300)!;
  expect(checkpoint.snapshot.network!.messages.length).toBeGreaterThan(0);
  expect(replay(earthquakeSystemic, recorder.record).hash()).toBe(sim.hash());
  const continued = new VerifiedTimeline(
    earthquakeSystemic,
    recorder.record,
  ).seek(300);
  continued.step(300);
  expect(continued.hash()).toBe(sim.hash());
  assertInvariants(continued.state, earthquakeSystemic);
});
it("network references, early arrivals and duplicate sources fail explicitly", () => {
  const sim = new Simulation(flood, "network-invalid"),
    w = sim.state;
  w.network!.messages[0].transmittedTick = 1;
  w.network!.messages[0].queuedTick = 2;
  expect(() => assertInvariants(w, flood)).toThrow("message chronology");
  w.network!.messages[0].queuedTick = 0;
  w.network!.messages[0].transmittedTick = undefined;
  w.network!.sources.push(w.network!.sources[0]);
  expect(() => assertInvariants(w, flood)).toThrow("duplicate communication");
  w.network!.sources.pop();
  w.network!.messages[0].status = "IN_TRANSIT";
  w.network!.messages[0].arrivalTick = 0;
  expect(() => assertInvariants(w, flood)).toThrow("pending network hop");
  w.network!.messages[0].status = "QUEUED";
  w.network!.edges[0].from = "unknown";
  expect(() => assertInvariants(w, flood)).toThrow(
    "unknown communication endpoint",
  );
});
