import { expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { launch } from "./launch";
import { viewport, capture } from "./capture";
import type { CommandCenterView } from "../../packages/domain/src/index";

declare global {
  interface Window {
    aegisMapQa: {
      draws: number;
      view?: CommandCenterView;
      receivedAt?: number;
      panCosts?: number[];
      pointerStarted?: number;
      pointerDraws?: number;
      panDraws?: number[];
      panProbe?: {
        start: (event: PointerEvent) => void;
        end: (event: PointerEvent) => void;
      };
    };
  }
}
const output = resolve(process.argv[3] ?? "test-results/map-visual");
mkdirSync(output, { recursive: true });
const started = performance.now();
const app = await launch(
  process.argv[2] === "--dev" ? undefined : process.argv[2],
  process.argv.includes("--portable"),
);
const launchMs = performance.now() - started;
const page = await app.firstWindow();
const runtime = await app.evaluate(({ app }) => ({
  version: app.getVersion(),
  gpuFeatures: app.getGPUFeatureStatus(),
}));
const errors: string[] = [],
  warnings: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (event) => {
  if (event.type() === "error") errors.push(event.text());
  if (event.type() === "warning") warnings.push(event.text());
});
const rows: Record<string, unknown>[] = [];
let passed = false;
const sample = async (action: () => Promise<unknown>) => {
  const start = performance.now();
  await action();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  return performance.now() - start;
};
const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: values,
    p50Ms: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
};
try {
  await viewport(app, page, { width: 1600, height: 900 });
  await page.evaluate(() => {
    window.aegisMapQa = { draws: 0 };
    for (const Context of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const prototype = Context.prototype;
      const drawArrays = prototype.drawArrays,
        drawElements = prototype.drawElements;
      prototype.drawArrays = function (...args) {
        window.aegisMapQa.draws++;
        return drawArrays.apply(this, args);
      };
      prototype.drawElements = function (...args) {
        window.aegisMapQa.draws++;
        return drawElements.apply(this, args);
      };
    }
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", (event) => {
          if (event.data.result?.view) {
            window.aegisMapQa.view = event.data.result.view;
            window.aegisMapQa.receivedAt = performance.now();
          }
        });
      }
    };
  });
  expect(await page.title()).toContain("AEGIS");
  for (const scenario of ["earthquake", "flood"]) {
    if (scenario === "flood") {
      await page
        .getByRole("button", { name: "返回主選單", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", {
          name: "返回主選單",
          exact: true,
        })
        .click();
    }
    await page.getByLabel("災害場景").selectOption(scenario);
    await page
      .locator("#seed")
      .fill(scenario === "flood" ? "AEGIS-FLOOD-2026-001" : "AEGIS-2026-001");
    const before = await page.evaluate(() => window.aegisMapQa.draws);
    const firstMapRenderMs = await sample(async () => {
      await page
        .getByRole("button", { name: "開始新情境", exact: true })
        .click();
      await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
      await expect
        .poll(() => page.evaluate(() => window.aegisMapQa.draws))
        .toBeGreaterThan(before);
    });
    await expect(page.locator(".unit-row").first()).toContainText("未知");
    await expect(page.locator(".operation-banner")).toContainText("電力：未知");
    await page.evaluate(() => {
      // A scenario remount installs a new Map listener. Reattach the end probe
      // after it; retaining the first probe would measure before the second map.
      const previous = window.aegisMapQa.panProbe;
      if (previous) {
        window.removeEventListener("pointermove", previous.start, true);
        window.removeEventListener("pointermove", previous.end);
      }
      const probe = {
        start(event: PointerEvent) {
          if (event.buttons !== 1) return;
          window.aegisMapQa.pointerStarted = performance.now();
          window.aegisMapQa.pointerDraws = window.aegisMapQa.draws;
        },
        end(event: PointerEvent) {
          if (event.buttons !== 1) return;
          window.aegisMapQa.panCosts!.push(
            performance.now() - window.aegisMapQa.pointerStarted!,
          );
          window.aegisMapQa.panDraws!.push(
            window.aegisMapQa.draws - window.aegisMapQa.pointerDraws!,
          );
        },
      };
      window.aegisMapQa.panProbe = probe;
      window.aegisMapQa.panCosts = [];
      window.aegisMapQa.panDraws = [];
      window.addEventListener("pointermove", probe.start, true);
      window.addEventListener("pointermove", probe.end);
    });
    await capture(app, page, resolve(output, `${scenario}-early.png`));
    const webglRenderer = await page.evaluate(() => {
      const canvas = document.querySelector("canvas")!;
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) return "unavailable";
      const extension = gl.getExtension("WEBGL_debug_renderer_info");
      return String(
        gl.getParameter(
          extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
        ),
      );
    });
    const idle = await page.evaluate(async () => {
      const counts: number[] = [];
      for (let n = 0; n < 8; n++) {
        await new Promise(requestAnimationFrame);
        counts.push(window.aegisMapQa.draws);
      }
      return counts.slice(2);
    });
    expect(new Set(idle).size).toBe(1);
    const zoom: number[] = [],
      toggles: number[] = [];
    for (let n = 0; n < 8; n++)
      zoom.push(
        await sample(() =>
          page
            .getByRole("button", {
              name: n % 2 ? "縮小地圖" : "放大地圖",
              exact: true,
            })
            .click(),
        ),
      );
    for (let n = 0; n < 8; n++)
      toggles.push(
        await sample(() =>
          page.getByRole("button", { name: "淹水", exact: true }).click(),
        ),
      );
    await page.getByRole("button", { name: "重設地圖", exact: true }).click();
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const panStarted = performance.now(),
      frames = 24;
    for (let n = 1; n <= frames; n++) {
      await page.mouse.move(
        box.x + box.width / 2 + n * 2,
        box.y + box.height / 2 + n,
      );
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    const panMs = performance.now() - panStarted;
    await page.mouse.up();
    await page.getByRole("button", { name: "重設地圖", exact: true }).click();
    const running: number[] = [];
    const receivedUpdateToFrameMs: number[] = [];
    for (let n = 0; n < 4; n++) {
      running.push(
        await sample(async () => {
          const tick = await page.evaluate(
            () => window.aegisMapQa.view?.tick ?? -1,
          );
          await page
            .getByRole("button", { name: "推進 5分", exact: true })
            .click();
          await expect
            .poll(
              () => page.evaluate(() => window.aegisMapQa.view?.tick ?? -1),
              { timeout: 30000 },
            )
            .toBe(tick + 300);
        }),
      );
      receivedUpdateToFrameMs.push(
        await page.evaluate(
          () =>
            performance.now() -
            (window.aegisMapQa.receivedAt ?? performance.now()),
        ),
      );
      if (n === 1)
        await capture(app, page, resolve(output, `${scenario}-mid.png`));
    }
    await capture(app, page, resolve(output, `${scenario}-late.png`));
    const denseFocusBefore = await page.evaluate(() => {
      window.aegisMapQa.panCosts = [];
      window.aegisMapQa.panDraws = [];
      return {
        focused: document.hasFocus(),
        visibility: document.visibilityState,
      };
    });
    const densePanStarted = performance.now();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const denseFrameSamples: { inputMs: number; rafMs: number }[] = [];
    for (let n = 1; n <= frames; n++) {
      const inputStarted = performance.now();
      await page.mouse.move(
        box.x + box.width / 2 + n * 2,
        box.y + box.height / 2 + n,
      );
      const inputMs = performance.now() - inputStarted;
      const rafStarted = performance.now();
      await page.evaluate(() => new Promise(requestAnimationFrame));
      denseFrameSamples.push({
        inputMs,
        rafMs: performance.now() - rafStarted,
      });
    }
    await page.mouse.up();
    const densePanMs = performance.now() - densePanStarted;
    const denseDiagnostics = await page.evaluate(() => ({
      focused: document.hasFocus(),
      visibility: document.visibilityState,
      costs: window.aegisMapQa.panCosts!,
      drawCalls: window.aegisMapQa.panDraws!,
    }));
    await page.getByRole("button", { name: "重設地圖", exact: true }).click();
    const denseIdle = await page.evaluate(async () => {
      const counts: number[] = [];
      for (let i = 0; i < 8; i++) {
        await new Promise(requestAnimationFrame);
        counts.push(window.aegisMapQa.draws);
      }
      return counts.slice(2);
    });
    expect(new Set(denseIdle).size).toBe(1);
    rows.push({
      scenario,
      webglRenderer,
      firstMapRenderMs,
      idleDraws: idle,
      idleAdditionalDraws: idle.at(-1)! - idle[0],
      denseIdleAdditionalDraws: denseIdle.at(-1)! - denseIdle[0],
      zoom: stats(zoom),
      layerToggle: stats(toggles),
      pan: {
        frames,
        ms: panMs,
        effectiveFramesPerSecond: (frames / panMs) * 1000,
      },
      stepAndRender: stats(running),
      densePan: {
        tick: 1200,
        frames,
        ms: densePanMs,
        effectiveFramesPerSecond: (frames / densePanMs) * 1000,
      },
      denseFocusBefore,
      denseFocusAfter: {
        focused: denseDiagnostics.focused,
        visibility: denseDiagnostics.visibility,
      },
      densePanHandler: stats(denseDiagnostics.costs),
      densePanDrawCalls: denseDiagnostics.drawCalls,
      denseInput: stats(denseFrameSamples.map((frame) => frame.inputMs)),
      denseRaf: stats(denseFrameSamples.map((frame) => frame.rafMs)),
      receivedUpdateToFrame: stats(receivedUpdateToFrameMs),
    });
    console.log(JSON.stringify(rows.at(-1)));
    expect(denseDiagnostics.drawCalls).toHaveLength(frames);
    expect(
      denseDiagnostics.drawCalls.every((count) => count > 0),
      "each measured drag frame must redraw the actual map",
    ).toBe(true);
    if (scenario === "flood" && !process.argv.includes("--baseline"))
      expect(
        (frames / densePanMs) * 1000,
        "dense flood pan release floor",
      ).toBeGreaterThanOrEqual(12);
  }
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
  expect(await page.locator("vite-error-overlay").count()).toBe(0);
  passed = true;
} finally {
  writeFileSync(
    resolve(output, "qa.json"),
    JSON.stringify(
      {
        executable: process.argv[2],
        browser: "Browser plugin not available; Playwright Electron",
        graphics:
          process.env.AEGIS_SOFTWARE_RENDERING || process.env.CI
            ? "SwiftShader"
            : "ordinary desktop flags",
        launchMs,
        runtime,
        rows,
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
