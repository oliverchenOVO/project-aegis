import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const benchmark = read("docs/qa/phase2-benchmark.json"),
  seek = read("docs/qa/phase2-replay-seek.json"),
  pack = read("docs/qa/phase2-windows-package.json"),
  tests = read(process.argv[2] ?? "test-results/final-tests.json");
const packaged = read("docs/qa/phase2-ui-packaged.json"),
  portable = read("docs/qa/phase2-ui-portable.json");
if (
  !benchmark.complete ||
  benchmark.seedsCompleted !== 200 ||
  benchmark.failures !== 0 ||
  benchmark.aggregateTicksPerSecond < 200 ||
  !benchmark.rows.every((r: { passed: boolean }) => r.passed)
)
  throw new Error("Final 200-seed robustness gate is incomplete/failed");
if (
  !seek.complete ||
  !seek.phase1GatePassed ||
  seek.rows.some((r: { mismatches: number }) => r.mismatches)
)
  throw new Error("Replay gate failed");
if (!tests.success || tests.numFailedTests !== 0)
  throw new Error("Full test gate failed");
for (const qa of [packaged, portable])
  if (
    qa.errors.length ||
    !qa.checks.evacuation ||
    !qa.checks.branch ||
    !qa.checks.replay
  )
    throw new Error("Desktop workflow proof incomplete");
for (const mode of ["packaged", "portable"])
  for (const kind of ["migration", "overload"])
    if (!read(`docs/qa/phase2-${kind}-${mode}.json`).passed)
      throw new Error(`${kind}/${mode} QA failed`);
type Row = {
  profile: string;
  ms: number;
  ticks: number;
  ticksPerSecond: number;
  incidents: number;
  cohorts: number;
  events: number;
};
const rows = benchmark.rows as Row[],
  profiles = ["earthquake", "flood", "stress"].map((profile) => {
    const selected = rows.filter((r) => r.profile === profile),
      ticks = selected.reduce((n, r) => n + r.ticks, 0),
      ms = selected.reduce((n, r) => n + r.ms, 0),
      times = selected.map((r) => r.ms).sort((a, b) => a - b);
    return {
      profile,
      runs: selected.length,
      ticksPerSecond: (ticks / ms) * 1000,
      p95Ms: times[Math.ceil(times.length * 0.95) - 1],
      maxIncidents: Math.max(...selected.map((r) => r.incidents)),
      maxCohorts: Math.max(...selected.map((r) => r.cohorts)),
      maxEvents: Math.max(...selected.map((r) => r.events)),
    };
  });
const phase1 = seek.rows.find(
    (r: { profile: string; minutes: number; fraction: number }) =>
      r.profile === "phase1" && r.minutes === 30 && r.fraction === 0.95,
  ),
  floodSeek = seek.rows.find(
    (r: { profile: string; minutes: number; fraction: number }) =>
      r.profile === "flood" && r.minutes === 30 && r.fraction === 0.95,
  );
const source = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  fmt = (n: number) => n.toFixed(2),
  reduction = (1 - pack.portableBytes / pack.phase1PortableBytes) * 100;
const summary = {
  sourceCommit: source,
  tests: tests.numPassedTests,
  benchmark: profiles,
  aggregateTicksPerSecond: benchmark.aggregateTicksPerSecond,
  phase1Seek: phase1,
  floodSeek,
  package: pack,
};
writeFileSync(
  "docs/qa/phase2-release-summary.json",
  JSON.stringify(summary, null, 2),
);
writeFileSync(
  "docs/PHASE2_REPORT.md",
  `# Phase 2 — Systemic Crisis Simulation

Simulation 0.2.0; systemic earthquake scenario 2.3.0; urban flood scenario 1.4.0; replay/save format 2. The frozen released v0.1 engine and fixtures remain unchanged. The release target is private v0.2.0; the final tag resolves the canonical release commit. Validation source before this report: ${source}. Tag/release creation follows a clean push and passing final CI; this report itself does not create a release.

## Implemented

Complete verified checkpoints and accelerated seek; pure v1 save migration retaining historical simulation rules; simultaneous flood macro evolution; 100 conserved civilian cohorts plus counted hospital populations; deterministic splitting, injury, evacuation and shelter capacity; cohort triage, finite ED/ICU/trauma queues, care and ambulance handover; routed source-limited reports/commands/return acknowledgements, FIFO congestion, power and backup circuits; immutable command-only replay branches; actual outcome comparison with causal evidence; AAR v2 seven-class intelligence audits and bounded direct causal graphs. The existing visual language is retained with scenario choice, knowledge-based map layers, hospital inspection, precise replay timeline and branch editor.

## Regression and tests

Full regression suite: **${tests.numPassedTests} passed, ${tests.numFailedTests} failed**. Original Phase 1 regression and immutable v1 saves remain intact. Six new Phase 2 golden contracts cover three earthquake and three flood seeds, final worlds/events/AAR, commands and checkpoint hashes. The generator refuses to overwrite existing expectations.

Release benchmark: **100 earthquake + 100 flood seeds**, plus one explicit stress profile. **0 crashes, invariant failures, replay mismatches, branch mismatches, save failures and parent mutations**. Every run checks population/patient/hospital/event invariants every 30 ticks, independently cold-replays the entire world/events/AAR, compares checkpoint seek with cold seek, reloads original saves, repeats a command-only branch, cold-replays and reloads that branch, and checks the unchanged parent record. Progress is persisted after each seed and resumes only with identical authoritative/runner content fingerprints. Evidence: [complete rows](qa/phase2-benchmark.json).

## Performance

| Profile | Runs | Recorded-step ticks/sec | Scenario runtime p95 (ms) | Maximum incidents / cohorts / events |
|---|---:|---:|---:|---|
${profiles.map((p) => `| ${p.profile} | ${p.runs} | ${fmt(p.ticksPerSecond)} | ${fmt(p.p95Ms)} | ${p.maxIncidents} / ${p.maxCohorts} / ${p.maxEvents} |`).join("\n")}

Combined throughput: **${fmt(benchmark.aggregateTicksPerSecond)} ticks/sec**; release floor 200, target 500. Timings include recorded simulation stepping, periodic invariants and checkpoint generation, and exclude initialization plus subsequent verification/save/branch work. Shared machine load affects timings. No event, population or checkpoint assertions were removed for speed. Optional 1,000-seed extended validation was not run; the required 200 complete runs and stress checks took priority.

## Replay

45 profile/duration/target combinations × 20 measurements: **zero mismatches**. Profiles are the actual frozen Phase 1 engine and both systemic scenarios; durations 10/20/30 minutes; targets 5/25/50/75/95%. Frozen Phase 1 30-minute 95% seek: p50 **${fmt(phase1.p50Ms)} ms**, p95 **${fmt(phase1.p95Ms)} ms**, cold **${fmt(phase1.coldMs)} ms**, first complete verification **${fmt(phase1.firstVerificationMs)} ms**. Restore tick ${phase1.restoredTick}, then ${phase1.forwardTicks} forward ticks. The requested 250 ms Phase 1 target passed.

The much larger 30-minute flood profile at 95% measured p50 **${fmt(floodSeek.p50Ms)} ms**, p95 **${fmt(floodSeek.p95Ms)} ms**, cold **${fmt(floodSeek.coldMs)} ms**, first verification **${fmt(floodSeek.firstVerificationMs)} ms**. It is slower and does not meet a universal 250 ms target; this is disclosed rather than hidden. [All restore/forward/total measurements](qa/phase2-replay-seek.json).

## Save migration

Both immutable v0.1 fixtures pass schema/container migration, deterministic continuation and process restart in packaged and portable apps. Original hashes 1ff69df065556950 and df7be778dec70fd4 remain exact. After 60 additional seconds and restart: 274b9673981fea23 and 0473de9276368be2, matching the isolated legacy engine. The V2 container retains simulation 0.1 and migration provenance; cold replay at completion also matches. Unsupported future/corrupt saves fail atomically. [Packaged proof](qa/phase2-migration-packaged.json), [portable proof](qa/phase2-migration-portable.json).

## Scenarios and demonstration

The original earthquake remains available for legacy saves; new play selects the shared systemic earthquake. Flood uses the same dispatcher, routes, patient/hospital and communications systems. Actual rain/depth/road/reroute/power/generator/network/report/deterioration events and direct ancestor graphs are in [causal showcase](qa/phase2-causal-showcase.json); no inferred temporal/location links are added.

Named flood seed AEGIS-FLOOD-2026-001: all six ambulances sent at second 30 versus reserving two for the received N23 incident at second 350 gives **901 → 897 deaths and four actual recoveries**. Original and alternative hospital-overload durations both remain zero. Original/branch hashes 4eb523d46aa39a2a / 2a2b76b4e6376144. Both actual desktop launch forms reproduce the branch, save it and seek verified replay to second 350. An early UI evacuation command has causal shelter-arrival proof for **324 people**.

## Windows QA and package

Actual packaged app and portable extraction workflow pass flood, causal evacuation, hospital received-information inspection, AAR, real branch comparison/save/reload, checkpoint replay and earthquake launch. Main/renderer identities match before portable test-only native dialog overrides; production IPC/filesystem/worker/save validation remain real. Viewports 1920×1080, 1600×900, 1366×768, 1664×941 and 700×900 are checked; desktop layout has no overflow, mobile has no horizontal overflow. Recorded workflows have zero console/page errors.

An explicit scarce-capacity QA content variant produces genuine queue/ICU/capacity stress: peak queue 8, census 36, ICU 8, overload 759 seconds and ambulance handover 328 vehicle-seconds. Both launch forms display the exact AAR measurements. It is clearly labeled as QA scenario content and does not alter normal flood balance or snapshots.

Portable: **${pack.portableBytes} bytes (${fmt(pack.portableBytes / 1048576)} MiB)**, **${fmt(reduction)}% smaller** than Phase 1's 510653100-byte archive. Staging ships bundled assets/desktop code and a minimal manifest, without repository node_modules. App.asar ${pack.asarBytes} bytes. Custom shield/pulse icon and Windows metadata identify Project AEGIS 0.2.0.0 / file 0.2.0 / CHEN, KUEI-HENG. The executable is **unsigned** (NotSigned). SHA-256: ${pack.portableSha256}. [Package metadata](qa/phase2-windows-package.json), [UI proof](UI_PHASE2.md).

## Failure ledger and CI

The first 70-incident/high-injury stress initialization hit the existing 1,000-events-per-tick guard; preserved in [probe](qa/phase2-benchmark-probe.json). Its replacement initializes 50 sparse-injury hazards and reaches at least 50 actual incidents/100 cohorts without relaxing guards. Earlier communication performance and zero-delta rescue probes are preserved in their milestone documentation. The late UI evacuation was actually lost; final QA now requires successful execution and command-caused shelter arrivals.

CI runs 37132433969 and 37133799517 failed Windows GUI timing/capture checks, despite passing core tests. No failed build was released. The harness preserves failed screenshot/DOM and timing, releases headless fixture memory in a separate process, and supports explicit CPU graphics on CI while local ordinary graphics QA remains separate. Final passing CI, a clean main tree and private push are required before v0.2.0 is tagged.

## Known limitations and next recommendation

Flood/medical/communications are fictional deterministic macro models, not calibrated real-world predictors. Unit utilization is estimated from authoritative observations. Historical numeric truth is not independently retained for every noisy estimate; the audit labels only supported discrepancies. Graphs are bounded and expose truncation/frontier IDs. The application retains four exportable in-memory branches; exported files remain independent. Initial verification and large flood seek/load costs remain noticeable. The executable lacks a signing certificate. Unity/Blender and LLM narrative are not required by this 2D phase.

Next: playtest decision visibility and scenario balance, then profile large checkpoint validation/serialization before adding more disasters or visual systems. Preserve deterministic regression and migration contracts while tuning explicitly versioned content.
`,
);
writeFileSync(
  "docs/RELEASE_NOTES_v0.2.0.md",
  `# Project AEGIS v0.2.0 — Systemic Crisis Simulation

Adds urban flash flood and systemic earthquake scenarios with conserved civilian populations, evacuation, finite medical/ICU queues and ambulance handover. Reports, commands and return acknowledgements now follow powered communication topology, backup routes and real congestion. Live maps and hospital inspectors continue to show received information.

Replay uses independently verified complete checkpoints. Original v0.1 saves migrate to format 2 while retaining the released simulation rules. Completed AAR adds seven intelligence classifications, direct causal graphs and immutable command-only alternative branches. The named reserve-ambulance demonstration reproduces 901→897 deaths with actual recovery events.

Validation: ${tests.numPassedTests} tests; 100 earthquake + 100 flood seeds and a 50-incident stress profile; zero robustness/replay/branch/save failures. Frozen Phase 1 30-minute 95% seek p95 ${fmt(phase1.p95Ms)} ms. Combined recorded-step throughput ${fmt(benchmark.aggregateTicksPerSecond)} ticks/sec. Both actual packaged and portable workflows, overload and legacy process restarts are verified; final CI must pass before publication.

Windows x64 portable: ${fmt(pack.portableBytes / 1048576)} MiB (${fmt(reduction)}% smaller than v0.1). Custom icon and PE metadata; unsigned. SHA-256: ${pack.portableSha256}.

Larger flood seek/initial verification remains slower than the Phase 1 target. Models are fictional macro simulations; causal displays expose bounded truncation. Full evidence and limitations: [Phase 2 report](PHASE2_REPORT.md).
`,
);
console.log(JSON.stringify(summary));
