# v0.2.2 — Fixed Oblique City View + Tactical Incident Clustering

Stable baseline: v0.2.1, commit 825bf505ad40f420d61cd81082c5c57fdec0a4af. This task changes presentation only. All 117 existing tests remain unchanged. Simulation/scenario/RNG/save/replay/migration behavior and golden expectations are frozen; any authoritative hash mismatch stops implementation.

## v0.2.1 diagnosis before implementation

Camera: one Pixi camera container applies centered uniform scale and translation to an 800×590 XY plane. `map/camera.ts` supplies inverse camera coordinates, route segment hit tolerance and a change-driven invalidator. Received updates coalesce into one RAF; camera changes flush immediately. Pixi's permanent ticker remains disabled.

Scene: cached static city host precedes dynamic tactical content. Terrain, parcels, river, roads, bridges, shadows, buildings, landmarks and static labels are cached in three bounded LOD variants. Ordinary masses sort by ground Y; landmarks have a separate higher layer, so ordering is incomplete across architecture. Ground itself has no tilt; roofs use the arbitrary (-0.38h,-0.68h) offset, which makes the city read as a raised board.

Interaction: Pixi pointer events select facilities, hospitals, received incident plates, known vehicles, flood and communication markers. Native route hover removes the camera transform and tests the original ground segment. The overlay receives only CommandCenterView and public scenario ID/version. Unknown positions never create vehicles; reported flood/operational conditions are separate from nominal public landmark architecture.

Callouts: the old seven-candidate ground-space collision search can overflow in 75+ incident flood scenes. It has no screen-space cluster representation. Selected incidents use the original subject ID in the shared UI store and existing right-hand inspector/dispatch workflow.

## Design and implementation contract

Preserve command-center chrome, typography, palette, nine layer controls, resource/intelligence rails, queue and tick controls. The new concept is a design reference, never a background bitmap. Fixed mathematical projection, deterministic vector geometry, horizontal readable labels and received-only clustering take precedence over invented geography/text in generated concepts. No raster substitute for cartography and no CSS canvas tilt.

Use one orthographic oblique matrix, initially X=x-0.32y, Y=0.16x+0.68y, with height rendered vertically as -zScale*z. The determinant is nonzero and the inverse is explicit. The Pixi ground container uses this exact matrix, allowing original public XY footprints and hit geometry to remain authoritative. Building surfaces are derived from XY footprint plus Z height through projectPoint, including inverse ground-frame roof offsets where needed. Camera fit uses projected bounds plus roof/label margins.

WORLD: public roads, river, footprints, bridges and physical landmarks. PROJECTED WORLD: received routes, known vehicles, incident ground anchors and flood extents. SCREEN-FACING: horizontal labels and plates anchored to projected positions, plus cluster labels/tooltips/right-panel details. Pointer flow is screen → inverse camera → inverse projection → original ground XY. Tactical information remains above architecture; flood surfaces remain on the ground below buildings.

Clustering begins only after projected interaction QA passes. A stable received-only layout will use viewport/zoom/projected overlap, retain selected/high-severity/newer incident priority, and represent every received incident individually or in exactly one cluster. Cluster selection opens a right-panel list of the actual received members; choosing one uses its original ID and existing dispatch inspector. No authoritative incidents are merged or newly queried.

## Verification protocol

Actual v0.2.1 executable baseline runs use the same GPU/explicit SwiftShader launch and public Worker instrumentation as candidate runs. In addition to first map, zoom/toggle, early pan, idle, +300 ticks and received-update-to-frame, the protocol now measures late T1200 pan to enforce the dense-flood software floor of 12 effective FPS. Samples include Playwright/CDP/host scheduling; they are not isolated GPU timings.

Browser plugin is not available in this session; native Electron/portable executables are tested through existing Playwright Electron/CDP harnesses. Before/after native screenshots, projected pure/hit tests, received-only cluster tests, all 117 unchanged regressions, actual packaged/portable GPU/SwiftShader matrices, replay/AAR/branch/migration/overload and final CI determine release gates. No v0.2.2 release before all gates pass.

Implementation, native fidelity ledger, measured results and limitations will be recorded as verification completes.
