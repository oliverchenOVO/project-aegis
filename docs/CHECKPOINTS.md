# Deterministic checkpoints

Checkpoints store a complete authoritative snapshot, including every RNG stream, pending command/report transmission, schedule and causal event; event and command cursors, canonical hash and simulation/scenario versions accompany it. They occur at tick 0 and each 300 ticks, before player commands at the same tick.

`replay()` always simulates from zero and verifies all checkpoint hashes against the independently reconstructed world. `VerifiedTimeline` first validates the entire replay and privately clones the record. Its seek restores the closest checkpoint at or before the target, applies same-tick commands exactly once and forward-simulates fewer than 300 ticks. No UI state is serialized or restored. Invalid cursors, mutated snapshots, forged checkpoint hashes and premature endings are errors.

Old records without checkpoints remain readable and use cold replay. The simulation version and authoritative hashes have not changed in Milestone A. Save-format/replay-format version separation is part of Milestone B.

Measurement lives outside the authoritative simulation. `pnpm exec tsx benchmarks/replay-seek.ts` measures 10/20/30-minute runs at 5/25/50/75/95%, including cold validation separately from repeated checkpoint seek. Evidence: `qa/checkpoint-seek.json`. Checkpoint construction adds snapshot cost to recording; seeking does not skip simulation systems or invariants.
