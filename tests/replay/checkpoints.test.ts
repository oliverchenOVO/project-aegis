import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Simulation } from "../../packages/simulation/src/index";
import { earthquake } from "../../packages/scenarios/src/earthquake";
import {
  ReplayRecorder,
  VerifiedTimeline,
  replay,
} from "../../packages/replay/src/index";
import { load } from "../../packages/persistence/src/index";
import { hash } from "../../packages/shared/src/index";
import legacyManifest from "../fixtures/legacy/manifest.json";

function seekTargets(seed: string, endTick: number) {
  let random = Number.parseInt(hash(seed).slice(0, 8), 16);
  const targets = [
    0,
    64,
    65,
    66,
    109,
    110,
    111,
    189,
    190,
    191,
    299,
    300,
    301,
    302,
    599,
    600,
    601,
    900,
    endTick,
  ];
  for (let n = 0; n < 25; n++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    targets.push(random % (endTick + 1));
  }
  return targets;
}
function timeline(seed: string) {
  const sim = new Simulation(earthquake, seed),
    recorder = new ReplayRecorder(sim),
    expected = new Map<number, string>();
  const targets = new Set(seekTargets(seed, earthquake.maxTicks));
  while (true) {
    if ([90, 300, 301, 310, 599, 600, 610].includes(sim.state.tick))
      recorder.command(sim, { type: "REQUEST_STATUS", target: "H-B" });
    if (targets.has(sim.state.tick) || sim.state.completed)
      expected.set(sim.state.tick, sim.hash());
    if (sim.state.completed) break;
    sim.step();
    recorder.checkpoint(sim);
  }
  return { sim, recorder, expected };
}
it.each(["checkpoint-1", "checkpoint-2", "checkpoint-3", "checkpoint-4"])(
  "25 random seeks and event/command boundaries exactly match cold timeline: %s",
  (seed) => {
    const { sim, recorder, expected } = timeline(seed),
      verified = new VerifiedTimeline(earthquake, recorder.record);
    const targets = seekTargets(seed, sim.state.tick);
    for (const target of targets) {
      const result = verified.seekMeasured(target);
      expect(result.simulation.state.tick).toBe(target);
      expect(result.simulation.hash()).toBe(expected.get(target));
      expect(result.forwardTicks).toBeLessThan(300);
    }
    const restored = verified.seek(900);
    restored.step(earthquake.maxTicks - 900);
    expect(restored.hash()).toBe(sim.hash());
    expect(restored.aar()).toEqual(sim.aar());
  },
);
it("checkpoint verification rejects edited snapshots and forged matching hashes", () => {
  const { recorder } = timeline("checkpoint-corrupt");
  const broken = structuredClone(recorder.record);
  broken.checkpoints![1].snapshot.power =
    !broken.checkpoints![1].snapshot.power;
  expect(() => new VerifiedTimeline(earthquake, broken)).toThrow(
    "Checkpoint integrity",
  );
  broken.checkpoints![1].canonicalHash = hash(broken.checkpoints![1].snapshot);
  broken.hashes[1].hash = broken.checkpoints![1].canonicalHash;
  expect(() => new VerifiedTimeline(earthquake, broken)).toThrow(
    "DETERMINISM REGRESSION",
  );
});
it("verified timeline is isolated from caller mutation and repeated seeking", () => {
  const { recorder, expected } = timeline("checkpoint-immutable"),
    verified = new VerifiedTimeline(earthquake, recorder.record);
  recorder.record.commands.length = 0;
  recorder.record.checkpoints![1].snapshot.rng = {};
  expect(verified.seek(301).hash()).toBe(expected.get(301));
  const first = verified.seek(600);
  first.state.rng = {};
  expect(verified.seek(600).hash()).toBe(expected.get(600));
});
it("fixed v0.1 fixtures retain original hashes and load without checkpoints", () => {
  for (const fixture of legacyManifest.fixtures) {
    const bytes = readFileSync(fixture.name);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      fixture.sha256,
    );
    const loaded = load(bytes);
    expect(loaded.simulation.hash()).toBe(fixture.stateHash);
    expect(loaded.replay.checkpoints).toBeUndefined();
    expect(replay(loaded.scenario, loaded.replay).hash()).toBe(
      fixture.stateHash,
    );
  }
});
