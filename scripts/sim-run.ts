import { Simulation, assertInvariants } from "../packages/simulation/src/index";
import {
  earthquake,
  SHOWCASE_SEED,
} from "../packages/scenarios/src/earthquake";
import { earthquakeSystemic } from "../packages/scenarios/src/earthquake-systemic";
import { flood, FLOOD_SHOWCASE_SEED } from "../packages/scenarios/src/flood";
const seedIndex = process.argv.indexOf("--seed");
const requested = process.argv[2]?.startsWith("--")
  ? "urban-earthquake"
  : (process.argv[2] ?? "urban-earthquake");
const scenario = ["earthquake", "urban-earthquake"].includes(requested)
  ? earthquakeSystemic
  : ["flood", "flood-urban-v1"].includes(requested)
    ? flood
    : requested === "legacy-earthquake"
      ? earthquake
      : undefined;
if (!scenario)
  throw new Error(
    "Scenario must be urban-earthquake, flood-urban-v1 or legacy-earthquake",
  );
if (seedIndex >= 0 && !process.argv[seedIndex + 1])
  throw new Error("Missing --seed value");
const simulation = new Simulation(
  scenario,
  seedIndex >= 0
    ? process.argv[seedIndex + 1]
    : scenario === flood
      ? FLOOD_SHOWCASE_SEED
      : SHOWCASE_SEED,
  undefined,
  requested === "legacy-earthquake" ? "0.1.0" : "0.2.0",
);
while (!simulation.state.completed) {
  simulation.step(1);
  if (simulation.state.tick % 60 === 0)
    assertInvariants(simulation.state, scenario);
}
console.log(JSON.stringify(simulation.aar(), null, 2));
