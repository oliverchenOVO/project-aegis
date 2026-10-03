# Phase 2 — Systemic Crisis Simulation

Baseline: main `90ce27b`, immutable private release `v0.1.0`. Clean tree before work. Existing 25 tests and production build passed; 100 seeds completed with zero crashes, invariant failures and replay mismatches. Local baseline: 11,787.63 ticks/sec; p95 171.49 ms. Machine load explains the difference from the original release measurement. Evidence: `qa/phase2-baseline.json`.

## Ordered milestones

A. Capture immutable legacy saves and golden Phase 1 contracts; add complete deterministic checkpoints, verified checkpoint restore and accelerated seek. Validate at least 100 random targets across seeds and benchmark 10/20/30-minute runs.

B. Separate simulation, scenario, replay and save versions. Preserve an isolated v0.1 engine for legacy verification; introduce pure schema-validated migration registry and portable V2 container. Legacy imports remain deterministic, resumable and auditable; future/corrupt versions must fail atomically.

C. Shared hazard interfaces and deterministic urban flood macro model. Version earthquake content explicitly when balance changes; retain earthquake v1. Flood zones drive road, building, power and medical consequences through shared systems.

D. Civilian cohorts with deterministic splitting, evacuation policy, exposure and explicit population conservation. At least 100 cohorts in performance scenario.

E. Patient cohorts, triage, deterioration, hospital capacities/queues/diversion, ambulance handover and direct medical causal references.

F. Communication topology, source capabilities, power dependencies, routed messages, bandwidth queues and congestion. Received knowledge stays the only live UI data source.

G. Immutable replay branches from checkpoint, player-command alternatives only, deterministic branch hashes and factual outcome deltas. No world editing or narrative-generated metrics.

H. AAR v2: overview, decision outcomes, intelligence classifications, direct causal chains and counterfactual comparisons.

I. Extend existing visual language: scenario selection, knowledge-limited flood/civilian/hospital/comms layers, timeline markers and branch panel. Audit package contents and add custom branding.

J. Full regression/property tests, six golden fixtures, 100 earthquake + 100 flood seed release benchmark, seek benchmark, legacy migration restart QA, actual packaged/portable workflows at 1920/1600/1366 widths, CI, documentation, clean private push and v0.2.0 release only after gates pass.

Every stable milestone receives tests, relevant benchmark evidence and a logical commit. No agents are delegated unless requested.

## Compatibility and replay strategy

Legacy fixture generation happens before any engine changes, with hashes and source tag recorded. Never update legacy fixtures or golden hashes to conceal regressions. A migrated legacy timeline retains its engine/scenario version and validates with the compatible headless engine. New simulation behavior receives a new simulation version. Current saves embed their scenario content and portable checkpoint index.

Checkpoint hashes are before commands at the same tick. A checkpoint includes authoritative state (including RNG streams, pending transmissions and events), event/command cursors and versions. Full cold replay validates checkpoint snapshots against independently simulated states. Accelerated seeks use an immutable verified timeline, restore the nearest prior checkpoint and forward-simulate exact commands. Snapshots accelerate deterministic computation; they do not replace it.

Risks: same-tick command duplication, old snapshot schema defaults changing hashes, unchecked checkpoint forgery, cohort double-counting, negative hospital queues, future network arrivals, UI leaking fields from new systems and inflated package/save sizes. Address these through immutable validated records, version dispatch, atomic loading, explicit conservation/reference invariants and public DTO boundary tests.

## Performance and evidence targets

Keep invariants enabled. Headless release minimum 200 ticks/sec; target 500+. Performance scenario: 4 districts, 18 responders, 100+ cohorts, 2 hospitals, power/comms network and 50+ incidents with flood propagation. Report actual scenario runtime p95, seek p50/p95 and package size. Measure cold replay, checkpoint restoration, forward simulation and total latency at 5/25/50/75/95% for 10/20/30-minute records. Target 30-minute 95% seek p95 <250 ms when hardware permits; no concealed failures or fabricated numbers.

## Completed implementation and validation

A–I are implemented and committed. J now records 103 passing local tests (15 files, 119.52 seconds), passing lint/typecheck, six new golden contracts, 100 earthquake and 100 flood seeds with zero robustness failures, and a complete stress run with 54 incidents/188 cohorts. Actual aggregate recorded-step throughput is 523.84 ticks/sec. All 45 seek combinations have zero mismatches; frozen Phase 1 30-minute 95% seek p95 is 98.40 ms. Actual final packaged/portable workflows, command-caused evacuation, legacy process restarts and hospital overload checks passed. Static map rendering now occurs on changes; idle/zoom/layer assertions pass locally and in CI.

The final report, package SHA-256, raw seed rows, test results and GUI evidence are under PHASE2_REPORT.md and qa/. Publication requires a clean pushed main, successful CI on the final commit, then the private v0.2.0 tag/release with the exact tested portable asset. Existing v0.1.0 remains unchanged. The canonical release commit resolves from v0.2.0.
