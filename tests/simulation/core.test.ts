import { describe, it, expect } from "vitest";
import { SeededRandom } from "../../packages/simulation/src/random";
import {
  Simulation,
  assertInvariants,
} from "../../packages/simulation/src/index";
import {
  earthquake,
  SHOWCASE_SEED,
} from "../../packages/scenarios/src/earthquake";
import { route, edge } from "../../packages/simulation/src/routing";
import { hash, canonical } from "../../packages/shared/src/index";
describe("deterministic foundations", () => {
  it("canonical ordering and seeded stream isolation", () => {
    expect(canonical({ b: 2, a: 1 })).toBe(canonical({ a: 1, b: 2 }));
    const states = {},
      a = new SeededRandom("x", states, "fire"),
      b = new SeededRandom("x", {}, "fire");
    expect(a.next()).toBe(b.next());
    new SeededRandom("x", states, "medical").next();
    expect(a.next()).toBe(b.next());
    expect(new SeededRandom("other", {}, "fire").next()).not.toBe(b.next());
  });
  it.each(["alpha", "beta", SHOWCASE_SEED])(
    "same seed produces identical state/events/AAR: %s",
    (seed) => {
      const a = new Simulation(earthquake, seed),
        b = new Simulation(earthquake, seed);
      for (const sim of [a, b]) {
        sim.step(90);
        sim.issue({
          type: "DISPATCH_UNIT",
          target: "ENG-01",
          incidentId: "INC-1",
        });
        sim.issue({ type: "REQUEST_STATUS", target: "H-B" });
        sim.step(1800);
        assertInvariants(sim.state, earthquake);
      }
      expect(a.hash()).toBe(b.hash());
      expect(hash(a.state.events)).toBe(hash(b.state.events));
      expect(a.aar()).toEqual(b.aar());
    },
  );
  it("shortest path avoids blocked edges and has deterministic ties", () => {
    const sim = new Simulation(earthquake, "route"),
      p = route(sim.state, "N0", "N6")!;
    expect(p.nodes.at(-1)).toBe("N6");
    edge(sim.state, "N0", p.nodes[0])!.state = "BLOCKED";
    const next = route(sim.state, "N0", "N6")!;
    expect(next.nodes[0]).not.toBe(p.nodes[0]);
    expect(next.eta).toBeGreaterThan(p.eta);
  });
  it("commands do not immediately mutate assignments; received orders move along roads", () => {
    const sim = new Simulation(earthquake, "cmd");
    sim.step(40);
    const c = sim.issue({
      type: "DISPATCH_UNIT",
      target: "ENG-01",
      incidentId: "INC-1",
    });
    expect(sim.state.units[0].assignment).toBeUndefined();
    sim.step(c.deliveryTick - sim.state.tick);
    expect(sim.state.units[0].assignment).toBe("INC-1");
    expect(sim.state.units[0].nodeId).toBe("N8");
    sim.step(45);
    expect(
      sim.state.units[0].edgeProgress + sim.state.units[0].route.length,
    ).toBeGreaterThan(0);
    expect(sim.state.events.some((e) => e.type === "UNIT_DEPARTED")).toBe(true);
  });
  it("hospital report describes observation, not live generator state", () => {
    const sim = new Simulation(earthquake, SHOWCASE_SEED);
    sim.step(400);
    const stale = sim.state.reports.find(
      (r) =>
        r.subjectId === "H-B" &&
        r.claim.value === "備用發電機運轉中" &&
        r.receivedTick !== undefined &&
        r.receivedTick > 195,
    );
    expect(stale).toBeDefined();
    expect(stale!.truthRef.value).toBe(stale!.claim.value);
    expect(sim.state.hospitals[1].generator).toBe("FAILED");
    const view = sim.view();
    expect(JSON.stringify(view)).not.toContain("truthRef");
    expect(view).not.toHaveProperty("patients");
    expect(view).not.toHaveProperty("rng");
    expect(view.reports.every((r) => r.receivedTick! <= view.tick)).toBe(true);
  });
  it("dead casualties never revive and all invariants hold across ticks", () => {
    const sim = new Simulation(earthquake, "invariants"),
      dead = new Set<string>();
    while (!sim.state.completed) {
      sim.step(1);
      if (sim.state.tick % 30 === 0) assertInvariants(sim.state, earthquake);
      for (const p of sim.state.patients) {
        if (dead.has(p.id)) expect(p.state).toBe("DEAD");
        if (p.state === "DEAD") dead.add(p.id);
      }
    }
    expect(sim.state.tick).toBeLessThanOrEqual(earthquake.maxTicks);
  });
});
