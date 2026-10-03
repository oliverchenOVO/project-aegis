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
