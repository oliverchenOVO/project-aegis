import { z } from "zod";
import { ScenarioSchema, WorldSchema } from "../../domain/src/index";
import { ReplaySchema, ReplayRecorder } from "../../replay/src/index";
import { Simulation } from "../../simulation/src/index";
import { hash } from "../../shared/src/index";
import {
  ScenarioSchema as LegacyScenarioSchema,
  WorldSchema as LegacyWorldSchema,
} from "../../legacy-v1/vendor/packages/domain/src/index";
import { ReplaySchema as LegacyReplaySchema } from "../../legacy-v1/vendor/packages/replay/src/index";
export interface SaveMigration {
  fromVersion: number;
  toVersion: number;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  migrate(data: unknown): unknown;
}
export class SaveMigrationRegistry {
  #steps = new Map<number, SaveMigration>();
  register(migration: SaveMigration): this {
    if (
      migration.toVersion <= migration.fromVersion ||
      this.#steps.has(migration.fromVersion)
    )
      throw new Error("Invalid migration registration");
    this.#steps.set(migration.fromVersion, migration);
    return this;
  }
  migrate(data: unknown, fromVersion: number, toVersion: number): unknown {
    if (fromVersion > toVersion) throw new Error("未知的未來存檔版本");
    let result = structuredClone(data),
      version = fromVersion,
      guard = 0;
    while (version < toVersion) {
      const step = this.#steps.get(version);
      if (!step || step.toVersion > toVersion || guard++ > 16)
        throw new Error(`Missing migration from ${version}`);
      const input = step.inputSchema.parse(result);
      result = step.outputSchema.parse(step.migrate(input));
      version = step.toVersion;
    }
    return result;
  }
}
export const MigrationMetadataSchema = z.object({
  fromVersion: z.number().int(),
  toVersion: z.number().int(),
  originalSnapshotHash: z.string(),
});
export type MigrationMetadata = z.infer<typeof MigrationMetadataSchema>;
const LegacyPayloadSchema = z.object({
  saveFormatVersion: z.literal(1),
  scenario: LegacyScenarioSchema,
  snapshot: LegacyWorldSchema,
  replay: LegacyReplaySchema,
});
export const SavePayloadSchema = z.object({
  saveFormatVersion: z.literal(2),
  scenario: ScenarioSchema,
  snapshot: WorldSchema,
  replay: ReplaySchema,
  migrations: z.array(MigrationMetadataSchema),
});
export const migrations = new SaveMigrationRegistry().register({
  fromVersion: 1,
  toVersion: 2,
  inputSchema: LegacyPayloadSchema,
  outputSchema: SavePayloadSchema,
  migrate(data) {
    const source = LegacyPayloadSchema.parse(data),
      sim = new Simulation(
        source.scenario,
        source.snapshot.seed,
        undefined,
        "0.1.0",
      ),
      recorder = new ReplayRecorder(sim);
    let cursor = 0;
    while (true) {
      while (source.replay.commands[cursor]?.tick === sim.state.tick)
        recorder.command(sim, source.replay.commands[cursor++].input);
      if (sim.state.tick === source.replay.endTick) break;
      if (sim.state.completed)
        throw new Error("Legacy replay ended before migration target");
      sim.step();
      recorder.checkpoint(sim);
    }
    recorder.record.endTick = sim.state.tick;
    if (sim.hash() !== hash(source.snapshot))
      throw new Error("Legacy migration state mismatch");
    return {
      saveFormatVersion: 2,
      scenario: source.scenario,
      snapshot: source.snapshot,
      replay: recorder.record,
      migrations: [
        {
          fromVersion: 1,
          toVersion: 2,
          originalSnapshotHash: hash(source.snapshot),
        },
      ],
    };
  },
});
