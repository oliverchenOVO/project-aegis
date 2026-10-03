# Project AEGIS v0.2.0 — Systemic Crisis Simulation

Adds urban flash flood and systemic earthquake scenarios with conserved civilian populations, evacuation, finite medical/ICU queues and ambulance handover. Reports, commands and return acknowledgements now follow powered communication topology, backup routes and real congestion. Live maps and hospital inspectors continue to show received information.

Replay uses independently verified complete checkpoints. Original v0.1 saves migrate to format 2 while retaining the released simulation rules. Completed AAR adds seven intelligence classifications, direct causal graphs and immutable command-only alternative branches. The named reserve-ambulance demonstration reproduces 901→897 deaths with actual recovery events.

Validation: 103 tests; 100 earthquake + 100 flood seeds and a 50-incident stress profile; zero robustness/replay/branch/save failures. Frozen Phase 1 30-minute 95% seek p95 98.40 ms. Combined recorded-step throughput 523.84 ticks/sec. Both actual packaged and portable workflows, overload and legacy process restarts are verified; final CI must pass before publication.

Windows x64 portable: 95.69 MiB (80.35% smaller than v0.1). Custom icon and PE metadata; unsigned. SHA-256: 696D9453D6E69B1A1DD6DF907576C0338A1EF1331CA4F0E2215A48CBB3135EC7.

Larger flood seek/initial verification remains slower than the Phase 1 target. Models are fictional macro simulations; causal displays expose bounded truncation. Full evidence and limitations: [Phase 2 report](PHASE2_REPORT.md).
