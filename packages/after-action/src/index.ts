import {
  IntelClasses,
  type IntelClass,
  type IntelReport,
  type IntelAudit,
  type Scenario,
  type WorldState,
  type SystemicAAR,
} from "../../domain/src/index";
import { outcomeMetrics } from "../../counterfactual/src/index";
import { CausalIndex } from "./causal";

const required: Record<IntelReport["subjectKind"], string[]> = {
  INCIDENT: ["nodeId", "incidentType", "severity"],
  UNIT: ["nodeId", "unitState"],
  HOSPITAL: [
    "nodeId",
    "powered",
    "hospitalStatus",
    "currentPatients",
    "emergencyQueue",
    "icuOccupied",
    "ambulanceHandover",
  ],
  ROAD: ["nodeId"],
  POWER: ["nodeId"],
  COMMS: ["nodeId"],
  FLOOD: ["nodeId", "estimatedDepth"],
  CIVILIANS: [
    "nodeId",
    "estimatedPopulation",
    "estimatedInjured",
    "estimatedCritical",
  ],
};
/** Classify at receipt using the historical observation/receipt truth and available sources. */
export function auditIntelligence(w: WorldState): IntelAudit[] {
  const receiptOrder = new Map(
    w.events
      .filter((e) => e.type === "REPORT_RECEIVED")
      .map((e, index) => [String(e.payload.reportId), index]),
  );
  const groups = new Map<string, IntelReport[]>();
  const result = new Map<string, IntelAudit>();
  const ordered = w.reports
    .filter((r) => r.subjectKind !== "UNIT")
    .slice()
    .sort(
      (a, b) =>
        (a.receivedTick ?? Infinity) - (b.receivedTick ?? Infinity) ||
        (receiptOrder.get(a.id) ?? 0) - (receiptOrder.get(b.id) ?? 0) ||
        a.observedTick - b.observedTick,
    );
  for (const r of ordered) {
    const key = `${r.subjectKind}:${r.subjectId}`,
      earlier = groups.get(key) ?? [],
      nearby =
        r.receivedTick === undefined
          ? []
          : earlier.filter(
              (other) =>
                other.sourceId !== r.sourceId &&
                Math.abs(other.observedTick - r.observedTick) <= 135,
            ),
      corroborating = nearby.filter(
        (other) => other.claim.value === r.claim.value,
      ),
      conflicting = nearby.filter(
        (other) => other.claim.value !== r.claim.value,
      ),
      claim = r.claim as Record<string, unknown>,
      missingFields = required[r.subjectKind].filter(
        (field) => claim[field] === undefined,
      ),
      classifications: IntelClass[] = [];
    if (
      r.receivedTick !== undefined &&
      (r.receivedTick > r.expiry ||
        (r.truthRef.receivedValue !== undefined &&
          r.truthRef.receivedValue !== r.truthRef.value))
    )
      classifications.push("STALE");
    if (r.claim.value !== r.truthRef.value) classifications.push("FALSE");
    if (missingFields.length) classifications.push("INCOMPLETE");
    if (r.receivedTick !== undefined && r.receivedTick - r.observedTick > 90)
      classifications.push("DELAYED");
    if (r.status === "LOST" || r.status === "EXPIRED")
      classifications.push("LOST");
    if (conflicting.length) classifications.push("CONFLICTED");
    if (r.receivedTick !== undefined && !corroborating.length)
      classifications.push("UNCORROBORATED");
    result.set(r.id, {
      id: r.id,
      source: r.sourceId,
      subject: r.subjectId,
      claim: r.claim.value,
      observedTruth: r.truthRef.value,
      receivedTruth: r.truthRef.receivedValue,
      observedTick: r.observedTick,
      receivedTick: r.receivedTick,
      classifications,
      corroboratingReportIds: corroborating.map((other) => other.id),
      conflictingReportIds: conflicting.map((other) => other.id),
      missingFields,
      causeEventIds: [
        r.createdEventId,
        ...(r.truthRef.cause ? [r.truthRef.cause] : []),
      ],
    });
    if (r.receivedTick !== undefined) {
      earlier.push(r);
      groups.set(key, earlier);
    }
  }
  return w.reports
    .filter((r) => r.subjectKind !== "UNIT")
    .map((r) => result.get(r.id)!);
}
export function systemicAAR(
  w: WorldState,
  s: Scenario,
  audits: IntelAudit[],
): SystemicAAR {
  const graph = new CausalIndex(w.events),
    intelligence = Object.fromEntries(
      IntelClasses.map((name) => [name, 0]),
    ) as Record<IntelClass, number>;
  for (const report of audits)
    for (const name of report.classifications as IntelClass[])
      intelligence[name]++;
  const decisions = w.commands.map((command) => {
    const events = w.events.filter((e) => e.payload.commandId === command.id),
      issued = events.find((e) => e.type === "COMMAND_ISSUED");
    if (!issued) throw new Error("Decision has no issue event");
    const outcomes = graph.outcomes(issued.id);
    return {
      command: structuredClone(command),
      issuedEventId: issued.id,
      acknowledgementEventIds: events
        .filter((e) => e.type === "COMMAND_ACKNOWLEDGED")
        .map((e) => e.id),
      executionEventIds: events
        .filter((e) =>
          ["COMMAND_RECEIVED", "COMMAND_COMPLETED", "COMMAND_FAILED"].includes(
            e.type,
          ),
        )
        .map((e) => e.id),
      outcomeEventIds: outcomes.ids,
      truncated: outcomes.truncated,
    };
  });
  const selected: string[] = [];
  for (const type of [
    "PATIENT_DIED",
    "PATIENT_RECOVERED",
    "GENERATOR_FAILED",
    "POWER_NODE_FAILED",
    "NETWORK_NODE_STATUS_CHANGED",
    "TRANSPORT_DELAYED",
    "CIVILIANS_SHELTERED",
  ])
    selected.push(
      ...w.events
        .filter((e) => e.type === type)
        .slice(-2)
        .map((e) => e.id),
    );
  return {
    version: 2,
    metrics: outcomeMetrics(w, s),
    intelligence,
    decisions,
    hospitals: w.hospitals.map((h) => ({
      id: h.id,
      status: h.status ?? "UNMODELED",
      currentPatients: h.currentPatients,
      queue: w.patients
        .filter((p) => p.hospitalId === h.id && p.state === "QUEUED")
        .reduce((n, p) => n + (p.count ?? 1), 0),
      peakQueue: h.peakQueue ?? 0,
      peakCensus: h.peakCensus ?? h.currentPatients,
      peakICU: h.peakICU ?? h.criticalPatients,
      overloadTicks: h.overloadTicks ?? 0,
      powerEmergencyTicks: h.powerEmergencyTicks ?? 0,
      handoverTicks: h.handoverTicks ?? 0,
    })),
    criticalChains: selected.map((id) => graph.trace(id)),
  };
}
