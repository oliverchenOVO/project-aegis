import { it, expect } from "vitest";
import {
  Simulation,
  assertInvariants,
} from "../../packages/simulation/src/index";
import { flood } from "../../packages/scenarios/src/flood";
import { earthquakeSystemic } from "../../packages/scenarios/src/earthquake-systemic";
import {
  splitPatient,
  updateHospital,
  beginHandover,
  completeHandover,
  refreshHospitalCensus,
} from "../../packages/simulation/src/hospital";
import { medical } from "../../packages/simulation/src/medical";
import {
  synchronizeCivilians,
  assertPopulation,
} from "../../packages/simulation/src/civilians";
import {
  ReplayRecorder,
  replay,
  VerifiedTimeline,
} from "../../packages/replay/src/index";
import { save, load } from "../../packages/persistence/src/index";
function queued() {
  const sim = new Simulation(earthquakeSystemic, "hospital-unit"),
    w = sim.state,
    h = w.hospitals[0];
  sim.step();
  const patients = w.patients.slice(0, 3);
  h.patientQueue = [];
  for (const p of patients) {
    p.state = "QUEUED";
    p.hospitalId = h.id;
    p.triage = "DELAYED";
    p.critical = false;
    h.patientQueue.push(p.id);
  }
  h.capacity = h.baselinePatients + 5;
  h.emergencyCapacity = 0;
  h.icuCapacity = h.criticalPatients + 1;
  h.traumaCapacity = 2;
  h.throughputCredit = 1;
  h.treatmentThroughput = 0;
  refreshHospitalCensus(w);
  return { sim, w, h, patients };
}
it("triage priority consumes finite throughput and ICU capacity before admitting a queue", () => {
  const { w, h, patients } = queued();
  patients[1].triage = "IMMEDIATE";
  patients[1].critical = true;
  patients[1].health = 40;
  updateHospital(w);
  expect(patients[1].state).toBe("ADMITTED");
  expect(patients[0].state).toBe("QUEUED");
  expect(h.throughputCredit).toBe(0);
  patients[2].triage = "IMMEDIATE";
  patients[2].critical = true;
  h.throughputCredit = 1;
  updateHospital(w);
  expect(patients[2].state).toBe("QUEUED");
  expect(patients[0].state).toBe("ADMITTED");
  synchronizeCivilians(w);
  refreshHospitalCensus(w);
  assertInvariants(w, earthquakeSystemic);
});
it("ambulance handover holds the actual vehicle longer under hospital congestion", () => {
  const { w, h, patients } = queued(),
    u = w.units.find((u) => u.agency === "EMS")!,
    p = patients[0];
  h.patientQueue = h.patientQueue!.filter((id) => id !== p.id);
  p.state = "IN_TRANSIT";
  p.unitId = u.id;
  p.hospitalId = undefined;
  u.nodeId = h.nodeId;
  u.patients = [p.id];
  u.destinationHospital = h.id;
  beginHandover(w, u);
  const normal = u.handoverUntil!;
  expect(u.state).toBe("HANDOVER");
  expect(p.state).toBe("IN_TRANSIT");
  h.status = "DIVERTING";
  beginHandover(w, u);
  expect(u.handoverUntil).toBe(normal + 60);
  w.tick = u.handoverUntil!;
  completeHandover(w, u);
  expect(p.state).toBe("QUEUED");
  expect(h.patientQueue).toContain(p.id);
  expect(u.patients).toEqual([]);
  const end = w.events
      .filter((e) => e.type === "AMBULANCE_HANDOVER_COMPLETED")
      .at(-1)!,
    start = w.events
      .filter((e) => e.type === "AMBULANCE_HANDOVER_STARTED")
      .at(-1)!;
  expect(end.causedByEventIds).toContain(start.id);
  synchronizeCivilians(w);
  refreshHospitalCensus(w);
  assertPopulation(w);
});
it("queue saturation and loss of power cause measured deterioration and death", () => {
  const { w, h, patients } = queued();
  h.edCapacity = 1;
  h.throughputCredit = 0;
  patients[0].health = 24.01;
  patients[0].critical = true;
  patients[0].triage = "IMMEDIATE";
  updateHospital(w);
  expect(h.status).toBe("DIVERTING");
  expect(h.overloadTicks).toBe(1);
  h.power = false;
  h.generator = "FAILED";
  updateHospital(w);
  expect(h.status).toBe("POWER_EMERGENCY");
  expect(h.powerEmergencyTicks).toBe(1);
  medical(w);
  expect(patients[0].triage).toBe("EXPECTANT");
  const deterioration = patients[0].cause;
  patients[0].health = 0.01;
  medical(w);
  expect(patients[0].outcome).toBe("DECEASED");
  expect(h.patientQueue).not.toContain(patients[0].id);
  expect(
    w.events.find((e) => e.id === patients[0].cause)!.causedByEventIds,
  ).toContain(deterioration);
  synchronizeCivilians(w);
  refreshHospitalCensus(w);
  assertPopulation(w);
});
it("partial treatment splits a real injury cohort without creating population", () => {
  const sim = new Simulation(flood, "hospital-split");
  sim.step(600);
  const w = sim.state,
    p = w.patients.find((p) => (p.count ?? 1) > 1)!;
  expect(p).toBeDefined();
  const before = w.cohorts!.reduce((n, c) => n + c.population, 0),
    child = splitPatient(w, p, 1);
  expect(child.count).toBe(1);
  expect(child.civilianCohortId).not.toBe(p.civilianCohortId);
  assertPopulation(w);
  expect(w.cohorts!.reduce((n, c) => n + c.population, 0)).toBe(before);
  expect(() => splitPatient(w, child, 1)).toThrow("Invalid patient split");
});
it("full treatment produces an explicit recovery outcome and frees a bed", () => {
  const { w, h, patients } = queued();
  h.throughputCredit = 1;
  updateHospital(w);
  const p = patients.find((p) => p.state === "ADMITTED")!;
  p.health = 99.99;
  medical(w);
  refreshHospitalCensus(w);
  synchronizeCivilians(w);
  expect(p.outcome).toBe("RECOVERED");
  expect(p.treatmentState).toBe("COMPLETED");
  expect(w.events.find((e) => e.id === p.cause)!.type).toBe(
    "PATIENT_RECOVERED",
  );
  assertPopulation(w);
});
it("an inpatient who deteriorates must wait for a full ICU rather than exceed specialty beds", () => {
  const { w, h, patients } = queued();
  updateHospital(w);
  const p = patients[0];
  expect(p.state).toBe("ADMITTED");
  h.icuCapacity = h.criticalPatients;
  h.power = false;
  h.generator = "FAILED";
  p.health = 50.01;
  medical(w);
  expect(p.triage).toBe("IMMEDIATE");
  expect(p.state).toBe("QUEUED");
  expect(h.patientQueue).toContain(p.id);
  expect(w.events.find((e) => e.id === p.cause)!.payload.reason).toBe(
    "AWAITING_ICU",
  );
  synchronizeCivilians(w);
  refreshHospitalCensus(w);
  assertInvariants(w, earthquakeSystemic);
});
it.each(["clinical-a", "clinical-b"])(
  "real dispatch medical timeline replays and survives checkpoint/save: %s",
  (seed) => {
    const sim = new Simulation(earthquakeSystemic, seed),
      recorder = new ReplayRecorder(sim);
    sim.step();
    recorder.checkpoint(sim);
    for (const unit of ["AMB-01", "AMB-02", "AMB-03", "AMB-04", "AMB-05"])
      recorder.command(sim, {
        type: "DISPATCH_UNIT",
        target: unit,
        incidentId: "INC-1",
      });
    while (!sim.state.completed) {
      sim.step();
      recorder.checkpoint(sim);
      if (sim.state.tick % 30 === 0)
        assertInvariants(sim.state, earthquakeSystemic);
    }
    expect(
      sim.state.events.some((e) => e.type === "AMBULANCE_HANDOVER_STARTED"),
    ).toBe(true);
    expect(sim.state.events.some((e) => e.type === "PATIENT_QUEUED")).toBe(
      true,
    );
    expect(replay(earthquakeSystemic, recorder.record).hash()).toBe(sim.hash());
    expect(load(save(sim, recorder.record)).simulation.hash()).toBe(sim.hash());
    const timeline = new VerifiedTimeline(earthquakeSystemic, recorder.record);
    expect(timeline.seek(600).state.tick).toBe(600);
  },
);
