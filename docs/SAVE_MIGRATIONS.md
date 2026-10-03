# Portable save migration

Save-format V2 is a ZIP containing manifest, embedded scenario, authoritative snapshot, commands/event NDJSON and checkpoint index. The manifest contains content hashes, complete replay checkpoints, engine/build versions and deterministic migration history. Schema validation and full replay validation happen before Session replaces its active world.

`SaveMigrationRegistry` validates each migration's input and output, clones caller data, requires monotonically increasing versions and bounds the chain. Unknown future versions and corrupted containers produce clear errors; no partially migrated session is exposed.

V1 → V2 first uses the frozen v0.1.0 loader and simulation to verify the original state and command/event contract. Migration reconstructs the old deterministic timeline, adds full checkpoints and their cursors, and records the original snapshot hash. It preserves simulation version `0.1.0`, scenario content and original authoritative hash. Resumed old saves keep running that engine and are exported in the new portable format; they are never relabeled as `0.2.0` or silently subjected to different hospital/flood rules.

Current new timelines use simulation `0.2.0`; save/replay formats are `2`; scenario versions remain independent. Fixed original fixtures under `tests/fixtures/legacy` were captured before changes from v0.1.0, with source commit, original hashes and SHA-256. Do not regenerate them. The capture script refuses to run with the new engine version.

Tests exercise repeat migration, original hash preservation, future RNG continuation, V2 save/reload, replay/seek, malformed history/schema and failed-load session preservation. Actual desktop restart QA is part of the final Phase 2 Windows release gate.

V2 accepts at most 20 MB compressed, 64 MB per decompressed entry and 192 MB total. Complete authoritative checkpoints legitimately increase manifest size: the civilian flood profile has a 17.6 MB manifest without commands, and busier dispatch timelines exceeded the old 20 MB entry cap. The raised V2 bound remains explicit; the frozen V1 validator retains its original limits. Duplicate schema parsing was removed while keeping one complete schema/integrity verification and an independently simulated replay.
