import { readFileSync, writeFileSync } from "node:fs";
import { load } from "../packages/persistence/src/index";
import { CausalIndex } from "../packages/after-action/src/causal";
const loaded = load(
    readFileSync("test-results/phase2-portable/original.aegis"),
  ),
  w = loaded.simulation.state,
  index = new CausalIndex(w.events);
const types = [
  "RAIN_STARTED",
  "FLOOD_ZONE_RISE",
  "ROAD_BLOCKED",
  "UNIT_REROUTED",
  "POWER_NODE_FAILED",
  "GENERATOR_FAILED",
  "NETWORK_NODE_STATUS_CHANGED",
  "MESSAGE_QUEUED",
  "MESSAGE_HOP_SENT",
  "REPORT_RECEIVED",
  "PATIENT_DIED",
  "COMMAND_ISSUED",
];
const eventTypes = [...new Set(w.events.map((e) => e.type))];
const roots = [
  "PATIENT_DIED",
  "PATIENT_DETERIORATED",
  "UNIT_REROUTED",
  "POWER_NODE_FAILED",
  "NETWORK_NODE_STATUS_CHANGED",
].flatMap((type) => w.events.filter((e) => e.type === type).slice(0, 2));
const delayed = w.reports.find(
  (r) =>
    r.receivedTick !== undefined &&
    r.subjectKind === "HOSPITAL" &&
    r.receivedTick - r.observedTick > 90,
);
const receipt =
  delayed &&
  w.events.find(
    (e) => e.type === "REPORT_RECEIVED" && e.payload.reportId === delayed.id,
  );
if (receipt) roots.push(receipt);
const chains = roots.map((e) => index.trace(e.id, 20, 250));
writeFileSync(
  "docs/qa/phase2-causal-showcase.json",
  JSON.stringify(
    {
      scenarioId: loaded.scenario.id,
      scenarioVersion: loaded.scenario.version,
      seed: w.seed,
      worldHash: loaded.simulation.hash(),
      eventTypes,
      selected: types.map((type) => ({
        type,
        count: w.events.filter((e) => e.type === type).length,
        first: w.events.find((e) => e.type === type),
      })),
      chains,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    eventTypes,
    roots: roots.map((e) => ({ id: e.id, type: e.type })),
  }),
);
