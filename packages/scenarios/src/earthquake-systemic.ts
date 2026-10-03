import { ScenarioSchema, type Scenario } from "../../domain/src/index";
import { earthquake } from "./earthquake";
export const earthquakeSystemic: Scenario = ScenarioSchema.parse({
  ...structuredClone(earthquake),
  version: "2.0.0",
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
