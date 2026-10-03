import { expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launch } from "./launch";
import { viewport, capture } from "./capture";
import type { CommandCenterView } from "../../packages/domain/src/index";
import { incidentCallouts } from "../../packages/ui/src/map/knowledge";
import { cameraPosition } from "../../packages/ui/src/map/camera";
declare global {
  interface Window {
    mapInteractionView?: CommandCenterView;
  }
}
const output = resolve(process.argv[3] ?? "test-results/map-interactions");
mkdirSync(output, { recursive: true });
const app = await launch(
  process.argv[2] === "--dev" ? undefined : process.argv[2],
  process.argv.includes("--portable"),
);
const page = await app.firstWindow(),
  errors: string[] = [],
  warnings: string[] = [],
  checks: unknown[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (e) => {
  if (e.type() === "error") errors.push(e.text());
  if (e.type() === "warning") warnings.push(e.text());
});
let passed = false;
const point = async (x: number, y: number, zoom = 1) => {
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  const box = (await page.locator("canvas").boundingBox())!;
  const scale = Math.min(box.width / 800, box.height / 590) * zoom,
    p = cameraPosition(box.width, box.height, scale, { x: 0, y: 0 });
  return { x: box.x + p.x + x * scale, y: box.y + p.y + y * scale };
};
const click = async (x: number, y: number, zoom = 1) => {
  const p = await point(x, y, zoom);
  await page.mouse.click(p.x, p.y);
};
const step = async (name = "推進 1分") => {
  const tick = await page.evaluate(() => window.mapInteractionView!.tick);
  await page.getByRole("button", { name, exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.mapInteractionView!.tick), {
      timeout: 30000,
    })
    .toBe(tick + (name === "推進 1分" ? 60 : 10));
};
try {
  await page.evaluate(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", (e) => {
          if (e.data.result?.view)
            window.mapInteractionView = e.data.result.view;
        });
      }
    };
  });
  for (const scenario of ["earthquake", "flood"]) {
    await viewport(app, page, { width: 1600, height: 900 });
    if (scenario === "flood") {
      await page
        .getByRole("button", { name: "返回主選單", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "返回主選單", exact: true })
        .click();
    }
    await page.getByLabel("災害場景").selectOption(scenario);
    await page
      .locator("#seed")
      .fill(scenario === "flood" ? "AEGIS-FLOOD-2026-001" : "AEGIS-2026-001");
    await page.getByRole("button", { name: "開始新情境", exact: true }).click();
    await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => page.evaluate(() => window.mapInteractionView?.tick))
      .toBe(0);
    const unknown = await page.evaluate(() => window.mapInteractionView!);
    expect(unknown.beliefs).toEqual([]);
    expect(unknown.units.every((u) => !u.belief?.claim.nodeId)).toBe(true);
    await click(520, 290);
    await expect(page.locator(".intel-panel")).toContainText("PWR：狀態未知");
    await click(410, 175);
    await expect(page.locator(".intel-panel")).toContainText("RAD：狀態未知");
    await click(630, 60);
    await expect(page.locator(".intel-panel")).toContainText("H-B：狀態未知");
    await expect(page.locator(".unit-row").first()).toContainText("未知");
    await expect(page.locator(".operation-banner")).toContainText("通訊：未知");
    await capture(app, page, resolve(output, `${scenario}-t0-fog.png`));
    await step();
    const view = await page.evaluate(() => window.mapInteractionView!);
    const incident =
      view.beliefs.find(
        (b) =>
          b.kind === "INCIDENT" && b.claim.incidentType === "BUILDING_COLLAPSE",
      ) ?? view.beliefs.find((b) => b.kind === "INCIDENT");
    expect(incident).toBeDefined();
    const callout = incidentCallouts(view).get(incident!.subjectId)!;
    for (const [width, height] of [
      [1920, 1080],
      [1600, 900],
      [1366, 768],
    ]) {
      await viewport(app, page, { width, height });
      await page.getByRole("button", { name: "重設地圖", exact: true }).click();
      await click(callout.x + 25, callout.y);
      await expect(page.locator(".incident-inspector")).toContainText(
        incident!.subjectId,
      );
      const p = await point(callout.x + 25, callout.y);
      await page.mouse.move(p.x, p.y);
      await expect(page.locator(".map-footer")).toContainText(
        incident!.subjectId,
      );
      await capture(app, page, resolve(output, `${scenario}-${width}.png`));
      checks.push({
        scenario,
        width,
        height,
        incident: incident!.subjectId,
        click: true,
        hover: true,
      });
    }
    await viewport(app, page, { width: 1600, height: 900 });
    await page.getByRole("button", { name: "重設地圖", exact: true }).click();
    await click(callout.x + 25, callout.y);
    const checkbox = page.getByRole("checkbox").first();
    const unitId = (await checkbox.getAttribute("aria-label"))!.replace(
      "派遣 ",
      "",
    );
    await checkbox.check();
    await page.getByRole("button", { name: "發布命令", exact: true }).click();
    await expect(page.locator(".queue")).toContainText(unitId);
    let routeUnit: CommandCenterView["units"][number] | undefined;
    for (let k = 0; k < 12; k++) {
      await step("推進 10秒");
      const received = await page.evaluate(() => window.mapInteractionView!);
      routeUnit = received.units.find(
        (u) => u.id === unitId && u.belief?.claim.route?.length,
      );
      if (routeUnit) break;
    }
    expect(
      routeUnit,
      "a real received dispatched route must exist",
    ).toBeDefined();
    const current = await page.evaluate(() => window.mapInteractionView!);
    const unitNode = current.city.nodes.find(
      (n) => n.id === routeUnit!.belief!.claim.nodeId,
    )!;
    const group = current.units.filter(
      (u) => u.belief?.claim.nodeId === unitNode.id,
    );
    const index = group.findIndex((u) => u.id === unitId);
    await click(
      unitNode.x - 16 + (index % 4) * 11,
      unitNode.y + 28 + Math.floor(index / 4) * 11,
    );
    await expect(page.locator(".unit-inspector")).toContainText(unitId);
    const routeNodes = [
      unitNode,
      ...routeUnit!.belief!.claim.route!.map(
        (id) => current.city.nodes.find((n) => n.id === id)!,
      ),
    ];
    const pair = routeNodes
      .slice(0, -1)
      .map((a, i) => [a, routeNodes[i + 1]])
      .find(([a, b]) => a.id !== b.id)!;
    const routePoint = await point(
      (pair[0].x + pair[1].x) / 2,
      (pair[0].y + pair[1].y) / 2,
    );
    await page.mouse.move(routePoint.x, routePoint.y);
    await expect(page.locator(".map-footer")).toContainText("已回報路線");
    await capture(app, page, resolve(output, `${scenario}-route.png`));
    for (const label of [
      "事件",
      "單位",
      "醫療",
      "電力",
      "通訊",
      "道路",
      "淹水",
      "居民",
      "情報",
    ]) {
      const button = page.getByRole("button", { name: label, exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "false");
      await button.click();
    }
    // Close LOD retains exact ground positions and interactive medical anchors.
    for (let k = 0; k < 4; k++)
      await page.getByRole("button", { name: "放大地圖", exact: true }).click();
    await page.locator(".unit-row").filter({ hasText: "ENG-02" }).click();
    await click(
      unitNode.x - 16 + (index % 4) * 11,
      unitNode.y + 28 + Math.floor(index / 4) * 11,
      1.2 ** 4,
    );
    await expect(page.locator(".unit-row.selected")).toContainText(unitId);
    await capture(app, page, resolve(output, `${scenario}-close.png`));
    await page.getByRole("button", { name: "重設地圖", exact: true }).click();
    const before = await page.locator("canvas").screenshot(),
      box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 30,
      box.y + box.height / 2 + 20,
      { steps: 5 },
    );
    await page.mouse.up();
    const after = await page.locator("canvas").screenshot();
    expect(after.equals(before)).toBe(false);
    await page.getByRole("button", { name: "重設地圖", exact: true }).click();
    checks.push({
      scenario,
      unitClick: unitId,
      commandTarget: incident!.subjectId,
      routeHover: true,
      pan: true,
      layers: 9,
    });
  }
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
  passed = true;
} catch (error) {
  await capture(app, page, resolve(output, "failure.png"));
  throw error;
} finally {
  writeFileSync(
    resolve(output, "qa.json"),
    JSON.stringify(
      {
        executable: process.argv[2],
        portable: process.argv.includes("--portable"),
        graphics: process.env.AEGIS_SOFTWARE_RENDERING
          ? "SwiftShader"
          : "ordinary desktop flags",
        checks,
        errors,
        warnings,
        passed,
      },
      null,
      2,
    ),
  );
  await app.close();
}
