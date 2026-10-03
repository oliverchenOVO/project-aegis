# 2.5D Emergency Command Map — inspection and implementation record

Baseline: stable v0.2.0, commit 5a595bcc5dd019ff13dd4752dbf7a43ae7211062. This upgrade changes presentation only. Simulation, scenarios, RNG, replay/persistence and existing golden contracts are frozen for this task.

## Existing renderer inspected before implementation

`packages/ui/src/Map.tsx` initializes Pixi with `autoStart: false`. Its scene graph is stage → camera container → one content container. A shared Graphics object draws 24 parcels and 216 flat building rectangles, the river, streets, facility badges and selected routes. Independently added Text/Graphics/Containers draw received flood/civilian/comms markers, hospitals, incident plates and known units. Ordering depends on insertion; routes in the shared Graphics object sit behind some independently added overlays.

Each view/selection/layer update destroys all content and rebuilds it, including static geography. Pan and zoom directly transform the camera and render. A ResizeObserver recalculates the fit. The world plane is 800×590; scale is fit × zoom, with centered translation plus pan. Camera rotation does not exist. Pixi pointer taps/over handle markers; native pointer events handle pan and wheel zoom. Geometry and labels all use the same XY coordinates.

The map receives only CommandCenterView. Buildings/roads/facility locations are public cartography. Dynamic units require a received position belief; flood depth, hospital, power and communication conditions come from beliefs. No new engine data is needed for visual massing. The already public SessionUpdate scenario ID/version can key visual generation without changing the simulation DTO or saved contents.

## Design decision and constraints

Keep the existing top-down XY plane. Roofs rise toward upper-left with shaded right/front faces and short lower-right shadows. Roads, routes and hit positions retain ground coordinates. The generated concept in `design/map-25d-concept.png` specifies architectural volume, cool slate colors, district density, landmarks and preserved command-center chrome. Existing UI copy/topology remain authoritative when the concept's generated text/geography differs. Code-native geometry is intentional: the user requires deterministic layouts, independent layers, zoom LOD, reliable hit testing and Pixi caching; the concept bitmap is a reference, not a shipped map/background.

Implement centralized layers/theme, deterministic public-geography mass generation, reusable district profiles, FAR/MEDIUM/NEAR detail, static/dynamic scene separation, geographic raised bridges and recessed river banks. Preserve change-driven rendering. No time-based sun, particle or permanent animation loop. Decorative city hall is visual cartography only, with no simulation entity or gameplay effect.

## Verification plan

Measure the same actual executable workflow before/after in ordinary desktop and explicit SwiftShader modes: launch, first map render, pan cadence, zoom, layer toggles, idle WebGL draw count and step/render round trip. Both earthquake and flood receive early/middle/late captures. Final packaged/portable runs cover 1920×1080, 1600×900, 1366×768 plus the concept/mobile sizes, real map clicks/hover/command targeting and existing replay/branch workflows.

Keep all 103 existing tests and simulation golden hashes unchanged. Add meaningful pure layout/ordering/knowledge/coordinate/hit/invalidation tests. Any authoritative or golden hash change stops the visual upgrade for investigation; never regenerate expectations. Final results and limitations will be recorded here after actual QA. Publish private v0.2.1 only after every requested gate passes.

## Implemented renderer

The ground plane, road endpoints, camera limits and marker anchors remain unchanged. `map/city.ts` derives footprints from the public node grid, with four profiles in `map/theme.ts`. FNV-style integer hashing keys scenario ID/version, public cartography and a visual revision; neither gameplay seed nor received observations participate. LOW/MID/HIGH/LANDMARK heights are 8/17/29/35 visual pixels. Extrusion moves roofs by (-0.38h, -0.68h), with darker right/front faces and lower-right projected shadows. This is fixed top-down XY with pseudo-depth, without camera rotation.

`map/architecture.ts` draws parcel bases, recessed water/banks, arterial/collector/local streets, elevated bridge edges and shadows, buildings and public landmarks. Hospital campuses have wings, roof crosses and ambulance access areas; fire bays, an EMS cross, police shield, technical utility yard, transformer banks and mast/antenna silhouettes identify facilities. City hall has a pediment and columns and is decorative cartography. Nominal public architecture always exists; its shape does not encode hidden damage or operational capacity.

FAR uses faces and shadows; MEDIUM adds roof parapets; NEAR adds HVAC and facade floor hints. LOD uses fit × zoom thresholds 0.9/1.6. Static geometry is retained across received reports, selections and layer changes. A bounded three-entry cache retains the FAR/MEDIUM/NEAR variants, with texture resolutions 1/1.25/2 and no multisample cache allocation. Returning to a warmed level reuses its geometry and texture; changing the public city key disposes every old resource. Tactical information stays outside the cache.

Dynamic containers use centralized order: flood knowledge, infrastructure, incident ground anchors, routes, callouts, vehicles, labels and selection. Vehicles sit above callouts so a received vehicle in a dense reported incident cluster remains visible and clickable. A native heavy-flood test selects a vehicle inside an incident plate at tick 680 with 75 received incidents. Routes use a dark outline, light center, arrow and destination ring. Received units use compact shaded vehicle silhouettes; units without a received node never appear. Known fire has a small static glow/smoke proxy, known collapse has a few rubble triangles. No particles or flicker run in the background.

Coincident incident callouts initially blocked a real map click during QA. A bounded deterministic candidate placement now separates them and draws stems to their original ground anchors. Pixi retains pointer hit targets for incident plates, hospitals, vehicles, flood/civilian/comms markers; native ground-plane radius testing supports route hover without intercepting underlying medical/infrastructure clicks. Geography and hit positions are not transformed by building height. Labels have dark strokes, and ordinary building labels are omitted. Landmark secondary labels vary with LOD.

`map/camera.ts` coalesces received-view invalidations into at most one pending requestAnimationFrame. Camera operations immediately flush the current scene, canceling a redundant queued frame. A generation guard ignores canceled callbacks. The callback draws once and does not schedule itself. Pixi still uses `autoStart: false`; disposal cancels any pending draw. There is no permanent animation loop. Queuing camera draws proved costly on SwiftShader; immediate flush restored responsiveness without introducing idle redraws.

## Information fog

Presentation still receives CommandCenterView plus already public scenario identity. No simulation, replay or persistence implementation is imported into UI. Static geography may be known; unit positions/routes, incident type/state, approximate flood depth, hospital conditions, road status, power warnings, communication failures and civilian estimates use received beliefs only. Unknown flood has a neutral faint boundary, not a simulated water surface. Operational warning colors require received failure/degradation; unknown infrastructure gets a neutral marker. Road styling handles both received hazard vocabularies: BLOCKED/IMPASSABLE and DEGRADED/RESTRICTED. Hover describes received age/confidence rather than claiming current conditions.

The pure tests cover seed/report-independent layouts, public geography filtering, distinct district density, consistent height/light direction, river exclusions and crossings, tactical layer order, unknown-unit suppression, bounded known flood appearance, incident collision separation, known-only infrastructure warnings, camera inversion and hit tolerance at three desktop sizes, LOD boundaries and nonrecursive invalidation. Existing simulation golden expectations and saved data schemas are untouched.

## Measurement protocol and interpretation

`tests/e2e/map-visual.ts` launches actual Electron executables, instruments real WebGL draws without suppressing them, and observes only the existing public Worker responses. For each scenario it measures initial map entry, eight alternating zoom actions, eight flood-layer toggles, 24 pan steps and four real +300 tick updates. Screenshots are outside timed step sections. Idle samples must remain constant. The public-update-to-frame measurement includes browser/CDP delivery and polling overhead; it is not an isolated GPU timer. Pan FPS is effective automated interaction cadence, not a claim of peak display refresh rate. Samples, medians and p95 are preserved as JSON.

Ordinary desktop flags and explicit ANGLE SwiftShader runs are separate. Software QA uses `--enable-unsafe-swiftshader` in the test launcher to explicitly opt into local trusted application rendering; the application itself does not add that flag. The original harness first failed because its return-menu confirmation locator was wrong; a second software attempt surfaced Electron's explicit-opt-in warning. Those failed attempts were retained locally and excluded from the passing baseline. The first full test run passed all 103 original tests but one new inverse-camera test used exact equality for floating-point coordinates; its assertion now uses a tight numerical tolerance. No golden value was changed.

## Known scope limits

This is architectural massing, not full 3D. Shadows are static polygons; bridge elevation is inferred from public river geometry, not a new road gameplay property. Fire/smoke/rubble are restrained static received-information proxies. Hospital/facility badges are operational hit targets; decorative building faces do not create new interactive entities. The current map geography is the existing 800×590 city and its A/B/C/D district profiles. The callout candidate search is bounded: late flood scenes with 75+ received incidents remain crowded and may contain overlapping plates. Zoom and the incident layer toggle help inspect them; automatic report clustering is a possible separate follow-up, not an unimplemented claim in this release. This release does not introduce new simulation balance, disaster types, saving rules or simulation versions.

## Concept fidelity ledger

The concept and actual native full/near/earthquake/flood captures were inspected together. The bitmap remains a design reference; native executable captures are the evidence of the implemented result.

| Concrete concept feature                                           | Implemented native map                                                                                 | Intentional difference                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Dark three-column command center with a dominant central map       | Existing resource/map/intelligence columns, controls and command queue retained                        | Generated concept text is replaced by the existing authoritative UI copy                          |
| Cool slate buildings with brighter roofs and shaded vertical faces | Four deterministic height classes, roof extrusion, right/front faces and lower-right shadows           | Vector massing replaces photoreal textures to preserve LOD and software rendering                 |
| District-specific density and height                               | Industrial low wide buildings, denser medical/residential blocks, larger administrative footprints     | Public parcels/road anchors remain the existing city rather than the concept's invented geography |
| River corridor and elevated bridges                                | Recessed water, bank edges, bridge deck highlights and bridge shadows                                  | Existing winding river is retained instead of the concept's straighter river                      |
| Recognizable emergency architecture                                | Hospital crosses/wings, fire bays, EMS, police shield, utility yard, power banks, masts, civic columns | Operational badges remain original ground-plane hit targets                                       |
| Bright tactical callouts above quiet background                    | Received orange incident plates/stems, pale outlined routes, agency-colored raised vehicle layer       | Decorative landscaping and distant facade detail are reduced; no hidden damage is depicted        |

## Optimization and failed-attempt ledger

The first bitmap-cache software run was functionally correct but unacceptable for interaction: earthquake/flood pan cadence was 8.55/11.43 FPS. Retaining three warmed LOD variants and reducing cache resolution improved zoom tails, but pan remained 9.33/12.81 FPS. Immediate camera flush then produced 23.42/18.16 FPS in the development executable, with zero extra idle draws. Final shipped-executable measurements, rather than this intermediate result, determine the release gate.

Local full-suite runs during resource contention reported timeouts (first: 3 tests plus 2 hooks; single-worker repeat: 9 timeouts). They are failed attempts, not passing regression evidence. No golden expectation was rewritten. Clean GitHub CI runs through 3babb54 passed all existing simulation/replay/persistence tests with the stock timeout and packaged/portable Windows workflows. Final exact-head CI and local suite results are recorded below when complete.

## Final executable performance

Ordinary rendering was verified as ANGLE / NVIDIA GeForce RTX 3070 Ti Laptop / D3D11. Software rendering was verified as ANGLE / Google Vulkan SwiftShader Subzero. These are actual renderer strings captured after the canvas initialized, not inferred from launch flags. All eight final executable matrix cases passed without renderer errors or console warnings.

Numbers below are before → after; times are milliseconds and paired latency values are p50 / p95. The first baseline and after runs occurred at different times on a shared desktop: comparisons include host scheduling, CDP and React work. They do not establish isolated GPU speedups. Small samples (8 zoom/toggle, 24 pan, 4 step) do not establish a stable population p95.

| Packaged runtime       | First map      | Effective pan FPS | Zoom p50 / p95               | Toggle p50 / p95              | Idle extra draws |
| ---------------------- | -------------- | ----------------- | ---------------------------- | ----------------------------- | ---------------- |
| GPU earthquake         | 314.6 → 550.2  | 48.9 → 66.9       | 43.1 / 47.9 → 49.0 / 84.1    | 54.9 / 67.5 → 43.7 / 72.6     | 0 → 0            |
| GPU flood              | 236.0 → 128.8  | 39.6 → 72.1       | 54.9 / 59.5 → 36.2 / 47.4    | 66.7 / 78.7 → 42.3 / 43.8     | 0 → 0            |
| SwiftShader earthquake | 878.6 → 1290.4 | 26.7 → 20.6       | 100.9 / 117.3 → 97.5 / 162.9 | 115.6 / 159.9 → 125.7 / 206.0 | 0 → 0            |
| SwiftShader flood      | 360.2 → 531.5  | 21.0 → 14.9       | 71.4 / 94.5 → 141.5 / 227.9  | 96.6 / 126.2 → 137.7 / 191.1  | 0 → 0            |

| Packaged runtime       | +300 ticks and frame, p50 / p95   | Public received update to frame, p50 / p95 |
| ---------------------- | --------------------------------- | ------------------------------------------ |
| GPU earthquake         | 275.4 / 479.4 → 205.6 / 235.5     | 85.2 / 243.7 → 52.8 / 72.2                 |
| GPU flood              | 1006.0 / 1051.6 → 486.3 / 521.1   | 386.8 / 465.6 → 133.1 / 186.4              |
| SwiftShader earthquake | 600.1 / 736.0 → 597.8 / 687.2     | 245.7 / 468.1 → 299.4 / 318.6              |
| SwiftShader flood      | 1083.6 / 1133.4 → 1004.5 / 1010.0 | 203.6 / 368.1 → 425.6 / 449.3              |

The initial software comparison alone shows a noticeable slowdown; it is preserved, not discarded. A nearby same-protocol portable control using the unchanged v0.2.0 binary helps assess desktop variability. Neither application ran concurrently with the other or with our packager/tests.

| Portable SwiftShader, v0.2.0 → v0.2.1 | First map       | Pan FPS     | Zoom p50 / p95                | Toggle p50 / p95              |
| ------------------------------------- | --------------- | ----------- | ----------------------------- | ----------------------------- |
| Earthquake                            | 1579.3 → 1906.1 | 16.5 → 18.9 | 250.4 / 322.4 → 185.1 / 357.9 | 130.5 / 285.6 → 146.4 / 248.8 |
| Flood                                 | 634.5 → 530.6   | 13.1 → 14.6 | 235.4 / 252.9 → 132.4 / 331.6 | 147.1 / 229.8 → 125.3 / 227.7 |

The upgraded software renderer remains usable but substantially slower than hardware rendering; the extra startup/LOD cost is visible. The paired control does not show a major drag regression, idle redraw stays zero and actual clicks/hover/dispatch pass at all sizes. Together with the normal GPU results, this supports the responsiveness gate, without promising 60 FPS in SwiftShader. A subsequent ordinary packaged repeat measured 48.9/45.0 pan FPS and 59.5/48.6 ms zoom medians, illustrating host variation.

Launch baseline: GPU 713.9 ms, software 596.2 ms. The first final packaged launches measured 6069.3 / 834.1 ms; the subsequent GPU repeat measured 1291.5 ms. These observations are all retained; the cause of the longer first post-build launch was not isolated. Final portable launch measured 13215.8 / 13490.9 ms, including SFX extraction and debug attachment; unchanged v0.2.0 portable software control measured 15102.1 ms. Runtime launch and portable extraction measurements must not be combined.

Raw evidence: `qa/map-before-desktop.json`, `qa/map-before-software.json`, `qa/map-after-desktop.json`, `qa/map-after-software.json`, `qa/map-after-desktop-repeat.json`, `qa/map-after-portable-desktop.json`, `qa/map-after-portable-software.json`, `qa/map-control-v020-portable-software.json` and `qa/map-windows-matrix.json`.

## Final visual and regression evidence

Required before/full images compare earthquake T0 with no received operational information. Earthquake and flood images capture tick 1200; early/middle/late native captures were inspected for both scenarios. The close image includes a real received dispatched-unit route at near LOD. Operational overlays remain above architecture; flood depth and infrastructure failures appear only after their reports. Native captures at 125% OS scale are larger in physical pixels than the CSS viewport (1600×900 → 2000×1125); this is expected, not a mislabeled resolution.

| Required image                    | Evidence                                              |
| --------------------------------- | ----------------------------------------------------- |
| `qa/map-before-v0.2.png`          | Actual stable v0.2.0, earthquake T0                   |
| `qa/map-after-25d-full.png`       | Final packaged v0.2.1, earthquake T0                  |
| `qa/map-after-25d-close.png`      | Final packaged near LOD, real vehicle/route selection |
| `qa/map-after-25d-earthquake.png` | Final packaged earthquake T1200                       |
| `qa/map-after-25d-flood.png`      | Final packaged flood T1200                            |

`qa/map-tests-final.json`: all 117 local tests passed (103 unchanged original tests plus 14 map tests). Lint, typecheck, formatting and production build passed. The simulation Worker output remains `worker-CsSoRM7K.js` (248.59 KB). A source diff against v0.2.0 for domain/simulation/scenarios/application/persistence/replay and existing replay/fixture expectations is empty. No authoritative hash or expected value was regenerated.

Source commit 2df13101515513dc96c3f0e63d0e392f722080f8 passed both core and Windows CI: https://github.com/oliverchenOVO/project-aegis/actions/runs/37153890299 . Windows CI includes actual packaged/portable map interactions, existing replay/branch smoke, migration/restart and overload checks. Local final map QA covers both executable forms × both renderer modes × earthquake/flood × 1920×1080, 1600×900 and 1366×768, with initial unknown infrastructure/medical states, received incident hits, actual command targeting, vehicle clicks, route hover, nine layer toggles and camera pan/zoom.

Final portable: 100,366,977 bytes (95.72 MiB), SHA-256 `7FB5155E0DB785BC0B299FB1CFE429F087D4B17E7BB292BDABF95C5D4E491A81`. Runtime and portable version fields are 0.2.1; the executable is unsigned. `qa/map-25d-windows-package.json` records runtime/ASAR evidence and confirms the stable v0.2.0 portable SHA-256 remains unchanged.

Local final packaged and portable replay smoke both passed with no errors/warnings: evacuation sheltered 324 people, AAR and alternative-command branches rendered, branch saves reloaded, replay checkpoint seek to tick 350 verified and replay commands disabled. Both forms reproduced the unchanged original hash `4eb523d46aa39a2a` and alternative hash `2a2b76b4e6376144`. Evidence: `qa/map-final-replay-packaged.json` and `qa/map-final-replay-portable.json`. Actual 1920/1600/1366 screenshots for each scenario and a heavy-flood vehicle screenshot are also saved in `qa/map-25d-*.png`.

Release verdict: **2.5D MAP UPGRADE GATE: PASS**. Building volume, differentiated districts, river/bridge depth, landmark silhouettes, tactical ordering and received-only overlays were verified in native executable captures. The measured software overhead and crowded late-flood callouts are explicitly retained as limitations. This is a visual upgrade / v0.2.x, not Phase 3. Publish the private v0.2.1 release only after the final documentation commit's CI also passes; the release notes record that exact-head CI link. The published binary must match the SHA-256 above, and old v0.1.0/v0.2.0 tags/assets remain intact.
