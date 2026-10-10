import { createRequire } from "node:module";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
// electron-builder is CommonJS. Loading it directly avoids traversing its large
// re-export graph for synthetic ESM named exports on Windows Node.js 24.
const { build, Platform, Arch } = createRequire(import.meta.url)(
  "electron-builder",
);
// Stage on local storage: some redirected Windows workspace drives reject directory renames.
const temporaryRoot = realpathSync(tmpdir());
const staging = mkdtempSync(join(temporaryRoot, "aegis-windows-"));
const output = resolve("release");
const packageMetadata = JSON.parse(
  readFileSync(resolve("package.json"), "utf8"),
);
const appDirectory = join(staging, "app");
const buildDirectory = join(staging, "artifacts");
const quote = (value) => "'" + value.replace(/'/g, "''") + "'";
let copied = false;
if (!existsSync(resolve("node_modules/electron/dist/electron.exe"))) {
  execFileSync(
    process.execPath,
    [resolve("node_modules/electron/install.js")],
    { stdio: "inherit" },
  );
}
try {
  mkdirSync(join(appDirectory, "apps/desktop"), { recursive: true });
  // All runtime imports except Electron are already bundled. Stage only the runtime,
  // without the source repository's development/production node_modules tree.
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      [
        "$ErrorActionPreference = 'Stop'",
        `Copy-Item -LiteralPath ${quote(resolve("dist"))} -Destination ${quote(appDirectory)} -Recurse -Force`,
        `Copy-Item -LiteralPath ${quote(resolve("apps/desktop/dist"))} -Destination ${quote(join(appDirectory, "apps/desktop"))} -Recurse -Force`,
      ].join("\n"),
    ],
    { stdio: "inherit", windowsHide: true },
  );
  writeFileSync(
    join(appDirectory, "package.json"),
    JSON.stringify(
      {
        name: packageMetadata.name,
        version: packageMetadata.version,
        private: true,
        description: packageMetadata.description,
        author: packageMetadata.author,
        type: "module",
        main: "apps/desktop/dist/main.cjs",
      },
      null,
      2,
    ),
  );
  await build({
    projectDir: appDirectory,
    publish: "never",
    targets: Platform.WINDOWS.createTarget(["portable"], Arch.x64),
    config: {
      ...packageMetadata.build,
      compression: "normal",
      electronVersion: packageMetadata.devDependencies.electron,
      electronDist: resolve("node_modules/electron/dist"),
      directories: {
        output: buildDirectory,
        buildResources: resolve("assets"),
      },
      win: { ...packageMetadata.build.win, icon: resolve("assets/aegis.ico") },
    },
  });
  mkdirSync(output, { recursive: true });
  mkdirSync(join(output, "windows-runtime"), { recursive: true });
  // Native PowerShell copying also works on redirected drives whose Node directory-copy semantics differ.
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      [
        "$ErrorActionPreference = 'Stop'",
        `$source = ${quote(join(buildDirectory, "win-unpacked"))}`,
        `$target = ${quote(join(output, "windows-runtime"))}`,
        "Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $target -Recurse -Force",
        `Get-ChildItem -LiteralPath ${quote(buildDirectory)} -Filter 'AEGIS-*.exe' -File | Copy-Item -Destination ${quote(output)} -Force`,
      ].join("\n"),
    ],
    { stdio: "inherit", windowsHide: true },
  );
  if (!existsSync(join(output, "windows-runtime/Project AEGIS.exe")))
    throw new Error("Packaged executable copy failed");
  if (
    !existsSync(
      join(output, `AEGIS-${packageMetadata.version}-Windows-x64.exe`),
    )
  )
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
