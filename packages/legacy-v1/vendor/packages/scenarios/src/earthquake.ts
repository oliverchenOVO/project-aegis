import {
  ScenarioSchema,
  type Scenario,
  type Unit,
  type Agency,
} from "../../domain/src/index";
const nodes: Scenario["nodes"] = [];
const districts = [
  { id: "A", name: "北港工業區", x: 130, y: 105 },
  { id: "B", name: "東川醫療區", x: 650, y: 105 },
  { id: "C", name: "西城住宅區", x: 130, y: 475 },
  { id: "D", name: "南灣行政區", x: 650, y: 475 },
];
for (let row = 0; row < 5; row++)
  for (let col = 0; col < 7; col++)
    nodes.push({
      id: `N${row * 7 + col}`,
      x: 80 + col * 110,
      y: 60 + row * 115,
      district: row < 2 ? (col < 3 ? "A" : "B") : col < 3 ? "C" : "D",
      name: `${["港灣路", "中央大道", "河濱路", "中山路", "環城路"][row]} ${col + 1}`,
    });
const roads: Scenario["roads"] = [];
for (let row = 0; row < 5; row++)
  for (let col = 0; col < 7; col++) {
    const from = `N${row * 7 + col}`;
    if (col < 6)
      roads.push({
        id: `R${roads.length}`,
        from,
        to: `N${row * 7 + col + 1}`,
        travelTicks: 36 + row * 4,
        state: "NORMAL",
      });
    if (row < 4)
      roads.push({
        id: `R${roads.length}`,
        from,
        to: `N${(row + 1) * 7 + col}`,
        travelTicks: 44 + col * 3,
        state: "NORMAL",
      });
  }
const units: Unit[] = [];
for (const [agency, count, prefix, home] of [
  ["FIRE", 6, "ENG", "N8"],
  ["EMS", 6, "AMB", "N23"],
  ["POLICE", 4, "POL", "N29"],
  ["UTILITY", 2, "UTL", "N32"],
] as const)
  for (let i = 1; i <= count; i++) {
    const homeId = agency === "FIRE" && i > 3 ? "N12" : home;
    units.push({
      id: `${prefix}-${String(i).padStart(2, "0")}`,
      agency: agency as Agency,
      type:
        agency === "FIRE"
          ? "消防救援車"
          : agency === "EMS"
            ? "救護車"
            : agency === "POLICE"
              ? "巡邏車"
              : "公用事業搶修隊",
      nodeId: homeId,
      homeId,
      state: "AVAILABLE",
      capabilities: [agency],
      personnel: agency === "FIRE" ? 4 : 2,
      equipment: 100,
      fatigue: 0,
      communicationStatus: "NORMAL",
      route: [],
      edgeProgress: 0,
      eta: 0,
      patients: [],
    });
  }
export const earthquake: Scenario = ScenarioSchema.parse({
  id: "urban-earthquake",
  version: "1.0.0",
  name: "臨江市・都市地震",
  maxTicks: 1800,
  districts,
  nodes,
  roads,
  units,
  hospitals: [
    {
      id: "H-A",
      nodeId: "N21",
      capacity: 40,
      emergencyCapacity: 10,
      baselinePatients: 28,
      criticalPatients: 8,
      currentPatients: 28,
      power: true,
      generator: "OPERATIONAL",
      fuel: 800,
      overloadReported: false,
    },
    {
      id: "H-B",
      nodeId: "N5",
      capacity: 36,
      emergencyCapacity: 12,
      baselinePatients: 34,
      criticalPatients: 12,
      currentPatients: 34,
      power: true,
      generator: "OPERATIONAL",
      fuel: 85,
      overloadReported: false,
    },
  ],
  facilities: [
    { id: "FD-A", nodeId: "N8", type: "FIRE", name: "西城消防分隊" },
    { id: "FD-B", nodeId: "N12", type: "FIRE", name: "東川消防分隊" },
    { id: "EMS", nodeId: "N23", type: "EMS", name: "緊急醫療中心" },
    { id: "PD", nodeId: "N29", type: "POLICE", name: "南灣警察局" },
    { id: "UD", nodeId: "N32", type: "UTILITY", name: "工務搶修基地" },
    { id: "PWR", nodeId: "N18", type: "POWER", name: "東川變電站" },
    { id: "RAD", nodeId: "N10", type: "COMMS", name: "無線電中繼站" },
  ],
  hazardSites: [
    { nodeId: "N1", type: "FIRE", severity: 76, injuries: 7, chance: 1 },
    {
      nodeId: "N9",
      type: "BUILDING_COLLAPSE",
      severity: 68,
      injuries: 12,
      chance: 1,
    },
    {
      nodeId: "N26",
      type: "MASS_CASUALTY",
      severity: 55,
      injuries: 8,
      chance: 1,
    },
    { nodeId: "N15", type: "FIRE", severity: 60, injuries: 6, chance: 0.75 },
  ],
  powerFailureTick: 110,
  radioFailureTick: 65,
  aftershockTick: 190,
  observationInterval: 45,
  reportDelay: [20, 110],
  degradedReportDelay: [75, 180],
  reportLoss: 0.03,
  degradedReportLoss: 0.14,
});
export const SHOWCASE_SEED = "AEGIS-2026-001";
