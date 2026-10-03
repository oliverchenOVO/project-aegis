import { it, expect } from "vitest";
import golden from "../fixtures/phase2/golden.json";
import { fixtureProfiles, fixtureRun } from "../../scripts/phase2-fixtures";
it.each(fixtureProfiles)("preserves Phase 2 golden $seed", (profile) => {
  const expected = golden.cases.find((c) => c.seed === profile.seed);
  expect(expected).toBeDefined();
  expect(fixtureRun(profile).summary).toEqual(expected);
});
