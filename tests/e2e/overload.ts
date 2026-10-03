import { expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launch } from "./launch";
import { ScenarioSchema } from "../../packages/domain/src/index";
import { flood, FLOOD_SHOWCASE_SEED } from "../../packages/scenarios/src/flood";
import {
  Simulation,
  assertInvariants,
} from "../../packages/simulation/src/index";
import { ReplayRecorder } from "../../packages/replay/src/index";
import { save } from "../../packages/persistence/src/index";
const portable = process.argv.includes("--portable"),
  output = resolve(
    portable
      ? "test-results/overload-portable"
      : "test-results/overload-packaged",
  );
mkdirSync(output, { recursive: true });
// Explicit content variant: same engine/roads/population, scarce receiving ICU/ED.
// No snapshot mutation, forged events or hardcoded outcome counters.
const scenario = ScenarioSchema.parse({
  ...structuredClone(flood),
  id: "qa-flood-overload",
  version: "1.4.0-overload-qa",
  name: "洪水醫療超載 QA 情境",
  hospitals: flood.hospitals.map((h) =>
    h.id === "H-A"
      ? {
          ...h,
          capacity: 28,
          emergencyCapacity: 0,
          edCapacity: 1,
          icuCapacity: 8,
          treatmentThroughput: 0.003,
        }
      : h,
  ),
});
const sim = new Simulation(scenario, FLOOD_SHOWCASE_SEED),
  recorder = new ReplayRecorder(sim);
while (!sim.state.completed) {
  if (sim.state.tick === 350)
    for (const target of ["AMB-05", "AMB-06"])
      recorder.command(sim, {
        type: "DISPATCH_UNIT",
        target,
        incidentId: "INC-10",
      });
  sim.step();
  recorder.checkpoint(sim);
  if (sim.state.tick % 30 === 0) assertInvariants(sim.state, scenario);
}
const aar = sim.aar(),
  hospital = aar.systemic!.hospitals.find((h) => h.id === "H-A")!;
expect(hospital.peakQueue).toBeGreaterThan(0);
expect(hospital.overloadTicks).toBeGreaterThan(0);
expect(hospital.handoverTicks).toBeGreaterThan(0);
const file = resolve(output, "overload.aegis");
writeFileSync(file, save(sim, recorder.record));
const app = await launch(process.argv[2], portable),
  errors: string[] = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, file);
  await page.getByRole("button", { name: "載入存檔", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "應變與系統壓力" }),
  ).toBeVisible({ timeout: 45000 });
  const row = page
    .locator(".systemic-overview tbody tr")
    .filter({ hasText: "H-A" });
  await expect(row.locator("td").nth(2)).toHaveText(String(hospital.peakQueue));
  await expect(row.locator("td").nth(4)).toHaveText(
    String(hospital.overloadTicks),
  );
  await expect(row.locator("td").nth(6)).toHaveText(
    String(hospital.handoverTicks),
  );
  await page.screenshot({ path: resolve(output, "overload-aar.png") });
  expect(errors).toEqual([]);
  writeFileSync(
    resolve(output, "qa.json"),
    JSON.stringify(
      {
        portable,
        scenarioId: scenario.id,
        scenarioVersion: scenario.version,
        worldHash: sim.hash(),
        hospital,
        events: sim.state.events.filter((e) =>
          [
            "HOSPITAL_STATUS_CHANGED",
            "AMBULANCE_HANDOVER_STARTED",
            "AMBULANCE_HANDOVER_COMPLETED",
          ].includes(e.type),
        ),
        errors,
        passed: true,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ portable, hospital, errors }));
} finally {
  await app.close();
}
