import type { WorldState, Scenario, DomainEvent } from "../../domain/src/index";
import { hash } from "../../shared/src/index";
import type { ReplayBranch } from "../../replay/src/index";
export interface OutcomeMetrics {
  fatalities: number;
  criticalCases: number;
  unresolvedCritical: number;
  resolvedIncidents: number;
  hospitalOverloadTicks: number;
  infrastructureDowntime: number;
  powerDowntime: number;
  communicationDowntime: number;
  averageResponseTime: number;
  respondedIncidents: number;
  averageEMSResponseTime: number;
  respondedEMSIncidents: number;
  averageCommandDelay: number;
  acknowledgedCommands: number;
  recovered: number;
  sheltered: number;
  unitUtilization: number;
}
export interface ChangedOutcome {
  originId: string;
  originalDeaths: number;
  alternativeDeaths: number;
  deathDelta: number;
  originalEventIds: string[];
  alternativeEventIds: string[];
}
export interface BranchComparison {
  lineage: ReplayBranch["lineage"];
  originalHash: string;
  alternativeHash: string;
  originalDuration: number;
  alternativeDuration: number;
  original: OutcomeMetrics;
  alternative: OutcomeMetrics;
  delta: OutcomeMetrics;
  changedOutcomes: ChangedOutcome[];
}
export function outcomeMetrics(w: WorldState, s: Scenario): OutcomeMetrics {
  const count = (events: DomainEvent[]) =>
    events.reduce(
      (n, e) => n + (typeof e.payload.count === "number" ? e.payload.count : 1),
      0,
    );
  const deaths = w.events.filter((e) => e.type === "PATIENT_DIED"),
    ack = w.commands.filter((c) => c.acknowledgementTick !== undefined);
  const outage = (
    failure: (e: DomainEvent) => boolean,
    recovery: (e: DomainEvent) => boolean,
  ) => {
    let start: number | undefined,
      total = 0;
    for (const event of w.events) {
      if (failure(event)) start ??= event.tick;
      else if (recovery(event) && start !== undefined) {
        total += event.tick - start;
        start = undefined;
      }
    }
    return total + (start === undefined ? 0 : w.tick - start);
  };
  const powerDowntime = outage(
    (e) => e.type === "POWER_NODE_FAILED",
    (e) => e.type === "POWER_RESTORED",
  );
  const communicationDowntime = w.network
    ? w.network.nodes.reduce(
        (total, node) =>
          total +
          outage(
            (e) =>
              e.type === "NETWORK_NODE_STATUS_CHANGED" &&
              e.payload.networkNodeId === node.id &&
              e.payload.status === "DOWN",
            (e) =>
              e.type === "NETWORK_NODE_STATUS_CHANGED" &&
              e.payload.networkNodeId === node.id &&
              e.payload.status !== "DOWN",
          ),
        0,
      )
    : outage(
        (e) =>
          e.type === "COMMUNICATION_DEGRADED" && e.payload.status === "OFFLINE",
        (e) => e.type === "COMMUNICATION_RESTORED",
      );
  const assignments = new Map<string, string>(),
    response = new Map<string, number>(),
    emsResponse = new Map<string, number>(),
    units = new Map(w.units.map((u) => [u.id, u])),
    incidents = new Map(w.incidents.map((i) => [i.id, i]));
  for (const event of w.events) {
    if (event.type === "UNIT_DISPATCHED" || event.type === "UNIT_REASSIGNED")
      assignments.set(
        String(event.payload.unitId),
        String(event.payload.incidentId),
      );
    if (event.type === "UNIT_ARRIVED") {
      const id = assignments.get(String(event.payload.unitId)),
        incident = incidents.get(id ?? "");
      if (
        incident &&
        event.payload.nodeId === incident.nodeId &&
        !response.has(incident.id)
      )
        response.set(incident.id, event.tick - incident.creationTick);
      if (
        incident &&
        event.payload.nodeId === incident.nodeId &&
        units.get(String(event.payload.unitId))?.agency === "EMS" &&
        !emsResponse.has(incident.id)
      )
        emsResponse.set(incident.id, event.tick - incident.creationTick);
    }
  }
  let busy = 0;
  const busyStates = new Set([
    "DISPATCHED",
    "EN_ROUTE",
    "OPERATING",
    "RETURNING",
    "HANDOVER",
  ]);
  for (const unit of w.units) {
    const observations = w.reports
      .filter((r) => r.subjectKind === "UNIT" && r.subjectId === unit.id)
      .sort(
        (a, b) =>
          a.observedTick - b.observedTick ||
          Number(a.id.split("-")[1]) - Number(b.id.split("-")[1]),
      );
    for (let i = 0; i < observations.length; i++)
      if (busyStates.has(observations[i].truthRef.value))
        busy +=
          (observations[i + 1]?.observedTick ?? w.tick) -
          observations[i].observedTick;
  }
  return {
    fatalities: count(deaths),
    criticalCases:
      w.patients
        .filter((p) => p.critical)
        .reduce((n, p) => n + (p.count ?? 1), 0) +
      w.hospitals.reduce((n, h) => n + h.criticalPatients, 0) +
      count(deaths.filter((e) => e.payload.baseline === true)),
    unresolvedCritical:
      w.patients
        .filter(
          (p) => p.critical && p.state !== "DEAD" && p.state !== "RECOVERED",
        )
        .reduce((n, p) => n + (p.count ?? 1), 0) +
      w.hospitals.reduce((n, h) => n + h.criticalPatients, 0),
    resolvedIncidents: w.incidents.filter((i) => i.status === "RESOLVED")
      .length,
    hospitalOverloadTicks: w.hospitals.reduce(
      (n, h) => n + (h.overloadTicks ?? 0),
      0,
    ),
    infrastructureDowntime: powerDowntime + communicationDowntime,
    powerDowntime,
    communicationDowntime,
    averageResponseTime: response.size
      ? [...response.values()].reduce((a, b) => a + b, 0) / response.size
      : 0,
    respondedIncidents: response.size,
    averageEMSResponseTime: emsResponse.size
      ? [...emsResponse.values()].reduce((a, b) => a + b, 0) / emsResponse.size
      : 0,
    respondedEMSIncidents: emsResponse.size,
    averageCommandDelay: ack.length
      ? ack.reduce((n, c) => n + c.acknowledgementTick! - c.issueTick, 0) /
        ack.length
      : 0,
    acknowledgedCommands: ack.length,
    recovered: w.patients
      .filter((p) => p.state === "RECOVERED")
      .reduce((n, p) => n + (p.count ?? 1), 0),
    sheltered:
      w.cohorts
        ?.filter(
          (c) => c.state === "SHELTERED" && c.shelterTarget !== undefined,
        )
        .reduce((n, c) => n + c.population, 0) ?? 0,
    unitUtilization: w.tick ? busy / (s.units.length * w.tick) : 0,
  };
}
function originDeaths(
  w: WorldState,
): Map<string, { count: number; events: string[] }> {
  const cohorts = new Map(w.cohorts?.map((c) => [c.id, c]) ?? []),
    patients = new Map(w.patients.map((p) => [p.id, p])),
    result = new Map<string, { count: number; events: string[] }>();
  for (const event of w.events.filter((e) => e.type === "PATIENT_DIED")) {
    const patient = patients.get(String(event.payload.patientId)),
      cohort = cohorts.get(patient?.civilianCohortId ?? "");
    const origin =
        cohort?.originId ??
        (event.payload.baseline === true
          ? `HOSPITAL-${event.payload.hospitalId}`
          : `PATIENT-${patient?.id ?? event.id}`),
      existing = result.get(origin) ?? { count: 0, events: [] };
    existing.count +=
      typeof event.payload.count === "number" ? event.payload.count : 1;
    existing.events.push(event.id);
    result.set(origin, existing);
  }
  return result;
}
export function compareBranch(
  original: WorldState,
  scenario: Scenario,
  branch: ReplayBranch,
): BranchComparison {
  if (
    branch.lineage.parentHash !== hash(original) ||
    branch.lineage.simulationVersion !== original.version ||
    branch.lineage.scenarioVersion !== original.scenarioVersion
  )
    throw new Error("Counterfactual parent identity mismatch");
  const originalMetrics = outcomeMetrics(original, scenario),
    alternative = outcomeMetrics(branch.simulation.state, scenario),
    delta = {} as OutcomeMetrics;
  for (const key of Object.keys(originalMetrics) as (keyof OutcomeMetrics)[])
    delta[key] = alternative[key] - originalMetrics[key];
  const originalDeaths = originDeaths(original),
    alternativeDeaths = originDeaths(branch.simulation.state),
    changedOutcomes: ChangedOutcome[] = [];
  for (const originId of new Set([
    ...originalDeaths.keys(),
    ...alternativeDeaths.keys(),
  ])) {
    const from = originalDeaths.get(originId) ?? { count: 0, events: [] },
      to = alternativeDeaths.get(originId) ?? { count: 0, events: [] };
    if (from.count !== to.count)
      changedOutcomes.push({
        originId,
        originalDeaths: from.count,
        alternativeDeaths: to.count,
        deathDelta: to.count - from.count,
        originalEventIds: from.events,
        alternativeEventIds: to.events,
      });
  }
  changedOutcomes.sort(
    (a, b) =>
      Math.abs(b.deathDelta) - Math.abs(a.deathDelta) ||
      a.originId.localeCompare(b.originId, "en"),
  );
  return {
    lineage: structuredClone(branch.lineage),
    originalHash: hash(original),
    alternativeHash: branch.simulation.hash(),
    originalDuration: original.tick,
    alternativeDuration: branch.simulation.state.tick,
    original: originalMetrics,
    alternative,
    delta,
    changedOutcomes: changedOutcomes.slice(0, 12),
  };
}
