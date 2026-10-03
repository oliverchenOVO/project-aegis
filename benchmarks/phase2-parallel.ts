import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";

const count = Number(process.argv[2] ?? 100);
const output = resolve(process.argv[3] ?? "docs/qa/phase2-benchmark.json");
if (!Number.isInteger(count) || count < 1 || count > 1000)
  throw new Error("Invalid count");
const read = (path = output) => JSON.parse(readFileSync(path, "utf8"));
let master = read();
if (
  master.count !== count ||
  master.rows.some((r: { passed: boolean }) => !r.passed)
)
  throw new Error("Invalid existing evidence");
const tasks = ["earthquake", "flood"]
  .flatMap((profile) =>
    Array.from(
      { length: count },
      (_, n) => `phase2-${profile}-${String(n).padStart(4, "0")}`,
    ),
  )
  .concat("phase2-stress-0000")
  .filter(
    (seed) => !master.rows.some((r: { seed: string }) => r.seed === seed),
  );
const directory = resolve("test-results/phase2-workers");
mkdirSync(directory, { recursive: true });
async function worker() {
  for (;;) {
    const seed = tasks.shift();
    if (!seed) return;
    const privateOutput = resolve(directory, `${seed}.json`);
    const before = structuredClone(master);
    writeFileSync(privateOutput, JSON.stringify(before));
    await new Promise<void>((resolveRun, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "benchmarks/phase2.ts",
          String(count),
          privateOutput,
        ],
        {
          env: { ...process.env, AEGIS_ONE_SEED: "1", AEGIS_SELECT_SEED: seed },
          stdio: "inherit",
          windowsHide: true,
        },
      );
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Seed timeout: ${seed}`));
      }, 600000);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolveRun();
        else
          reject(
            new Error(
              `Seed failed: ${seed}, exit ${code}; inspect ${privateOutput}`,
            ),
          );
      });
    });
    const result = read(privateOutput);
    const added = result.rows.filter(
      (r: { seed: string }) =>
        !before.rows.some((old: { seed: string }) => old.seed === r.seed),
    );
    if (
      added.length !== 1 ||
      added[0].seed !== seed ||
      !added[0].passed ||
      master.rows.some((r: { seed: string }) => r.seed === seed)
    )
      throw new Error(`Invalid worker result: ${seed}`);
    master.rows.push(added[0]);
    master.fingerprint = result.fingerprint;
    master.runnerMigration = result.runnerMigration;
    master.sourceCommit = result.sourceCommit;
    master.complete = false;
    master.seedsCompleted = master.rows.filter(
      (r: { profile: string }) => r.profile !== "stress",
    ).length;
    master.failures = 0;
    master.workerConcurrency = 2;
    master.aggregateTicksPerSecond =
      (master.rows.reduce((n: number, r: { ticks: number }) => n + r.ticks, 0) /
        master.rows.reduce((n: number, r: { ms: number }) => n + r.ms, 0)) *
      1000;
    master.minimumTicksPerSecond = Math.min(
      ...master.rows.map((r: { ticksPerSecond: number }) => r.ticksPerSecond),
    );
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(`${output}.tmp`, JSON.stringify(master, null, 2));
    renameSync(`${output}.tmp`, output);
  }
}
await Promise.all([worker(), worker()]);
const final = spawnSync(
  process.execPath,
  ["--import", "tsx", "benchmarks/phase2.ts", String(count), output],
  {
    env: { ...process.env, AEGIS_ONE_SEED: "0", AEGIS_SELECT_SEED: "" },
    stdio: "inherit",
    windowsHide: true,
    timeout: 600000,
  },
);
if (final.status !== 0 || !read().complete)
  throw new Error("Final benchmark gate failed");
master = read();
master.workerConcurrency = 2;
master.orchestration =
  "Preserved serial evidence; remaining seeds use two isolated processes with private output files and serial parent merges. Timings are measured under actual host load.";
writeFileSync(output, JSON.stringify(master, null, 2));
