import type { WorldState } from "../../domain/src/index";
import { emit } from "./events";
import { baselineFatality } from "./civilians";
import { clinicalEnabled, updateHospital } from "./hospital";
export function infrastructure(w: WorldState): void {
  for (const h of w.hospitals) {
    if (!h.power && h.generator === "OPERATIONAL") {
      h.fuel = Math.max(0, h.fuel - 1);
      if (h.fuel === 0) {
        h.generator = "FAILED";
        h.cause = emit(w, "GENERATOR_FAILED", { hospitalId: h.id }, [h.cause]);
      }
    }
    h.currentPatients =
      h.baselinePatients +
      w.patients
        .filter(
          (p) =>
            p.hospitalId === h.id &&
            (p.state === "ADMITTED" ||
              (h.edCapacity !== undefined &&
                ["QUEUED", "IN_TRANSIT"].includes(p.state))),
        )
        .reduce((n, p) => n + (p.count ?? 1), 0);
    if (
      h.currentPatients > h.capacity + h.emergencyCapacity &&
      !h.overloadReported
    ) {
      h.overloadReported = true;
      emit(
        w,
        "HOSPITAL_OVER_CAPACITY",
        { hospitalId: h.id, load: h.currentPatients },
        [
          h.cause,
          ...w.patients
            .filter((p) => p.hospitalId === h.id)
            .map((p) => p.cause),
        ],
      );
    }
    if (
      !h.power &&
      h.generator === "FAILED" &&
      h.criticalPatients > 0 &&
      w.tick % 100 === 0
    ) {
      h.criticalPatients--;
      h.baselinePatients--;
      h.currentPatients--;
      const cause = emit(
        w,
        "PATIENT_DIED",
        { hospitalId: h.id, baseline: true, count: 1 },
        [h.cause],
      );
      baselineFatality(w, h.id, cause);
    }
  }
  updateHospital(w);
  if (!w.power && w.tick % 240 === 0 && w.comms === "DEGRADED") {
    w.comms = "OFFLINE";
    w.commsCause = emit(w, "COMMUNICATION_DEGRADED", { status: "OFFLINE" }, [
      w.powerCause,
      w.commsCause,
    ]);
  }
  for (const u of w.units) u.communicationStatus = w.comms;
}
export function medical(w: WorldState): void {
  if (clinicalEnabled(w)) {
    clinicalMedical(w);
    return;
  }
  for (const p of w.patients) {
    if (p.state === "DEAD" || p.state === "RECOVERED") continue;
    const i = w.incidents.find((i) => i.id === p.incidentId)!;
    if (p.state === "WAITING") {
      const care = w.units.some(
        (u) =>
          u.assignment === i.id &&
          u.state === "OPERATING" &&
          u.agency === "EMS",
      );
      p.health = Math.max(
        0,
        p.health -
          (p.critical ? 0.065 : 0.022) *
            (care ? 0.3 : 1) *
            (i.status === "ACTIVE" ? 1 + i.hazard / 100 : 0.7),
      );
    } else if (p.state === "IN_TRANSIT")
      p.health = Math.max(0, p.health - (p.critical ? 0.025 : 0.008));
    else if (p.state === "ADMITTED") {
      const h = w.hospitals.find((h) => h.id === p.hospitalId)!;
      const powered = h.power || h.generator === "OPERATIONAL";
      const overloaded = h.currentPatients > h.capacity + h.emergencyCapacity;
      p.health = Math.max(
        0,
        Math.min(100, p.health + (powered && !overloaded ? 0.11 : -0.08)),
      );
      if (p.health >= 100) p.state = "RECOVERED";
    }
    if (p.health === 0) {
      p.state = "DEAD";
      const unit = w.units.find((u) => u.id === p.unitId);
      if (unit) unit.patients = unit.patients.filter((id) => id !== p.id);
      const h = w.hospitals.find((h) => h.id === p.hospitalId);
      p.cause = emit(
        w,
        "PATIENT_DIED",
        { patientId: p.id, incidentId: i.id, count: p.count ?? 1 },
        [p.cause, i.cause, h?.cause, unit?.missionCause],
      );
    }
  }
}
function clinicalMedical(w: WorldState): void {
  for (const p of w.patients) {
    if (p.state === "DEAD" || p.state === "RECOVERED") continue;
    const incident = w.incidents.find((i) => i.id === p.incidentId)!;
    const hospital = w.hospitals.find((h) => h.id === p.hospitalId);
    const unit = w.units.find((u) => u.id === p.unitId);
    p.triage ??= p.critical ? "IMMEDIATE" : "DELAYED";
    p.outcome ??= "UNRESOLVED";
    p.transportNeed ??= p.state === "WAITING";
    p.location = hospital?.nodeId ?? unit?.nodeId ?? incident.nodeId;
    const powered =
      !!hospital && (hospital.power || hospital.generator === "OPERATIONAL");
    const stressCause =
      hospital &&
      (!powered || (p.state === "QUEUED" && hospital.status === "DIVERTING"))
        ? hospital.statusCause
        : undefined;
    const care = w.units.some(
      (u) =>
        u.assignment === incident.id &&
        u.state === "OPERATING" &&
        u.agency === "EMS",
    );
    if (p.state === "WAITING") {
      p.treatmentState = care ? "FIELD" : "UNTREATED";
      p.health = Math.max(
        0,
        p.health -
          (p.critical ? 0.065 : 0.022) *
            (care ? 0.3 : 1) *
            (incident.status === "ACTIVE" ? 1 + incident.hazard / 100 : 0.7),
      );
    } else if (p.state === "IN_TRANSIT")
      p.health = Math.max(0, p.health - (p.critical ? 0.025 : 0.008));
    else if (p.state === "QUEUED")
      p.health = Math.max(
        0,
        p.health -
          (p.critical ? 0.04 : 0.015) *
            (powered ? 1 : 2) *
            (hospital?.status === "DIVERTING" ? 1.5 : 1),
      );
    else if (p.state === "ADMITTED")
      p.health = Math.min(
        100,
        Math.max(
          0,
          p.health +
            (powered ? 0.18 * (hospital?.staffEffectiveness ?? 1) : -0.08),
        ),
      );
    p.deteriorationTimer =
      (p.deteriorationTimer ?? 0) + (p.state === "ADMITTED" ? 0 : 1);
    if (
      p.state === "WAITING" &&
      p.deteriorationTimer >= 120 &&
      !p.delayedReported
    ) {
      p.delayedReported = true;
      p.cause = emit(
        w,
        "TRANSPORT_DELAYED",
        { patientId: p.id, reason: "AWAITING_TRANSPORT" },
        [p.cause],
      );
    }
    const next =
      p.health < 25 ? "EXPECTANT" : p.health < 50 ? "IMMEDIATE" : p.triage;
    if (next !== p.triage) {
      const previous = p.triage;
      p.triage = next;
      p.critical = true;
      p.cause = emit(
        w,
        "PATIENT_DETERIORATED",
        { patientId: p.id, previous, triage: next, count: p.count ?? 1 },
        [p.cause, hospital?.cause, stressCause, unit?.missionCause],
      );
      if (
        p.state === "ADMITTED" &&
        hospital &&
        previous !== "IMMEDIATE" &&
        previous !== "EXPECTANT"
      ) {
        const occupied =
          hospital.criticalPatients +
          w.patients
            .filter(
              (other) =>
                other.id !== p.id &&
                other.hospitalId === hospital.id &&
                other.state === "ADMITTED" &&
                other.critical,
            )
            .reduce((n, other) => n + (other.count ?? 1), 0);
        if (
          occupied + (p.count ?? 1) >
          (hospital.icuCapacity ?? hospital.capacity)
        ) {
          p.state = "QUEUED";
          p.treatmentState = "QUEUED";
          hospital.patientQueue!.push(p.id);
          p.cause = emit(
            w,
            "PATIENT_QUEUED",
            {
              patientId: p.id,
              hospitalId: hospital.id,
              reason: "AWAITING_ICU",
              count: p.count ?? 1,
            },
            [p.cause, hospital.cause],
          );
        }
      }
    }
    if (p.health >= 100) {
      p.state = "RECOVERED";
      p.outcome = "RECOVERED";
      p.treatmentState = "COMPLETED";
      p.transportNeed = false;
      p.cause = emit(
        w,
        "PATIENT_RECOVERED",
        { patientId: p.id, hospitalId: p.hospitalId!, count: p.count ?? 1 },
        [p.cause, hospital?.cause],
      );
    }
    if (p.health === 0) {
      p.state = "DEAD";
      p.outcome = "DECEASED";
      p.treatmentState = "PALLIATIVE";
      p.transportNeed = false;
      if (unit) unit.patients = unit.patients.filter((id) => id !== p.id);
      if (hospital)
        hospital.patientQueue = hospital.patientQueue?.filter(
          (id) => id !== p.id,
        );
      p.cause = emit(
        w,
        "PATIENT_DIED",
        { patientId: p.id, incidentId: incident.id, count: p.count ?? 1 },
        [
          p.cause,
          incident.cause,
          hospital?.cause,
          stressCause,
          unit?.missionCause,
        ],
      );
    }
  }
}
