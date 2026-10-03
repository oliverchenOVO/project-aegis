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

FAR uses faces and shadows; MEDIUM adds roof parapets; NEAR adds HVAC and facade floor hints. LOD uses fit × zoom thresholds 0.9/1.6. Static geometry is retained across received reports, selections and layer changes; the initial measured geometry-only implementation issued 23 draw calls at T0, motivating a per-LOD cached texture at resolution 2. Layout/LOD changes rebuild that cache; pan reuses it. Tactical information stays outside the cache.

Dynamic containers use centralized order: flood knowledge, infrastructure, incident ground anchors, routes, vehicles, callouts, labels and selection. Routes use a dark outline, light center, arrow and destination ring. Received units use compact shaded vehicle silhouettes; units without a received node never appear. Known fire has a small static glow/smoke proxy, known collapse has a few rubble triangles. No particles or flicker run in the background.

Coincident incident callouts initially blocked a real map click during QA. A bounded deterministic candidate placement now separates them and draws stems to their original ground anchors. Pixi retains pointer hit targets for incident plates, hospitals, vehicles, flood/civilian/comms markers; route polygons support hover. Geography and hit positions are not transformed by building height. Labels have dark strokes, and ordinary building labels are omitted. Landmark secondary labels vary with LOD.

`map/camera.ts` coalesces relevant invalidations into at most one pending requestAnimationFrame. The callback draws once and does not schedule itself. Pixi still uses `autoStart: false`; resize, camera change and received-view updates invalidate the scene. Disposal cancels any pending draw. There is no permanent animation loop.

## Information fog

Presentation still receives CommandCenterView plus already public scenario identity. No simulation, replay or persistence implementation is imported into UI. Static geography may be known; unit positions/routes, incident type/state, approximate flood depth, hospital conditions, road status, power warnings, communication failures and civilian estimates use received beliefs only. Unknown flood has a neutral faint boundary, not a simulated water surface. Operational warning colors require received failure/degradation; unknown infrastructure gets a neutral marker. Hover describes received age/confidence rather than claiming current conditions.

The pure tests cover seed/report-independent layouts, public geography filtering, distinct district density, consistent height/light direction, river exclusions and crossings, tactical layer order, unknown-unit suppression, bounded known flood appearance, incident collision separation, known-only infrastructure warnings, camera inversion and hit tolerance at three desktop sizes, LOD boundaries and nonrecursive invalidation. Existing simulation golden expectations and saved data schemas are untouched.

## Measurement protocol and interpretation

`tests/e2e/map-visual.ts` launches actual Electron executables, instruments real WebGL draws without suppressing them, and observes only the existing public Worker responses. For each scenario it measures initial map entry, eight alternating zoom actions, eight flood-layer toggles, 24 pan steps and four real +300 tick updates. Screenshots are outside timed step sections. Idle samples must remain constant. The public-update-to-frame measurement includes browser/CDP delivery and polling overhead; it is not an isolated GPU timer. Pan FPS is effective automated interaction cadence, not a claim of peak display refresh rate. Samples, medians and p95 are preserved as JSON.

Ordinary desktop flags and explicit ANGLE SwiftShader runs are separate. Software QA uses `--enable-unsafe-swiftshader` in the test launcher to explicitly opt into local trusted application rendering; the application itself does not add that flag. The original harness first failed because its return-menu confirmation locator was wrong; a second software attempt surfaced Electron's explicit-opt-in warning. Those failed attempts were retained locally and excluded from the passing baseline. The first full test run passed all 103 original tests but one new inverse-camera test used exact equality for floating-point coordinates; its assertion now uses a tight numerical tolerance. No golden value was changed.

## Known scope limits

This is architectural massing, not full 3D. Shadows are static polygons; bridge elevation is inferred from public river geometry, not a new road gameplay property. Fire/smoke/rubble are restrained static received-information proxies. Hospital/facility badges are operational hit targets; decorative building faces do not create new interactive entities. The current map geography is the existing 800×590 city and its A/B/C/D district profiles. The callout candidate search is bounded; an unusually dense future scenario may need a broader collision solver. This release does not introduce new simulation balance, disaster types, saving rules or simulation versions.
