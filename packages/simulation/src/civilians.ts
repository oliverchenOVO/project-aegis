import type {
  WorldState,
  Scenario,
  CivilianCohort,
} from "../../domain/src/index";
import { emit } from "./events";
import { SeededRandom } from "./random";
import { route, edge, cost, passable } from "./routing";
export function initializeCivilians(w: WorldState, s: Scenario): void {
  if (!s.civilians) return;
  w.cohorts = [];
  w.populationSources = {};
  w.counters.cohort = 0;
  w.counters.splits = 0;
  const rng = new SeededRandom(w.seed, w.rng, "civilians:initial");
  for (let n = 0; n < s.civilians.cohortCount; n++) {
    const node = s.nodes[n % s.nodes.length],
      zone =
        s.flood?.zones.find((z) => z.nodeIds.includes(node.id))?.id ??
        node.district;
    const id = `CIV-${++w.counters.cohort}`,
      population = rng.integer(...s.civilians.populationRange);
    w.cohorts.push({
      id,
      originId: id,
      population,
      location: node.id,
      zoneId: zone,
      mobility: 0.3 + rng.next() * 0.6,
      vulnerability: 0.2 + rng.next() * 0.7,
      state: "NORMAL",
      healthState: "NORMAL",
      evacuationState: "NONE",
      exposure: 0,
      injuryStage: 0,
      route: [],
      edgeProgress: 0,
    });
    w.populationSources[id] = population;
  }
  for (const hospital of w.hospitals) {
    if (hospital.baselinePatients <= 0) continue;
    const id = `CIV-${++w.counters.cohort}`;
    w.cohorts.push({
      id,
      originId: id,
      population: hospital.baselinePatients,
      location: hospital.nodeId,
      zoneId: s.nodes.find((n) => n.id === hospital.nodeId)!.district,
      mobility: 0.3,
      vulnerability: 0.8,
      state: "TRANSPORTED",
      healthState: "INJURED",
      evacuationState: "TRANSPORTED",
      exposure: 0,
      injuryStage: 0,
      route: [],
      edgeProgress: 0,
      baselineHospital: hospital.id,
    });
    w.populationSources[id] = hospital.baselinePatients;
  }
}
export function splitCohort(
  w: WorldState,
  source: CivilianCohort,
  count: number,
): CivilianCohort {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > source.population ||
    !w.cohorts?.some((c) => c.id === source.id)
  )
    throw new Error("Invalid cohort split");
  if ((w.counters.splits ?? 0) >= 4096)
    throw new Error("Cohort split explosion guard");
  w.counters.splits = (w.counters.splits ?? 0) + 1;
  const child = {
    ...structuredClone(source),
    id: `CIV-${(w.counters.cohort = (w.counters.cohort ?? 0) + 1)}`,
    population: count,
  };
  source.population -= count;
  if (source.population === 0)
    w.cohorts = w.cohorts.filter((c) => c.id !== source.id);
  w.cohorts!.push(child);
  child.cause = emit(
    w,
    "COHORT_SPLIT",
    { parentId: source.id, cohortId: child.id, count },
    [source.cause],
  );
  return child;
}
export function attachPatientPopulation(
  w: WorldState,
  nodeId: string,
  patient: WorldState["patients"][number],
): void {
  if (!w.cohorts) return;
  const source = w.cohorts
    .filter((c) => c.location === nodeId && c.healthState === "NORMAL")
    .sort((a, b) => a.id.localeCompare(b.id, "en"))[0];
  if (!source)
    throw new Error(`No civilian population at ${nodeId} for injury`);
  const child = splitCohort(w, source, patient.count ?? 1);
  child.healthState = patient.critical ? "CRITICAL" : "INJURED";
  child.state = child.healthState;
  child.evacuationState = "NONE";
  child.route = [];
  child.cause = patient.cause;
  patient.civilianCohortId = child.id;
}
export function baselineFatality(
  w: WorldState,
  hospitalId: string,
  cause: string,
): void {
  const source = w.cohorts?.find(
    (c) => c.baselineHospital === hospitalId && c.state !== "DEAD",
  );
  if (!source) return;
  const child = splitCohort(w, source, 1);
  child.healthState = "DEAD";
  child.state = "DEAD";
  child.evacuationState = "NONE";
  child.cause = cause;
}
function startEvacuation(
  w: WorldState,
  s: Scenario,
  cohort: CivilianCohort,
  cause?: string,
): boolean {
  const choices = s
    .civilians!.shelters.map((shelter) => ({
      shelter,
      path: route(w, cohort.location, shelter.nodeId, "POLICE"),
      used: w
        .cohorts!.filter(
          (c) =>
            c.id !== cohort.id &&
            c.shelterTarget === shelter.id &&
            c.state !== "DEAD",
        )
        .reduce((n, c) => n + c.population, 0),
    }))
    .filter((c) => c.path && c.used + cohort.population <= c.shelter.capacity)
    .sort(
      (a, b) =>
        a.path!.eta - b.path!.eta ||
        a.shelter.id.localeCompare(b.shelter.id, "en"),
    );
  const choice = choices[0];
  if (!choice) {
    if (cohort.state !== "STRANDED")
      cohort.cause = emit(
        w,
        "CIVILIANS_STRANDED",
        { cohortId: cohort.id, count: cohort.population },
        [cause, cohort.cause],
      );
    cohort.state = "STRANDED";
    cohort.evacuationState = "STRANDED";
    return false;
  }
  cohort.route = choice.path!.nodes;
  cohort.shelterTarget = choice.shelter.id;
  cohort.edgeProgress = 0;
  cohort.state = "EVACUATING";
  cohort.evacuationState = "MOVING";
  cohort.cause = emit(
    w,
    "EVACUATION_STARTED",
    {
      cohortId: cohort.id,
      shelterId: choice.shelter.id,
      count: cohort.population,
    },
    [cause, cohort.cause],
  );
  return true;
}
export function evacuateZone(
  w: WorldState,
  s: Scenario,
  zoneId: string,
  cause: string,
): void {
  if (!s.civilians || !w.cohorts)
    throw new Error("Scenario has no civilian evacuation model");
  const order = emit(w, "EVACUATION_ORDERED", { zoneId }, [cause]);
  for (const cohort of w.cohorts.filter(
    (c) =>
      c.zoneId === zoneId &&
      c.healthState === "NORMAL" &&
      c.state !== "SHELTERED",
  )) {
    cohort.evacuationCause = order;
    cohort.evacuationState = "ORDERED";
    if (
      new SeededRandom(
        w.seed,
        w.rng,
        `civilian:compliance:${cohort.id}`,
      ).chance(0.65 + cohort.mobility * 0.3)
    )
      startEvacuation(w, s, cohort, order);
  }
}
export function civilianEffects(
  w: WorldState,
  s: Scenario,
  createIncident: (
    w: WorldState,
    type: WorldState["incidents"][number]["type"],
    nodeId: string,
    severity: number,
    injuries: number,
    cause: string,
  ) => WorldState["incidents"][number],
): void {
  if (!w.cohorts || !s.civilians) return;
  for (const cohort of [...w.cohorts]) {
    if (cohort.healthState !== "NORMAL" || cohort.state === "SHELTERED")
      continue;
    if (cohort.state === "EVACUATING") {
      const next = cohort.route[0];
      if (next) {
        const road = edge(w, cohort.location, next);
        if (!road || !passable(road, "POLICE")) {
          startEvacuation(w, s, cohort, road?.cause);
          continue;
        }
        cohort.edgeProgress += cohort.mobility;
        if (cohort.edgeProgress >= cost(road)) {
          cohort.location = cohort.route.shift()!;
          cohort.edgeProgress = 0;
        }
      }
      if (!cohort.route.length) {
        cohort.state = "SHELTERED";
        cohort.evacuationState = "SHELTERED";
        cohort.cause = emit(
          w,
          "CIVILIANS_SHELTERED",
          {
            cohortId: cohort.id,
            shelterId: cohort.shelterTarget!,
            count: cohort.population,
          },
          [cohort.cause],
        );
      }
      continue;
    }
    if (w.tick % 30 !== 0) continue;
    const zone = w.flood?.zones.find((z) =>
      z.nodeIds.includes(cohort.location),
    );
    const depth = zone?.waterDepth ?? 0;
    if (depth < 0.25) continue;
    cohort.exposure += Math.max(0, depth - 0.25) * cohort.vulnerability * 0.08;
    if (
      depth > 0.6 &&
      cohort.state === "NORMAL" &&
      new SeededRandom(w.seed, w.rng, `civilian:threat:${cohort.id}`).chance(
        0.15,
      )
    )
      startEvacuation(w, s, cohort, w.flood!.rainCause);
    const threshold = [0.25, 0.6, 1.1][cohort.injuryStage];
    if (threshold === undefined || cohort.exposure < threshold) continue;
    cohort.injuryStage++;
    const cause = emit(
      w,
      "CIVILIANS_EXPOSED",
      { cohortId: cohort.id, depth, exposure: cohort.exposure },
      [zone?.cause ?? w.flood?.rainCause],
    );
    const incident =
      w.incidents.find(
        (i) =>
          i.nodeId === cohort.location &&
          i.type === "FLOOD" &&
          i.status === "ACTIVE",
      ) ??
      createIncident(w, "STRANDED_CIVILIANS", cohort.location, 65, 0, cause);
    let affected = Math.min(
      cohort.population,
      Math.max(1, Math.floor(cohort.population * 0.2)),
    );
    while (affected > 0) {
      const count = Math.min(2, affected),
        critical = cohort.injuryStage > 1 || cohort.vulnerability > 0.7,
        child = splitCohort(w, cohort, count);
      child.healthState = critical ? "CRITICAL" : "INJURED";
      child.state = child.healthState;
      child.evacuationState = "NONE";
      child.shelterTarget = undefined;
      child.route = [];
      child.cause = cause;
      const patient = {
        id: `PAT-${w.patients.length + 1}`,
        incidentId: incident.id,
        state: "WAITING" as const,
        health: critical ? 50 : 80,
        critical,
        count,
        civilianCohortId: child.id,
        cause,
      };
      w.patients.push(patient);
      incident.affectedEntities.push(patient.id);
      affected -= count;
    }
  }
}
export function synchronizeCivilians(w: WorldState): void {
  if (!w.cohorts) return;
  const cohortsById = new Map(w.cohorts.map((c) => [c.id, c]));
  for (const patient of w.patients) {
    const cohort = cohortsById.get(patient.civilianCohortId ?? "");
    if (!cohort) continue;
    cohort.cause = patient.cause;
    if (patient.hospitalId)
      cohort.location = w.hospitals.find(
        (h) => h.id === patient.hospitalId,
      )!.nodeId;
    else if (patient.unitId)
      cohort.location = w.units.find((u) => u.id === patient.unitId)!.nodeId;
    if (patient.state === "DEAD") {
      cohort.state = "DEAD";
      cohort.healthState = "DEAD";
      cohort.evacuationState = "NONE";
    } else if (patient.state === "RECOVERED") {
      cohort.state = "SHELTERED";
      cohort.healthState = "NORMAL";
      cohort.evacuationState = "SHELTERED";
    } else if (patient.state === "ADMITTED") {
      cohort.state = "TRANSPORTED";
      cohort.evacuationState = "TRANSPORTED";
    } else if (patient.state === "IN_TRANSIT") {
      cohort.state = "TRANSPORT_PENDING";
    } else {
      cohort.healthState = patient.critical ? "CRITICAL" : "INJURED";
      cohort.state = cohort.healthState;
    }
  }
}
export function assertPopulation(w: WorldState): void {
  if (!w.cohorts) return;
  const cohortsById = new Map(w.cohorts.map((c) => [c.id, c]));
  const totals = new Map<string, number>();
  for (const cohort of w.cohorts) {
    if (
      cohort.population <= 0 ||
      !Number.isInteger(cohort.population) ||
      !w.populationSources?.[cohort.originId]
    )
      throw new Error("Invariant civilian population source/count");
    totals.set(
      cohort.originId,
      (totals.get(cohort.originId) ?? 0) + cohort.population,
    );
    if ((cohort.state === "DEAD") !== (cohort.healthState === "DEAD"))
      throw new Error("Invariant impossible civilian health state");
    if (
      ["NORMAL", "EVACUATING", "STRANDED", "SHELTERED"].includes(
        cohort.state,
      ) &&
      cohort.healthState !== "NORMAL"
    )
      throw new Error("Invariant civilian lifecycle/health mismatch");
    if (
      (cohort.state === "INJURED" && cohort.healthState !== "INJURED") ||
      (cohort.state === "CRITICAL" && cohort.healthState !== "CRITICAL")
    )
      throw new Error("Invariant civilian triage/health mismatch");
  }
  for (const [origin, count] of Object.entries(w.populationSources!))
    if (totals.get(origin) !== count)
      throw new Error(`Invariant civilian population conservation ${origin}`);
  for (const patient of w.patients) {
    if (!patient.civilianCohortId)
      throw new Error("Invariant patient missing civilian source");
    const cohort = cohortsById.get(patient.civilianCohortId);
    if (!cohort || cohort.population !== (patient.count ?? 1))
      throw new Error("Invariant patient/cohort count mismatch");
  }
  if (
    new Set(w.patients.map((p) => p.civilianCohortId)).size !==
    w.patients.length
  )
    throw new Error("Invariant duplicated patient cohort population");
}
