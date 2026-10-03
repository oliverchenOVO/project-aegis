# Project AEGIS architecture

## Product constitution

1. The UI must never have privileged access to world truth during normal gameplay.
2. No LLM output may directly mutate authoritative simulation state.
3. All simulation randomness must derive from the seeded deterministic RNG system.
4. A replay with the same simulation version, scenario version, seed, and command stream must produce identical canonical state hashes.

## Dependencies

`shared → domain → scenarios → simulation → replay/persistence/counterfactual → application → desktop`
The UI consumes only public view types and a narrow application port. The application owns a private simulation instance. The pure simulation has no DOM, filesystem, timer, renderer, Electron or network dependency. Static city topology is public; incident truth, infrastructure damage, casualties, unreceived reports and actual unit movements are not.

Commands cross the port and enter the communications queue. The read model projects only received observations and locally issued command receipts. AAR discloses truth only after completion. ZIP saves are validated before the application swaps the running session.

## Phase 2 boundaries

Systemic earthquake 2.3.0 and flood 1.4.0 use simulation 0.2.0. Civilian, medical, flood and communications modules update the same authoritative world in a fixed order. No frontend component imports the engine, replay implementation, persistence or world snapshots. Its application port exports DTO types and only start/step/issue/load/save/seek/fork operations. Scenario cartography contains static geometry and nominal capacities; water, patient, hospital and network measurements come only from received beliefs. Completed AAR/branch comparisons explicitly disclose historical truth.

The isolated `packages/legacy-v1/vendor` source is the released v0.1.0 implementation. Version dispatch verifies and continues old timelines using that code. It rejects new scenario features rather than silently upgrading simulation rules. Save format migration changes the container, not historical outcomes.

`after-action/causal.ts` indexes backward event references without guessing causal relationships. AAR and counterfactual comparisons consume that index and authoritative results; comparisons cannot write the world. Branches validate a command-only alternative plan, restore a verified checkpoint and run the shared engine. The original record remains immutable; the application bounds retained exportable branches to four.

See [checkpoint trust](CHECKPOINTS.md), [migration](SAVE_MIGRATIONS.md), [communications](COMMUNICATION_NETWORK.md), [counterfactuals](COUNTERFACTUAL_REPLAY.md) and [interface verification](UI_PHASE2.md).
