# Project AEGIS architecture

## Product constitution

1. The UI must never have privileged access to world truth during normal gameplay.
2. No LLM output may directly mutate authoritative simulation state.
3. All simulation randomness must derive from the seeded deterministic RNG system.
4. A replay with the same simulation version, scenario version, seed, and command stream must produce identical canonical state hashes.

## Dependencies

`shared → domain → scenarios → simulation → replay/persistence → application → desktop`
The UI consumes only public view types and a narrow application port. The application owns a private simulation instance. The pure simulation has no DOM, filesystem, timer, renderer, Electron or network dependency. Static city topology is public; incident truth, infrastructure damage, casualties, unreceived reports and actual unit movements are not.

Commands cross the port and enter the communications queue. The read model projects only received observations and locally issued command receipts. AAR discloses truth only after completion. ZIP saves are validated before the application swaps the running session.
