# Project AEGIS — AI 災難指揮中心

Windows emergency command simulation: incomplete information, delayed commands, real consequences and deterministic replay. Phase 1 scenario: a fictional city experiencing an urban earthquake.

## Play

Launch `release/AEGIS-0.1.0-Windows-x64.exe`. Select the showcase seed `AEGIS-2026-001`, start a scenario and press the play control. Pause to inspect reports or advance by 1/5 simulated minutes. Select an incident, choose compatible units and issue the order. Wait for acknowledgment and field reports. Save/load uses `.aegis` files. Finished scenarios open AAR with causal timeline, per-report intelligence audit and verified replay/seek.

No API key or Internet connection is needed to play. Unity and Blender are not required by this 2D command-center phase.

## Develop

Requires Node.js 24 and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm benchmark
pnpm build
pnpm desktop
pnpm package:win
pnpm smoke "release/windows-runtime/Project AEGIS.exe"
```

UI dev port is 5173. If occupied, `pnpm exec vite --host 127.0.0.1 --port 5187`. The packaged app opens local production assets and isolates the renderer from Node. Simulation runs in a separate worker and only exposes received views.

See [architecture](docs/ARCHITECTURE.md), [simulation](docs/SIMULATION.md), [information fog](docs/INFORMATION_FOG.md), [replay/save format](docs/REPLAY_FORMAT.md) and [Phase 1 results](docs/PHASE1_REPORT.md).
