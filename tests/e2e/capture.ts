import type { ElectronApplication, Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { expect } from "@playwright/test";
type App = Pick<ElectronApplication, "evaluate">;
export async function viewport(
  app: App,
  page: Page,
  size: { width: number; height: number },
) {
  await app.evaluate(({ BrowserWindow }, size) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setContentSize(size.width, size.height);
    window.show();
    window.focus();
  }, size);
  await page.setViewportSize(size);
  await page.bringToFront();
}
export async function capture(app: App, page: Page, path: string) {
  // DOM assertions can complete before the compositor presents the selection frame.
  // Wait across a paint boundary before asking Electron for native pixels.
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  const size = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  // Electron's own compositor capture avoids a remote-desktop CDP resize race.
  const data = await app.evaluate(async ({ BrowserWindow, screen }, size) => {
    const window = BrowserWindow.getAllWindows()[0];
    const image = await window.webContents.capturePage({ x: 0, y: 0, ...size });
    const scale = screen.getDisplayMatching(window.getBounds()).scaleFactor;
    return { data: image.toDataURL(), scale };
  }, size);
  const bytes = Buffer.from(
    data.data.slice(data.data.indexOf(",") + 1),
    "base64",
  );
  // Windows DIP→pixel conversion rounds fractional edges independently.
  expect(
    Math.abs(bytes.readUInt32BE(16) - size.width * data.scale),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(bytes.readUInt32BE(20) - size.height * data.scale),
  ).toBeLessThanOrEqual(1);
  expect(bytes.length).toBeGreaterThan(10000);
  writeFileSync(path, bytes);
}
