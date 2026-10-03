import { z } from "zod";
import {
  SIM_VERSION,
  CommandInputSchema,
  ScenarioSchema,
  WorldSchema,
  type Scenario,
  type CommandInput,
} from "../../domain/src/index";
import { Simulation } from "../../simulation/src/index";
import { hash } from "../../shared/src/index";
export const CheckpointSchema = z.object({
  tick: z.number().int().nonnegative(),
  snapshot: WorldSchema,
  eventCursor: z.number().int().nonnegative(),
  commandCursor: z.number().int().nonnegative(),
  canonicalHash: z.string().regex(/^[0-9a-f]{16}$/),
  simulationVersion: z.literal(SIM_VERSION),
  scenarioVersion: z.string(),
});
export type ReplayCheckpoint = z.infer<typeof CheckpointSchema>;
export const ReplaySchema = z.object({
  formatVersion: z.literal(1),
  simulationVersion: z.literal(SIM_VERSION),
  scenarioId: z.string(),
  scenarioVersion: z.string(),
  seed: z.string().min(1).max(100),
  endTick: z.number().int().nonnegative().max(14400),
  commands: z.array(
    z.object({
      tick: z.number().int().nonnegative().max(14400),
      input: CommandInputSchema,
    }),
  ),
  hashes: z.array(
    z.object({
      tick: z.number().int().nonnegative(),
      hash: z.string().regex(/^[0-9a-f]{16}$/),
    }),
  ),
  checkpoints: z.array(CheckpointSchema).optional(),
});
export type ReplayRecord = z.infer<typeof ReplaySchema>;
export class ReplayRecorder {
  record: ReplayRecord;
  constructor(sim: Simulation) {
    this.record = {
      formatVersion: 1,
      simulationVersion: SIM_VERSION,
      scenarioId: sim.scenario.id,
      scenarioVersion: sim.scenario.version,
      seed: sim.state.seed,
      endTick: sim.state.tick,
      commands: [],
      hashes: [{ tick: 0, hash: sim.hash() }],
      checkpoints: [captureCheckpoint(sim, 0)],
    };
  }
  command(sim: Simulation, input: CommandInput): void {
    sim.issue(input);
    this.record.commands.push({
      tick: sim.state.tick,
      input: structuredClone(input),
    });
  }
  checkpoint(sim: Simulation): void {
    this.record.endTick = sim.state.tick;
    if (
      sim.state.tick % 300 === 0 &&
      !this.record.hashes.some((h) => h.tick === sim.state.tick)
    ) {
      this.record.hashes.push({ tick: sim.state.tick, hash: sim.hash() });
      this.record.checkpoints ??= [];
      this.record.checkpoints.push(
        captureCheckpoint(sim, this.record.commands.length),
      );
    }
  }
}
export function validateReplay(
  input: unknown,
  scenario: Scenario,
): ReplayRecord {
  const record = ReplaySchema.parse(input);
  ScenarioSchema.parse(scenario);
  if (
    record.scenarioId !== scenario.id ||
    record.scenarioVersion !== scenario.version ||
    record.endTick > scenario.maxTicks
  )
    throw new Error("重播場景版本不相容");
  if (
    record.commands.some(
      (c, i) =>
        c.tick > record.endTick ||
        (i > 0 && c.tick < record.commands[i - 1].tick),
    )
  )
    throw new Error("重播指令時間序列損壞");
  if (
    !record.hashes.length ||
    record.hashes[0].tick !== 0 ||
    record.hashes.some(
      (h, i) =>
        h.tick > record.endTick ||
        (i > 0 && h.tick <= record.hashes[i - 1].tick),
    )
  )
    throw new Error("重播校驗索引損壞");
  for (const [i, checkpoint] of (record.checkpoints ?? []).entries()) {
    const expectedCursor = record.commands.filter(
      (c) => c.tick < checkpoint.tick,
    ).length;
    if (
      checkpoint.tick > record.endTick ||
      checkpoint.snapshot.tick !== checkpoint.tick ||
      checkpoint.snapshot.seed !== record.seed ||
      checkpoint.snapshot.scenarioId !== scenario.id ||
      checkpoint.scenarioVersion !== scenario.version ||
      checkpoint.snapshot.scenarioVersion !== scenario.version ||
      checkpoint.eventCursor !== checkpoint.snapshot.events.length ||
      checkpoint.commandCursor !== expectedCursor ||
      checkpoint.canonicalHash !== hash(checkpoint.snapshot) ||
      record.hashes.find((h) => h.tick === checkpoint.tick)?.hash !==
        checkpoint.canonicalHash ||
      (i > 0 && checkpoint.tick <= record.checkpoints![i - 1].tick)
    )
      throw new Error(
        `DETERMINISM REGRESSION: Checkpoint integrity failure at tick ${checkpoint.tick}`,
      );
  }
  return record;
}
export function replay(
  scenario: Scenario,
  input: unknown,
  targetTick?: number,
): Simulation {
  const record = validateReplay(input, scenario),
    target = targetTick ?? record.endTick;
  if (!Number.isInteger(target) || target < 0 || target > record.endTick)
    throw new Error("重播時間超出範圍");
  const sim = new Simulation(scenario, record.seed);
  let cursor = 0;
  const checks = new Map(record.hashes.map((h) => [h.tick, h.hash]));
  while (sim.state.tick <= target) {
    const expected = checks.get(sim.state.tick);
    if (expected && expected !== sim.hash())
      throw new Error(`DETERMINISM REGRESSION at tick ${sim.state.tick}`);
    const checkpoint = record.checkpoints?.find(
      (c) => c.tick === sim.state.tick,
    );
    if (
      checkpoint &&
      (checkpoint.canonicalHash !== sim.hash() ||
        hash(checkpoint.snapshot) !== sim.hash())
    )
      throw new Error(
        `Checkpoint does not match simulated timeline at tick ${sim.state.tick}`,
      );
    while (record.commands[cursor]?.tick === sim.state.tick) {
      sim.issue(record.commands[cursor].input);
      cursor++;
    }
    if (sim.state.tick === target) break;
    if (sim.state.completed) throw new Error("重播提前結束");
    sim.step(1);
  }
  return sim;
}

function captureCheckpoint(
  sim: Simulation,
  commandCursor: number,
): ReplayCheckpoint {
  return {
    tick: sim.state.tick,
    snapshot: sim.snapshot(),
    eventCursor: sim.state.events.length,
    commandCursor,
    canonicalHash: sim.hash(),
    simulationVersion: SIM_VERSION,
    scenarioVersion: sim.scenario.version,
  };
}

/** Owns a fully verified immutable timeline; seek never trusts caller-mutated snapshots. */
export class VerifiedTimeline {
  readonly #record: ReplayRecord;
  readonly #scenario: Scenario;
  constructor(scenario: Scenario, input: unknown) {
    this.#scenario = ScenarioSchema.parse(scenario);
    this.#record = validateReplay(structuredClone(input), this.#scenario);
    replay(this.#scenario, this.#record);
  }
  seek(target: number): Simulation {
    return this.seekMeasured(target).simulation;
  }
  seekMeasured(target: number): {
    simulation: Simulation;
    restoredTick: number;
    forwardTicks: number;
    restoreMs: number;
    forwardMs: number;
    totalMs: number;
  } {
    if (
      !Number.isInteger(target) ||
      target < 0 ||
      target > this.#record.endTick
    )
      throw new Error("重播時間超出範圍");
    const start = performance.now();
    const checkpoint = this.#record.checkpoints
      ?.slice()
      .reverse()
      .find((c) => c.tick <= target);
    const sim = checkpoint
      ? new Simulation(this.#scenario, this.#record.seed, checkpoint.snapshot)
      : new Simulation(this.#scenario, this.#record.seed);
    const restoreMs = performance.now() - start,
      restoredTick = sim.state.tick;
    let cursor = checkpoint?.commandCursor ?? 0;
    const checks = new Map(this.#record.hashes.map((h) => [h.tick, h.hash]));
    while (sim.state.tick <= target) {
      const expected = checks.get(sim.state.tick);
      if (expected && expected !== sim.hash())
        throw new Error(`DETERMINISM REGRESSION at tick ${sim.state.tick}`);
      while (this.#record.commands[cursor]?.tick === sim.state.tick)
        sim.issue(this.#record.commands[cursor++].input);
      if (sim.state.tick === target) break;
      if (sim.state.completed) throw new Error("重播提前結束");
      sim.step();
    }
    const totalMs = performance.now() - start;
    return {
      simulation: sim,
      restoredTick,
      forwardTicks: target - restoredTick,
      restoreMs,
      forwardMs: totalMs - restoreMs,
      totalMs,
    };
  }
}
