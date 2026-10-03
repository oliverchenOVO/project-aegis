import { build, Platform, Arch } from "electron-builder";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  existsSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
// Stage on local storage: some redirected Windows workspace drives reject directory renames.
const temporaryRoot = realpathSync(tmpdir());
const staging = mkdtempSync(join(temporaryRoot, "aegis-windows-"));
const output = resolve("release");
let copied = false;
if (!existsSync(resolve("node_modules/electron/dist/electron.exe"))) {
  execFileSync(
    process.execPath,
    [resolve("node_modules/electron/install.js")],
    { stdio: "inherit" },
  );
}
try {
  await build({
    publish: "never",
    targets: Platform.WINDOWS.createTarget(["portable"], Arch.x64),
    config: {
      compression: "store",
      electronDist: resolve("node_modules/electron/dist"),
      directories: { output: staging },
    },
  });
  mkdirSync(output, { recursive: true });
  mkdirSync(join(output, "windows-runtime"), { recursive: true });
  const quote = (value) => "'" + value.replace(/'/g, "''") + "'";
  // Native PowerShell copying also works on redirected drives whose Node directory-copy semantics differ.
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      [
        "$ErrorActionPreference = 'Stop'",
        `$source = ${quote(join(staging, "win-unpacked"))}`,
        `$target = ${quote(join(output, "windows-runtime"))}`,
        "Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $target -Recurse -Force",
        `Get-ChildItem -LiteralPath ${quote(staging)} -Filter 'AEGIS-*.exe' -File | Copy-Item -Destination ${quote(output)} -Force`,
      ].join("\n"),
    ],
    { stdio: "inherit", windowsHide: true },
  );
  if (!existsSync(join(output, "windows-runtime/Project AEGIS.exe")))
    throw new Error("Packaged executable copy failed");
  if (!existsSync(join(output, "AEGIS-0.1.0-Windows-x64.exe")))
    throw new Error("Portable executable copy failed");
  copied = true;
  console.log(`Windows artifacts: ${output}`);
} finally {
  const actual = realpathSync(staging),
    inside = relative(temporaryRoot, actual);
  if (
    copied &&
    !inside.startsWith("..") &&
    inside.startsWith("aegis-windows-") &&
    actual === resolve(staging)
  )
    rmSync(actual, { recursive: true, force: true });
  else console.error(`Build staging retained for recovery: ${actual}`);
}
if (!existsSync(join(output, "windows-runtime/Project AEGIS.exe")))
  throw new Error("Packaged executable disappeared after staging cleanup");
