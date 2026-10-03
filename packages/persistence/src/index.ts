import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { z } from "zod";
import {
  SIM_VERSION,
  SimulationVersionSchema,
  ScenarioSchema,
  WorldSchema,
  type Scenario,
} from "../../domain/src/index";
import { hash } from "../../shared/src/index";
import {
  ReplaySchema,
  verifyReplay,
  validateReplay,
  type ReplayRecord,
} from "../../replay/src/index";
import { Simulation } from "../../simulation/src/index";
import { load as loadLegacy } from "../../legacy-v1/vendor/packages/persistence/src/index";
import {
  migrations,
  SavePayloadSchema,
  MigrationMetadataSchema,
  type MigrationMetadata,
} from "./migrations";
export { SaveMigrationRegistry } from "./migrations";
export type { SaveMigration, MigrationMetadata } from "./migrations";
const ManifestSchema = z.object({
  saveFormatVersion: z.literal(2),
  simulationVersion: SimulationVersionSchema,
  scenarioVersion: z.string(),
  simulationBuild: z.literal(SIM_VERSION),
  snapshotHash: z.string(),
  eventHash: z.string(),
  replay: ReplaySchema,
  contentManifest: z.record(z.string(), z.string()),
  migrations: z.array(MigrationMetadataSchema),
});
const ndjson = (items: unknown[]) =>
  items.map((item) => JSON.stringify(item)).join("\n");
const parseLines = (text: string): unknown[] =>
  text.trim()
    ? text
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as unknown)
    : [];
const checkpointIndex = (record: ReplayRecord) =>
  (record.checkpoints ?? []).map((c) => ({
    tick: c.tick,
    canonicalHash: c.canonicalHash,
    eventCursor: c.eventCursor,
    commandCursor: c.commandCursor,
  }));
export function save(
  sim: Simulation,
  record: ReplayRecord,
  history: MigrationMetadata[] = [],
): Uint8Array {
  const state = sim.snapshot();
  validateReplay(record, sim.scenario);
  if (
    record.endTick !== state.tick ||
    record.simulationVersion !== state.version
  )
    throw new Error("Save/replay version or tick mismatch");
  const files: Record<string, Uint8Array> = {
    "scenario.json": strToU8(JSON.stringify(sim.scenario)),
    "snapshot.json": strToU8(JSON.stringify(state)),
    "commands.ndjson": strToU8(ndjson(state.commands)),
    "events.ndjson": strToU8(ndjson(state.events)),
    "checkpoints.json": strToU8(JSON.stringify(checkpointIndex(record))),
  };
  const manifest = ManifestSchema.parse({
    saveFormatVersion: 2,
    simulationVersion: state.version,
    scenarioVersion: sim.scenario.version,
    simulationBuild: SIM_VERSION,
    snapshotHash: hash(state),
    eventHash: hash(state.events),
    replay: record,
    contentManifest: Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [
        name,
        hash(strFromU8(bytes)),
      ]),
    ),
    migrations: history,
  });
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  return zipSync(files, { level: 6 });
}
export function load(bytes: Uint8Array): {
  simulation: Simulation;
  replay: ReplayRecord;
  scenario: Scenario;
  migrations: MigrationMetadata[];
} {
  try {
    if (bytes.length > 20_000_000 || bytes.length < 20)
      throw new Error("檔案大小不合法");
    let total = 0;
    const files = unzipSync(bytes, {
      filter: (entry) => {
        total += entry.originalSize;
        if (entry.originalSize > 20_000_000 || total > 50_000_000)
          throw new Error("解壓縮大小超出限制");
        return [
          "manifest.json",
          "scenario.json",
          "snapshot.json",
          "commands.ndjson",
          "events.ndjson",
          "checkpoints.json",
        ].includes(entry.name);
      },
    });
    const text = (name: string) => {
      if (!files[name]) throw new Error(`缺少 ${name}`);
      return strFromU8(files[name]);
    };
    const header = z
      .object({ saveFormatVersion: z.number().int() })
      .parse(JSON.parse(text("manifest.json")));
    if (header.saveFormatVersion > 2) throw new Error("未知的未來存檔版本");
    if (header.saveFormatVersion === 1) {
      const legacy = loadLegacy(bytes),
        payload = SavePayloadSchema.parse(
          migrations.migrate(
            {
              saveFormatVersion: 1,
              scenario: legacy.scenario,
              snapshot: legacy.simulation.snapshot(),
              replay: legacy.replay,
            },
            1,
            2,
          ),
        );
      return {
        simulation: new Simulation(
          payload.scenario,
          payload.snapshot.seed,
          payload.snapshot,
        ),
        replay: payload.replay,
        scenario: payload.scenario,
        migrations: payload.migrations,
      };
    }
    if (header.saveFormatVersion !== 2) throw new Error("不支援的存檔版本");
    const manifest = ManifestSchema.parse(JSON.parse(text("manifest.json"))),
      scenario = ScenarioSchema.parse(JSON.parse(text("scenario.json"))),
      state = WorldSchema.parse(JSON.parse(text("snapshot.json")));
    for (const name of [
      "scenario.json",
      "snapshot.json",
      "commands.ndjson",
      "events.ndjson",
      "checkpoints.json",
    ]) {
      if (manifest.contentManifest[name] !== hash(text(name)))
        throw new Error(`存檔校驗失敗：${name}`);
    }
    if (
      manifest.simulationVersion !== state.version ||
      manifest.scenarioVersion !== scenario.version ||
      manifest.snapshotHash !== hash(state) ||
      manifest.eventHash !== hash(state.events) ||
      hash(parseLines(text("commands.ndjson"))) !== hash(state.commands) ||
      hash(parseLines(text("events.ndjson"))) !== hash(state.events)
    )
      throw new Error("存檔校驗失敗");
    const verified = verifyReplay(scenario, manifest.replay),
      record = verified.record;
    if (
      record.simulationVersion !== state.version ||
      record.endTick !== state.tick ||
      hash(JSON.parse(text("checkpoints.json"))) !==
        hash(checkpointIndex(record)) ||
      verified.simulation.hash() !== hash(state)
    )
      throw new Error("存檔與重播不一致");
    return {
      simulation: new Simulation(scenario, state.seed, state),
      replay: record,
      scenario,
      migrations: manifest.migrations,
    };
  } catch (error) {
    throw new Error(
      `無法讀取 AEGIS 存檔：${error instanceof Error ? error.message : "格式損壞"}`,
    );
  }
}
