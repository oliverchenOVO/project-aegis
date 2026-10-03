import type { WorldState, Scenario, Incident } from "../../domain/src/index";
import { emit } from "./events";
import { SeededRandom } from "./random";
import { attachPatientPopulation } from "./civilians";
export function createIncident(
  w: WorldState,
  type: Incident["type"],
  nodeId: string,
  severity: number,
  injuries: number,
  cause: string,
): Incident {
  const id = `INC-${++w.counters.incident}`;
  const event = emit(w, "INCIDENT_CREATED", { incidentId: id, type, nodeId }, [
    cause,
  ]);
  const required: Incident["required"] =
    type === "FIRE"
      ? ["FIRE", "EMS"]
      : type === "BUILDING_COLLAPSE"
        ? ["FIRE", "EMS", "POLICE"]
        : type === "MASS_CASUALTY"
          ? ["EMS"]
          : type === "FLOOD" || type === "STRANDED_CIVILIANS"
            ? ["FIRE", "EMS", "POLICE", "UTILITY"]
            : type === "ROAD_BLOCKAGE"
              ? ["POLICE"]
              : ["UTILITY"];
  const incident: Incident = {
    id,
    type,
    nodeId,
    severity,
    status: "ACTIVE",
    creationTick: w.tick,
    cause: event,
    required,
    affectedEntities: [],
    hazard: severity,
    priority: 2,
    work: 0,
  };
  w.incidents.push(incident);
  for (let i = 0; i < injuries; i++) {
    const p = {
      id: `PAT-${w.patients.length + 1}`,
      incidentId: id,
      state: "WAITING" as const,
      health: 70 + (i % 25),
      critical: i % 3 === 0,
      count: 1,
      civilianCohortId: undefined as string | undefined,
      cause: event,
    };
    w.patients.push(p);
    attachPatientPopulation(w, nodeId, p);
    incident.affectedEntities.push(p.id);
  }
  if (type === "FIRE") emit(w, "FIRE_STARTED", { incidentId: id }, [event]);
  if (type === "BUILDING_COLLAPSE")
    emit(w, "BUILDING_COLLAPSED", { incidentId: id }, [event]);
  return incident;
}
export function initializeDisaster(w: WorldState, s: Scenario): void {
  const cause = emit(w, "EARTHQUAKE_OCCURRED", {
    scenario: s.id,
    magnitude: 6.8,
  });
  const rng = new SeededRandom(w.seed, w.rng, "earthquake");
  for (const site of s.hazardSites)
    if (rng.chance(site.chance))
      createIncident(
        w,
        site.type,
        site.nodeId,
        Math.min(100, site.severity + rng.integer(-8, 8)),
        site.injuries + rng.integer(0, 3),
        cause,
      );
  const road = rng.choose(
    w.roads.filter((r) => r.from === "N9" || r.to === "N9"),
  );
  road.state = "BLOCKED";
  road.cause = emit(w, "ROAD_BLOCKED", { roadId: road.id }, [cause]);
  createIncident(
    w,
    "ROAD_BLOCKAGE",
    road.from,
    45,
    0,
    road.cause,
  ).affectedEntities.push(road.id);
  w.schedule.push(
    {
      tick: s.powerFailureTick + rng.integer(-8, 8),
      kind: "POWER_DAMAGE",
      target: "PWR",
      cause,
    },
    { tick: s.radioFailureTick, kind: "RADIO_DAMAGE", target: "RAD", cause },
    {
      tick: s.aftershockTick + rng.integer(-10, 10),
      kind: "AFTERSHOCK",
      target: "CITY",
      cause,
    },
  );
}
export function scheduledEvents(w: WorldState, s: Scenario): void {
  const due = w.schedule.filter((e) => e.tick <= w.tick);
  w.schedule = w.schedule.filter((e) => e.tick > w.tick);
  for (const e of due) {
    if (e.kind === "POWER_DAMAGE") {
      w.power = false;
      w.powerCause = emit(w, "POWER_NODE_FAILED", { nodeId: e.target }, [
        e.cause,
      ]);
      createIncident(
        w,
        "POWER_FAILURE",
        s.facilities.find((f) => f.type === "POWER")!.nodeId,
        78,
        0,
        w.powerCause,
      );
      for (const h of w.hospitals) {
        h.power = false;
        h.cause = w.powerCause;
      }
    } else if (e.kind === "RADIO_DAMAGE") {
      w.comms = "DEGRADED";
      w.commsCause = emit(w, "COMMUNICATION_DEGRADED", { nodeId: e.target }, [
        e.cause,
      ]);
      createIncident(
        w,
        "COMMUNICATION_FAILURE",
        s.facilities.find((f) => f.type === "COMMS")!.nodeId,
        60,
        0,
        w.commsCause,
      );
    } else if (e.kind === "AFTERSHOCK") {
      const cause = emit(
        w,
        "EARTHQUAKE_OCCURRED",
        { magnitude: 4.5, aftershock: true },
        [e.cause],
      );
      const rng = new SeededRandom(w.seed, w.rng, "aftershock");
      const r = rng.choose(w.roads.filter((r) => r.state !== "BLOCKED"));
      r.state = "BLOCKED";
      r.cause = emit(w, "ROAD_BLOCKED", { roadId: r.id }, [cause]);
      createIncident(
        w,
        "ROAD_BLOCKAGE",
        r.from,
        40,
        0,
        r.cause,
      ).affectedEntities.push(r.id);
      for (const i of w.incidents.filter(
        (i) => i.status === "ACTIVE" && i.type === "FIRE",
      )) {
        i.severity = Math.min(100, i.severity + 6);
        i.hazard = i.severity;
      }
    }
  }
}
export function hazards(w: WorldState): void {
  for (const i of w.incidents) {
    if (i.status === "RESOLVED") continue;
    const responders = w.units.filter(
      (u) => u.assignment === i.id && u.state === "OPERATING",
    );
    const fire = responders.filter((u) => u.agency === "FIRE").length;
    const service = responders.filter(
      (u) => i.required.includes(u.agency) && u.agency !== "EMS",
    ).length;
    if (i.type === "FIRE" && i.status === "ACTIVE") {
      i.severity = Math.max(
        0,
        Math.min(100, i.severity + (fire ? -0.15 * fire : 0.014)),
      );
      i.hazard = i.severity;
      if (
        w.tick % 180 === 0 &&
        i.severity > 85 &&
        w.incidents.filter((n) => n.type === "FIRE").length < 7
      ) {
        const rng = new SeededRandom(w.seed, w.rng, `fire:${i.id}`);
        if (rng.chance(0.3)) {
          const adjacent = w.roads
            .filter((r) => r.from === i.nodeId || r.to === i.nodeId)
            .map((r) => (r.from === i.nodeId ? r.to : r.from))
            .sort();
          const node = rng.choose(adjacent);
          if (
            !w.incidents.some((n) => n.nodeId === node && n.type === "FIRE")
          ) {
            const cause = emit(
              w,
              "FIRE_SPREAD",
              { fromIncident: i.id, nodeId: node },
              [i.cause],
            );
            createIncident(w, "FIRE", node, 50, 2, cause);
          }
        }
      }
      if (i.severity < 25)
        stabilize(
          w,
          i,
          responders.map((u) => u.missionCause),
        );
    } else if (service && i.status === "ACTIVE") {
      i.work += service;
      if (i.work >= (i.type === "BUILDING_COLLAPSE" ? 240 : 120))
        stabilize(
          w,
          i,
          responders.map((u) => u.missionCause),
        );
    }
    if (
      i.type === "MASS_CASUALTY" &&
      !w.patients.some((p) => p.incidentId === i.id && p.state === "WAITING")
    )
      stabilize(
        w,
        i,
        responders.map((u) => u.missionCause),
      );
    if (
      i.status === "STABILIZED" &&
      !w.patients.some(
        (p) =>
          p.incidentId === i.id &&
          (p.state === "WAITING" || p.state === "IN_TRANSIT"),
      )
    ) {
      i.status = "RESOLVED";
      i.hazard = 0;
      i.cause = emit(w, "INCIDENT_RESOLVED", { incidentId: i.id }, [i.cause]);
    }
  }
}
function stabilize(
  w: WorldState,
  i: Incident,
  causes: (string | undefined)[],
): void {
  if (i.status !== "ACTIVE") return;
  i.status = "STABILIZED";
  i.hazard = 0;
  i.cause = emit(w, "INCIDENT_STABILIZED", { incidentId: i.id }, [
    i.cause,
    ...causes,
  ]);
  if (i.type === "POWER_FAILURE") {
    w.power = true;
    w.powerCause = emit(w, "POWER_RESTORED", { incidentId: i.id }, [i.cause]);
    for (const h of w.hospitals) {
      h.power = true;
      h.cause = w.powerCause;
    }
  }
  if (i.type === "COMMUNICATION_FAILURE") {
    w.comms = "NORMAL";
    w.commsCause = emit(w, "COMMUNICATION_RESTORED", { incidentId: i.id }, [
      i.cause,
    ]);
  }
  if (i.type === "ROAD_BLOCKAGE")
    for (const r of w.roads.filter((r) => i.affectedEntities.includes(r.id))) {
      r.state = "NORMAL";
      r.cause = emit(w, "ROAD_CLEARED", { roadId: r.id }, [i.cause]);
    }
}
