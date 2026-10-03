import { it, expect } from "vitest";
import {
  Simulation,
  assertInvariants,
} from "../../packages/simulation/src/index";
import {
  splitCohort,
  assertPopulation,
} from "../../packages/simulation/src/civilians";
import { flood } from "../../packages/scenarios/src/flood";
import { earthquakeSystemic } from "../../packages/scenarios/src/earthquake-systemic";
import { SeededRandom } from "../../packages/simulation/src/random";
import { emit } from "../../packages/simulation/src/events";
it("100 deterministic cohort splits preserve every original population source", () => {
  const sim = new Simulation(flood, "cohort-property"),
    population = Object.values(sim.state.populationSources!).reduce(
      (a, b) => a + b,
      0,
    ),
    rng = new SeededRandom("cohort-fuzz", {}, "split");
  for (let n = 0; n < 100; n++) {
    const source = rng.choose(
        sim.state.cohorts!.filter((c) => c.healthState === "NORMAL"),
      ),
      count = rng.integer(1, source.population);
    splitCohort(sim.state, source, count);
    assertPopulation(sim.state);
    expect(sim.state.cohorts!.reduce((n, c) => n + c.population, 0)).toBe(
      population,
    );
  }
  sim.state.cohorts![0].population++;
  expect(() => assertPopulation(sim.state)).toThrow("conservation");
});
it.each(["civilian-a", "civilian-b", "civilian-c"])(
  "exposure, injuries, transport and deaths conserve population: %s",
  (seed) => {
    const sim = new Simulation(flood, seed),
      population = Object.values(sim.state.populationSources!).reduce(
        (a, b) => a + b,
        0,
      );
    expect(sim.state.cohorts!.length).toBeGreaterThanOrEqual(100);
    while (sim.state.tick < 1200) {
      sim.step();
      if (sim.state.tick % 30 === 0) assertInvariants(sim.state, flood);
    }
    expect(sim.state.patients.some((p) => p.civilianCohortId && p.count)).toBe(
      true,
    );
    expect(sim.state.cohorts!.reduce((n, c) => n + c.population, 0)).toBe(
      population,
    );
    expect(sim.state.events.some((e) => e.type === "CIVILIANS_EXPOSED")).toBe(
      true,
    );
    const twin = new Simulation(flood, seed);
    twin.step(1200);
    expect(twin.hash()).toBe(sim.hash());
  },
);
it("evacuation is delivered/acknowledged and changes actual shelter outcomes", () => {
  const active = new Simulation(flood, "evacuation-policy"),
    passive = new Simulation(flood, "evacuation-policy");
  active.step();
  passive.step();
  const before = active.state.cohorts!.filter(
      (c) => c.state === "EVACUATING",
    ).length,
    command = active.issue({ type: "EVACUATE_ZONE", target: "F-C" });
  expect(command.deliveryStatus).toBe("SENT");
  expect(
    active.state.cohorts!.filter((c) => c.state === "EVACUATING").length,
  ).toBe(before);
  active.step(599);
  passive.step(599);
  expect(command.deliveryStatus).toBe("ACKNOWLEDGED");
  expect(command.acknowledgementTick).toBeGreaterThanOrEqual(
    command.deliveryTick,
  );
  expect(active.state.events.some((e) => e.type === "EVACUATION_ORDERED")).toBe(
    true,
  );
  const safe = (sim: Simulation) =>
    sim.state
      .cohorts!.filter((c) => c.state === "SHELTERED")
      .reduce((n, c) => n + c.population, 0);
  expect(safe(active)).toBeGreaterThan(safe(passive));
  assertPopulation(active.state);
  assertPopulation(passive.state);
});
it("earthquake v2 cohorts link real casualties while v1 remains separate", () => {
  const sim = new Simulation(earthquakeSystemic, "cohort-earthquake");
  sim.step(600);
  assertInvariants(sim.state, earthquakeSystemic);
  expect(sim.state.patients.every((p) => !!p.civilianCohortId)).toBe(true);
  expect(sim.state.scenarioVersion).toBe("2.0.0");
});
it("split/event/queue runaway guards fail explicitly", () => {
  const sim = new Simulation(flood, "cohort-guards");
  sim.state.counters.splits = 4096;
  expect(() => splitCohort(sim.state, sim.state.cohorts![0], 1)).toThrow(
    "explosion guard",
  );
  sim.state.counters.eventsThisTick = 1000;
  sim.state.counters.eventTick = sim.state.tick;
  expect(() => emit(sim.state, "CIVILIANS_STRANDED", {})).toThrow(
    "Event explosion guard",
  );
});
