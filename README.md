# Project AEGIS — AI 災難指揮中心

Windows emergency command simulation: incomplete information, delayed commands, conserved civilian populations, finite hospital care and deterministic replay. Phase 2 scenarios: systemic urban earthquake and urban flash flood.

## Play

Launch `release/AEGIS-0.2.0-Windows-x64.exe`. Choose earthquake or flood (flood showcase `AEGIS-FLOOD-2026-001`), start and press play. Pause to inspect received reports or advance by 10 seconds/1 minute/5 minutes. Select an incident, choose compatible units and issue the order; evacuation orders select a configured zone. Wait for acknowledgement and field reports. Save/load uses `.aegis`; original v0.1 saves continue under their original rules. Completed AAR shows actual systemic outcomes, seven intelligence classes and causal chains. Verify replay, seek with timeline markers or choose a decision to edit and simulate an independent alternative-command branch.

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
node node_modules/electron/install.js
pnpm desktop
pnpm package:win
pnpm smoke "release/windows-runtime/Project AEGIS.exe"
pnpm smoke release/AEGIS-0.2.0-Windows-x64.exe --portable
pnpm exec tsx tests/e2e/migration-restart.ts release/AEGIS-0.2.0-Windows-x64.exe --portable
pnpm exec tsx tests/e2e/overload.ts release/AEGIS-0.2.0-Windows-x64.exe --portable
pnpm exec tsx benchmarks/phase2.ts 100 test-results/phase2-local.json
pnpm exec tsx benchmarks/phase2-seek.ts
```

UI dev port is 5173. If occupied, `pnpm exec vite --host 127.0.0.1 --port 5187`. The packaged app opens local production assets and isolates the renderer from Node. Simulation runs in a separate worker and only exposes received views.

See [architecture](docs/ARCHITECTURE.md), [simulation](docs/SIMULATION.md), [information fog](docs/INFORMATION_FOG.md), [replay/save format](docs/REPLAY_FORMAT.md), [Phase 2 results](docs/PHASE2_REPORT.md) and preserved [Phase 1 results](docs/PHASE1_REPORT.md).

The 200-seed validation includes independent replay, checkpoint seek, original/branch save reload, repeated branches and invariants; it takes substantially longer than recorded-step timing alone. Use a fresh local output path to retain the published evidence. Interrupted runs resume only when authoritative content and validation fingerprints match. `benchmarks/phase2-parallel.ts` can resume an existing output using two isolated CLI workers; neither worker writes the shared evidence file.
