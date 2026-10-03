# Phase 2 — Systemic Crisis Simulation

Simulation 0.2.0; systemic earthquake scenario 2.3.0; urban flood scenario 1.4.0; replay/save format 2. The frozen released v0.1 engine and fixtures remain unchanged. The release target is private v0.2.0; the final tag resolves the canonical release commit. Validation source before this report: 3681fab5b2cf2cf5be93ec7464e081929bfc33b5. Tag/release creation follows a clean push and passing final CI; this report itself does not create a release.

## Implemented

Complete verified checkpoints and accelerated seek; pure v1 save migration retaining historical simulation rules; simultaneous flood macro evolution; 100 conserved civilian cohorts plus counted hospital populations; deterministic splitting, injury, evacuation and shelter capacity; cohort triage, finite ED/ICU/trauma queues, care and ambulance handover; routed source-limited reports/commands/return acknowledgements, FIFO congestion, power and backup circuits; immutable command-only replay branches; actual outcome comparison with causal evidence; AAR v2 seven-class intelligence audits and bounded direct causal graphs. The existing visual language is retained with scenario choice, knowledge-based map layers, hospital inspection, precise replay timeline and branch editor.

## Regression and tests

Full regression suite: **103 passed, 0 failed**. Original Phase 1 regression and immutable v1 saves remain intact. Six new Phase 2 golden contracts cover three earthquake and three flood seeds, final worlds/events/AAR, commands and checkpoint hashes. The generator refuses to overwrite existing expectations.

Release benchmark: **100 earthquake + 100 flood seeds**, plus one explicit stress profile. **0 crashes, invariant failures, replay mismatches, branch mismatches, save failures and parent mutations**. Every run checks population/patient/hospital/event invariants every 30 ticks, independently cold-replays the entire world/events/AAR, compares checkpoint seek with cold seek, reloads original saves, repeats a command-only branch, cold-replays and reloads that branch, and checks the unchanged parent record. Progress resumes with identical content fingerprints, or a recorded orchestration-only migration that reconstructs the prior runner fingerprint against current authoritative bytes. The first serial measurements remain intact; remaining seeds run in two isolated processes with private files and serial parent merges. Evidence: [complete rows](qa/phase2-benchmark.json), [serial history](qa/phase2-benchmark-serial-history.json). These CLI workers do not change deterministic simulation steps.

## Performance

| Profile    | Runs | Recorded-step ticks/sec | Scenario runtime p95 (ms) | Maximum incidents / cohorts / events |
| ---------- | ---: | ----------------------: | ------------------------: | ------------------------------------ |
| earthquake |  100 |                 1590.78 |                   1850.04 | 11 / 171 / 12131                     |
| flood      |  100 |                  348.52 |                  11573.10 | 100 / 720 / 34681                    |
| stress     |    1 |                  523.75 |                   3436.74 | 54 / 188 / 29548                     |

Combined throughput: **523.84 ticks/sec**; release floor 200 average, target 500. The minimum individual recorded run was **103.39 ticks/sec**, retained without deletion; the requested floor applies to the average. Timings include recorded simulation stepping, periodic invariants and checkpoint generation, and exclude initialization plus subsequent verification/save/branch work. Shared machine load affects timings. No event, population or checkpoint assertions were removed for speed. Optional 1,000-seed extended validation was not run; the required 200 complete runs and stress checks took priority.

## Replay

45 profile/duration/target combinations × 20 measurements: **zero mismatches**. Profiles are the actual frozen Phase 1 engine and both systemic scenarios; durations 10/20/30 minutes; targets 5/25/50/75/95%. Frozen Phase 1 30-minute 95% seek: p50 **66.37 ms**, p95 **98.40 ms**, cold **315.12 ms**, first complete verification **322.82 ms**. Restore tick 1500, then 210 forward ticks. The requested 250 ms Phase 1 target passed.

The much larger 30-minute flood profile at 95% measured p50 **464.56 ms**, p95 **1446.35 ms**, cold **2460.38 ms**, first verification **1689.72 ms**. It is slower and does not meet a universal 250 ms target; this is disclosed rather than hidden. [All restore/forward/total measurements](qa/phase2-replay-seek.json).

## Save migration

Both immutable v0.1 fixtures pass schema/container migration, deterministic continuation and process restart in packaged and portable apps. Original hashes 1ff69df065556950 and df7be778dec70fd4 remain exact. After 60 additional seconds and restart: 274b9673981fea23 and 0473de9276368be2, matching the isolated legacy engine. The V2 container retains simulation 0.1 and migration provenance; cold replay at completion also matches. Unsupported future/corrupt saves fail atomically. [Packaged proof](qa/phase2-migration-packaged.json), [portable proof](qa/phase2-migration-portable.json).

## Scenarios and demonstration

The original earthquake remains available for legacy saves; new play selects the shared systemic earthquake. Flood uses the same dispatcher, routes, patient/hospital and communications systems. Actual rain/depth/road/reroute/power/generator/network/report/deterioration events and direct ancestor graphs are in [causal showcase](qa/phase2-causal-showcase.json); no inferred temporal/location links are added.

Named flood seed AEGIS-FLOOD-2026-001: all six ambulances sent at second 30 versus reserving two for the received N23 incident at second 350 gives **901 → 897 deaths and four actual recoveries**. Original and alternative hospital-overload durations both remain zero. Original/branch hashes 4eb523d46aa39a2a / 2a2b76b4e6376144. Both actual desktop launch forms reproduce the branch, save it and seek verified replay to second 350. An early UI evacuation command has causal shelter-arrival proof for **324 people**.

## Windows QA and package

Actual packaged app and portable extraction workflow pass flood, causal evacuation, hospital received-information inspection, AAR, real branch comparison/save/reload, checkpoint replay and earthquake launch. Main/renderer identities match before portable test-only native dialog overrides; production IPC/filesystem/worker/save validation remain real. Viewports 1920×1080, 1600×900, 1366×768, 1664×941 and 700×900 are checked; desktop layout has no overflow, mobile has no horizontal overflow. Recorded workflows have zero console/page errors.

An explicit scarce-capacity QA content variant produces genuine queue/ICU/capacity stress: peak queue 8, census 36, ICU 8, overload 759 seconds and ambulance handover 328 vehicle-seconds. Both launch forms display the exact AAR measurements. It is clearly labeled as QA scenario content and does not alter normal flood balance or snapshots.

Portable: **100341421 bytes (95.69 MiB)**, **80.35% smaller** than Phase 1's 510653100-byte archive. Staging ships bundled assets/desktop code and a minimal manifest, without repository node_modules. App.asar 14170073 bytes. Custom shield/pulse icon and Windows metadata identify Project AEGIS 0.2.0.0 / file 0.2.0 / CHEN, KUEI-HENG. The executable is **unsigned** (NotSigned). SHA-256: 696D9453D6E69B1A1DD6DF907576C0338A1EF1331CA4F0E2215A48CBB3135EC7. [Package metadata](qa/phase2-windows-package.json), [UI proof](UI_PHASE2.md).

## Failure ledger and CI

The first 70-incident/high-injury stress initialization hit the existing 1,000-events-per-tick guard; preserved in [probe](qa/phase2-benchmark-probe.json). Its replacement initializes 50 sparse-injury hazards and reaches at least 50 actual incidents/100 cohorts without relaxing guards. Earlier communication performance and zero-delta rescue probes are preserved in their milestone documentation. The late UI evacuation was actually lost; final QA now requires successful execution and command-caused shelter arrivals.

CI runs 37132433969, 37133799517 and 37134822468 failed Windows GUI timing/capture checks, despite passing core tests. No failed build was released. Continuous static Pixi rendering consumed renderer time on software graphics. The product now renders only after relevant state/viewport changes; actual WebGL instrumentation checks unchanged draw counts while paused and changed pixels after zoom/layer actions. Run 37136960805 passed this fix, and merged run 37137877377 passed the combined harness. The latest code validation [CI run 37139077207](https://github.com/oliverchenOVO/project-aegis/actions/runs/37139077207) passed all jobs at 3681fab5b2cf2cf5be93ec7464e081929bfc33b5; [raw CI evidence](qa/phase2-ci-validation.json) and [103-test results](qa/phase2-core-tests-ci.json) are retained. Native capture validates physical dimensions against display scaling. Local ordinary graphics QA remains separate.

## Git and release gates

Branch: main. Repository: private oliverchenOVO/project-aegis. All A–R functional/build/desktop gates pass with the evidence above. Publication checks a pushed final documentation/evidence commit, its passing CI and a clean working tree (gates S–T). Release tag: v0.2.0. The [resolved final tag commit](https://github.com/oliverchenOVO/project-aegis/commit/v0.2.0) is canonical (git rev-parse v0.2.0^{commit}); a tracked report cannot contain its own commit hash. Validation commit before this report: 3681fab5b2cf2cf5be93ec7464e081929bfc33b5. Release title: Project AEGIS v0.2.0 — Systemic Crisis Simulation. The portable asset's exact bytes and SHA-256 are recorded above. Publication verifies the private repository, tag target and uploaded asset digest. [Release](https://github.com/oliverchenOVO/project-aegis/releases/tag/v0.2.0).

## Known limitations and next recommendation

Flood/medical/communications are fictional deterministic macro models, not calibrated real-world predictors. Unit utilization is estimated from authoritative observations. Historical numeric truth is not independently retained for every noisy estimate; the audit labels only supported discrepancies. Graphs are bounded and expose truncation/frontier IDs. The application retains four exportable in-memory branches; exported files remain independent. Initial verification and large flood seek/load costs remain noticeable. The executable lacks a signing certificate. Unity/Blender and LLM narrative are not required by this 2D phase.

Next: playtest decision visibility and scenario balance, then profile large checkpoint validation/serialization before adding more disasters or visual systems. Preserve deterministic regression and migration contracts while tuning explicitly versioned content.
