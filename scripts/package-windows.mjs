import { build, Platform, Arch } from "electron-builder";
import {
  mkdtempSync,
  cpSync,
  mkdirSync,
  readdirSync,
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
      electronDist: resolve("node_modules/electron/dist"),
      directories: { output: staging },
    },
  });
  mkdirSync(output, { recursive: true });
  mkdirSync(join(output, "windows-runtime"), { recursive: true });
  cpSync(join(staging, "win-unpacked"), join(output, "windows-runtime"), {
    recursive: true,
    dereference: true,
  });
  if (!existsSync(join(output, "windows-runtime/Project AEGIS.exe")))
    throw new Error("Packaged executable copy failed");
  for (const file of readdirSync(staging).filter((file) =>
    /^AEGIS-.*\.exe$/.test(file),
  ))
    cpSync(join(staging, file), join(output, file));
  console.log(`Windows artifacts: ${output}`);
} finally {
  const actual = realpathSync(staging),
    inside = relative(temporaryRoot, actual);
  if (
    !inside.startsWith("..") &&
    inside.startsWith("aegis-windows-") &&
    actual === resolve(staging)
  )
    rmSync(actual, { recursive: true, force: true });
}
if (!existsSync(join(output, "windows-runtime/Project AEGIS.exe")))
  throw new Error("Packaged executable disappeared after staging cleanup");
