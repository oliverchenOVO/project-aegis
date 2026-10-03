import { build, Platform, Arch } from "electron-builder";
import {
  mkdtempSync,
  cpSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
// Stage on local storage: some redirected Windows workspace drives reject directory renames.
const temporaryRoot = realpathSync(tmpdir());
const staging = mkdtempSync(join(temporaryRoot, "aegis-windows-"));
const output = resolve("release");
try {
  await build({
    targets: Platform.WINDOWS.createTarget(["portable"], Arch.x64),
    config: {
      electronDist: resolve("node_modules/electron/dist"),
      directories: { output: staging },
    },
  });
  mkdirSync(output, { recursive: true });
  cpSync(join(staging, "win-unpacked"), join(output, "win-unpacked"), {
    recursive: true,
  });
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
