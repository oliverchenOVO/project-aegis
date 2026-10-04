import {
  _electron,
  chromium,
  type ElectronApplication,
} from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";

async function port() {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing debug port");
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}
async function endpoint(port: number, path: string) {
  // Portable extraction and software-driver startup can exceed 30s on busy Windows.
  // This readiness deadline is outside all recorded map/interaction intervals.
  for (let n = 0; n < 120; n++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return await response.json();
    } catch {
      /* Wait for this launched process to extract/start. */
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(
    `Launched process did not expose debug endpoint ${port}${path}`,
  );
}
export async function launch(
  executable?: string,
  portable = false,
): Promise<Pick<ElectronApplication, "firstWindow" | "evaluate" | "close">> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const graphicsArgs =
    process.env.CI || process.env.AEGIS_SOFTWARE_RENDERING
      ? [
          "--use-gl=angle",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
          "--disable-renderer-backgrounding",
        ]
      : [];
  if (!portable) {
    const application = await _electron.launch({
      ...(executable
        ? { executablePath: resolve(executable), args: graphicsArgs }
        : { args: [resolve("apps/desktop/dist/main.cjs"), ...graphicsArgs] }),
      env,
      timeout: 30000,
    });
    await application.firstWindow();
    await application.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.setBackgroundThrottling(false);
        window.show();
        window.focus();
      }
    });
    return application;
  }
  if (!executable)
    throw new Error("Portable test requires its wrapper executable");
  const browserPort = await port(),
    nodePort = await port();
  const processHandle = spawn(
    resolve(executable),
    [
      `--remote-debugging-port=${browserPort}`,
      `--inspect=127.0.0.1:${nodePort}`,
      ...graphicsArgs,
    ],
    { env, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  let startupLog = "";
  processHandle.stderr?.on("data", (bytes) => {
    startupLog = (startupLog + String(bytes)).slice(-4000);
  });
  let browserPid: number | undefined;
  let socket: WebSocket | undefined;
  let inspectorVerified = false;
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  const close = async () => {
    if (inspectorVerified && socket?.readyState === WebSocket.OPEN) {
      // Graceful Electron quit lets the portable wrapper finish removing its own
      // extraction. Force-killing the wrapper after 5s can leave ~900MB behind.
      socket.send(
        JSON.stringify({
          id: 0,
          method: "Runtime.evaluate",
          params: { expression: "require('electron').app.quit()" },
        }),
      );
      if (processHandle.exitCode === null)
        await new Promise<void>((done) => {
          const timer = setTimeout(finish, 20000);
          function finish() {
            clearTimeout(timer);
            processHandle.removeListener("exit", finish);
            done();
          }
          processHandle.once("exit", finish);
        });
    }
    socket?.close();
    await browser?.close().catch(() => {});
    // Kill only the browser PID obtained from this wrapper's reserved CDP port.
    if (browserPid) {
      try {
        execFileSync("taskkill", ["/PID", String(browserPid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } catch {
        /* Already closed. */
      }
    }
    if (processHandle.exitCode === null) {
      await new Promise<void>((done) => {
        const timer = setTimeout(() => {
          processHandle.removeListener("exit", finish);
          done();
        }, 5000);
        const finish = () => {
          clearTimeout(timer);
          done();
        };
        processHandle.once("exit", finish);
      });
      if (processHandle.exitCode === null) processHandle.kill();
    }
  };
  try {
    await endpoint(browserPort, "/json/version");
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${browserPort}`);
    const cdp = await browser.newBrowserCDPSession();
    const info = (await cdp.send("SystemInfo.getProcessInfo")) as {
      processInfo: { id: number; type: string }[];
    };
    browserPid = info.processInfo.find((p) => p.type === "browser")?.id;
    if (!browserPid)
      throw new Error("Could not identify launched portable browser process");
    const targets = (await endpoint(nodePort, "/json/list")) as {
      webSocketDebuggerUrl: string;
    }[];
    socket = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise<void>((done, reject) => {
      socket!.addEventListener("open", () => done(), { once: true });
      socket!.addEventListener(
        "error",
        () => reject(new Error("Inspector connection failed")),
        { once: true },
      );
    });
    let sequence = 0;
    const pending = new Map<
      number,
      { done: (value: unknown) => void; reject: (error: Error) => void }
    >();
    socket.addEventListener("message", (e) => {
      const response = JSON.parse(String(e.data));
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      if (response.error)
        request.reject(new Error(JSON.stringify(response.error)));
      else request.done(response.result);
    });
    const evaluateExpression = async (expression: string) => {
      const id = ++sequence;
      const result = (await new Promise<unknown>((done, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("Inspector evaluation timeout"));
        }, 30000);
        pending.set(id, {
          done: (value) => {
            clearTimeout(timer);
            done(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        socket!.send(
          JSON.stringify({
            id,
            method: "Runtime.evaluate",
            params: {
              expression,
              includeCommandLineAPI: true,
              awaitPromise: true,
              returnByValue: true,
            },
          }),
        );
      })) as { result: { value: unknown }; exceptionDetails?: unknown };
      if (result.exceptionDetails)
        throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    if ((await evaluateExpression("process.pid")) !== browserPid)
      throw new Error("Inspector and renderer belong to different processes");
    inspectorVerified = true;
    // Mirrors Playwright's Electron main-process evaluation, including require access.
    const evaluate = ((fn: unknown, arg: unknown) =>
      evaluateExpression(
        `(${String(fn)})(require('electron'),${JSON.stringify(arg) ?? "undefined"})`,
      )) as ElectronApplication["evaluate"];
    const pages = browser.contexts()[0].pages();
    const page = pages[0] ?? (await browser.contexts()[0].waitForEvent("page"));
    await evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.setBackgroundThrottling(false);
        window.show();
        window.focus();
      }
    });
    return { firstWindow: async () => page, evaluate, close };
  } catch (error) {
    await close();
    throw new Error(
      `${String(error)}; portable exit=${processHandle.exitCode}; ${startupLog}`,
    );
  }
}
