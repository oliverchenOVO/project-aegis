import { it, expect } from "vitest";
import {
  Simulation,
  assertInvariants,
} from "../../packages/simulation/src/index";
import {
  earthquake,
  SHOWCASE_SEED,
} from "../../packages/scenarios/src/earthquake";
import { edge } from "../../packages/simulation/src/routing";
import { emit } from "../../packages/simulation/src/events";
import { projectView } from "../../packages/simulation/src/intelligence";
import { ScenarioSchema } from "../../packages/domain/src/index";
it("all five command types traverse communications and support recall/reassignment", () => {
  const sim = new Simulation(earthquake, "commands");
  sim.step(40);
  const dispatch = sim.issue({
    type: "DISPATCH_UNIT",
    target: "ENG-01",
    incidentId: "INC-1",
  });
  sim.step(15);
  expect(dispatch.deliveryStatus).toBe("ACKNOWLEDGED");
  const reassign = sim.issue({
    type: "REASSIGN_UNIT",
    target: "ENG-01",
    incidentId: "INC-2",
  });
  sim.step(70);
  expect(reassign.deliveryStatus).toBe("ACKNOWLEDGED");
  expect(sim.state.units[0].assignment).toBe("INC-2");
  const priority = sim.issue({
    type: "SET_INCIDENT_PRIORITY",
    target: "INC-2",
    priority: 3,
  });
  const status = sim.issue({ type: "REQUEST_STATUS", target: "H-B" });
  const recall = sim.issue({ type: "RECALL_UNIT", target: "ENG-01" });
  sim.step(500);
  expect(priority.executionStatus).toBe("COMPLETED");
  expect(sim.state.incidents[1].priority).toBe(3);
  expect(status.executionStatus).toBe("COMPLETED");
  expect(recall.executionStatus).toBe("COMPLETED");
  expect(sim.state.units[0].state).toBe("AVAILABLE");
  expect(sim.state.units[0].nodeId).toBe(sim.state.units[0].homeId);
  assertInvariants(sim.state, earthquake);
});
it("a blocked next edge forces a longer route with a recorded causal chain", () => {
  const sim = new Simulation(earthquake, "reroute");
  sim.step(30);
  const cmd = sim.issue({
    type: "DISPATCH_UNIT",
    target: "ENG-01",
    incidentId: "INC-1",
  });
  sim.step(cmd.deliveryTick - sim.state.tick + 1);
  const u = sim.state.units[0],
    r = edge(sim.state, u.nodeId, u.route[0])!,
    oldETA = u.eta;
  r.state = "BLOCKED";
  r.cause = emit(sim.state, "ROAD_BLOCKED", { roadId: r.id }, [
    sim.state.incidents[0].cause,
  ]);
  sim.step();
  expect(u.eta).toBeGreaterThan(oldETA);
  expect(u.route[0]).not.toBe(r.from === u.nodeId ? r.to : r.from);
  const reroute = [...sim.state.events]
    .reverse()
    .find((e) => e.type === "UNIT_REROUTED")!;
  expect(reroute.causedByEventIds).toContain(r.cause);
  expect(
    sim.state.events.some(
      (e) =>
        e.type === "UNIT_ARRIVAL_DELAYED" &&
        e.causedByEventIds.includes(reroute.id),
    ),
  ).toBe(true);
});
it("EMS actually transports patients and admits them to reachable hospitals", () => {
  const sim = new Simulation(earthquake, "transport");
  sim.step(30);
  sim.issue({ type: "DISPATCH_UNIT", target: "AMB-01", incidentId: "INC-3" });
  sim.step(700);
  expect(sim.state.events.some((e) => e.type === "PATIENT_TRANSPORTED")).toBe(
    true,
  );
  expect(sim.state.events.some((e) => e.type === "PATIENT_ADMITTED")).toBe(
    true,
  );
  assertInvariants(sim.state, earthquake);
});
it("response strategy changes real fatalities and infrastructure outcomes", () => {
  const passive = new Simulation(earthquake, SHOWCASE_SEED),
    active = new Simulation(earthquake, SHOWCASE_SEED);
  active.step(90);
  for (const [unit, incident] of [
    ["ENG-01", "INC-1"],
    ["ENG-02", "INC-1"],
    ["ENG-03", "INC-2"],
    ["ENG-04", "INC-2"],
    ["ENG-05", "INC-4"],
    ["AMB-01", "INC-1"],
    ["AMB-02", "INC-2"],
    ["AMB-03", "INC-2"],
    ["AMB-04", "INC-3"],
    ["AMB-05", "INC-3"],
    ["AMB-06", "INC-4"],
  ] as const)
    active.issue({ type: "DISPATCH_UNIT", target: unit, incidentId: incident });
  active.step(90);
  const power = active.state.incidents.find((i) => i.type === "POWER_FAILURE")!,
    radio = active.state.incidents.find(
      (i) => i.type === "COMMUNICATION_FAILURE",
    )!;
  active.issue({
    type: "DISPATCH_UNIT",
    target: "UTL-01",
    incidentId: power.id,
  });
  active.issue({
    type: "DISPATCH_UNIT",
    target: "UTL-02",
    incidentId: radio.id,
  });
  active.step(1800);
  passive.step(1800);
  expect(active.aar().fatalities).toBeLessThan(passive.aar().fatalities);
  expect(active.state.power).toBe(true);
  expect(active.state.comms).toBe("NORMAL");
  expect(active.aar().resolved).toBeGreaterThan(passive.aar().resolved);
});
it("unknown/live truth changes cannot leak into normal read model", () => {
  const sim = new Simulation(earthquake, "fog");
  sim.step(20);
  const before = sim.view();
  sim.state.hospitals[1].generator = "FAILED";
  sim.state.incidents[0].severity = 99;
  sim.state.units[0].nodeId = "N0";
  expect(projectView(sim.state, earthquake)).toEqual(before);
  expect(before.beliefs.some((b) => b.subjectId === "INC-1")).toBe(false);
});
it("beliefs distinguish stale, corroborated and conflicting reports", () => {
  const sim = new Simulation(earthquake, SHOWCASE_SEED);
  sim.step(800);
  const incident = sim.view().beliefs.filter((b) => b.kind === "INCIDENT");
  expect(incident.some((b) => b.conflicts.length > 0)).toBe(true);
  expect(incident.some((b) => b.corroboration.length > 0)).toBe(true);
  const oldReport = sim.state.reports.find(
    (r) =>
      r.subjectId === "H-B" &&
      r.claim.value === "備用發電機運轉中" &&
      r.receivedTick !== undefined,
  )!;
  expect(oldReport.truthRef.receivedValue).toBe("停電・發電機失效");
  expect(oldReport.truthRef.value).toBe(oldReport.claim.value);
});
it("scenario schema rejects malformed data and impossible topology during simulation validation", () => {
  expect(() => ScenarioSchema.parse({ ...earthquake, maxTicks: -1 })).toThrow();
  expect(() => new Simulation(earthquake, "")).toThrow("Seed");
  const sim = new Simulation(earthquake, "invalid");
  sim.state.units[0].nodeId = "missing";
  expect(() => assertInvariants(sim.state, earthquake)).toThrow(
    "unknown route node",
  );
});
it("maximum time completion and active AAR gate work without force completion", () => {
  const sim = new Simulation(earthquake, "completion");
  expect(() => sim.aar()).toThrow("AAR");
  sim.step(1800);
  expect(sim.state.completed).toBe(true);
  const tick = sim.state.tick;
  sim.step(50);
  expect(sim.state.tick).toBe(tick);
  expect(() => sim.issue({ type: "REQUEST_STATUS", target: "H-A" })).toThrow(
    "情境已結束",
  );
});
