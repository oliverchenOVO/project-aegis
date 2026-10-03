import { ScenarioSchema, type Scenario } from "../../domain/src/index";
import { earthquake } from "./earthquake";
export const earthquakeSystemic: Scenario = ScenarioSchema.parse({
  ...structuredClone(earthquake),
  version: "2.1.0",
  hospitals: earthquake.hospitals.map((h) => ({
    ...h,
    edCapacity: 10,
    icuCapacity: h.id === "H-A" ? 14 : 16,
    traumaCapacity: 8,
    treatmentThroughput: 0.06,
    staffEffectiveness: 0.85,
    patientQueue: [],
    status: "NORMAL",
    throughputCredit: 0,
    overloadTicks: 0,
    powerEmergencyTicks: 0,
  })),
  civilians: {
    cohortCount: 100,
    populationRange: [12, 35],
    shelters: [
      { id: "SH-A", nodeId: "N0", capacity: 1000 },
      { id: "SH-C", nodeId: "N21", capacity: 1000 },
      { id: "SH-D", nodeId: "N34", capacity: 1000 },
    ],
  },
});
// Earthquake v1 remains unchanged in earthquake.ts and the frozen v0.1 compatibility engine.
