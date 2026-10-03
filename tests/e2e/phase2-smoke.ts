import { expect } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { flood, FLOOD_SHOWCASE_SEED } from "../../packages/scenarios/src/flood";

import { load } from "../../packages/persistence/src/index";

import { launch } from "./launch";
import { viewport, capture } from "./capture";
import { CausalIndex } from "../../packages/after-action/src/causal";
declare global {
  interface Window {
    aegisQaDrawCalls: () => number;
  }
}
const portable = process.argv.includes("--portable");
const output = resolve(
  portable ? "test-results/phase2-portable" : "test-results/phase2",
);
mkdirSync(output, { recursive: true });
const originalPath = resolve(output, "original.aegis"),
  branchPath = resolve(output, "branch.aegis"),
  livePath = resolve(output, "evacuation.aegis");
const started = performance.now();
const original = JSON.parse(
  execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/generate-ui-showcase.ts", originalPath],
    { encoding: "utf8" },
  ),
) as { worldHash: string; recordHash: string };
const mark = (stage: string) =>
  console.log(
    JSON.stringify({ stage, elapsedMs: performance.now() - started }),
  );
mark("showcase generated in isolated process");
const app = await launch(process.argv[2], portable);
const page = await app.firstWindow(),
  errors: string[] = [],
  warnings: string[] = [],
  workerTimings: { action: string; elapsedMs: number; error?: string }[] = [],
  checks: Record<string, unknown> = {};
checks.workerTimings = workerTimings;
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (e) => {
  if (e.text().startsWith("AEGIS-QA ")) console.log(e.text());
  if (e.text().startsWith("AEGIS-QA response "))
    workerTimings.push(JSON.parse(e.text().slice("AEGIS-QA response ".length)));
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
  checks.runtime = await app.evaluate(({ app, BrowserWindow }) => ({
    versions: process.versions,
    gpu: app.getGPUFeatureStatus(),
    windows: BrowserWindow.getAllWindows().map((window) => ({
      visible: window.isVisible(),
      minimized: window.isMinimized(),
      backgroundThrottling: window.webContents.getBackgroundThrottling(),
    })),
  }));
  console.log("AEGIS-QA runtime", JSON.stringify(checks.runtime));
  await page.evaluate(() => {
    let drawCalls = 0;
    window.aegisQaDrawCalls = () => drawCalls;
    for (const context of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const prototype = context.prototype;
      const drawElements = prototype.drawElements;
      prototype.drawElements = function (...args) {
        drawCalls++;
        return drawElements.apply(this, args);
      };
      const drawArrays = prototype.drawArrays;
      prototype.drawArrays = function (...args) {
        drawCalls++;
        return drawArrays.apply(this, args);
      };
    }
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      private requests = new Map<number, { action: string; start: number }>();
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", (event) => {
          const request = this.requests.get(event.data.id);
          if (!request) return;
          console.log(
            "AEGIS-QA response",
            JSON.stringify({
              action: request.action,
              elapsedMs: performance.now() - request.start,
              error: event.data.error,
            }),
          );
          this.requests.delete(event.data.id);
        });
      }
      postMessage(
        message: { id: number; action: string },
        options?: StructuredSerializeOptions | Transferable[],
      ) {
        this.requests.set(message.id, {
          action: message.action,
          start: performance.now(),
        });
        console.log(
          "AEGIS-QA request",
          message.action,
          new Date().toISOString(),
        );
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await viewport(app, page, { width: 1600, height: 900 });
  await expect(
    page.getByRole("heading", { name: "啟動應變中心" }),
  ).toBeVisible();
  expect(await page.title()).toContain("AEGIS");
  checks.identity = { url: page.url(), title: await page.title() };
  await page.getByLabel("災害場景").selectOption("flood");
  await expect(page.locator("#seed")).toHaveValue(FLOOD_SHOWCASE_SEED);
  await capture(app, page, resolve(output, "menu-flood.png"));
  await page.getByRole("button", { name: "開始新情境", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".scenario-title")).toHaveText(flood.name);
  await expect(page.locator(".unit-row").first()).toContainText("未知");
  await expect(page.locator(".operation-banner")).toContainText("電力：未知");
  checks.initialFog = "unknown units/power; no initial truth";
  const idleDraws = await page.evaluate(async () => {
    const samples: number[] = [];
    for (let frame = 0; frame < 8; frame++) {
      await new Promise(requestAnimationFrame);
      samples.push(window.aegisQaDrawCalls());
    }
    return samples.slice(2);
  });
  expect(
    idleDraws[0],
    "map must actually draw its initial content",
  ).toBeGreaterThan(0);
  expect(
    new Set(idleDraws).size,
    "paused static map must not keep drawing",
  ).toBe(1);
  const beforeZoom = await page.locator("canvas").screenshot();
  await page.getByRole("button", { name: "放大地圖", exact: true }).click();
  const afterZoom = await page.locator("canvas").screenshot();
  expect(
    afterZoom.equals(beforeZoom),
    "camera change must redraw the map",
  ).toBe(false);
  await page.getByRole("button", { name: "重設地圖", exact: true }).click();
  await page.getByRole("button", { name: "淹水", exact: true }).click();
  const afterLayer = await page.locator("canvas").screenshot();
  expect(
    afterLayer.equals(beforeZoom),
    "layer change must redraw the map",
  ).toBe(false);
  await page.getByRole("button", { name: "淹水", exact: true }).click();
  checks.mapRendering = { idleDraws, zoomRedrawn: true, layerRedrawn: true };
  await page.getByLabel("疏散區域").selectOption("F-A");
  await page.getByRole("button", { name: "發布疏散", exact: true }).click();
  await expect(page.locator(".queue")).toContainText("疏散區域");
  await page.getByRole("button", { name: "推進 5分", exact: true }).click();
  await expect(page.getByTestId("sim-clock")).toHaveText("14:05:00", {
    timeout: 30000,
  });
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
    await viewport(app, page, size);
    await page.bringToFront();
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
    await capture(app, page, resolve(output, `flood-${size.width}.png`));
  }
  await viewport(app, page, { width: 1600, height: 900 });
  await dialogPaths(livePath);
  await page.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(page.locator(".controlbar")).toContainText("已儲存", {
    timeout: 30000,
  });
  const live = load(readFileSync(livePath));
  expect(
    live.simulation.state.commands.some((c) => c.type === "EVACUATE_ZONE"),
  ).toBe(true);
  const evacuationCommand = live.simulation.state.commands.find(
    (c) => c.type === "EVACUATE_ZONE",
  )!;
  expect(evacuationCommand.executionStatus).toBe("COMPLETED");
  const graph = new CausalIndex(live.simulation.state.events);
  const sheltered = live.simulation.state.events.filter(
    (e) =>
      e.type === "CIVILIANS_SHELTERED" &&
      graph
        .trace(e.id, 20, 250)
        .nodes.some((n) => n.type === "EVACUATION_ORDERED"),
  );
  expect(sheltered.length).toBeGreaterThan(0);
  checks.evacuation = {
    commandId: evacuationCommand.id,
    executionStatus: evacuationCommand.executionStatus,
    shelteredPeople: sheltered.reduce((n, e) => n + Number(e.payload.count), 0),
    eventIds: sheltered.map((e) => e.id),
  };
  mark("live save validated");
  await dialogPaths(originalPath, branchPath);
  await page.getByRole("button", { name: "載入", exact: true }).click();
  await expect(page.getByRole("heading", { name: "行動檢討報告" })).toBeVisible(
    { timeout: 45000 },
  );
  await expect(page.getByRole("heading", { name: "關鍵因果鏈" })).toBeVisible();
  mark("completed save loaded and AAR rendered");
  await capture(app, page, resolve(output, "aar2.png"));
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
  mark("alternative simulated and compared");
  await capture(app, page, resolve(output, "counterfactual.png"));
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
  expect(branch.replay.lineage!.parentHash).toBe(original.worldHash);
  checks.branch = {
    originalHash: original.worldHash,
    alternativeHash: branch.simulation.hash(),
    lineage: branch.replay.lineage,
    fatalities: branch.simulation.aar().fatalities,
    parentRecordHash: original.recordHash,
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
  await capture(app, page, resolve(output, "replay.png"));
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
} catch (error) {
  await page
    .screenshot({ path: resolve(output, "failure.png") })
    .catch(() => {});
  writeFileSync(
    resolve(output, "failure-dom.txt"),
    await page.locator("body").innerText(),
  );
  throw error;
} finally {
  writeFileSync(
    resolve(output, "ui-qa.json"),
    JSON.stringify(
      {
        executable: process.argv[2] ?? "development Electron",
        browser: "Browser plugin not available; Playwright Electron used",
        graphics:
          process.env.CI || process.env.AEGIS_SOFTWARE_RENDERING
            ? "SwiftShader CPU graphics for test environment"
            : "ordinary desktop graphics",
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
