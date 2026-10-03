import { expect } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { launch } from "./launch";
import { load } from "../../packages/persistence/src/index";
import { ReplayRecorder, replay } from "../../packages/replay/src/index";
import { Simulation as LegacySimulation } from "../../packages/legacy-v1/vendor/packages/simulation/src/index";
import {
  ScenarioSchema as LegacyScenarioSchema,
  WorldSchema as LegacyWorldSchema,
} from "../../packages/legacy-v1/vendor/packages/domain/src/index";
import manifest from "../fixtures/legacy/manifest.json";

const executable = process.argv[2],
  portable = process.argv.includes("--portable");
const output = resolve(
  portable
    ? "test-results/migration-portable"
    : "test-results/migration-packaged",
);
mkdirSync(output, { recursive: true });
const errors: string[] = [],
  rows = [];
for (const fixture of manifest.fixtures) {
  const original = load(readFileSync(fixture.name)),
    reference = new LegacySimulation(
      LegacyScenarioSchema.parse(original.scenario),
      original.simulation.state.seed,
      LegacyWorldSchema.parse(original.simulation.snapshot()),
    );
  reference.step(60);
  const saved = resolve(output, fixture.tick + "-migrated.aegis");
  let app = await launch(executable, portable);
  try {
    let page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(e.message));
    await app.evaluate(
      ({ dialog }, paths) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [paths.original],
        });
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: paths.saved,
        });
      },
      { original: resolve(fixture.name), saved },
    );
    await page.getByRole("button", { name: "載入存檔", exact: true }).click();
    await expect(page.locator(".controlbar")).toContainText("引擎 0.1.0", {
      timeout: 30000,
    });
    await expect(page.locator(".controlbar")).toContainText("1→2");
    await page.getByRole("button", { name: "推進 1分", exact: true }).click();
    await expect(page.getByTestId("sim-clock")).toHaveText(
      fixture.tick === 60 ? "14:02:00" : "14:11:00",
    );
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await expect(page.locator(".controlbar")).toContainText("已儲存");
    const first = load(readFileSync(saved));
    expect(first.simulation.hash()).toBe(reference.hash());
    expect(first.simulation.state.version).toBe("0.1.0");
    await page.screenshot({
      path: resolve(output, `${fixture.tick}-before-restart.png`),
    });
    await app.close();
    app = await launch(executable, portable);
    page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(e.message));
    await app.evaluate(
      ({ dialog }, paths) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [paths.saved],
        });
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: paths.saved,
        });
      },
      { saved },
    );
    await page.getByRole("button", { name: "載入存檔", exact: true }).click();
    await expect(page.locator(".controlbar")).toContainText("引擎 0.1.0", {
      timeout: 30000,
    });
    await expect(page.getByTestId("sim-clock")).toHaveText(
      fixture.tick === 60 ? "14:02:00" : "14:11:00",
    );
    await page.getByRole("button", { name: "儲存", exact: true }).click();
    await expect(page.locator(".controlbar")).toContainText("已儲存");
    const restarted = load(readFileSync(saved));
    expect(restarted.simulation.hash()).toBe(reference.hash());
    expect(replay(restarted.scenario, restarted.replay).hash()).toBe(
      reference.hash(),
    );
    const recorder = new ReplayRecorder(restarted.simulation);
    recorder.record = restarted.replay;
    while (!restarted.simulation.state.completed) {
      restarted.simulation.step();
      recorder.checkpoint(restarted.simulation);
    }
    expect(replay(restarted.scenario, recorder.record).hash()).toBe(
      restarted.simulation.hash(),
    );
    await page.screenshot({
      path: resolve(output, `${fixture.tick}-after-restart.png`),
    });
    rows.push({
      fixture: fixture.name,
      originalHash: fixture.stateHash,
      continuedHash: reference.hash(),
      restartHash: first.simulation.hash(),
      completedHash: restarted.simulation.hash(),
      migrations: restarted.migrations,
      passed: true,
    });
  } finally {
    await app.close();
  }
}
expect(errors).toEqual([]);
writeFileSync(
  resolve(output, "qa.json"),
  JSON.stringify(
    {
      executable,
      portable,
      realProcessRestarts: 2,
      rows,
      errors,
      passed: true,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ portable, rows, errors }));
