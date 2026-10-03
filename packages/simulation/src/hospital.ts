import type { WorldState, Unit } from "../../domain/src/index";
import { emit } from "./events";
import { splitCohort } from "./civilians";
export function clinicalEnabled(w: WorldState): boolean {
  return w.hospitals.some((h) => h.edCapacity !== undefined);
}
export function refreshHospitalCensus(w: WorldState): void {
  for (const h of w.hospitals)
    if (h.edCapacity !== undefined)
      h.currentPatients =
        h.baselinePatients +
        w.patients
          .filter(
            (p) =>
              p.hospitalId === h.id &&
              ["IN_TRANSIT", "QUEUED", "ADMITTED"].includes(p.state),
          )
          .reduce((n, p) => n + (p.count ?? 1), 0);
}
export function splitPatient(
  w: WorldState,
  patient: WorldState["patients"][number],
  count: number,
): WorldState["patients"][number] {
  if (!Number.isInteger(count) || count < 1 || count >= (patient.count ?? 1))
    throw new Error("Invalid patient split");
  const child = {
    ...structuredClone(patient),
    id: `PAT-${w.patients.length + 1}`,
    count,
  };
  patient.count = (patient.count ?? 1) - count;
  if (patient.civilianCohortId) {
    const cohort = w.cohorts!.find((c) => c.id === patient.civilianCohortId)!;
    const civilian = splitCohort(w, cohort, count);
    child.civilianCohortId = civilian.id;
  }
  child.cause = emit(
    w,
    "PATIENT_COHORT_SPLIT",
    { patientId: child.id, parentId: patient.id, count },
    [patient.cause],
  );
  w.patients.push(child);
  return child;
}
export function updateHospital(w: WorldState): void {
  for (const h of w.hospitals) {
    if (h.edCapacity === undefined) continue;
    h.patientQueue ??= [];
    h.patientQueue = h.patientQueue.filter((id) => {
      const p = w.patients.find((p) => p.id === id);
      return p?.state === "QUEUED" && p.hospitalId === h.id;
    });
    const patients = w.patients.filter(
      (p) =>
        p.hospitalId === h.id &&
        ["IN_TRANSIT", "QUEUED", "ADMITTED"].includes(p.state),
    );
    h.currentPatients =
      h.baselinePatients + patients.reduce((n, p) => n + (p.count ?? 1), 0);
    const queue = patients
        .filter((p) => p.state !== "ADMITTED")
        .reduce((n, p) => n + (p.count ?? 1), 0),
      load = h.currentPatients / (h.capacity + h.emergencyCapacity),
      powered = h.power || h.generator === "OPERATIONAL";
    const status = !powered
      ? "POWER_EMERGENCY"
      : queue > h.edCapacity * 1.5
        ? "DIVERTING"
        : load > 1
          ? "OVER_CAPACITY"
          : load > 0.85 || queue > h.edCapacity * 0.5
            ? "STRAINED"
            : "NORMAL";
    if (status !== h.status) {
      h.status = status;
      h.statusCause = emit(
        w,
        "HOSPITAL_STATUS_CHANGED",
        { hospitalId: h.id, status, queue, load: h.currentPatients },
        [
          h.cause,
          h.statusCause,
          ...patients.filter((p) => p.state === "QUEUED").map((p) => p.cause),
        ],
      );
    }
    if (["OVER_CAPACITY", "DIVERTING"].includes(status))
      h.overloadTicks = (h.overloadTicks ?? 0) + 1;
    if (status === "POWER_EMERGENCY")
      h.powerEmergencyTicks = (h.powerEmergencyTicks ?? 0) + 1;
    h.throughputCredit = Math.min(
      4,
      (h.throughputCredit ?? 0) +
        (h.treatmentThroughput ?? 0.06) *
          (h.staffEffectiveness ?? 1) *
          (powered ? 1 : 0.2),
    );
    const order = { IMMEDIATE: 0, DELAYED: 1, MINOR: 2, EXPECTANT: 3 },
      queuePatients = h.patientQueue
        .map((id) => w.patients.find((p) => p.id === id)!)
        .sort(
          (a, b) =>
            order[a.triage ?? "DELAYED"] - order[b.triage ?? "DELAYED"] ||
            a.health - b.health ||
            a.id.localeCompare(b.id, "en"),
        );
    for (let patient of queuePatients) {
      const admitted = w.patients.filter(
          (p) => p.hospitalId === h.id && p.state === "ADMITTED",
        ),
        critical =
          h.criticalPatients +
          admitted
            .filter((p) => p.triage === "IMMEDIATE" || p.triage === "EXPECTANT")
            .reduce((n, p) => n + (p.count ?? 1), 0),
        trauma = admitted
          .filter((p) => p.triage === "DELAYED")
          .reduce((n, p) => n + (p.count ?? 1), 0);
      const beds = Math.max(
        0,
        h.capacity +
          h.emergencyCapacity -
          h.baselinePatients -
          admitted.reduce((n, p) => n + (p.count ?? 1), 0),
      );
      const specialty = patient.critical
        ? Math.max(0, (h.icuCapacity ?? h.capacity) - critical)
        : patient.triage === "DELAYED"
          ? Math.max(0, (h.traumaCapacity ?? h.capacity) - trauma)
          : beds;
      const count = Math.min(
        patient.count ?? 1,
        beds,
        specialty,
        Math.floor(h.throughputCredit),
      );
      if (count <= 0) continue;
      if (count < (patient.count ?? 1))
        patient = splitPatient(w, patient, count);
      patient.state = "ADMITTED";
      patient.treatmentState = "IN_TREATMENT";
      patient.transportNeed = false;
      patient.cause = emit(
        w,
        "PATIENT_TREATMENT_STARTED",
        { patientId: patient.id, hospitalId: h.id, count },
        [patient.cause, h.cause],
      );
      emit(
        w,
        "PATIENT_ADMITTED",
        { patientId: patient.id, hospitalId: h.id, count },
        [patient.cause],
      );
      h.throughputCredit -= count;
    }
    h.patientQueue = h.patientQueue.filter(
      (id) => w.patients.find((p) => p.id === id)?.state === "QUEUED",
    );
  }
}
export function beginHandover(w: WorldState, u: Unit): void {
  const h = w.hospitals.find((h) => h.id === u.destinationHospital)!;
  const queue = (h.patientQueue ?? []).reduce(
      (n, id) => n + (w.patients.find((p) => p.id === id)?.count ?? 1),
      0,
    ),
    severity = u.patients.reduce((n, id) => {
      const patient = w.patients.find((p) => p.id === id)!;
      return n + (patient.critical ? (patient.count ?? 1) : 0);
    }, 0);
  u.state = "HANDOVER";
  u.handoverUntil =
    w.tick +
    Math.min(
      240,
      20 +
        queue * 6 +
        severity * 10 +
        (["OVER_CAPACITY", "DIVERTING", "POWER_EMERGENCY"].includes(
          h.status ?? "NORMAL",
        )
          ? 60
          : 0),
    );
  const cause = emit(
    w,
    "AMBULANCE_HANDOVER_STARTED",
    { unitId: u.id, hospitalId: h.id, until: u.handoverUntil },
    [
      u.missionCause,
      h.cause,
      ["OVER_CAPACITY", "DIVERTING", "POWER_EMERGENCY"].includes(
        h.status ?? "NORMAL",
      )
        ? h.statusCause
        : undefined,
      ...u.patients.map((id) => w.patients.find((p) => p.id === id)?.cause),
    ],
  );
  u.handoverCause = cause;
  for (const id of u.patients) {
    const p = w.patients.find((p) => p.id === id)!;
    p.hospitalId = h.id;
    p.treatmentState = "HANDOVER";
    p.cause = cause;
  }
}
export function completeHandover(w: WorldState, u: Unit): void {
  const h = w.hospitals.find((h) => h.id === u.destinationHospital)!;
  const cause = emit(
    w,
    "AMBULANCE_HANDOVER_COMPLETED",
    { unitId: u.id, hospitalId: h.id },
    [
      u.handoverCause,
      ...u.patients.map((id) => w.patients.find((p) => p.id === id)?.cause),
      h.cause,
    ],
  );
  h.patientQueue ??= [];
  for (const id of u.patients) {
    const p = w.patients.find((p) => p.id === id)!;
    if (p.state === "DEAD") continue;
    p.state = "QUEUED";
    p.treatmentState = "QUEUED";
    p.unitId = undefined;
    p.transportNeed = false;
    p.cause = emit(
      w,
      "PATIENT_QUEUED",
      { patientId: p.id, hospitalId: h.id, count: p.count ?? 1 },
      [p.cause, cause],
    );
    h.patientQueue.push(p.id);
  }
  u.patients = [];
  u.destinationHospital = undefined;
  u.handoverUntil = undefined;
  u.handoverCause = undefined;
}
