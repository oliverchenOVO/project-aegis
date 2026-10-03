import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { load, save } from "../packages/persistence/src/index";
import { replay } from "../packages/replay/src/index";
import manifest from "../tests/fixtures/legacy/manifest.json";
const results = [];
for (const fixture of manifest.fixtures) {
  const times = [];
  for (let n = 0; n < 10; n++) {
    const start = performance.now(),
      loaded = load(readFileSync(fixture.name));
    if (loaded.simulation.hash() !== fixture.stateHash)
      throw new Error("Migration original hash mismatch");
    const restarted = load(
      save(loaded.simulation, loaded.replay, loaded.migrations),
    );
    if (
      replay(restarted.scenario, restarted.replay).hash() !== fixture.stateHash
    )
      throw new Error("Migration restart/replay mismatch");
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  results.push({
    fixture: fixture.name,
    iterations: times.length,
    p50Ms: times[4],
    p95Ms: times[9],
    mismatches: 0,
  });
}
writeFileSync("docs/qa/migration.json", JSON.stringify({ results }, null, 2));
console.log(JSON.stringify({ results }, null, 2));
