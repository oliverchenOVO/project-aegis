import { ScenarioSchema, type Scenario } from "../../domain/src/index";
import { earthquake } from "./earthquake";
import { communicationConfig } from "./communications";
const groups = [
  {
    id: "F-A",
    nodes: [0, 1, 2, 7, 8, 9],
    elevation: 1.8,
    inflow: 0.09,
    drainage: 0.035,
    adjacency: ["F-B", "F-C"],
  },
  {
    id: "F-B",
    nodes: [3, 4, 5, 6, 10, 11, 12, 13, 17, 18, 19, 20],
    elevation: 0.4,
    inflow: 0.085,
    drainage: 0.025,
    adjacency: ["F-A", "F-D"],
  },
  {
    id: "F-C",
    nodes: [14, 15, 16, 21, 22, 23, 28, 29, 30],
    elevation: 0.05,
    inflow: 0.11,
    drainage: 0.03,
    adjacency: ["F-A", "F-D"],
  },
  {
    id: "F-D",
    nodes: [24, 25, 26, 27, 31, 32, 33, 34],
    elevation: 0.8,
    inflow: 0.06,
    drainage: 0.032,
    adjacency: ["F-B", "F-C"],
  },
];
const floodContent: Scenario = ScenarioSchema.parse({
  ...structuredClone(earthquake),
  id: "flood-urban-v1",
  version: "1.3.0",
  name: "臨江市・都市暴洪",
  hazardKind: "FLOOD",
  maxTicks: 2400,
  hazardSites: [],
  powerFailureTick: 0,
  radioFailureTick: 0,
  aftershockTick: 0,
  observationInterval: 120,
  civilians: {
    cohortCount: 100,
    populationRange: [12, 35],
    shelters: [
      { id: "SH-C", nodeId: "N21", capacity: 1000 },
      { id: "SH-A", nodeId: "N0", capacity: 800 },
      { id: "SH-D", nodeId: "N34", capacity: 1000 },
    ],
  },
  roads: earthquake.roads.map((r) => ({
    ...r,
    floodElevation:
      ["N21", "N22", "N23"].includes(r.from) &&
      ["N21", "N22", "N23"].includes(r.to)
        ? 2.5
        : 0,
  })),
  flood: {
    zones: groups.map((g) => ({
      id: g.id,
      nodeIds: g.nodes.map((n) => `N${n}`),
      roadIds: earthquake.roads
        .filter((r) => g.nodes.map((n) => `N${n}`).includes(r.from))
        .map((r) => r.id),
      elevation: g.elevation,
      waterDepth: 0,
      inflow: g.inflow,
      outflow: 0.006,
      drainageCapacity: g.drainage,
      adjacency: g.adjacency,
    })),
    rainfallIntensity: 1.4,
    rainfallDuration: 1500,
    updateInterval: 30,
    degradedDepth: 0.25,
    impassableDepth: 0.7,
    buildingDepth: 0.5,
    powerDepth: 0.45,
  },
  hospitals: earthquake.hospitals.map((h) => ({
    ...h,
    fuel: h.id === "H-B" ? 180 : 900,
    capacity: h.id === "H-A" ? 34 : h.capacity,
    emergencyCapacity: h.id === "H-A" ? 4 : h.emergencyCapacity,
    edCapacity: 10,
    icuCapacity: h.id === "H-A" ? 12 : 16,
    traumaCapacity: 8,
    treatmentThroughput: 0.06,
    staffEffectiveness: 0.85,
    patientQueue: [],
    status: "NORMAL",
    throughputCredit: 0,
    overloadTicks: 0,
    powerEmergencyTicks: 0,
  })),
});
export const flood: Scenario = ScenarioSchema.parse({
  ...floodContent,
  communications: communicationConfig(floodContent),
});
export const FLOOD_SHOWCASE_SEED = "AEGIS-FLOOD-2026-001";
