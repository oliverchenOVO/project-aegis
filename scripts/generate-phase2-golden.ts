import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fixtureProfiles, fixtureRun } from "./phase2-fixtures";
const output = "tests/fixtures/phase2/golden.json";
if (existsSync(output))
  throw new Error("Golden already exists; never silently replace expectations");
const cases = fixtureProfiles.map((p) => {
  const result = fixtureRun(p);
  console.log(result.summary.seed, result.summary.worldHash);
  return result.summary;
});
mkdirSync("tests/fixtures/phase2", { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      description:
        "Phase 2 independent frozen expectations; Phase 1 fixtures are unchanged",
      cases,
    },
    null,
    2,
  ),
);
