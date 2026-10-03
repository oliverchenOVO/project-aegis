import type {
  WorldState,
  Scenario,
  IntelReport,
  CommandCenterView,
  Belief,
  PublicReport,
} from "../../domain/src/index";
import { emit } from "./events";
import { SeededRandom } from "./random";
function floodDescription(depth: number): string {
  return depth < 0.25
    ? "低度積水"
    : depth < 0.7
      ? "道路積水風險"
      : "深度淹水・可能阻斷";
}
export function report(
  w: WorldState,
  s: Scenario,
  sourceId: string,
  subjectId: string,
  kind: IntelReport["subjectKind"],
  claim: IntelReport["claim"],
  trueValue: string,
  cause?: string,
  immediate = false,
): void {
  const rng = new SeededRandom(w.seed, w.rng, `intel:${sourceId}`);
  const interval = w.comms === "NORMAL" ? s.reportDelay : s.degradedReportDelay;
  const delay = immediate
    ? 0
    : rng.integer(interval[0], interval[1]) + (w.comms === "OFFLINE" ? 150 : 0);
  const unreliable = sourceId.startsWith("CIV");
  const confidence = unreliable
    ? 0.45 + rng.next() * 0.2
    : 0.78 + rng.next() * 0.18;
  const id = `RPT-${++w.counters.report}`;
  const createdEventId = emit(
    w,
    "REPORT_CREATED",
    { reportId: id, subjectId },
    [cause],
  );
  const r: IntelReport = {
    id,
    sourceId,
    subjectId,
    subjectKind: kind,
    claim: structuredClone(claim),
    observedTick: w.tick,
    deliveryTick: w.tick + delay,
    expiry: w.tick + 150,
    sourceReliability: unreliable ? 0.6 : 0.94,
    observationConfidence: confidence,
    status: "CREATED",
    truthRef: { value: trueValue, cause },
    createdEventId,
  };
  w.reports.push(r);
  if (immediate) {
    r.status = "RECEIVED";
    r.transmittedTick = w.tick;
    r.receivedTick = w.tick;
    emit(w, "REPORT_RECEIVED", { reportId: id }, [createdEventId]);
  }
}
export function unitReport(
  w: WorldState,
  s: Scenario,
  unitId: string,
  immediate = false,
): void {
  const u = w.units.find((u) => u.id === unitId)!;
  report(
    w,
    s,
    u.id,
    u.id,
    "UNIT",
    {
      value: u.state,
      unitState: u.state,
      nodeId: u.nodeId,
      assignment: u.assignment,
      route: [...u.route],
      eta: u.eta,
      comms: u.communicationStatus,
    },
    u.state,
    u.missionCause,
    immediate,
  );
}
export function observe(
  w: WorldState,
  s: Scenario,
  forceSubject?: string,
): void {
  if (!forceSubject && w.tick !== 1 && w.tick % s.observationInterval !== 0)
    return;
  for (const zone of w.flood?.zones ?? []) {
    if (forceSubject && forceSubject !== zone.id) continue;
    const value = floodDescription(zone.waterDepth),
      rng = new SeededRandom(w.seed, w.rng, `observation:flood:${zone.id}`);
    report(
      w,
      s,
      `SENSOR-${zone.id}`,
      zone.id,
      "FLOOD",
      {
        value,
        nodeId: zone.nodeIds[0],
        estimatedDepth: Math.round(zone.waterDepth * 10) / 10,
      },
      value,
      w.flood!.rainCause,
    );
    const estimate = Math.max(
      0,
      Math.round((zone.waterDepth + rng.integer(-3, 3) / 10) * 10) / 10,
    );
    report(
      w,
      s,
      `CIV-${zone.id}`,
      zone.id,
      "FLOOD",
      {
        value: floodDescription(estimate),
        nodeId: zone.nodeIds[0],
        estimatedDepth: estimate,
      },
      value,
      w.flood!.rainCause,
    );
  }
  for (const i of w.incidents.filter(
    (i) => !forceSubject || i.id === forceSubject,
  )) {
    const responders = w.units.filter(
      (u) => u.assignment === i.id && u.state === "OPERATING",
    );
    const source = responders[0]?.id ?? `CIV-${i.nodeId}`;
    const value =
      i.status === "ACTIVE"
        ? i.severity > 70
          ? "危急"
          : i.severity > 40
            ? "嚴重"
            : "中度"
        : i.status === "STABILIZED"
          ? "已穩定"
          : "已解除";
    const rng = new SeededRandom(w.seed, w.rng, `observation:${i.id}`);
    const severity = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          i.severity +
            (source.startsWith("CIV")
              ? rng.integer(-25, 25)
              : rng.integer(-5, 5)),
        ),
      ),
    );
    const estimate =
      i.status !== "ACTIVE"
        ? value
        : severity > 70
          ? "危急"
          : severity > 40
            ? "嚴重"
            : "中度";
    report(
      w,
      s,
      source,
      i.id,
      "INCIDENT",
      { value: estimate, nodeId: i.nodeId, incidentType: i.type, severity },
      value,
      i.cause,
    );
    if (!forceSubject && w.tick % (s.observationInterval * 3) === 0)
      report(
        w,
        s,
        `FD-OBSERVER-${i.nodeId}`,
        i.id,
        "INCIDENT",
        {
          value,
          nodeId: i.nodeId,
          incidentType: i.type,
          severity: Math.round(i.severity),
        },
        value,
        i.cause,
      );
  }
  for (const h of w.hospitals.filter(
    (h) => !forceSubject || h.id === forceSubject,
  )) {
    const value = h.power
      ? "市電正常"
      : h.generator === "OPERATIONAL"
        ? "備用發電機運轉中"
        : "停電・發電機失效";
    report(
      w,
      s,
      h.id,
      h.id,
      "HOSPITAL",
      { value, nodeId: h.nodeId },
      value,
      h.cause,
    );
  }
  for (const u of w.units.filter((u) => !forceSubject || u.id === forceSubject))
    unitReport(w, s, u.id);
  if (!forceSubject || forceSubject === "PWR")
    report(
      w,
      s,
      "UTILITY-CONTROL",
      "PWR",
      "POWER",
      {
        value: w.power ? "電網供電正常" : "變電站停機",
        nodeId: s.facilities.find((f) => f.type === "POWER")!.nodeId,
      },
      w.power ? "電網供電正常" : "變電站停機",
      w.powerCause,
    );
  if (!forceSubject || forceSubject === "RAD")
    report(
      w,
      s,
      "RADIO-CONTROL",
      "RAD",
      "COMMS",
      {
        value: w.comms,
        nodeId: s.facilities.find((f) => f.type === "COMMS")!.nodeId,
      },
      w.comms,
      w.commsCause,
    );
  for (const r of w.roads.filter((r) =>
    forceSubject ? r.id === forceSubject : !!r.cause,
  ))
    report(
      w,
      s,
      "TRAFFIC-CONTROL",
      r.id,
      "ROAD",
      { value: r.state, nodeId: r.from },
      r.state,
      r.cause,
    );
}
export function transmit(w: WorldState, s: Scenario): void {
  for (const r of w.reports) {
    if (r.status === "CREATED") {
      const rng = new SeededRandom(w.seed, w.rng, `comms:report:${r.sourceId}`);
      r.transmittedTick = w.tick;
      const probability =
        w.comms === "NORMAL"
          ? s.reportLoss
          : w.comms === "DEGRADED"
            ? s.degradedReportLoss
            : 0.5;
      if (rng.chance(probability)) {
        r.status = "LOST";
        emit(w, "REPORT_LOST", { reportId: r.id }, [
          r.createdEventId,
          w.commsCause,
        ]);
      } else {
        r.status = "IN_TRANSIT";
        emit(w, "REPORT_TRANSMITTED", { reportId: r.id }, [
          r.createdEventId,
          w.commsCause,
        ]);
      }
    }
    if (r.status === "IN_TRANSIT" && r.deliveryTick <= w.tick) {
      r.status = "RECEIVED";
      r.receivedTick = w.tick;
      r.truthRef.receivedValue = factAtReceipt(w, r);
      emit(
        w,
        "REPORT_RECEIVED",
        { reportId: r.id, latency: w.tick - r.observedTick },
        [r.createdEventId, w.commsCause],
      );
    }
    // Retain received reports for knowledge/history even after expiry; staleness is a belief flag.
    if (r.status === "IN_TRANSIT" && w.tick > r.expiry + 300)
      r.status = "EXPIRED";
  }
}
function factAtReceipt(w: WorldState, r: IntelReport): string {
  if (r.subjectKind === "FLOOD")
    return floodDescription(
      w.flood!.zones.find((z) => z.id === r.subjectId)!.waterDepth,
    );
  if (r.subjectKind === "UNIT")
    return w.units.find((u) => u.id === r.subjectId)!.state;
  if (r.subjectKind === "HOSPITAL") {
    const h = w.hospitals.find((h) => h.id === r.subjectId)!;
    return h.power
      ? "市電正常"
      : h.generator === "OPERATIONAL"
        ? "備用發電機運轉中"
        : "停電・發電機失效";
  }
  if (r.subjectKind === "POWER") return w.power ? "電網供電正常" : "變電站停機";
  if (r.subjectKind === "COMMS") return w.comms;
  if (r.subjectKind === "ROAD")
    return w.roads.find((road) => road.id === r.subjectId)!.state;
  const i = w.incidents.find((i) => i.id === r.subjectId)!;
  return i.status === "ACTIVE"
    ? i.severity > 70
      ? "危急"
      : i.severity > 40
        ? "嚴重"
        : "中度"
    : i.status === "STABILIZED"
      ? "已穩定"
      : "已解除";
}
export function projectView(w: WorldState, s: Scenario): CommandCenterView {
  const received = w.reports.filter((r) => r.status === "RECEIVED");
  const beliefs: Belief[] = [];
  for (const subjectId of [
    ...new Set(received.map((r) => r.subjectId)),
  ].sort()) {
    const reports = received
      .filter((r) => r.subjectId === subjectId)
      .sort(
        (a, b) =>
          b.observedTick - a.observedTick ||
          b.receivedTick! - a.receivedTick! ||
          b.id.localeCompare(a.id, "en"),
      );
    const last = reports[0],
      recent = reports.filter(
        (r) => Math.abs(last.observedTick - r.observedTick) <= 135,
      );
    const sources = [...new Set(recent.map((r) => r.sourceId))];
    const corroboration = [
      ...new Set(
        recent
          .filter(
            (r) =>
              r.claim.value === last.claim.value &&
              r.sourceId !== last.sourceId,
          )
          .map((r) => r.sourceId),
      ),
    ];
    const conflicts = recent
      .filter((r) => r.claim.value !== last.claim.value)
      .map((r) => r.id);
    const age = w.tick - last.observedTick;
    beliefs.push({
      subjectId,
      kind: last.subjectKind,
      claim: structuredClone(last.claim),
      observedTick: last.observedTick,
      receivedTick: last.receivedTick!,
      age,
      confidence: Math.max(
        0.1,
        Math.min(
          0.99,
          last.observationConfidence * last.sourceReliability +
            corroboration.length * 0.08 -
            conflicts.length * 0.025 -
            Math.max(0, age - 90) / 2000,
        ),
      ),
      sources,
      corroboration,
      conflicts,
      stale: age > 150,
      reportId: last.id,
    });
  }
  const reports: PublicReport[] = received.map((r) => ({
    id: r.id,
    sourceId: r.sourceId,
    subjectId: r.subjectId,
    subjectKind: r.subjectKind,
    claim: structuredClone(r.claim),
    observedTick: r.observedTick,
    transmittedTick: r.transmittedTick,
    receivedTick: r.receivedTick,
    expiry: r.expiry,
    sourceReliability: r.sourceReliability,
    observationConfidence: r.observationConfidence,
    status: "RECEIVED",
  }));
  return {
    tick: w.tick,
    seed: w.seed,
    completed: w.completed,
    completionReason: w.completionReason,
    reports,
    beliefs,
    units: s.units.map((u) => ({
      id: u.id,
      agency: u.agency,
      type: u.type,
      homeId: u.homeId,
      capabilities: [...u.capabilities],
      belief: beliefs.find((b) => b.subjectId === u.id),
    })),
    commands: w.commands.map((c) => ({
      id: c.id,
      issueTick: c.issueTick,
      type: c.type,
      target: c.target,
      incidentId: c.incidentId,
      deliveryStatus: c.deliveryStatus,
      executionStatus: c.executionStatus,
      acknowledgementTick: c.acknowledgementTick,
      failure: c.failure,
    })),
    city: {
      ...(s.flood
        ? {
            floodZones: s.flood.zones.map((z) => ({
              id: z.id,
              nodeIds: [...z.nodeIds],
            })),
          }
        : {}),
      nodes: structuredClone(s.nodes),
      districts: structuredClone(s.districts),
      facilities: structuredClone(s.facilities),
      roads: s.roads.map((r) => ({ id: r.id, from: r.from, to: r.to })),
      hospitals: s.hospitals.map((h) => ({
        id: h.id,
        nodeId: h.nodeId,
        capacity: h.capacity,
        emergencyCapacity: h.emergencyCapacity,
      })),
    },
  };
}
