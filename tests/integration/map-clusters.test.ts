import { describe, expect, it } from "vitest";
import { Session } from "../../packages/application/src/session";
import { flood } from "../../packages/scenarios/src/flood";
import { clusterIncidents, PLATE } from "../../packages/ui/src/map/clusters";
import { cityCamera, cityFit } from "../../packages/ui/src/map/projection";
describe("received-only deterministic incident aggregation", () => {
  const session = new Session("AEGIS-FLOOD-2026-001", flood);
  session.step(1200);
  const view = session.update().view;
  const layout = (v = view, zoom = 1, selected?: string) => {
    const scale = cityFit(820, 650) * zoom;
    return clusterIncidents(
      v,
      cityCamera(820, 650, scale, { x: 0, y: 0 }),
      scale,
      820,
      650,
      selected,
    );
  };
  it("represents every received incident exactly once through all LOD levels", () => {
    const ids = view.beliefs
      .filter((b) => b.kind === "INCIDENT")
      .map((b) => b.subjectId)
      .sort();
    expect(ids.length).toBeGreaterThan(75);
    for (const zoom of [0.65, 1, 3]) {
      const groups = layout(view, zoom);
      expect(
        groups.flatMap((g) => g.members.map((b) => b.subjectId)).sort(),
      ).toEqual(ids);
      expect(groups.length).toBeLessThan(ids.length);
      for (const [i, a] of groups.entries())
        for (const b of groups.slice(i + 1))
          expect(
            Math.abs(a.x - b.x) >= PLATE.width + PLATE.gap ||
              Math.abs(a.y - b.y) >= PLATE.height + PLATE.gap,
          ).toBe(true);
    }
  });
  it("ignores hidden truth, input order and timing; only beliefs affect summaries", () => {
    const other = structuredClone(view);
    other.beliefs.reverse();
    Object.assign(other, {
      incidents: [{ id: "HIDDEN", severity: 100, nodeId: "N1" }],
      floodDepth: 99,
    });
    Object.assign(other.city, { incidents: [{ id: "HIDDEN" }] });
    expect(layout(other)).toEqual(layout());
    for (const g of layout()) {
      expect(
        g.members.every((b) =>
          view.beliefs.some((v) => v.subjectId === b.subjectId),
        ),
      ).toBe(true);
      expect(g.receivedAge).toBe(
        view.tick - Math.max(...g.members.map((b) => b.receivedTick)),
      );
    }
  });
  it("keeps selected incident individual even among coincident reports", () => {
    const id = view.beliefs.find((b) => b.kind === "INCIDENT")!.subjectId;
    expect(
      layout(view, 0.65, id)
        .find((g) => g.members.some((b) => b.subjectId === id))!
        .members.map((b) => b.subjectId),
    ).toEqual([id]);
  });
  it("preserves unknown-location reports without inventing ground anchors", () => {
    const other = structuredClone(view);
    const b = other.beliefs.find((b) => b.kind === "INCIDENT")!;
    delete b.claim.nodeId;
    expect(
      layout(other).flatMap((g) => g.members.map((b) => b.subjectId)),
    ).toContain(b.subjectId);
  });
  it("separates spaced incidents at near zoom and honors severity then received recency", () => {
    const other = structuredClone(view);
    const template = other.beliefs.find((b) => b.kind === "INCIDENT")!;
    other.beliefs = [
      {
        ...template,
        subjectId: "A",
        receivedTick: 4,
        claim: {
          ...template.claim,
          nodeId: other.city.nodes[0].id,
          severity: 10,
        },
      },
      {
        ...template,
        subjectId: "B",
        receivedTick: 2,
        claim: {
          ...template.claim,
          nodeId: other.city.nodes[0].id,
          severity: 90,
        },
      },
      {
        ...template,
        subjectId: "C",
        receivedTick: 6,
        claim: {
          ...template.claim,
          nodeId: other.city.nodes.at(-1)!.id,
          severity: 10,
        },
      },
    ];
    const groups = layout(other, 3);
    expect(groups[0].members.map((b) => b.subjectId)).toEqual(["B", "A"]);
    expect(
      groups.some(
        (g) => g.members.length === 1 && g.members[0].subjectId === "C",
      ),
    ).toBe(true);
    expect(other.beliefs[0].claim.nodeId).toBe(view.city.nodes[0].id);
  });
});
