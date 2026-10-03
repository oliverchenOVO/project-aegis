import { it, expect, describe, beforeAll, afterAll } from "vitest";
import {
  Simulation,
  assertInvariants,
} from "../../packages/simulation/src/index";
import { flood } from "../../packages/scenarios/src/flood";
import { earthquake } from "../../packages/scenarios/src/earthquake";
import {
  ReplayRecorder,
  replay,
  VerifiedTimeline,
} from "../../packages/replay/src/index";
import { save, load } from "../../packages/persistence/src/index";
import { route, passable } from "../../packages/simulation/src/routing";
import { hash } from "../../packages/shared/src/index";
describe.each(["flood-one", "flood-two", "AEGIS-FLOOD-2026-001"])(
  "flood complete timeline: %s",
  (seed) => {
    let completed: { sim: Simulation; recorder: ReplayRecorder } | undefined,
      saved: Uint8Array | undefined;
    beforeAll(() => {
      const sim = new Simulation(flood, seed),
        recorder = new ReplayRecorder(sim);
      while (!sim.state.completed) {
        if (sim.state.tick === 30)
          recorder.command(sim, {
            type: "DISPATCH_UNIT",
            target: "AMB-01",
            incidentId: "INC-1",
          });
        sim.step();
        recorder.checkpoint(sim);
        if (sim.state.tick % 30 === 0) assertInvariants(sim.state, flood);
      }
      completed = { sim, recorder };
    }, 30000);
    afterAll(() => {
      completed = undefined;
      saved = undefined;
    });
    it("shared hazards, actual power/communication causes and vehicle rerouting", () => {
      const { sim } = completed!;
      expect(sim.state.tick).toBe(flood.maxTicks);
      expect(sim.state.events.some((e) => e.type === "RAIN_ENDED")).toBe(true);
      expect(sim.state.incidents.length).toBeGreaterThanOrEqual(50);
      const power = sim.state.events.find(
          (e) => e.type === "POWER_NODE_FAILED",
        )!,
        cause = sim.state.events.find(
          (e) => e.id === power.causedByEventIds[0],
        )!;
      expect(cause.type).toBe("FLOOD_ZONE_RISE");
      const comms = sim.state.events.find(
        (e) => e.type === "COMMUNICATION_DEGRADED",
      )!;
      expect(comms.causedByEventIds).toContain(power.id);
      expect(
        sim.state.events.some(
          (e) => e.type === "UNIT_REROUTED" && e.payload.unitId === "AMB-01",
        ),
      ).toBe(true);
    });
    it("cold replay exactly reproduces final state and AAR", () => {
      const { sim, recorder } = completed!,
        reconstructed = replay(flood, recorder.record);
      expect(reconstructed.hash()).toBe(sim.hash());
      expect(reconstructed.aar()).toEqual(sim.aar());
    });
    it("a verified checkpoint timeline reaches the exact requested cursor", () => {
      const { recorder } = completed!;
      expect(
        new VerifiedTimeline(flood, recorder.record).seek(1500).state.tick,
      ).toBe(1500);
    });
    it("encodes a full portable save with its replay and checkpoint index", () => {
      const { sim, recorder } = completed!;
      saved = save(sim, recorder.record);
      expect(saved.length).toBeGreaterThan(20);
    });
    it("reopens the encoded save with independent replay verification", () => {
      const { sim } = completed!,
        restored = load(saved!);
      expect(restored.simulation.hash()).toBe(sim.hash());
    });
  },
);
it("flood fields and infrastructure truth never leak into received knowledge", () => {
  const sim = new Simulation(flood, "flood-fog");
  sim.step(200);
  const before = sim.view();
  sim.state.flood!.zones[0].waterDepth += 2;
  sim.state.power = !sim.state.power;
  sim.state.hospitals[0].power = !sim.state.hospitals[0].power;
  expect(sim.view()).toEqual(before);
  expect(JSON.stringify(before.city)).not.toContain("waterDepth");
  expect(JSON.stringify(before)).not.toContain("truthRef");
  expect(before.city.floodZones?.length).toBe(4);
});
it("road constraints prevent ambulance/utility traversal at unsafe water depths", () => {
  const sim = new Simulation(flood, "flood-routing");
  const road = sim.state.roads[0];
  road.waterDepth = 0.5;
  road.state = "DEGRADED";
  expect(passable(road, "EMS")).toBe(true);
  expect(passable(road, "UTILITY")).toBe(false);
  road.waterDepth = 0.6;
  expect(passable(road, "EMS")).toBe(false);
  for (const r of sim.state.roads) {
    r.state = "IMPASSABLE";
    r.waterDepth = 1;
  }
  expect(route(sim.state, "N0", "N34", "EMS")).toBeUndefined();
});
it("shared earthquake hazard wrapper preserves engine behavior and frozen v1 timeline", () => {
  const sim = new Simulation(earthquake, "legacy-compat", undefined, "0.1.0"),
    recorder = new ReplayRecorder(sim);
  while (!sim.state.completed) {
    sim.step();
    recorder.checkpoint(sim);
  }
  expect(replay(earthquake, recorder.record).hash()).toBe(hash(sim.state));
  expect(sim.state.flood).toBeUndefined();
});
