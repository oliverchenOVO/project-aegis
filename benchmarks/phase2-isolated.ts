import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
const count = Number(process.argv[2] ?? 100),
  output = process.argv[3] ?? "docs/qa/phase2-benchmark.json";
if (!Number.isInteger(count) || count < 1 || count > 1000)
  throw new Error("Invalid seed count");
const read = () =>
  existsSync(output) ? JSON.parse(readFileSync(output, "utf8")) : { rows: [] };
for (let n = 0; n < 2 * count + 2; n++) {
  const before = read();
  if (before.rows.some((r: { passed: boolean }) => !r.passed))
    throw new Error("Existing failed seed requires investigation");
  if (before.rows.length === 2 * count + 1) break;
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "benchmarks/phase2.ts", String(count), output],
    {
      env: { ...process.env, AEGIS_ONE_SEED: "1" },
      stdio: "inherit",
      windowsHide: true,
      timeout: 600000,
    },
  );
  if (child.status !== 0)
    throw new Error(
      `Isolated worker failed: ${child.status}, ${child.error ?? "see seed evidence"}`,
    );
  if (read().rows.length !== before.rows.length + 1)
    throw new Error("Worker did not persist exactly one fully validated seed");
}
const final = spawnSync(
  process.execPath,
  ["--import", "tsx", "benchmarks/phase2.ts", String(count), output],
  {
    env: { ...process.env, AEGIS_ONE_SEED: "0" },
    stdio: "inherit",
    windowsHide: true,
    timeout: 600000,
  },
);
if (final.status !== 0 || !read().complete)
  throw new Error("Final benchmark gate failed");
