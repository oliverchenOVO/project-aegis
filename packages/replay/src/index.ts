import { z } from "zod";
import {
  CommandInputSchema,
  ScenarioSchema,
  WorldSchema,
  SimulationVersionSchema,
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
  simulationVersion: SimulationVersionSchema,
  scenarioVersion: z.string(),
});
export type ReplayCheckpoint = z.infer<typeof CheckpointSchema>;
export const AlternativeCommandsSchema = z
  .array(
    z
      .object({
        tick: z.number().int().nonnegative().max(14400),
        input: CommandInputSchema,
      })
      .strict(),
  )
  .max(5000);
export type AlternativeCommands = z.infer<typeof AlternativeCommandsSchema>;
export const BranchLineageSchema = z
  .object({
    branchId: z.string(),
    parentReplayId: z.string(),
    parentHash: z.string().regex(/^[0-9a-f]{16}$/),
    forkTick: z.number().int().nonnegative(),
    baseHash: z.string().regex(/^[0-9a-f]{16}$/),
    simulationVersion: SimulationVersionSchema,
    scenarioVersion: z.string(),
    requestedEndTick: z.number().int().nonnegative().max(14400),
    alternativeCommands: AlternativeCommandsSchema,
    unappliedCommands: AlternativeCommandsSchema,
  })
  .strict();
export const ReplaySchema = z.object({
  formatVersion: z.union([z.literal(1), z.literal(2)]),
  simulationVersion: SimulationVersionSchema,
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
  lineage: BranchLineageSchema.optional(),
});
export type ReplayRecord = z.infer<typeof ReplaySchema>;
export interface ReplayBranch {
  simulation: Simulation;
  record: ReplayRecord;
  lineage: z.infer<typeof BranchLineageSchema>;
  restoredTick: number;
  forwardToForkTicks: number;
}
export class ReplayRecorder {
  record: ReplayRecord;
  constructor(sim: Simulation) {
    const initialHash = sim.hash();
    this.record = {
      formatVersion: 2,
      simulationVersion: sim.state.version,
      scenarioId: sim.scenario.id,
      scenarioVersion: sim.scenario.version,
      seed: sim.state.seed,
      endTick: sim.state.tick,
      commands: [],
      hashes: [{ tick: 0, hash: initialHash }],
      checkpoints: [captureCheckpoint(sim, 0, initialHash)],
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
      const boundaryHash = sim.hash();
      this.record.hashes.push({ tick: sim.state.tick, hash: boundaryHash });
      this.record.checkpoints ??= [];
      this.record.checkpoints.push(
        captureCheckpoint(sim, this.record.commands.length, boundaryHash),
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
      checkpoint.snapshot.version !== record.simulationVersion ||
      checkpoint.simulationVersion !== record.simulationVersion ||
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
  if (record.lineage) {
    const lineage = record.lineage;
    const plannedCommands = [
      ...record.commands.filter((c) => c.tick >= lineage.forkTick),
      ...lineage.unappliedCommands,
    ];
    if (
      hash(lineage.alternativeCommands) !== hash(plannedCommands) ||
      lineage.simulationVersion !== record.simulationVersion ||
      lineage.scenarioVersion !== record.scenarioVersion ||
      lineage.forkTick > record.endTick ||
      lineage.requestedEndTick < record.endTick ||
      lineage.requestedEndTick > scenario.maxTicks ||
      record.checkpoints?.find((c) => c.tick === lineage.forkTick)
        ?.canonicalHash !== lineage.baseHash ||
      lineage.unappliedCommands.some(
        (c) => c.tick < record.endTick || c.tick > lineage.requestedEndTick,
      )
    )
      throw new Error("Branch lineage integrity failure");
    const alternatives = [
      ...record.commands.filter((c) => c.tick >= lineage.forkTick),
      ...lineage.unappliedCommands,
    ];
    if (
      lineage.branchId !==
      branchId(
        lineage.parentReplayId,
        lineage.parentHash,
        lineage.forkTick,
        lineage.baseHash,
        alternatives,
      )
    )
      throw new Error("Branch identity integrity failure");
  }
  return record;
}
export function replay(
  scenario: Scenario,
  input: unknown,
  targetTick?: number,
): Simulation {
  return verifyReplay(scenario, input, targetTick).simulation;
}
export function verifyReplay(
  scenario: Scenario,
  input: unknown,
  targetTick?: number,
): { record: ReplayRecord; simulation: Simulation } {
  const record = validateReplay(input, scenario);
  return {
    record,
    simulation: simulateValidated(
      scenario,
      record,
      targetTick ?? record.endTick,
    ),
  };
}
function simulateValidated(
  scenario: Scenario,
  record: ReplayRecord,
  target: number,
): Simulation {
  if (!Number.isInteger(target) || target < 0 || target > record.endTick)
    throw new Error("重播時間超出範圍");
  const sim = new Simulation(
    scenario,
    record.seed,
    undefined,
    record.simulationVersion,
  );
  let cursor = 0;
  const checks = new Map(record.hashes.map((h) => [h.tick, h.hash]));
  while (sim.state.tick <= target) {
    const expected = checks.get(sim.state.tick);
    if (expected && expected !== sim.hash())
      throw new Error(`DETERMINISM REGRESSION at tick ${sim.state.tick}`);
    // validateReplay already hashed every snapshot and matched its hash to this index.
    // Independently simulating this boundary validates the checkpoint without hashing it again.
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
  canonicalHash: string,
): ReplayCheckpoint {
  return {
    tick: sim.state.tick,
    snapshot: sim.snapshot(),
    eventCursor: sim.state.events.length,
    commandCursor,
    canonicalHash,
    simulationVersion: sim.state.version,
    scenarioVersion: sim.scenario.version,
  };
}

/** Owns a fully verified immutable timeline; seek never trusts caller-mutated snapshots. */
export class VerifiedTimeline {
  readonly #record: ReplayRecord;
  readonly #scenario: Scenario;
  readonly finalHash: string;
  readonly replayId: string;
  constructor(scenario: Scenario, input: unknown) {
    this.#scenario = ScenarioSchema.parse(scenario);
    // Full Zod parsing creates owned copies of every record/snapshot field.
    this.#record = validateReplay(input, this.#scenario);
    this.finalHash = simulateValidated(
      this.#scenario,
      this.#record,
      this.#record.endTick,
    ).hash();
    this.replayId =
      this.#record.lineage?.branchId ??
      `RPL-${hash({ simulationVersion: this.#record.simulationVersion, scenario: this.#scenario, seed: this.#record.seed, endTick: this.#record.endTick, commands: this.#record.commands, hashes: this.#record.hashes })}`;
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
    return this.restoreMeasured(target, true);
  }
  private restoreMeasured(
    target: number,
    applyAtTarget: boolean,
  ): {
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
      : new Simulation(
          this.#scenario,
          this.#record.seed,
          undefined,
          this.#record.simulationVersion,
        );
    const restoreMs = performance.now() - start,
      restoredTick = sim.state.tick;
    let cursor = checkpoint?.commandCursor ?? 0;
    const checks = new Map(this.#record.hashes.map((h) => [h.tick, h.hash]));
    while (sim.state.tick <= target) {
      const expected = checks.get(sim.state.tick);
      if (expected && expected !== sim.hash())
        throw new Error(`DETERMINISM REGRESSION at tick ${sim.state.tick}`);
      while (
        (sim.state.tick < target || applyAtTarget) &&
        this.#record.commands[cursor]?.tick === sim.state.tick
      )
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
  fork(forkTick: number, input: unknown): ReplayBranch {
    const alternatives = AlternativeCommandsSchema.parse(input);
    if (
      alternatives.some(
        (c, i) =>
          c.tick < forkTick ||
          c.tick > this.#record.endTick ||
          (i > 0 && c.tick < alternatives[i - 1].tick),
      )
    )
      throw new Error(
        "Alternative command timeline outside fork horizon or unordered",
      );
    const restored = this.restoreMeasured(forkTick, false),
      sim = restored.simulation;
    if (sim.state.completed && alternatives.length)
      throw new Error(
        "Cannot issue alternative commands after scenario completion",
      );
    const baseHash = sim.hash(),
      lineage: z.infer<typeof BranchLineageSchema> = {
        branchId: branchId(
          this.replayId,
          this.finalHash,
          forkTick,
          baseHash,
          alternatives,
        ),
        parentReplayId: this.replayId,
        parentHash: this.finalHash,
        forkTick,
        baseHash,
        simulationVersion: this.#record.simulationVersion,
        scenarioVersion: this.#record.scenarioVersion,
        requestedEndTick: this.#record.endTick,
        alternativeCommands: structuredClone(alternatives),
        unappliedCommands: [],
      };
    const record: ReplayRecord = {
      formatVersion: 2,
      simulationVersion: this.#record.simulationVersion,
      scenarioId: this.#record.scenarioId,
      scenarioVersion: this.#record.scenarioVersion,
      seed: this.#record.seed,
      endTick: forkTick,
      commands: structuredClone(
        this.#record.commands.filter((c) => c.tick < forkTick),
      ),
      hashes: structuredClone(
        this.#record.hashes.filter((h) => h.tick <= forkTick),
      ),
      checkpoints: structuredClone(
        this.#record.checkpoints?.filter((c) => c.tick <= forkTick) ?? [],
      ),
      lineage,
    };
    // Insert a complete pre-command checkpoint at the exact fork, even between periodic boundaries.
    if (!record.hashes.some((h) => h.tick === forkTick))
      record.hashes.push({ tick: forkTick, hash: baseHash });
    if (!record.checkpoints!.some((c) => c.tick === forkTick))
      record.checkpoints!.push(
        captureCheckpoint(sim, record.commands.length, baseHash),
      );
    const recorder = new ReplayRecorder(
      new Simulation(
        this.#scenario,
        this.#record.seed,
        undefined,
        this.#record.simulationVersion,
      ),
    );
    recorder.record = record;
    let cursor = 0,
      guard = 0;
    while (true) {
      while (
        alternatives[cursor]?.tick === sim.state.tick &&
        !sim.state.completed
      )
        recorder.command(sim, alternatives[cursor++].input);
      recorder.record.endTick = sim.state.tick;
      if (sim.state.completed || sim.state.tick >= this.#record.endTick) break;
      if (++guard > this.#scenario.maxTicks + 1)
        throw new Error("Branch no-hang guard");
      sim.step();
      recorder.checkpoint(sim);
    }
    lineage.unappliedCommands = structuredClone(alternatives.slice(cursor));
    return {
      simulation: sim,
      record: recorder.record,
      lineage: structuredClone(lineage),
      restoredTick: restored.restoredTick,
      forwardToForkTicks: restored.forwardTicks,
    };
  }
}
function branchId(
  parentReplayId: string,
  parentHash: string,
  forkTick: number,
  baseHash: string,
  alternatives: AlternativeCommands,
): string {
  return `BR-${hash({ parentReplayId, parentHash, forkTick, baseHash, alternatives })}`;
}
