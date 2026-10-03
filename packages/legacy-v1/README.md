# Frozen v0.1.0 compatibility engine

`vendor/packages` was extracted with `git archive v0.1.0` from commit `90ce27b500b5e3d66772f9f1da06fb8d14f640e0`. Do not modify its simulation/domain/scenario/replay/persistence implementations. It verifies and continues legacy timelines with their original RNG/system order and hashes. Current format V2 stores the old simulation version explicitly; migration never relabels it as a new engine or changes old outcomes.

This is a compatibility boundary, not a second flood game. New hazards, cohorts and communications use the current shared engine. Retaining the old engine prevents simulation changes from silently invalidating released saves and replays. Fixed original saves and SHA-256 values are under `tests/fixtures/legacy`.
