import { _electron as electron, expect } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Simulation } from "../../packages/simulation/src/index";
import { flood, FLOOD_SHOWCASE_SEED } from "../../packages/scenarios/src/flood";
import { ReplayRecorder } from "../../packages/replay/src/index";
import { save, load } from "../../packages/persistence/src/index";
import { hash } from "../../packages/shared/src/index";
const output = resolve("test-results/phase2");
mkdirSync(output, { recursive: true });
const original = new Simulation(flood, FLOOD_SHOWCASE_SEED),
  recorder = new ReplayRecorder(original);
while (!original.state.completed) {
  if (original.state.tick === 30)
    for (const target of [
      "AMB-01",
      "AMB-02",
      "AMB-03",
      "AMB-04",
      "AMB-05",
      "AMB-06",
    ])
      recorder.command(original, {
        type: "DISPATCH_UNIT",
        target,
        incidentId: "INC-1",
      });
  original.step();
  recorder.checkpoint(original);
}
const originalPath = resolve(output, "original.aegis"),
  branchPath = resolve(output, "branch.aegis"),
  livePath = resolve(output, "evacuation.aegis");
writeFileSync(originalPath, save(original, recorder.record));
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    (e): e is [string, string] => e[1] !== undefined,
  ),
);
delete env.ELECTRON_RUN_AS_NODE;
const executable = process.argv[2];
const app = await electron.launch({
  ...(executable
    ? { executablePath: resolve(executable), args: [] }
    : { args: [resolve("apps/desktop/dist/main.cjs")] }),
  env,
  timeout: 30000,
});
const page = await app.firstWindow(),
  errors: string[] = [],
  warnings: string[] = [],
  checks: Record<string, unknown> = {};
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (e) => {
  if (e.type() === "error") errors.push(e.text());
  if (e.type() === "warning") warnings.push(e.text());
});
const dialogPaths = async (loadPath: string, savePath = livePath) =>
  app.evaluate(
    ({ dialog }, paths) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [paths.loadPath],
      });
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: paths.savePath,
      });
    },
    { loadPath, savePath },
  );
try {
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(
    page.getByRole("heading", { name: "啟動應變中心" }),
  ).toBeVisible();
  expect(await page.title()).toContain("AEGIS");
  checks.identity = { url: page.url(), title: await page.title() };
  await page.getByLabel("災害場景").selectOption("flood");
  await expect(page.locator("#seed")).toHaveValue(FLOOD_SHOWCASE_SEED);
  await page.screenshot({ path: resolve(output, "menu-flood.png") });
  await page.getByRole("button", { name: "開始新情境", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".scenario-title")).toHaveText(flood.name);
  await expect(page.locator(".unit-row").first()).toContainText("未知");
  await expect(page.locator(".operation-banner")).toContainText("電力：未知");
  checks.initialFog = "unknown units/power; no initial truth";
  await page.getByRole("button", { name: "推進 5分", exact: true }).click();
  await expect(page.getByTestId("sim-clock")).toHaveText("14:05:00", {
    timeout: 30000,
  });
  await page.getByLabel("疏散區域").selectOption("F-A");
  await page.getByRole("button", { name: "發布疏散", exact: true }).click();
  await expect(page.locator(".queue")).toContainText("疏散區域");
  await page.getByRole("button", { name: "推進 5分", exact: true }).click();
  await expect(page.getByTestId("sim-clock")).toHaveText("14:10:00", {
    timeout: 30000,
  });
  await page.getByLabel("情報篩選").selectOption("HOSPITAL");
  await page.locator(".report-row").filter({ hasText: "H-A" }).first().click();
  await expect(page.locator(".inspector-body")).toContainText("回報急診佇列");
  await expect(page.locator(".inspector-body")).toContainText("回報 ICU 占用");
  checks.hospitalInspector =
    "received census/queue/ICU/handover/power with age/source";
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 1600, height: 900 },
    { width: 1366, height: 768 },
    { width: 1664, height: 941 },
    { width: 700, height: 900 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      `horizontal overflow ${size.width}`,
    ).toBe(false);
    if (size.width > 800)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight > innerHeight,
        ),
        `vertical overflow ${size.width}`,
      ).toBe(false);
    await page.screenshot({
      path: resolve(output, `flood-${size.width}.png`),
      fullPage: size.width === 700,
    });
  }
  await page.setViewportSize({ width: 1600, height: 900 });
  await dialogPaths(livePath);
  await page.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(page.locator(".controlbar")).toContainText("已儲存", {
    timeout: 30000,
  });
  const live = load(readFileSync(livePath));
  expect(
    live.simulation.state.commands.some((c) => c.type === "EVACUATE_ZONE"),
  ).toBe(true);
  await dialogPaths(originalPath, branchPath);
  await page.getByRole("button", { name: "載入", exact: true }).click();
  await expect(page.getByRole("heading", { name: "行動檢討報告" })).toBeVisible(
    { timeout: 45000 },
  );
  await expect(page.getByRole("heading", { name: "關鍵因果鏈" })).toBeVisible();
  await page.screenshot({ path: resolve(output, "aar2.png") });
  await page
    .getByRole("button", { name: "從 CMD-1 分岔", exact: true })
    .click();
  await expect(page.getByTestId("counterfactual-panel")).toBeVisible();
  await page.getByLabel("刪除替代命令 6", { exact: true }).click();
  await page.getByLabel("刪除替代命令 5", { exact: true }).click();
  for (const [index, target] of [
    [5, "AMB-05"],
    [6, "AMB-06"],
  ] as const) {
    await page.getByRole("button", { name: "新增命令", exact: true }).click();
    await page
      .getByLabel(`替代命令 ${index} 秒數`, { exact: true })
      .fill("350");
    await page
      .getByLabel(`替代命令 ${index} 類型`, { exact: true })
      .selectOption("DISPATCH_UNIT");
    await page
      .getByLabel(`替代命令 ${index} 目標`, { exact: true })
      .fill(target);
    await page
      .getByLabel(`替代命令 ${index} 事件`, { exact: true })
      .fill("INC-10");
  }
  await page.getByRole("button", { name: "模擬替代分支", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "儲存分支存檔", exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await expect(
    page
      .getByTestId("counterfactual-panel")
      .locator("tr")
      .filter({ hasText: "死亡（人）" }),
  ).toContainText("-4.0");
  await expect(
    page
      .getByTestId("counterfactual-panel")
      .locator("tr")
      .filter({ hasText: "平均 EMS 應變" }),
  ).toContainText("不適用");
  await expect(page.getByTestId("counterfactual-panel")).toContainText(
    "PATIENT_RECOVERED",
  );
  await page.screenshot({ path: resolve(output, "counterfactual.png") });
  await page.getByRole("button", { name: "儲存分支存檔", exact: true }).click();
  await expect
    .poll(
      () => {
        try {
          return readFileSync(branchPath).length;
        } catch {
          return 0;
        }
      },
      { timeout: 30000 },
    )
    .toBeGreaterThan(0);
  const branch = load(readFileSync(branchPath));
  expect(branch.replay.lineage!.parentHash).toBe(original.hash());
  checks.branch = {
    originalHash: original.hash(),
    alternativeHash: branch.simulation.hash(),
    lineage: branch.replay.lineage,
    fatalities: branch.simulation.aar().fatalities,
    parentRecordHash: hash(recorder.record),
  };
  await page.getByRole("button", { name: "驗證並重播", exact: true }).click();
  await expect(page.locator(".operation-banner")).toContainText(
    "完整結果校驗通過",
    { timeout: 45000 },
  );
  await page.getByLabel("精確重播秒數", { exact: true }).fill("350");
  await page.getByRole("button", { name: "定位", exact: true }).click();
  await expect(page.getByTestId("sim-clock")).toHaveText("14:05:50", {
    timeout: 30000,
  });
  await expect(
    page.getByRole("button", { name: "發布疏散", exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: resolve(output, "replay.png") });
  checks.replay = "verified checkpoint seek to350; commands disabled";
  await page.getByRole("button", { name: "返回主選單", exact: true }).click();
  await page
    .locator(".dialog")
    .getByRole("button", { name: "返回主選單", exact: true })
    .click();
  await page.getByLabel("災害場景").selectOption("earthquake");
  await page.getByRole("button", { name: "開始新情境", exact: true }).click();
  await page.getByRole("button", { name: "推進 1分", exact: true }).click();
  await expect(page.getByTestId("sim-clock")).toHaveText("14:01:00", {
    timeout: 30000,
  });
  await expect(page.locator(".scenario-title")).toHaveText("臨江市・都市地震");
  await expect(page.locator("canvas")).toBeVisible();
  checks.earthquake = "systemic scenario selection/start/tick/render";
  expect(errors).toEqual([]);
  checks.overlays = await page.locator("vite-error-overlay").count();
  expect(checks.overlays).toBe(0);
} finally {
  writeFileSync(
    resolve(output, "ui-qa.json"),
    JSON.stringify(
      {
        executable: executable ?? "development Electron",
        browser: "Browser plugin not available; Playwright Electron used",
        checks,
        errors,
        warnings,
      },
      null,
      2,
    ),
  );
  await app.close();
}
console.log(JSON.stringify(checks));
