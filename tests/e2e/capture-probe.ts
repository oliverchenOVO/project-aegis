import { launch } from "./launch";
import { capture, viewport } from "./capture";
import { mkdirSync } from "node:fs";
import { expect } from "@playwright/test";
mkdirSync("test-results/capture-probe", { recursive: true });
const app = await launch("release/windows-runtime/Project AEGIS.exe");
try {
  const page = await app.firstWindow();
  await page.getByLabel("災害場景").selectOption("flood");
  await page.getByRole("button", { name: "開始新情境", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible();
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 1600, height: 900 },
    { width: 1366, height: 768 },
    { width: 1664, height: 941 },
    { width: 700, height: 900 },
  ]) {
    await viewport(app, page, size);
    await capture(app, page, `test-results/capture-probe/${size.width}.png`);
    console.log(JSON.stringify({ size, passed: true }));
  }
} finally {
  await app.close();
}
