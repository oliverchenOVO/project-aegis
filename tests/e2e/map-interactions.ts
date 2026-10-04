import { expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launch } from "./launch";
import { viewport, capture } from "./capture";
import type { CommandCenterView } from "../../packages/domain/src/index";
import { positionedUnits } from "../../packages/ui/src/map/knowledge";
import { clusterIncidents } from "../../packages/ui/src/map/clusters";
import {
  cityFit,
  cityCamera,
  projectGround,
} from "../../packages/ui/src/map/projection";
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
  const scale = cityFit(box.width, box.height) * zoom,
    p = cityCamera(box.width, box.height, scale, { x: 0, y: 0 }),
    ground = projectGround(x, y);
  return {
    x: box.x + p.x + ground.x * scale,
    y: box.y + p.y + ground.y * scale,
  };
};
const groupsFor = async (view: CommandCenterView, selected?: string) => {
  // Store/DOM selection precedes the change-driven Pixi frame on software renderers.
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  const box = (await page.locator("canvas").boundingBox())!;
  const scale = cityFit(box.width, box.height),
    camera = cityCamera(box.width, box.height, scale, { x: 0, y: 0 });
  const reserved = [...positionedUnits(view)].flatMap(([id, units]) => {
    const n = view.city.nodes.find((n) => n.id === id)!;
    return units.map((_, i) => {
      const p = projectGround(
        n.x - 16 + (i % 4) * 11,
        n.y + 28 + Math.floor(i / 4) * 11,
      );
      return { x: camera.x + p.x * scale, y: camera.y + p.y * scale };
    });
  });
  return {
    box,
    groups: clusterIncidents(
      view,
      camera,
      scale,
      box.width,
      box.height,
      selected,
      reserved,
    ),
  };
};
const selectIncident = async (view: CommandCenterView, id: string) => {
  // Public hospital clears any previous incident selection before computing layout.
  const n = view.city.nodes.find(
    (n) => n.id === view.city.hospitals[0].nodeId,
  )!;
  await click(n.x, n.y);
  const { box, groups } = await groupsFor(view);
  const g = groups.find((g) => g.members.some((b) => b.subjectId === id))!;
  await page.mouse.click(box.x + g.x + 20, box.y + g.y + 12);
  if (g.members.length > 1) {
    await expect(page.getByTestId("cluster-inspector")).toBeVisible();
    await page.getByTestId(`cluster-member-${id}`).click();
  }
  await expect(
    page.locator(".incident-inspector .panel-title .orange"),
  ).toHaveText(id);
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
    .toBe(tick + (name === "推進 5分" ? 300 : name === "推進 1分" ? 60 : 10));
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
    for (const [width, height] of [
      [1920, 1080],
      [1600, 900],
      [1366, 768],
    ]) {
      await viewport(app, page, { width, height });
      await page.getByRole("button", { name: "重設地圖", exact: true }).click();
      const hospital = unknown.city.hospitals[0],
        hospitalNode = unknown.city.nodes.find(
          (n) => n.id === hospital.nodeId,
        )!;
      await click(hospitalNode.x, hospitalNode.y);
      await expect(page.locator(".intel-panel")).toContainText(
        `${hospital.id}：狀態未知`,
      );
      const comm = unknown.city.communicationNodes![0],
        commNode = unknown.city.nodes.find((n) => n.id === comm.nodeId)!;
      await click(commNode.x + 30, commNode.y - 10);
      await expect(page.locator(".intel-panel")).toContainText(
        `${comm.id}：狀態未知`,
      );
      const zone = unknown.city.floodZones?.[0];
      if (zone) {
        const zoneNode = unknown.city.nodes.find(
          (n) => n.id === zone.nodeIds[0],
        )!;
        await click(zoneNode.x - 25, zoneNode.y + 25);
        await expect(page.locator(".intel-panel")).toContainText(
          `${zone.id}：狀態未知`,
        );
      }
      checks.push({
        scenario,
        width,
        height,
        projectedHospital: true,
        projectedComms: true,
        projectedFlood: !!zone,
      });
    }
    await viewport(app, page, { width: 1600, height: 900 });
    await page.getByRole("button", { name: "重設地圖", exact: true }).click();
    await step();
    const view = await page.evaluate(() => window.mapInteractionView!);
    const incident =
      view.beliefs.find(
        (b) =>
          b.kind === "INCIDENT" && b.claim.incidentType === "BUILDING_COLLAPSE",
      ) ?? view.beliefs.find((b) => b.kind === "INCIDENT");
    expect(incident).toBeDefined();
    for (const [width, height] of [
      [1920, 1080],
      [1600, 900],
      [1366, 768],
    ]) {
      await viewport(app, page, { width, height });
      await page.getByRole("button", { name: "重設地圖", exact: true }).click();
      await selectIncident(view, incident!.subjectId);
      await expect(page.locator(".incident-inspector")).toContainText(
        incident!.subjectId,
      );
      const { box, groups } = await groupsFor(view, incident!.subjectId);
      const plate = groups.find(
        (g) => g.members[0].subjectId === incident!.subjectId,
      )!;
      await page.mouse.move(box.x + 2, box.y + 2);
      await page.mouse.move(box.x + plate.x + 20, box.y + plate.y + 12);
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
    await selectIncident(view, incident!.subjectId);
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
    {
      await step("推進 5分");
      await step("推進 5分");
      const heavy = await page.evaluate(() => window.mapInteractionView!);
      const ids = heavy.beliefs
        .filter((b) => b.kind === "INCIDENT")
        .map((b) => b.subjectId)
        .sort();
      for (const [width, height] of [
        [1920, 1080],
        [1600, 900],
        [1366, 768],
      ]) {
        await viewport(app, page, { width, height });
        await page
          .getByRole("button", { name: "重設地圖", exact: true })
          .click();
        const n = heavy.city.nodes.find(
          (n) => n.id === heavy.city.hospitals[0].nodeId,
        )!;
        await click(n.x, n.y);
        const { box, groups } = await groupsFor(heavy);
        expect(
          groups.flatMap((g) => g.members.map((b) => b.subjectId)).sort(),
        ).toEqual(ids);
        expect(groups.length).toBeLessThan(ids.length);
        const cluster = groups.find((g) => g.members.length > 1)!;
        await page.mouse.click(box.x + cluster.x + 20, box.y + cluster.y + 12);
        await expect(page.getByTestId("cluster-inspector")).toBeVisible();
        await expect(
          page
            .getByTestId("cluster-inspector")
            .getByRole("heading", { name: "事件聚合", exact: true }),
        ).toBeInViewport();
        await expect(
          page.locator('[data-testid^="cluster-member-"]'),
        ).toHaveCount(cluster.members.length);
        await capture(
          app,
          page,
          resolve(output, `${scenario}-cluster-selected-${width}.png`),
        );
        const member = cluster.members[0].subjectId;
        await page.getByTestId(`cluster-member-${member}`).click();
        await expect(
          page.locator(".incident-inspector .panel-title .orange"),
        ).toHaveText(member);
        await expect(
          page.getByRole("button", { name: "發布命令", exact: true }),
        ).toBeVisible();
        await capture(
          app,
          page,
          resolve(output, `${scenario}-clusters-${width}.png`),
        );
        if (width === 1600) {
          const compatible = page.getByRole("checkbox").first();
          const dispatchedId = (await compatible.getAttribute(
            "aria-label",
          ))!.replace("派遣 ", "");
          await compatible.check();
          await page
            .getByRole("button", { name: "發布命令", exact: true })
            .click();
          await expect(page.locator(".queue")).toContainText(member);
          await expect(page.locator(".queue")).toContainText(dispatchedId);
          checks.push({
            scenario,
            clusterDispatchTarget: member,
            unit: dispatchedId,
          });
        }
        for (const u of heavy.units
          .filter((u) => u.belief?.claim.nodeId)
          .slice(0, 3)) {
          const n = heavy.city.nodes.find(
            (n) => n.id === u.belief!.claim.nodeId,
          )!;
          const i = heavy.units
            .filter((v) => v.belief?.claim.nodeId === n.id)
            .findIndex((v) => v.id === u.id);
          await click(
            n.x - 16 + (i % 4) * 11,
            n.y + 28 + Math.floor(i / 4) * 11,
          );
          await expect(page.locator(".unit-row.selected")).toContainText(u.id);
        }
        checks.push({
          scenario,
          width,
          height,
          tick: heavy.tick,
          received: ids.length,
          plates: groups.length,
          clusterMembers: cluster.members.length,
          clusterSelection: true,
          memberInspector: true,
          vehicles: true,
        });
      }
    }
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
        graphics:
          process.env.AEGIS_SOFTWARE_RENDERING || process.env.CI
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
