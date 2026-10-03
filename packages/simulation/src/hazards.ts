import type { WorldState, Scenario } from "../../domain/src/index";
import {
  initializeDisaster,
  scheduledEvents,
  hazards as incidentEffects,
  createIncident,
} from "./disasters";
import { emit } from "./events";
import { SeededRandom } from "./random";
export interface HazardEffect {
  kind: "ROAD" | "BUILDING" | "POWER";
  subjectId: string;
  cause: string;
}
export interface HazardSystem {
  kind: "EARTHQUAKE" | "FLOOD";
  initialize(w: WorldState, s: Scenario): void;
  step(w: WorldState, s: Scenario): void;
}
const earthquakeSystem: HazardSystem = {
  kind: "EARTHQUAKE",
  initialize: initializeDisaster,
  step: scheduledEvents,
};
const floodSystem: HazardSystem = {
  kind: "FLOOD",
  initialize(w, s) {
    if (!s.flood) throw new Error("Flood scenario missing hydrology");
    const rainCause = emit(w, "RAIN_STARTED", {
      intensity: s.flood.rainfallIntensity,
    });
    w.flood = {
      zones: structuredClone(s.flood.zones),
      rainfallIntensity: s.flood.rainfallIntensity,
      rainCause,
      buildingImpacts: [],
      rainEnded: false,
    };
    const rng = new SeededRandom(w.seed, w.rng, "flood:initial");
    for (const zone of w.flood.zones) zone.inflow *= 0.85 + rng.next() * 0.3;
    for (const [index, zone] of w.flood.zones.entries())
      createIncident(
        w,
        "STRANDED_CIVILIANS",
        zone.nodeIds[index % zone.nodeIds.length],
        45 + rng.integer(0, 15),
        4 + rng.integer(0, 4),
        rainCause,
      );
  },
  step(w, s) {
    const config = s.flood!,
      flood = w.flood!;
    if (w.tick > s.flood!.rainfallDuration && !flood.rainEnded) {
      flood.rainEnded = true;
      flood.rainfallIntensity = 0;
      emit(w, "RAIN_ENDED", {}, [flood.rainCause]);
    }
    if (w.tick % config.updateInterval !== 0) return;
    const previous = structuredClone(flood.zones),
      delta = new Map(
        previous.map((z) => [
          z.id,
          z.inflow * flood.rainfallIntensity - z.outflow - z.drainageCapacity,
        ]),
      );
    for (const zone of previous) {
      for (const adjacentId of zone.adjacency.filter((id) => id > zone.id)) {
        const adjacent = previous.find((z) => z.id === adjacentId);
        if (!adjacent) throw new Error("Unknown flood adjacency");
        const head =
          zone.elevation +
          zone.waterDepth -
          adjacent.elevation -
          adjacent.waterDepth;
        const from = head > 0 ? zone : adjacent,
          to = head > 0 ? adjacent : zone;
        const flow = Math.min(from.waterDepth * 0.12, Math.abs(head) * 0.035);
        delta.set(from.id, delta.get(from.id)! - flow);
        delta.set(to.id, delta.get(to.id)! + flow);
      }
    }
    for (const zone of flood.zones) {
      const before = zone.waterDepth,
        pumps = w.units.filter(
          (u) =>
            u.agency === "UTILITY" &&
            u.state === "OPERATING" &&
            zone.nodeIds.includes(u.nodeId),
        ).length;
      zone.waterDepth = Math.max(
        0,
        Math.min(5, before + delta.get(zone.id)! - pumps * 0.09),
      );
      if (Math.abs(zone.waterDepth - before) < 0.001) continue;
      const cause = emit(
        w,
        zone.waterDepth > before ? "FLOOD_ZONE_RISE" : "FLOOD_ZONE_RECEDING",
        { zoneId: zone.id, depth: zone.waterDepth, previousDepth: before },
        [
          flood.rainCause,
          ...w.units
            .filter(
              (u) =>
                u.agency === "UTILITY" &&
                u.state === "OPERATING" &&
                zone.nodeIds.includes(u.nodeId),
            )
            .map((u) => u.missionCause),
        ],
      );
      zone.cause = cause;
      for (const road of w.roads.filter((r) => zone.roadIds.includes(r.id))) {
        road.waterDepth = Math.max(
          0,
          zone.waterDepth - (road.floodElevation ?? 0),
        );
        const next =
          road.waterDepth >= config.impassableDepth
            ? "IMPASSABLE"
            : road.waterDepth >= config.degradedDepth
              ? "DEGRADED"
              : "NORMAL";
        if (road.state === next) continue;
        road.state = next;
        road.cause = emit(
          w,
          next === "IMPASSABLE"
            ? "ROAD_BLOCKED"
            : next === "DEGRADED"
              ? "ROAD_DEGRADED"
              : "ROAD_CLEARED",
          { roadId: road.id, state: next },
          [cause],
        );
        if (
          next === "IMPASSABLE" &&
          !w.incidents.some(
            (i) =>
              i.type === "ROAD_BLOCKAGE" &&
              i.affectedEntities.includes(road.id) &&
              i.status !== "RESOLVED",
          )
        )
          createIncident(
            w,
            "ROAD_BLOCKAGE",
            road.from,
            50,
            0,
            road.cause,
          ).affectedEntities.push(road.id);
      }
      if (zone.waterDepth >= config.buildingDepth) {
        for (const nodeId of zone.nodeIds.filter(
          (id) => !flood.buildingImpacts.includes(id),
        )) {
          flood.buildingImpacts.push(nodeId);
          const building = emit(
            w,
            "BUILDING_FLOODED",
            { nodeId, zoneId: zone.id },
            [cause],
          );
          createIncident(
            w,
            "FLOOD",
            nodeId,
            Math.min(95, zone.waterDepth * 50),
            0,
            building,
          );
        }
      }
      const substation = s.facilities.find((f) => f.type === "POWER")!;
      if (
        zone.nodeIds.includes(substation.nodeId) &&
        zone.waterDepth >= config.powerDepth &&
        w.power
      ) {
        w.power = false;
        w.powerCause = emit(w, "POWER_NODE_FAILED", { nodeId: substation.id }, [
          cause,
        ]);
        createIncident(
          w,
          "POWER_FAILURE",
          substation.nodeId,
          80,
          0,
          w.powerCause,
        );
        for (const hospital of w.hospitals) {
          hospital.power = false;
          hospital.cause = w.powerCause;
        }
        w.comms = "DEGRADED";
        w.commsCause = emit(w, "COMMUNICATION_DEGRADED", { nodeId: "RAD" }, [
          w.powerCause,
        ]);
        createIncident(
          w,
          "COMMUNICATION_FAILURE",
          s.facilities.find((f) => f.type === "COMMS")!.nodeId,
          70,
          0,
          w.commsCause,
        );
      }
    }
  },
};
export const hazardSystems: Readonly<
  Record<"EARTHQUAKE" | "FLOOD", HazardSystem>
> = { EARTHQUAKE: earthquakeSystem, FLOOD: floodSystem };
export function updateHazards(w: WorldState, s: Scenario): void {
  const system = hazardSystems[s.hazardKind ?? "EARTHQUAKE"];
  if (w.tick === 1) system.initialize(w, s);
  system.step(w, s);
  incidentEffects(w);
}
