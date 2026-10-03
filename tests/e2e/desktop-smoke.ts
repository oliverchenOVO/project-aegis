import { _electron as electron, expect } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const output = resolve("test-results");
mkdirSync(output, { recursive: true });
const executable = process.argv[2];
const env: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  ...(executable
    ? { executablePath: resolve(executable), args: [] }
    : { args: [resolve("apps/desktop/dist/main.cjs")] }),
  env,
  timeout: 30000,
});
const page = await app.firstWindow();
const errors: string[] = [],
  warnings: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (e) => {
  if (e.type() === "error") errors.push(e.text());
  if (e.type() === "warning") warnings.push(e.text());
});
try {
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(
    page.getByRole("heading", { name: "啟動應變中心" }),
  ).toBeVisible();
  await page.screenshot({ path: resolve(output, "menu.png") });
  await page.getByRole("button", { name: "開始新情境", exact: true }).click();
  await expect(page.getByRole("heading", { name: "態勢地圖" })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "推進 1分", exact: true }).click();
  await expect(page.getByTestId("sim-clock")).toHaveText("14:01:00");
  await page.getByRole("button", { name: "推進 1分", exact: true }).click();
  await expect(page.getByTestId("sim-clock")).toHaveText("14:02:00");
  await page.getByLabel("情報篩選").selectOption("INCIDENT");
  await expect(page.locator(".report-row").first()).toBeVisible();
  await page
    .locator(".report-row")
    .filter({ hasText: "INC-1" })
    .first()
    .click();
  await page.getByLabel("派遣 ENG-01", { exact: true }).check();
  await page.getByRole("button", { name: "發布命令", exact: true }).click();
  await expect(page.locator(".queue")).toContainText("已送出");
  await page.getByRole("button", { name: "推進 5分", exact: true }).click();
  await expect(page.getByTestId("sim-clock")).toHaveText("14:07:00");
  await expect(page.locator(".queue")).toContainText("已確認");
  await page
    .getByRole("button", { name: "ENG-01", exact: false })
    .first()
    .click();
  await page.getByRole("button", { name: "查詢", exact: true }).click();
  await page.getByRole("button", { name: "推進 5分", exact: true }).click();
  await expect(page.getByTestId("sim-clock")).toHaveText("14:12:00");
  await expect(page.locator(".unit-inspector")).toContainText("INC-1");
  await page
    .locator(".report-row")
    .filter({ hasText: "INC-1" })
    .first()
    .click();
  await page.getByRole("button", { name: "放大地圖" }).click();
  await page.getByRole("button", { name: "重設地圖" }).click();
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 1600, height: 900 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(size);
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth > innerWidth,
      y: document.documentElement.scrollHeight > innerHeight,
    }));
    expect(overflow, `overflow ${size.width}`).toEqual({ x: false, y: false });
    await expect(page.getByRole("heading", { name: "態勢地圖" })).toBeVisible();
    await page.screenshot({
      path: resolve(output, `command-${size.width}.png`),
    });
  }
  await page.setViewportSize({ width: 1664, height: 941 });
  await page.screenshot({ path: resolve(output, "command-native.png") });
  await page.setViewportSize({ width: 700, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: resolve(output, "command-small.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  const filePath = resolve(output, "smoke.aegis");
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, filePath);
  await page.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(page.locator(".controlbar")).toContainText("已儲存");
  await page.getByRole("button", { name: "推進 1分", exact: true }).click();
  await expect(page.getByTestId("sim-clock")).toHaveText("14:13:00");
  await page.getByRole("button", { name: "載入", exact: true }).click();
  await expect(page.getByTestId("sim-clock")).toHaveText("14:12:00");
  const validBytes = readFileSync(filePath);
  writeFileSync(filePath, "corrupt save");
  await page.getByRole("button", { name: "載入", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByRole("alertdialog")).toContainText("無法讀取");
  await page.screenshot({ path: resolve(output, "corrupt-save.png") });
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  writeFileSync(filePath, validBytes);
  for (let n = 0; n < 6; n++) {
    const advance = page.getByRole("button", { name: "推進 5分", exact: true });
    if (!(await advance.isVisible())) break;
    await advance.click();
    await expect(advance)
      .toBeEnabled({ timeout: 10000 })
      .catch(() => undefined);
  }
  await expect(page.getByRole("heading", { name: "行動檢討報告" })).toBeVisible(
    { timeout: 15000 },
  );
  await page.screenshot({ path: resolve(output, "aar.png") });
  await page.getByRole("button", { name: "驗證並重播", exact: true }).click();
  await expect(page.locator(".operation-banner")).toContainText(
    "完整結果校驗通過",
  );
  await page.getByRole("button", { name: "推進 5分", exact: true }).click();
  await expect(page.getByTestId("sim-clock")).toHaveText("14:05:00");
  await page.getByLabel("重播定位").fill("900");
  await expect(page.getByTestId("sim-clock")).toHaveText("14:15:00");
  await page.screenshot({ path: resolve(output, "replay.png") });
  await page.getByRole("button", { name: "返回 AAR", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "行動檢討報告" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  const report = {
    executable: executable ?? "development Electron production renderer",
    viewports: ["1920×1080", "1600×900", "1366×768", "1664×941", "700×900"],
    checks: [
      "launch/menu",
      "scenario",
      "intel",
      "dispatch",
      "command ack",
      "unit route",
      "map zoom",
      "responsive overflow",
      "save/load",
      "corrupt save",
      "natural completion",
      "AAR",
      "verified replay",
      "seek",
    ],
    errors,
    warnings,
    passed: true,
  };
  writeFileSync(
    resolve(output, "desktop-smoke.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page
    .screenshot({ path: resolve(output, "failure.png") })
    .catch(() => undefined);
  console.error("Console errors:", errors, warnings);
  throw error;
} finally {
  await app.close();
}
