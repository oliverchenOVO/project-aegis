import { describe, it, expect } from "vitest";
import { Session } from "../../packages/application/src/session";
import { flood } from "../../packages/scenarios/src/flood";
import {
  projectGround,
  projectPoint,
  unprojectGround,
  groundFramePoint,
  cityFit,
  cityCamera,
  pointerGround,
  buildingDepth,
  PROJECTION,
} from "../../packages/ui/src/map/projection";
describe("fixed oblique renderer projection", () => {
  const view = new Session("projection-only", flood).update().view;
  it("round-trips public corners, roads, bridge/facility/unit/incident anchors without mutating XY", () => {
    const original = structuredClone(view.city.nodes);
    const points = [
      ...view.city.nodes,
      ...Array.from({ length: 100 }, (_, i) => ({
        x: i * 8,
        y: (i * 37) % 591,
      })),
      { x: 0, y: 0 },
      { x: 800, y: 590 },
    ];
    for (const p of points) {
      const q = projectGround(p.x, p.y),
        r = unprojectGround(q.x, q.y);
      expect(r.x).toBeCloseTo(p.x, 10);
      expect(r.y).toBeCloseTo(p.y, 10);
    }
    expect(view.city.nodes).toEqual(original);
  });
  it("pointer inversion survives fit, pan and zoom at every required viewport", () => {
    for (const [w, h] of [
      [1920, 1080],
      [1600, 900],
      [1366, 768],
    ])
      for (const zoom of [0.65, 1, 3]) {
        const scale = cityFit(w, h) * zoom,
          camera = cityCamera(w, h, scale, { x: 37, y: -23 });
        for (const node of view.city.nodes) {
          const p = projectGround(node.x, node.y),
            q = pointerGround(
              { x: camera.x + p.x * scale, y: camera.y + p.y * scale },
              camera,
              scale,
            );
          expect(q.x).toBeCloseTo(node.x, 10);
          expect(q.y).toBeCloseTo(node.y, 10);
        }
      }
  });
  it("height is vertical and roof ground-frame coordinates project to the same XYZ point", () => {
    for (const z of [0, 12, 24, 40, 52]) {
      const ground = projectGround(630, 60),
        roof = projectPoint(630, 60, z),
        local = groundFramePoint(630, 60, z);
      expect(roof.x).toBe(ground.x);
      expect(ground.y - roof.y).toBeCloseTo(z * PROJECTION.zScale, 10);
      expect(projectGround(local.x, local.y).x).toBeCloseTo(roof.x, 10);
      expect(projectGround(local.x, local.y).y).toBeCloseTo(roof.y, 10);
    }
  });
  it("architectural depth follows both projected ground axes and has a stable order", () => {
    const far = { x: 80, y: 60, w: 30, d: 20 },
      near = { ...far, y: 175 },
      right = { ...far, x: 630 };
    expect(buildingDepth(near)).toBeGreaterThan(buildingDepth(far));
    expect(buildingDepth(right)).toBeGreaterThan(buildingDepth(far));
  });
  it("routes interpolate exactly on the projected road rather than a second gameplay graph", () => {
    for (const road of view.city.roads) {
      const a = view.city.nodes.find((n) => n.id === road.from)!,
        b = view.city.nodes.find((n) => n.id === road.to)!;
      const p = projectGround(a.x, a.y),
        q = projectGround(b.x, b.y),
        mid = projectGround((a.x + b.x) / 2, (a.y + b.y) / 2);
      expect(mid.x).toBeCloseTo((p.x + q.x) / 2, 10);
      expect(mid.y).toBeCloseTo((p.y + q.y) / 2, 10);
    }
  });
});
