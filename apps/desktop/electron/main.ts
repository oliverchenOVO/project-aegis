import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join } from "node:path";
import { writeFile, readFile } from "node:fs/promises";
let window: BrowserWindow;
function authorized(event: Electron.IpcMainInvokeEvent) {
  if (
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw new Error("Unknown IPC sender");
}
app.whenReady().then(() => {
  window = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#10151b",
    title: "Project AEGIS",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  ipcMain.handle("aegis:save", async (event, data: Uint8Array) => {
    authorized(event);
    if (!(data instanceof Uint8Array) || data.byteLength > 20_000_000)
      throw new Error("Invalid save payload");
    const result = await dialog.showSaveDialog(window, {
      title: "儲存 AEGIS 情境",
      defaultPath: "AEGIS.aegis",
      filters: [{ name: "AEGIS save", extensions: ["aegis"] }],
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, data);
    return result.filePath;
  });
  ipcMain.handle("aegis:load", async (event) => {
    authorized(event);
    const result = await dialog.showOpenDialog(window, {
      title: "載入 AEGIS 情境",
      properties: ["openFile"],
      filters: [{ name: "AEGIS save", extensions: ["aegis"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const data = await readFile(result.filePaths[0]);
    if (data.byteLength > 20_000_000) throw new Error("Save is too large");
    return Uint8Array.from(data);
  });
  void window.loadFile(join(__dirname, "../../../dist/index.html"));
});
app.on("window-all-closed", () => app.quit());
