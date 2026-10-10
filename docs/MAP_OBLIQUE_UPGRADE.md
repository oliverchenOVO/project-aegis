# v0.2.2 — Fixed Oblique City View + Tactical Incident Clustering

Stable baseline: v0.2.1, commit 825bf505ad40f420d61cd81082c5c57fdec0a4af. This task changes presentation only. All 117 existing tests remain unchanged. Simulation/scenario/RNG/save/replay/migration behavior and golden expectations are frozen; any authoritative hash mismatch stops implementation.

Latest candidate evidence is in the [2026-10-11 follow-up](#2026-10-11-renderer-and-measurement-follow-up): 127/127 core tests, all 14 local Windows gates and product-source CI passed. Earlier failed candidates below are historical records. Formal releases require a clean working tree and successful CI at the exact tagged head, including the new portable performance check.

## v0.2.1 diagnosis before implementation

Camera: one Pixi camera container applies centered uniform scale and translation to an 800×590 XY plane. `map/camera.ts` supplies inverse camera coordinates, route segment hit tolerance and a change-driven invalidator. Received updates coalesce into one RAF; camera changes flush immediately. Pixi's permanent ticker remains disabled.

Scene: cached static city host precedes dynamic tactical content. Terrain, parcels, river, roads, bridges, shadows, buildings, landmarks and static labels are cached in three bounded LOD variants. Ordinary masses sort by ground Y; landmarks have a separate higher layer, so ordering is incomplete across architecture. Ground itself has no tilt; roofs use the arbitrary (-0.38h,-0.68h) offset, which makes the city read as a raised board.

Interaction: Pixi pointer events select facilities, hospitals, received incident plates, known vehicles, flood and communication markers. Native route hover removes the camera transform and tests the original ground segment. The overlay receives only CommandCenterView and public scenario ID/version. Unknown positions never create vehicles; reported flood/operational conditions are separate from nominal public landmark architecture.

Callouts: the old seven-candidate ground-space collision search can overflow in 75+ incident flood scenes. It has no screen-space cluster representation. Selected incidents use the original subject ID in the shared UI store and existing right-hand inspector/dispatch workflow.

## Design and implementation contract

Preserve command-center chrome, typography, palette, nine layer controls, resource/intelligence rails, queue and tick controls. The new concept is a design reference, never a background bitmap. Fixed mathematical projection, deterministic vector geometry, horizontal readable labels and received-only clustering take precedence over invented geography/text in generated concepts. No raster substitute for cartography and no CSS canvas tilt.

Use one orthographic oblique matrix, initially X=x-0.32y, Y=0.16x+0.68y, with height rendered vertically as -zScale\*z. The determinant is nonzero and the inverse is explicit. The Pixi ground container uses this exact matrix, allowing original public XY footprints and hit geometry to remain authoritative. Building surfaces are derived from XY footprint plus Z height through projectPoint, including inverse ground-frame roof offsets where needed. Camera fit uses projected bounds plus roof/label margins.

WORLD: public roads, river, footprints, bridges and physical landmarks. PROJECTED WORLD: received routes, known vehicles, incident ground anchors and flood extents. SCREEN-FACING: horizontal labels and plates anchored to projected positions, plus cluster labels/tooltips/right-panel details. Pointer flow is screen → inverse camera → inverse projection → original ground XY. Tactical information remains above architecture; flood surfaces remain on the ground below buildings.

Clustering begins only after projected interaction QA passes. A stable received-only layout will use viewport/zoom/projected overlap, retain selected/high-severity/newer incident priority, and represent every received incident individually or in exactly one cluster. Cluster selection opens a right-panel list of the actual received members; choosing one uses its original ID and existing dispatch inspector. No authoritative incidents are merged or newly queried.

## Verification protocol

Actual v0.2.1 executable baseline runs use the same GPU/explicit SwiftShader launch and public Worker instrumentation as candidate runs. In addition to first map, zoom/toggle, early pan, idle, +300 ticks and received-update-to-frame, the protocol now measures late T1200 pan to enforce the dense-flood software floor of 12 effective FPS. Samples include Playwright/CDP/host scheduling; they are not isolated GPU timings.

Browser plugin is not available in this session; native Electron/portable executables are tested through existing Playwright Electron/CDP harnesses. Before/after native screenshots, projected pure/hit tests, received-only cluster tests, all 117 unchanged regressions, actual packaged/portable GPU/SwiftShader matrices, replay/AAR/branch/migration/overload and final CI determine release gates. No v0.2.2 release before all gates pass.

## Implemented projection and depth

Projection revision `oblique-v1`: X=x-0.32y, Y=0.16x+0.68y-1.12z. Determinant 0.7312; inverse x=(0.68X+0.32Y)/0.7312, y=(-0.16X+Y)/0.7312. Pan and uniform camera scale are removed before this inverse. Buildings, masts and bridge side/support points use the same ground-frame conversion of true XYZ. Heights LOW=12, MID=24, HIGH=40, LANDMARK=52. Ordinary masses and public landmark jobs share one stable sort by projected footprint rear/bottom Y then public ID. Roads/routes retain original XY. Street-level bridge decks meet the public road endpoints at z=0; sides descend to z=-5 and supports to z=-12, above the recessed river surface z=-8. No route endpoint is moved to simulate bridge elevation.

Static ground and volumes are separate cached roots, retaining three bounded FAR/MEDIUM/NEAR variants and public identity+visual revision+projection revision keys. Received flood is between these roots, attached to original ground geometry below buildings. Tactical anchors/routes/vehicles remain in the projected world above architecture. Incident plates and their stems are true screen-space stage children with constant CSS-pixel size; horizontal architectural labels cancel the ground matrix. No CSS transform, per-marker filter, continuous ticker or particle loop is introduced.

## Received-only cluster algorithm and interaction

`clusterIncidents` accepts beliefs, public city, received-view tick, camera scale/position and viewport. It never accepts authoritative world or hidden incident collections. Stable priority: selected incident, highest reported severity, latest received tick, lexical original incident ID. FAR/MEDIUM/NEAR proximity radii are 125/88/24 screen pixels. Proximity or overlapping plate rectangles aggregate into the existing higher-priority group. The selected incident is placed first and remains individual. Remaining groups use bounded vertical candidate offsets followed by deterministic shelf placement. At exhausted capacity, remaining reports join an existing nonselected group; no report disappears. Unknown-location received reports retain representation without inventing a geographic location. Every received incident is a member of exactly one group.

Groups expose received count, maximum _reported_ severity (unknown stays unknown), received categories and age since newest reception. Choosing a cluster lists only its received members in the right inspector. Choosing a member uses its original subject ID, clears cluster selection and opens the existing inspector/dispatch controls. Cluster selection is transient UI state, excluded from saves/replays. Updated received views resolve member IDs afresh; stale IDs cannot synthesize information.

Plates are retained by stable membership key during camera motion; only grouping changes create/destroy text/plate containers. Cached architecture is never rebuilt on every pan. Placement reserves received vehicle hit locations. Selected objects, received updates, layer toggles, pan/zoom/resize and cluster selection use the existing change-driven invalidator. There is no idle layout or drawing loop.

## Projection and aggregation QA before packaging

Projected hospital, communication, flood marker, incident, vehicle, route hover and dispatch interaction gates passed before clustering started, at 1920×1080, 1600×900 and 1366×768 in both scenarios (earthquake has no flood zones). Native testing found the stroke-only communication circle needed an explicit circular hit area to accept its center; the correction passed all widths.

All 117 previous tests remain byte-for-byte unchanged; 5 projection tests and 5 clustering tests pass, total 127/127. Tests cover inverse XY at all widths/scales, genuine vertical Z, interpolation along roads, deterministic aggregation under reversed belief order/hidden extra fields, exactly-once received membership across LOD, nonoverlapping plates, selected coincident incident priority, unknown locations, severity/new reception ordering and near zoom separation. Original simulation/replay golden fixtures are unchanged. Worker bundle identity remains `worker-CsSoRM7K.js`.

Native dense T680 flood with a real dispatched route contains 75 received incidents: 32 plates at 1920, 15 at 1600, 6 at 1366. Actual cluster click, exact member count, member inspector, dispatch controls and three known vehicle clicks passed at each width. These are deterministic received counts, not total world incidents.

## Native fidelity ledger

1. Preserved the existing full command-center header, nine-layer bar, resource rail, intelligence rail and command queue from the concept family.
2. Actual ground now has a fixed tilt/shear; native roads visibly recede diagonally across the city.
3. Stronger low/mid/high/civic silhouettes show substantial front and side facades, replacing the old raised board appearance.
4. Fit bounds were tightened after native inspection; city uses available central width with roof/bottom margins retained.
5. Operational color remains above low-contrast architecture; horizontal screen plates stay readable independently of ground projection.
6. The civic pediment and vector architectural details deliberately preserve deterministic code-native geometry instead of adopting invented dome/geography in the generated reference.
7. Dense incident clutter becomes a small set of count plates plus a scrollable member inspector; no animated spider expansion is needed.

## Measured performance before / after — qualification still open

The table below records the **first candidate**, before the final inspector scroll correction. Its reports retain historical `final-*` filenames; those names do not qualify the rebuilt release candidate.

Windows 11 laptop, NVIDIA RTX 3070 Ti (ordinary flags) and verified ANGLE SwiftShader. Native viewport 1600×900, Windows 125% display scaling. All rows use the same 24-event pan / eight zoom-toggle samples / four +300 tick samples protocol. Timings include Playwright/CDP and host scheduling, not isolated GPU frame timings. p50/p95 use the recorded finite samples; +300 timing includes simulation and frame.

| Runtime             | Scenario   | First map ms | Early pan FPS | T1200 dense pan FPS | Zoom ms p50/p95 | Toggle ms p50/p95 | +300 ticks/frame ms p50/p95 | Receipt/frame ms p50/p95 | Idle extra draws |
| ------------------- | ---------- | -----------: | ------------: | ------------------: | --------------: | ----------------: | --------------------------: | -----------------------: | ---------------: |
| v0.2.1 packaged GPU | earthquake |        201.5 |          83.1 |                81.3 |       25.1/48.0 |         24.3/36.2 |                 156.5/163.8 |                82.1/82.4 |                0 |
| v0.2.1 packaged GPU | flood      |         76.4 |          83.5 |                80.9 |       24.4/30.5 |         24.3/30.6 |                 413.7/417.2 |              231.5/240.1 |                0 |
| v0.2.1 packaged SW  | earthquake |        588.6 |          47.0 |                37.7 |       43.9/99.4 |         64.7/98.8 |                 207.2/236.5 |              108.7/115.9 |                0 |
| v0.2.1 packaged SW  | flood      |        255.2 |          32.2 |                18.1 |       55.1/75.5 |        83.1/103.8 |                 469.2/469.8 |              188.8/254.1 |                0 |
| v0.2.2 packaged GPU | earthquake |        341.8 |          67.5 |                65.8 |       35.9/42.8 |         36.4/42.8 |                 191.0/191.7 |                60.3/65.9 |                0 |
| v0.2.2 packaged GPU | flood      |        116.0 |          66.2 |                62.6 |       30.3/36.4 |         36.7/51.2 |                 446.1/450.9 |              187.7/250.6 |                0 |
| v0.2.2 packaged SW  | earthquake |       2489.2 |          27.6 |                19.2 |      78.1/106.3 |        82.6/140.7 |                 285.9/306.0 |               91.8/156.9 |                0 |
| v0.2.2 packaged SW  | flood      |        591.3 |          24.7 |                15.2 |       70.2/95.0 |       110.3/132.0 |               1089.1/1120.8 |              297.9/376.2 |                0 |
| v0.2.2 portable GPU | earthquake |        526.2 |          44.1 |                38.5 |       54.5/55.0 |         55.0/60.4 |                 536.4/620.3 |              184.9/247.6 |                0 |
| v0.2.2 portable GPU | flood      |        200.1 |          68.5 |                51.7 |       53.2/60.7 |         59.8/60.9 |                 509.8/974.7 |              256.2/505.8 |                0 |
| v0.2.2 portable SW  | earthquake |       1605.6 |          16.8 |                14.9 |     379.8/541.3 |       224.3/432.8 |                 367.7/400.1 |               92.5/166.2 |                0 |
| v0.2.2 portable SW  | flood      |        528.0 |          23.0 |                14.6 |       76.9/87.6 |        88.3/147.3 |                576.1/1048.6 |              272.8/505.1 |                0 |

The first candidate four-executable/mode performance matrix cleared the dense flood ≥12 FPS gate: packaged SwiftShader 15.2 FPS, portable SwiftShader 14.6 FPS. Both early and dense idle extra draws are exactly zero. GPU dense flood cadence is 62.6 FPS packaged / 51.7 FPS portable. This is **not a claim of universal performance improvement**: against the original quieter v0.2.1 samples (GPU 80.9, SwiftShader 18.1), first-candidate cadence regresses while native spatial depth and clutter improve. Software cold earthquake first map also regresses significantly (2.49 seconds packaged), and portable earthquake zoom showed scheduling spikes (p95 541ms). These remain recorded limitations.

A first packaged software sample failed the dense pan gate at **9.013 FPS**. It is retained in `qa/map-v022-software-initial-failure.json`, not replaced with a passing report. A subsequent same-host comparison produced old v0.2.1 10.845 FPS versus candidate 12.925 FPS (`map-v022-shared-load-v021.json` / `map-v022-shared-load-v022.json`). Both versions slowed under the shared Windows workload. The complete later matrix passed the unchanged 12 FPS assertion; there was no simulation change, lowered threshold, alternative renderer or hidden timing exclusion. Performance remains sensitive to concurrent CPU load. The failed sample prevents promising a 12 FPS minimum under arbitrary external workload.

A portable software launch also exceeded the harness's initial 30-second readiness polling. QA now allows at least 60 seconds for extraction/software-driver startup, before map performance timing starts. Rechecking the same SHA-256 executable passed. This changes test readiness, not gameplay speed or the pan floor. Initial matrix attempts and their dispositions are retained alongside the successful first-candidate reports.

## Native screenshot comparison and occupancy

These are Electron compositor captures of the tested executables, not concept renders. In comparable 1600×900 full views, the principal built-up footprint grows from approximately 55% to 80% of available map width (manual native-pixel estimate excluding the long river extension). Oblique ground, street intersections, vertical front/side facades and the unified skyline sort provide spatial depth. Roads remain visible between blocks and received routes exactly follow projected road endpoints. Count plates reduce clutter while the member inspector preserves access to every received incident. Selected routes remain visible above architecture; reported water is below it.

| Evidence                                  | Native capture                                                |
| ----------------------------------------- | ------------------------------------------------------------- |
| Before v0.2.1 full city                   | [before](../qa/map-v021-before-full.png)                      |
| Fixed oblique full city / T0 fog          | [full](../qa/map-v022-oblique-full.png)                       |
| Close selected route / facades            | [near](../qa/map-v022-oblique-near.png)                       |
| Earthquake received late state            | [earthquake](../qa/map-v022-earthquake.png)                   |
| Flood received late state                 | [flood](../qa/map-v022-flood.png)                             |
| Selected incident cluster + received list | [cluster](../qa/map-v022-clusters.png)                        |
| 1920/1600/1366 cluster states             | `qa/map-v022-{earthquake,flood}-clusters-{width}.png`         |
| 1920/1600/1366 selected cluster           | `qa/map-v022-{earthquake,flood}-cluster-selected-{width}.png` |
| Explicit portable SwiftShader at 1366     | [software](../qa/map-v022-flood-software-1366.png)            |
| T0 / T600 / T1200 both scenarios          | `qa/map-v022-{earthquake,flood}-{early,mid,late}.png`         |

Four interaction matrices (packaged/portable × GPU/SwiftShader) each cover both scenarios and three widths, including unknown T0 hospital/comms/flood selectors, received incident selection/hover, dispatch, received route hover, known vehicles, close LOD, pan, all nine layers and late cluster member selection. Earthquake T680 has 8 received incidents represented by 7/5/3 plates; flood T680 has 75 represented by 32/15/6. Both scenarios dispatch a real original member ID from the late cluster list. Screenshots include these concrete states and membership counts; no hidden total is used.

The first software hover probe ran before the selected incident's Pixi frame completed. QA now waits two native RAFs after store selection and asserts the exact individual inspector ID before moving into its plate; it does not substitute a cluster count for an incident hover expectation. The same executable subsequently passes the strict hover test.

## Information fog and frozen contracts

`qa/map-v022-frozen-contracts.json` compares every one of the 16 existing test files against the stable v0.2.1 Git blobs. All are identical. Simulation/application/scenario/domain/replay/persistence/AAR source and original fixtures likewise have no changes. The complete 127-test result is `qa/map-v022-core-tests.json`. Cluster tests inject hidden incident/depth fields into the received-view object and public city; output is unchanged. Reversing belief order yields identical memberships/positions. Every received incident is represented exactly once at every tested LOD. Unreported incidents, actual depth, hidden unit positions, hospital/power/comms truth and actual casualty coordinates never become renderer inputs.

## Known limitations and next recommendation

Fixed orthographic view has no camera rotation/perspective. Draw-order sorting approximates occlusion of footprint volumes; it is not a full depth buffer. Static label sharpness varies with cached LOD/zoom and small screens. Far views intentionally aggregate many received reports, and the right member list can require scrolling. Some overflow groups use deterministic shelf placement with longer stems. Unknown operational truth remains unknown.

Software initial cache rendering and CPU scheduling remain the largest performance limitations; the retained 9 FPS busy-host sample and all slow cold/zoom timings are documented above. Portable startup can be delayed by extraction/system workload. The Windows artifacts are unsigned. No portable size reduction or simulation acceleration is claimed.

Native full/near screenshots now demonstrate useful facade/skyline depth; a full 3D engine is not justified by this task. Prefer focused cold-cache/SwiftShader profiling and playtesting cluster summaries before adding broader renderer complexity. This is a presentation upgrade to Phase 2, not Phase 3.

## Final inspector/capture correction

Native software inspection caught two distinct presentation issues: capture could precede the compositor paint, and the right inspector retained the previous object's scroll position. Capture now crosses two RAF paint boundaries. The inspector is keyed by the actual selected subject or received cluster IDs, resetting only its scroll position when selection changes; it does not reset dispatch/store knowledge or authoritative state. New cluster selections show their count/title and highest-priority member from the top at every width. The resulting final package was rebuilt. All four actual executable interaction matrices and six replay/migration/overload runs passed. Its performance qualification remains incomplete; see the current release-candidate status below.

Repeated forced QA shutdowns also retained five closed v0.2.2 portable extraction folders (~4.58GB) on C:, eventually causing a separate extraction/startup failure. Those exact test-created folders were preserved under ignored `test-results/v022-portable-temp-recovery` on the workspace drive. QA now requests a graceful quit through the PID-verified Electron inspector and allows the wrapper cleanup to complete before falling back to termination. A new portable run completed with its extraction removed and C: space restored; older v0.2.0/v0.2.1 temporary folders were not touched. Portable startup needs approximately 1GB of temporary disk space in addition to its compressed executable.

## Current release-candidate status (2026-10-04)

**OBLIQUE CITY VIEW GATE: FAIL — performance/CI qualification is unresolved. No v0.2.2 tag or formal release has been created.** The portable release candidate is 100,375,646 bytes, SHA-256 `08C60A69A5349A04C0F52D5F912D39E0FCBE13567D0A594E1758DD004C0A8F37`. Its compiled product source is commit `3ba9cbdca8d23706334b22b6ca2573083eae7fbc`; later commits only change the QA harness. `qa/map-v022-build-equivalence.json` proves unchanged compiled paths through `928614cc0ae3b452191704033c9abe816eaaab25`. The stable v0.2.1 portable SHA remains `7FB5155E0DB785BC0B299FB1CFE429F087D4B17E7BB292BDABF95C5D4E491A81`.

| Final candidate validation                          | Result                                       | Evidence                                   |
| --------------------------------------------------- | -------------------------------------------- | ------------------------------------------ |
| Packaged GPU / SwiftShader native interactions      | PASS, both scenarios × all three widths      | `qa/map-v022-release-hits-packaged-*.json` |
| Portable GPU / SwiftShader native interactions      | PASS, both scenarios × all three widths      | `qa/map-v022-release-hits-portable-*.json` |
| Replay, AAR, original/alternative branch, save/load | PASS, packaged and portable                  | `qa/map-v022-release-replay-*.json`        |
| Legacy migration and two real restarts              | PASS, packaged and portable                  | `qa/map-v022-release-migration-*.json`     |
| Hospital overload and power emergency               | PASS, packaged and portable                  | `qa/map-v022-release-overload-*.json`      |
| Final package performance matrix                    | INCOMPLETE / FAIL                            | `qa/map-v022-release-*-first-sample.json`  |
| Windows CI at 928614c                               | FAIL, dense flood SwiftShader 8.835 FPS < 12 | `qa/map-v022-ci-928614c-failure.json`      |

Final candidate first local samples measured dense flood 38.06 FPS packaged GPU, 14.197 FPS packaged SwiftShader, and 10.583 FPS portable GPU. The last sample failed the unchanged pan floor; portable SwiftShader has not yet been qualified. Packaged SwiftShader earthquake was also slow (7.34 FPS). Local concurrent work is confirmed by the user, but it is **not established as the sole cause**. The separate Windows CI failure retained focused/visible state before and after pan. Its original pointer-handler report (p50 0.3 ms / p95 0.8 ms) is invalid: the observer retained from the earthquake scenario ran before the remounted flood Map listener. The end-to-end 8.835 FPS failure remains valid, but those handler timings cannot attribute the delay or rule out synchronous rendering cost. No assertion has been lowered or failed sample discarded.

## 2026-10-11 renderer and measurement follow-up

The pan probe now reattaches after each scenario's Map listener and asserts that all 24 measured drag frames issue real draw calls. It also records input and RAF intervals without adding browser round trips inside the timed loop. A corrected, unmodified packaged SwiftShader run measured flood T1200 at 10.113 FPS, handler p50/p95 2.6/4.0 ms and 10 draw calls per drag frame. Windows display scaling was 150%, versus 125% during the earlier local baseline; cross-date differences are not controlled performance comparisons.

The renderer disables multisampling on the main backbuffer and caches received flood geometry as a texture between received-view/layer updates. Pan retains the original public XY hit objects and only moves the camera; the flood texture stays below building volumes. Texture refresh remains tied to received information, not undisclosed simulation state. Simulation, replay, saves and the 117 original tests remain unchanged. Browser-injected diagnostic experiments are not release qualification; the rebuilt packaged and portable executables still require the complete gates.

The rebuilt third candidate is 100,375,628 bytes, SHA-256 `B80243C13027F21CFB2E25FDFC574F9A018FED32847B62798DB2523D1FE3A219`, product source `dd6271a27b080c52c3ee8494b969862ecd9a0d20`. Its actual executable measurements below passed the unchanged dense flood floor. All eight scenario/mode measurements retained visible focus, 24 real redraw samples and zero extra idle draws. CPU workload varied between the before and after runs, so FPS differences are not attributed solely to the renderer change. The corrected software draw count fell from 10 to 5 per dense flood drag frame.

| Runtime              | Scenario   | First map ms | Early pan FPS | T1200 dense pan FPS | Zoom ms p50/p95 | Toggle ms p50/p95 | +300 ticks/frame ms p50/p95 | Receipt/frame ms p50/p95 |
| -------------------- | ---------- | -----------: | ------------: | ------------------: | --------------: | ----------------: | --------------------------: | -----------------------: |
| Packaged GPU         | earthquake |       2906.3 |          70.6 |                63.6 |       41.5/50.1 |         43.8/57.5 |                 248.7/451.0 |               88.6/262.1 |
| Packaged GPU         | flood      |        142.9 |          79.8 |                62.3 |       31.3/31.7 |         37.5/43.9 |                 443.7/466.1 |              111.2/220.2 |
| Packaged SwiftShader | earthquake |        718.3 |          33.7 |                34.5 |       94.9/99.0 |       104.6/138.2 |                 259.4/302.4 |              102.0/144.6 |
| Packaged SwiftShader | flood      |        393.6 |          31.1 |                27.3 |       48.2/55.0 |        86.5/128.4 |                 477.4/508.1 |              219.5/261.5 |
| Portable GPU         | earthquake |        255.9 |          80.8 |                78.2 |       25.1/30.6 |         37.2/38.2 |                 165.5/167.2 |                69.3/83.4 |
| Portable GPU         | flood      |         74.7 |          79.4 |                76.2 |       25.1/25.4 |         31.5/36.8 |                 411.4/425.3 |              233.3/261.9 |
| Portable SwiftShader | earthquake |        640.7 |          40.3 |                35.8 |       47.7/54.1 |        70.4/149.3 |                 229.3/235.0 |               78.5/113.1 |
| Portable SwiftShader | flood      |        353.5 |          35.3 |                31.1 |       57.2/74.2 |       106.2/134.9 |                 452.4/485.2 |              209.8/263.3 |

All 14 local Windows gates passed: four performance modes, four native interaction matrices and replay/migration/overload for both packaged and portable executables. Interaction checks reported no page errors or warnings, both scenarios and all three viewport widths. Root `qa/map-v022-20261011-*.json` files preserve the new reports and the two earlier unmodified executable failures. Required native screenshots and width comparisons now come from the rebuilt package. Core regressions passed 127/127 again. The qualification manifest verifies that the bundled client, Worker and desktop entry files match their built sources and that the v0.2.1 portable is unchanged.

Product-source [CI run 38087936163](https://github.com/oliverchenOVO/project-aegis/actions/runs/38087936163) passed both core and Windows jobs. Its actual packaged SwiftShader dense flood measured **20.47 FPS**, with five real draw calls per drag sample and zero extra idle draws; `qa/map-v022-20261011-ci-dd6271a-performance.json` retains the raw report. CI now also runs the same performance assertion against the portable wrapper. The final tagged commit must pass that expanded workflow before publication; [Releases](https://github.com/oliverchenOVO/project-aegis/releases) records the publication status.

Replay original/alternative hashes remain `4eb523d46aa39a2a` / `2a2b76b4e6376144`; simulation version remains 0.2.0. Legacy basic migration continues/restarts at `274b9673981fea23`, completes at `c3bc65045a879d42`; mid-incident continues/restarts at `0473de9276368be2`, completes at `36c486a38daa37c1`. Overload peak queue/census/ICU remain 8/36/8, with overload/power-emergency/handover ticks 759/1352/328. Native screenshots for full/near/cluster and all interaction widths are from the rebuilt final package. The six early/mid/late performance screenshots still describe the first candidate pending replacement by a qualified final run.

Next work: diagnose raster/compositor versus end-to-end automation cadence, then repeat the same complete performance protocol when local competing work has finished. Product changes require a new package and requalification. Publish only after the final candidate, all required gates, clean Git and exact final-head CI pass.
