# Phase 2 interface — Milestone I

The existing command-center layout, typography and color scheme are retained. New scenario selection starts the shared systemic earthquake or flood engine. Static map geometry exposes flood/evacuation zones, shelters, known communication-node locations and nominal hospital capacities. It never copies live water depths, patient health, hospital measurements, node failures or network queues into cartography. Flood tint/labels, civilian risk and hospital status use received claims with observation time, age, confidence and conflicts; missing observations stay unknown.

Hospital inspection shows received census, ED queue, ICU occupancy, ambulance handovers and supply status alongside the source/observation metadata. EVACUATE_ZONE uses the routed command path and remains subject to compliance and actual roads/shelter capacity. Replay disables commands.

Replay has actual checkpoint/command/event markers, draggable and keyboard-accessible positioning and exact second input. Seek commits at release rather than launching an expensive verification on every drag frame. AAR event and intelligence lists paginate without dropping underlying records. Critical graphs expose omitted frontier IDs when bounded. Choosing a player command opens a structured alternative-command editor; removal, replacement and addition go through the application port to a verified immutable replay fork. Original/Alternative/Delta results come from actual branches. Saved branches reopen through the normal save path. A Session retains its four latest exportable branches to bound memory; original saves are preserved and older exported files remain independently usable.

The UI imports only public DTO/types, helpers and the application port. The first full suite found direct replay type imports in presentation code. They were replaced with public application-port type exports; the boundary test was preserved. The complete 97-test suite then passed in 52.27 seconds, including a regression for bounded branch retention and unchanged parent saves.

## Actual rendered verification

The flow under test is: menu → flood → delayed reports and evacuation → received hospital inspection → original showcase load → remove two early dispatches/add later rescues → real comparison → branch save → verified checkpoint seek → earthquake selection/start.

The Browser plugin/browser skill is not available in this session. Playwright Electron controls the actual desktop renderer. Page identity/title, meaningful content, absent error overlays, console health, interaction states and screenshots are checked. The test script runs against either development Electron or a supplied packaged executable; file dialogs are stubbed only in the test process, while production IPC/filesystem/worker/save validation remain real.

Development and initial packaged runs passed with zero console errors/warnings. Viewports 1920×1080, 1600×900, 1366×768, 1664×941 and 700×900 had no horizontal overflow; desktop command layouts had no vertical overflow. Screenshots confirmed received hospital data, initial unknown states, a real 901→897 death comparison and replay at second 350 with commands disabled. Inspection found the legacy range width rule restricting the new timeline slider; its specific width override was fixed and the same rendered flow rerun. Zone overlays now follow configured node cells rather than overlapping rectangular bounding boxes.

Evidence is generated under `test-results/phase2` by `pnpm smoke <executable>`. Release QA additionally requires the actual portable wrapper, legacy save migration followed by a process restart, overload presentation and the final engine/package build. Those gates are not replaced by this first packaged probe.

## Windows packaging

The staged application contains compiled desktop bundles, front-end assets and a minimal dependency-free package manifest. Electron is the only external desktop runtime import; worker/front-end dependencies are bundled. No repository node_modules tree is shipped. Portable compression changed from store to normal. The initial 0.2.0 executable is 100,339,242 bytes (95.7 MiB), down from 510,653,100 bytes (487.0 MiB). The initial app.asar is 12,020,959 bytes. Final asset hashes/sizes are recorded after all changes and tests finish.

Custom AEGIS SVG artwork and a reproducible six-resolution ICO generator are in `assets` and `scripts/build-icon.ps1`. Windows PE metadata now reports Project AEGIS, product 0.2.0.0, file 0.2.0 and CHEN, KUEI-HENG. Local executables remain unsigned. Packaging is not a public release; no v0.2.0 tag or release is created until final gates pass.
