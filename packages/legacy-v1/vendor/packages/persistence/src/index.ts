import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { z } from "zod";
import {
  SIM_VERSION,
  ScenarioSchema,
  WorldSchema,
  type Scenario,
} from "../../domain/src/index";
import { hash } from "../../shared/src/index";
import {
  ReplaySchema,
  replay,
  validateReplay,
  type ReplayRecord,
} from "../../replay/src/index";
import { Simulation } from "../../simulation/src/index";
const ManifestSchema = z.object({
  saveFormatVersion: z.literal(1),
  simulationVersion: z.literal(SIM_VERSION),
  scenarioVersion: z.string(),
  snapshotHash: z.string(),
  eventHash: z.string(),
  replay: ReplaySchema,
});
const ndjson = (items: unknown[]) =>
  items.map((item) => JSON.stringify(item)).join("\n");
const parseLines = (value: string): unknown[] =>
  value.trim()
    ? value
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as unknown)
    : [];
export function save(sim: Simulation, record: ReplayRecord): Uint8Array {
  const state = sim.snapshot();
  validateReplay(record, sim.scenario);
  const manifest = {
    saveFormatVersion: 1,
    simulationVersion: SIM_VERSION,
    scenarioVersion: sim.scenario.version,
    snapshotHash: hash(state),
    eventHash: hash(state.events),
    replay: record,
  };
  return zipSync(
    {
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "scenario.json": strToU8(JSON.stringify(sim.scenario)),
      "snapshot.json": strToU8(JSON.stringify(state)),
      "commands.ndjson": strToU8(ndjson(state.commands)),
      "events.ndjson": strToU8(ndjson(state.events)),
    },
    { level: 6 },
  );
}
export function load(bytes: Uint8Array): {
  simulation: Simulation;
  replay: ReplayRecord;
  scenario: Scenario;
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
        ].includes(entry.name);
      },
    });
    const text = (name: string) => {
      if (!files[name]) throw new Error(`缺少 ${name}`);
      return strFromU8(files[name]);
    };
    const manifest = ManifestSchema.parse(JSON.parse(text("manifest.json"))),
      scenario = ScenarioSchema.parse(JSON.parse(text("scenario.json"))),
      state = WorldSchema.parse(JSON.parse(text("snapshot.json")));
    if (
      manifest.scenarioVersion !== scenario.version ||
      manifest.snapshotHash !== hash(state) ||
      manifest.eventHash !== hash(state.events) ||
      hash(parseLines(text("commands.ndjson"))) !== hash(state.commands) ||
      hash(parseLines(text("events.ndjson"))) !== hash(state.events)
    )
      throw new Error("存檔校驗失敗");
    const record = validateReplay(manifest.replay, scenario);
    if (
      record.endTick !== state.tick ||
      replay(scenario, record).hash() !== hash(state)
    )
      throw new Error("存檔與重播不一致");
    return {
      simulation: new Simulation(scenario, state.seed, state),
      replay: record,
      scenario,
    };
  } catch (error) {
    throw new Error(
      `無法讀取 AEGIS 存檔：${error instanceof Error ? error.message : "格式損壞"}`,
    );
  }
}
