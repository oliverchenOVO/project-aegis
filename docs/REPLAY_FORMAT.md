# Replay and save formats (v1)

Authoritative replay inputs: simulation version `0.1.0`, scenario id/version, seed and ordered command input stream `{tick, input}`. No prerecorded positions or UI frames. Every 300 ticks records a canonical state hash. Replay starts from zero, executes the identical system order and regenerates events, reports and outcomes.

## Tick boundary semantics

State hash at tick N is taken after advancing to N and before issuing player commands at N. Commands at N are applied before advancing to N+1. Commands at tick zero are applied after the initial hash. Multiple commands at one tick preserve issuance order. Seeking to N includes commands issued at N; the next playback step does not issue them twice. A save immediately after a command is valid even if the command tick equals the save tick.

Canonical serialization sorts object keys, preserves ordered arrays, omits undefined properties and normalizes JSON numbers. Two independent 32-bit deterministic hash accumulators yield a 16-hex-character regression fingerprint. This detects accidental corruption/divergence and is not a cryptographic signature. Any checkpoint mismatch raises `DETERMINISM REGRESSION`. UI verifies the entire finished run before entering replay, then validates checkpoints during playback and seeking.

Seeking currently reconstructs from tick zero. At a 1,800-tick scenario limit this is practical; cached snapshot seek optimization is reserved for larger scenarios. The replay index already holds every 300-tick expected hash.

## `.aegis` ZIP container

- `manifest.json`: save format version, simulation version, scenario version, replay input stream/checkpoint hashes, snapshot/event hashes.
- `scenario.json`: runtime-validated scenario definition.
- `snapshot.json`: full authoritative world, RNG streams, scheduled events, transit queues, commands and reports.
- `commands.ndjson`: exact command audit records.
- `events.ndjson`: complete domain events and causal references.

Load validates ZIP size limits, all mandatory entries, schemas, versions, hashes, command/event consistency, references and a complete reconstructed replay against the snapshot. Session replacement happens only after validation succeeds; a corrupt save shows an error and leaves the active session intact. Saves are portable and not tied to a local filesystem path. Only v1 exists; incompatible versions are rejected with an error. Future migrations must be implemented and tested before introducing a new save version.
