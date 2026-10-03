# Replay and save formats (v2 with frozen v1 compatibility)

Authoritative replay inputs: simulation version (`0.1.0` or `0.2.0`), scenario id/version, seed and ordered command input stream `{tick, input}`. No prerecorded positions or UI frames. Version 2 records complete authoritative checkpoints at zero and every 300 ticks, including RNG, pending messages/events, cursors and canonical hash. Independent cold replay verifies checkpoint snapshots before accelerated restoration is trusted. Original Phase 1 golden fixtures and its isolated engine remain immutable.

## Tick boundary semantics

State hash at tick N is taken after advancing to N and before issuing player commands at N. Commands at N are applied before advancing to N+1. Commands at tick zero are applied after the initial hash. Multiple commands at one tick preserve issuance order. Seeking to N includes commands issued at N; the next playback step does not issue them twice. A save immediately after a command is valid even if the command tick equals the save tick.

Canonical serialization sorts object keys, preserves ordered arrays, omits undefined properties and normalizes JSON numbers. Two independent 32-bit deterministic hash accumulators yield a 16-hex-character regression fingerprint. This detects accidental corruption/divergence and is not a cryptographic signature. Any checkpoint mismatch raises `DETERMINISM REGRESSION`. UI verifies the entire finished run before entering replay, then validates checkpoints during playback and seeking.

`VerifiedTimeline` owns parsed copies, independently validates the whole run once, then restores the closest verified checkpoint and forwards the exact remaining command stream. Caller mutations cannot alter its owned record. Cold replay remains an independent verification path. Measurements separate initial verification, restore and forward costs; see [checkpoint contract](CHECKPOINTS.md).

## `.aegis` ZIP container

- `manifest.json`: save format version, simulation version, scenario version, replay input stream/checkpoint hashes, snapshot/event hashes.
- `scenario.json`: runtime-validated scenario definition.
- `snapshot.json`: full authoritative world, RNG streams, scheduled events, transit queues, commands and reports.
- `commands.ndjson`: exact command audit records.
- `events.ndjson`: complete domain events and causal references.
- `checkpoints.json`: complete checkpoint index consistent with the replay's owned snapshots and cursors.

Load validates ZIP size limits, all mandatory entries, schemas, versions, hashes, command/event consistency, references and a complete reconstructed replay against the snapshot. Session replacement happens only after validation succeeds; a corrupt save shows an error and leaves the active session intact. Saves are portable and not tied to a local filesystem path. Version 2 uses fixed ZIP timestamps for reproducible bytes. Bounds are 20 MiB compressed, 64 MiB per entry and 192 MiB total uncompressed; frozen v1 uses its original decoder limits.

Pure schema-validated v1→v2 migration preserves the original simulation 0.1, embedded scenario and snapshot hash, rebuilds verified checkpoints and records migration provenance. Future unsupported versions fail before replacing the session. See [migrations](SAVE_MIGRATIONS.md).

Counterfactual lineage commits parent final hash, fork hash/tick, versions, complete alternative command plan and explicit unapplied future commands. Only player command changes are accepted. A fork retains the pre-fork prefix, inserts a verified boundary checkpoint and runs to the original horizon or legitimate early completion. It never edits snapshots or mutates its parent. Nested branches retain their own parent identity. See [branch format](COUNTERFACTUAL_REPLAY.md).
