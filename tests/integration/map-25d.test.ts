import { describe, it, expect, vi } from "vitest";
import { Session } from "../../packages/application/src/session";
import { flood } from "../../packages/scenarios/src/flood";
import {
  cityLayout,
  cityKey,
  inRiver,
  roofOffset,
  crossesRiver,
} from "../../packages/ui/src/map/city";
import {
  cameraPosition,
  screenToGround,
  nearSegment,
  invalidator,
} from "../../packages/ui/src/map/camera";
import {
  positionedUnits,
  floodAppearance,
  incidentCallouts,
} from "../../packages/ui/src/map/knowledge";
import {
  MAP_LAYERS,
  detailForScale,
  HEIGHTS,
} from "../../packages/ui/src/map/theme";
describe("renderer cartography and knowledge contract", () => {
  const initial = new Session("map-a", flood).update();
  it("layout ignores gameplay seeds, report updates and hidden extra fields", () => {
    const other = new Session("map-b", flood);
    other.step(90);
    const city = structuredClone(initial.view.city);
    Object.assign(city, { floodDepth: 9, failed: true });
    expect(cityLayout(city, initial.scenario)).toEqual(
      cityLayout(other.update().view.city, initial.scenario),
    );
    expect(cityKey(city, { ...initial.scenario, version: "future" })).not.toBe(
      cityKey(city, initial.scenario),
    );
  });
  it("district morphology differs and roofs have consistent light direction", () => {
    const { masses } = cityLayout(initial.view.city, initial.scenario);
    const average = (id: string) => {
      const items = masses.filter((m) => m.district === id);
      return items.reduce((s, m) => s + m.w * m.d, 0) / items.length;
    };
    expect(average("A")).toBeGreaterThan(average("C") * 2);
    expect(masses.filter((m) => m.district === "C").length).toBeGreaterThan(
      masses.filter((m) => m.district === "A").length,
    );
    expect(
      new Set(
        masses.filter((m) => m.district === "B").map((m) => m.heightClass),
      ),
    ).toContain("HIGH");
    for (const type of Object.keys(HEIGHTS) as (keyof typeof HEIGHTS)[]) {
      expect(roofOffset(type).x).toBeLessThan(0);
      expect(roofOffset(type).y).toBeLessThan(0);
    }
    for (const m of masses)
      for (const [x, y] of [
        [m.x, m.y],
        [m.x + m.w, m.y],
        [m.x, m.y + m.d],
        [m.x + m.w, m.y + m.d],
      ])
        expect(inRiver(x, y)).toBe(false);
  });
  it("physical bridge classification uses geography only", () => {
    expect(crossesRiver({ x: 300, y: 175 }, { x: 410, y: 175 })).toBe(true);
    expect(crossesRiver({ x: 80, y: 60 }, { x: 190, y: 60 })).toBe(false);
  });
  it("unknown units and hidden extra positions never become vehicles", () => {
    const view = structuredClone(initial.view);
    for (const u of view.units)
      Object.assign(u, {
        nodeId: "N5",
        position: { x: 630, y: 60 },
        actualPosition: "N5",
      });
    expect(positionedUnits(view).size).toBe(0);
    const session = new Session("known", flood);
    session.step(90);
    const known = session.update().view;
    const ids = [...positionedUnits(known).values()].flat().map((u) => u.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(
      ids.every(
        (id) => known.units.find((u) => u.id === id)?.belief?.claim.nodeId,
      ),
    ).toBe(true);
  });
  it("unknown flood has neutral appearance and received severity is bounded", () => {
    expect(floodAppearance(undefined).alpha).toBe(0.035);
    expect(floodAppearance(0)).not.toEqual(floodAppearance(undefined));
    expect(floodAppearance(30).alpha).toBe(0.26);
  });
  it("tactical overlays stay above all masses and shadows", () => {
    for (const id of ["routes", "units", "callouts", "selection"] as const)
      expect(MAP_LAYERS[id]).toBeGreaterThan(MAP_LAYERS.landmarks);
    expect(MAP_LAYERS.units).toBeGreaterThan(MAP_LAYERS.routes);
    expect(MAP_LAYERS.flood).toBeLessThan(MAP_LAYERS.routes);
  });
  it("inverse camera and route hit radius survive zoom, pan and all desktop sizes", () => {
    for (const [width, height] of [
      [1920, 1080],
      [1600, 900],
      [1366, 768],
    ])
      for (const zoom of [0.65, 1, 3]) {
        const scale = Math.min(width / 800, height / 590) * zoom;
        const p = cameraPosition(width, height, scale, { x: 37, y: -23 });
        const ground = screenToGround(
          { x: p.x + 630 * scale, y: p.y + 60 * scale },
          p,
          scale,
        );
        expect(ground.x).toBeCloseTo(630, 10);
        expect(ground.y).toBeCloseTo(60, 10);
      }
    expect(
      nearSegment({ x: 355, y: 181 }, { x: 300, y: 175 }, { x: 410, y: 175 }),
    ).toBe(true);
    expect(
      nearSegment({ x: 355, y: 185 }, { x: 300, y: 175 }, { x: 410, y: 175 }),
    ).toBe(false);
  });
  it("invalidation coalesces changes and never schedules an idle loop", () => {
    const queue: (() => void)[] = [],
      draw = vi.fn(),
      cancel = vi.fn();
    const scheduler = invalidator(
      (fn) => {
        queue.push(fn);
        return queue.length;
      },
      cancel,
      draw,
    );
    scheduler.request();
    scheduler.request();
    expect(queue.length).toBe(1);
    queue[0]();
    expect(draw).toHaveBeenCalledTimes(1);
    expect(queue.length).toBe(1);
    scheduler.request();
    scheduler.dispose();
    expect(cancel).toHaveBeenCalledWith(2);
    queue[1]();
    scheduler.request();
    expect(draw).toHaveBeenCalledTimes(1);
    expect(queue.length).toBe(2);
  });
  it("coincident incident labels remain separate and geographically anchored", () => {
    const session = new Session("AEGIS-2026-001");
    session.step(60);
    const view = session.update().view;
    const places = [...incidentCallouts(view).values()];
    for (let i = 0; i < places.length; i++)
      for (let j = i + 1; j < places.length; j++)
        expect(
          Math.abs(places[i].x - places[j].x) >= 98 ||
            Math.abs(places[i].y - places[j].y) >= 34,
        ).toBe(true);
    expect(places.length).toBe(
      view.beliefs.filter((b) => b.kind === "INCIDENT" && b.claim.nodeId)
        .length,
    );
  });
  it("LOD boundaries are independent of incoming disaster reports", () => {
    expect([0.65, 1, 2].map(detailForScale)).toEqual(["FAR", "MEDIUM", "NEAR"]);
  });
});
