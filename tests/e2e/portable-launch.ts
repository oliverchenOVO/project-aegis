import { chromium, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
const server = createServer();
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("No debug port");
const port = address.port;
await new Promise<void>((resolve) => server.close(() => resolve()));
const executable = resolve(
  process.argv[2] ?? "release/AEGIS-0.1.0-Windows-x64.exe",
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const processHandle = spawn(executable, [`--remote-debugging-port=${port}`], {
  env,
  windowsHide: true,
  stdio: "ignore",
});
let connected = false;
let browserProcessId: number | undefined;
try {
  for (let n = 0; n < 45; n++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        connected = true;
        break;
      }
    } catch {
      /* Portable extraction still running. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!connected)
    throw new Error("Portable app did not expose its launched renderer");
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`),
    page = browser.contexts()[0].pages()[0];
  const cdp = await browser.newBrowserCDPSession();
  const processInfo = (await cdp.send("SystemInfo.getProcessInfo")) as {
    processInfo: { id: number; type: string }[];
  };
  browserProcessId = processInfo.processInfo.find(
    (p) => p.type === "browser",
  )?.id;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(
    page.getByRole("heading", { name: "啟動應變中心" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "開始新情境", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible();
  for (let n = 0; n < 2; n++) {
    await page.getByRole("button", { name: "推進 1分", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "推進 1分", exact: true }),
    ).toBeEnabled();
  }
  await expect(page.getByTestId("sim-clock")).toHaveText("14:02:00");
  await page.getByLabel("情報篩選").selectOption("INCIDENT");
  await page
    .locator(".report-row")
    .filter({ hasText: "INC-1" })
    .first()
    .click();
  await page.getByLabel("派遣 ENG-01", { exact: true }).check();
  await page.getByRole("button", { name: "發布命令", exact: true }).click();
  await expect(page.locator(".queue")).toContainText("已送出");
  await page.getByRole("button", { name: "推進 5分", exact: true }).click();
  await expect(page.locator(".queue")).toContainText("已確認");
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({ path: resolve("test-results/portable-launch.png") });
  expect(errors).toEqual([]);
  const report = {
    executable,
    launchedPortableWrapper: true,
    rendererTitle: await page.title(),
    simTick: await page.getByTestId("sim-clock").textContent(),
    checks: [
      "portable extraction",
      "actual menu",
      "scenario",
      "map",
      "dispatch",
      "command acknowledgment",
    ],
    errors,
    passed: true,
  };
  writeFileSync(
    "test-results/portable-launch.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
} finally {
  if (browserProcessId ?? processHandle.pid) {
    try {
      execFileSync(
        "taskkill",
        ["/PID", String(browserProcessId ?? processHandle.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true },
      );
    } catch {
      /* Wrapper already exited. */
    }
  }
}
