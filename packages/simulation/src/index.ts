import {
  SIM_VERSION,
  WorldSchema,
  ScenarioSchema,
  type WorldState,
  type Scenario,
  type CommandInput,
  type AAR,
  type CommandCenterView,
} from "../../domain/src/index";
import { hash } from "../../shared/src/index";
import { updateHazards } from "./hazards";
import {
  initializeCivilians,
  civilianEffects,
  synchronizeCivilians,
  assertPopulation,
} from "./civilians";
import { createIncident } from "./disasters";
import { infrastructure, medical } from "./medical";
import { responders } from "./units";
import { observe, transmit, projectView, unitReport } from "./intelligence";
import { issue, deliverCommands } from "./commands";
import { emit } from "./events";
import { Simulation as LegacySimulation } from "../../legacy-v1/vendor/packages/simulation/src/index";
import {
  WorldSchema as LegacyWorldSchema,
  ScenarioSchema as LegacyScenarioSchema,
  CommandInputSchema as LegacyCommandSchema,
} from "../../legacy-v1/vendor/packages/domain/src/index";
export class Simulation {
  readonly scenario: Scenario;
  state: WorldState;
  #legacy?: LegacySimulation;
  constructor(
    scenario: Scenario,
    seed: string,
    snapshot?: WorldState,
    simulationVersion: WorldState["version"] = snapshot?.version ?? SIM_VERSION,
  ) {
    this.scenario = ScenarioSchema.parse(scenario);
    if (!seed.trim() || seed.length > 100)
      throw new Error("Seed 必須為 1–100 字元");
    if (simulationVersion === "0.1.0") {
      if (scenario.hazardKind === "FLOOD" || scenario.civilians)
        throw new Error("Legacy engine cannot run new scenario features");
      this.#legacy = new LegacySimulation(
        LegacyScenarioSchema.parse(scenario),
        seed,
        snapshot ? LegacyWorldSchema.parse(snapshot) : undefined,
      );
      this.state = this.#legacy.state;
      return;
    }
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
    initializeCivilians(this.state, scenario);
    for (const u of this.state.units)
      unitReport(this.state, scenario, u.id, true);
  }
  issue(input: CommandInput) {
    if (this.#legacy)
      return this.#legacy.issue(LegacyCommandSchema.parse(input));
    return issue(this.state, input);
  }
  view(): CommandCenterView {
    if (this.#legacy) return this.#legacy.view();
    return projectView(this.state, this.scenario);
  }
  snapshot() {
    return structuredClone(this.state);
  }
  hash() {
    return hash(this.state);
  }
  step(count = 1): void {
    if (this.#legacy) {
      this.#legacy.step(count);
      this.state = this.#legacy.state;
      return;
    }
    if (!Number.isInteger(count) || count < 0 || count > 20000)
      throw new Error("Invalid tick count");
    for (let n = 0; n < count && !this.state.completed; n++) {
      const w = this.state;
      w.tick++;
      updateHazards(w, this.scenario);
      civilianEffects(w, this.scenario, createIncident);
      infrastructure(w);
      medical(w);
      responders(w, this.scenario);
      synchronizeCivilians(w);
      observe(w, this.scenario);
      transmit(w, this.scenario);
      deliverCommands(w, this.scenario);
      const stabilized =
        (!w.flood ||
          (w.flood.rainEnded &&
            w.flood.zones.every((z) => z.waterDepth < 0.2))) &&
        w.tick > this.scenario.aftershockTick + 20 &&
        w.schedule.length === 0 &&
        w.incidents.every((i) => i.status !== "ACTIVE") &&
        !w.patients.some(
          (p) => p.state === "WAITING" || p.state === "IN_TRANSIT",
        );
      const fatalities = w.events
        .filter((e) => e.type === "PATIENT_DIED")
        .reduce(
          (n, e) =>
            n + (typeof e.payload.count === "number" ? e.payload.count : 1),
          0,
        );
      const catastrophic =
        !w.cohorts && this.scenario.hazardKind !== "FLOOD" && fatalities >= 60;
      if (stabilized || w.tick >= this.scenario.maxTicks || catastrophic) {
        w.completed = true;
        w.completionReason = stabilized
          ? "主要事件已穩定"
          : catastrophic
            ? "災難性傷亡門檻"
            : "作業時限已到";
        emit(w, "SCENARIO_COMPLETED", { reason: w.completionReason });
      }
      if (w.events.length > 100000) throw new Error("Event explosion guard");
    }
  }
  aar(): AAR {
    if (this.#legacy) return this.#legacy.aar();
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
      fatalities: w.events
        .filter((e) => e.type === "PATIENT_DIED")
        .reduce(
          (n, e) =>
            n + (typeof e.payload.count === "number" ? e.payload.count : 1),
          0,
        ),
      injuries: w.patients.reduce((n, p) => n + (p.count ?? 1), 0),
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
  assertPopulation(w);
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
    ...(w.cohorts ? [w.cohorts] : []),
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
  if (w.flood) {
    const zones = new Set(w.flood.zones.map((z) => z.id));
    for (const zone of w.flood.zones)
      if (
        !Number.isFinite(zone.waterDepth) ||
        zone.waterDepth < 0 ||
        zone.adjacency.some((id) => !zones.has(id)) ||
        zone.nodeIds.some((id) => !nodes.has(id)) ||
        zone.roadIds.some((id) => !w.roads.some((r) => r.id === id))
      )
        fail("invalid flood geometry or depth");
  }
}
