import {
  SIM_VERSION,
  WorldSchema,
  ScenarioSchema,
  type WorldState,
  type Scenario,
  type CommandInput,
  type AAR,
} from "../../domain/src/index";
import { hash } from "../../shared/src/index";
import { initializeDisaster, scheduledEvents, hazards } from "./disasters";
import { infrastructure, medical } from "./medical";
import { responders } from "./units";
import { observe, transmit, projectView, unitReport } from "./intelligence";
import { issue, deliverCommands } from "./commands";
import { emit } from "./events";
export class Simulation {
  readonly scenario: Scenario;
  state: WorldState;
  constructor(scenario: Scenario, seed: string, snapshot?: WorldState) {
    this.scenario = ScenarioSchema.parse(scenario);
    if (!seed.trim() || seed.length > 100)
      throw new Error("Seed 必須為 1–100 字元");
    if (snapshot) {
      this.state = WorldSchema.parse(snapshot);
      if (
        this.state.scenarioId !== scenario.id ||
        this.state.scenarioVersion !== scenario.version ||
        this.state.seed !== seed
      )
        throw new Error("場景版本或種子不符");
      assertInvariants(this.state, scenario);
      return;
    }
    this.state = {
      version: SIM_VERSION,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      seed,
      tick: 0,
      rng: {},
      units: structuredClone(scenario.units),
      roads: structuredClone(scenario.roads),
      hospitals: structuredClone(scenario.hospitals),
      incidents: [],
      patients: [],
      reports: [],
      commands: [],
      events: [],
      schedule: [],
      power: true,
      comms: "NORMAL",
      completed: false,
      counters: { event: 0, report: 0, command: 0, incident: 0 },
    };
    for (const u of this.state.units)
      unitReport(this.state, scenario, u.id, true);
  }
  issue(input: CommandInput) {
    return issue(this.state, input);
  }
  view() {
    return projectView(this.state, this.scenario);
  }
  snapshot() {
    return structuredClone(this.state);
  }
  hash() {
    return hash(this.state);
  }
  step(count = 1): void {
    if (!Number.isInteger(count) || count < 0 || count > 20000)
      throw new Error("Invalid tick count");
    for (let n = 0; n < count && !this.state.completed; n++) {
      const w = this.state;
      w.tick++;
      if (w.tick === 1) initializeDisaster(w, this.scenario);
      scheduledEvents(w, this.scenario);
      hazards(w);
      infrastructure(w);
      medical(w);
      responders(w, this.scenario);
      observe(w, this.scenario);
      transmit(w, this.scenario);
      deliverCommands(w, this.scenario);
      const stabilized =
        w.tick > this.scenario.aftershockTick + 20 &&
        w.schedule.length === 0 &&
        w.incidents.every((i) => i.status !== "ACTIVE") &&
        !w.patients.some(
          (p) => p.state === "WAITING" || p.state === "IN_TRANSIT",
        );
      const fatalities = w.events.filter(
        (e) => e.type === "PATIENT_DIED",
      ).length;
      if (stabilized || w.tick >= this.scenario.maxTicks || fatalities >= 60) {
        w.completed = true;
        w.completionReason = stabilized
          ? "主要事件已穩定"
          : fatalities >= 60
            ? "災難性傷亡門檻"
            : "作業時限已到";
        emit(w, "SCENARIO_COMPLETED", { reason: w.completionReason });
      }
      if (w.events.length > 100000) throw new Error("Event explosion guard");
    }
  }
  aar(): AAR {
    const w = this.state;
    if (!w.completed) throw new Error("AAR 僅能於情境結束後開啟");
    const reports = w.reports,
      commands = this.view().commands,
      acknowledged = w.commands.filter(
        (c) => c.acknowledgementTick !== undefined,
      );
    return {
      seed: w.seed,
      duration: w.tick,
      reason: w.completionReason!,
      fatalities: w.events.filter((e) => e.type === "PATIENT_DIED").length,
      injuries: w.patients.length,
      resolved: w.incidents.filter((i) => i.status === "RESOLVED").length,
      hospitalOverload: w.events.filter(
        (e) => e.type === "HOSPITAL_OVER_CAPACITY",
      ).length,
      infrastructureFailures: w.events.filter((e) =>
        ["POWER_NODE_FAILED", "ROAD_BLOCKED", "GENERATOR_FAILED"].includes(
          e.type,
        ),
      ).length,
      intelFailures: {
        stale: reports.filter(
          (r) =>
            r.receivedTick !== undefined &&
            (r.receivedTick > r.expiry ||
              (r.truthRef.receivedValue !== undefined &&
                r.truthRef.receivedValue !== r.truthRef.value)),
        ).length,
        inaccurate: reports.filter((r) => r.claim.value !== r.truthRef.value)
          .length,
        lost: reports.filter((r) => r.status === "LOST").length,
        delayed: reports.filter(
          (r) =>
            r.receivedTick !== undefined &&
            r.receivedTick - r.observedTick > 90,
        ).length,
        lowConfidence: reports.filter((r) => r.observationConfidence < 0.65)
          .length,
      },
      intelAudit: reports
        .filter((r) => r.subjectKind !== "UNIT")
        .map((r) => ({
          id: r.id,
          source: r.sourceId,
          subject: r.subjectId,
          claim: r.claim.value,
          observedTruth: r.truthRef.value,
          receivedTruth: r.truthRef.receivedValue,
          observedTick: r.observedTick,
          receivedTick: r.receivedTick,
          classifications: [
            r.claim.value !== r.truthRef.value ? "觀察誤差" : "",
            r.receivedTick !== undefined &&
            (r.receivedTick > r.expiry ||
              r.truthRef.receivedValue !== r.truthRef.value)
              ? "過時"
              : "",
            r.status === "LOST" ? "遺失" : "",
            r.receivedTick !== undefined && r.receivedTick - r.observedTick > 90
              ? "延遲"
              : "",
            r.observationConfidence < 0.65 ? "低信心" : "",
          ].filter(Boolean),
        })),
      commands,
      averageCommandDelay: acknowledged.length
        ? acknowledged.reduce(
            (sum, c) => sum + c.acknowledgementTick! - c.issueTick,
            0,
          ) / acknowledged.length
        : 0,
      timeline: structuredClone(
        w.events.filter((e) => !e.type.startsWith("REPORT_")),
      ),
      finalHash: this.hash(),
    };
  }
}
export function assertInvariants(w: WorldState, s: Scenario): void {
  const nodes = new Set(s.nodes.map((n) => n.id)),
    incidents = new Set(w.incidents.map((i) => i.id)),
    events = new Set(w.events.map((e) => e.id));
  const fail = (message: string) => {
    throw new Error(`Invariant tick ${w.tick}: ${message}`);
  };
  for (const list of [
    w.units,
    w.incidents,
    w.patients,
    w.events,
    w.reports,
    w.commands,
  ])
    if (new Set(list.map((e) => e.id)).size !== list.length)
      fail("duplicate IDs");
  for (const u of w.units) {
    if (!nodes.has(u.nodeId) || u.route.some((n) => !nodes.has(n)))
      fail("unknown route node");
    if (u.assignment && !incidents.has(u.assignment))
      fail("unknown assignment");
    if (
      u.personnel < 0 ||
      u.equipment < 0 ||
      u.eta < 0 ||
      u.patients.length > 2
    )
      fail("invalid resources");
    if (
      u.state === "AVAILABLE" &&
      (u.assignment || u.patients.length || u.route.length)
    )
      fail("available unit has mission");
    for (const id of u.patients) {
      const p = w.patients.find((p) => p.id === id);
      if (!p || p.unitId !== u.id || p.state !== "IN_TRANSIT")
        fail("invalid patient transport");
    }
  }
  for (const i of w.incidents)
    if (
      !nodes.has(i.nodeId) ||
      i.severity < 0 ||
      i.severity > 100 ||
      !Number.isFinite(i.severity) ||
      (i.status === "RESOLVED" && i.hazard !== 0)
    )
      fail("invalid incident");
  for (const h of w.hospitals)
    if (h.currentPatients < 0 || h.baselinePatients < 0 || h.fuel < 0)
      fail("negative hospital resources");
  for (const p of w.patients) {
    if (!incidents.has(p.incidentId)) fail("unknown patient incident");
    if (p.state === "DEAD" && p.health !== 0) fail("dead patient health");
    if (p.hospitalId && !w.hospitals.some((h) => h.id === p.hospitalId))
      fail("unknown hospital");
  }
  let previousTick = 0;
  for (const e of w.events) {
    if (
      e.tick < previousTick ||
      e.tick > w.tick ||
      e.causedByEventIds.some(
        (id) =>
          !events.has(id) ||
          Number(id.split("-")[1]) >= Number(e.id.split("-")[1]),
      )
    )
      fail("invalid causal chronology");
    previousTick = e.tick;
  }
  if (w.tick > s.maxTicks || w.events.length > 100000) fail("guard exceeded");
}
