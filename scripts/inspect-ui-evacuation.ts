import { readFileSync } from "node:fs";
import { load } from "../packages/persistence/src/index";
import { CausalIndex } from "../packages/after-action/src/causal";
const w = load(readFileSync("test-results/phase2-portable/evacuation.aegis"))
    .simulation.state,
  index = new CausalIndex(w.events),
  command = w.commands.find((c) => c.type === "EVACUATE_ZONE");
const affected = w.events
  .filter((e) =>
    [
      "EVACUATION_STARTED",
      "CIVILIANS_SHELTERED",
      "CIVILIANS_STRANDED",
    ].includes(e.type),
  )
  .filter((e) =>
    index
      .trace(e.id, 20, 250)
      .nodes.some((n) => n.type === "EVACUATION_ORDERED"),
  );
console.log(
  JSON.stringify({
    command,
    affected: affected.map((e) => ({
      id: e.id,
      type: e.type,
      count: e.payload.count,
    })),
    totalSheltered: w.cohorts
      ?.filter((c) => c.state === "SHELTERED")
      .reduce((n, c) => n + c.population, 0),
  }),
);
