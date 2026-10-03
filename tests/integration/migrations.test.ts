import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
import { z } from "zod";
import {
  load,
  save,
  SaveMigrationRegistry,
} from "../../packages/persistence/src/index";
import { Simulation as LegacySimulation } from "../../packages/legacy-v1/vendor/packages/simulation/src/index";
import { load as loadLegacy } from "../../packages/legacy-v1/vendor/packages/persistence/src/index";
import { Session } from "../../packages/application/src/session";
import {
  ReplayRecorder,
  replay,
  VerifiedTimeline,
} from "../../packages/replay/src/index";
import manifest from "../fixtures/legacy/manifest.json";
it.each(manifest.fixtures)(
  "v1 fixture migration is pure, deterministic, resumable and portable: $name",
  (fixture) => {
    const bytes = readFileSync(fixture.name),
      first = load(bytes),
      second = load(bytes),
      legacy = loadLegacy(bytes);
    expect(first.simulation.hash()).toBe(fixture.stateHash);
    expect(first.replay).toEqual(second.replay);
    expect(first.migrations).toEqual(second.migrations);
    const reference = new LegacySimulation(
        legacy.scenario,
        legacy.simulation.state.seed,
        legacy.simulation.snapshot(),
      ),
      recorder = new ReplayRecorder(first.simulation);
    recorder.record = first.replay;
    for (let n = 0; n < 180; n++) {
      first.simulation.step();
      recorder.checkpoint(first.simulation);
      reference.step();
    }
    expect(first.simulation.hash()).toBe(reference.hash());
    const v2 = save(first.simulation, recorder.record, first.migrations),
      header = JSON.parse(strFromU8(unzipSync(v2)["manifest.json"])) as {
        saveFormatVersion: number;
        simulationVersion: string;
      };
    expect(header.saveFormatVersion).toBe(2);
    expect(header.simulationVersion).toBe("0.1.0");
    const restarted = load(v2);
    expect(restarted.simulation.hash()).toBe(reference.hash());
    expect(restarted.migrations).toEqual(first.migrations);
    expect(replay(restarted.scenario, restarted.replay).hash()).toBe(
      reference.hash(),
    );
    expect(
      new VerifiedTimeline(restarted.scenario, restarted.replay)
        .seek(restarted.replay.endTick)
        .hash(),
    ).toBe(reference.hash());
  },
);
it("future versions and corrupt migrations fail atomically without replacing live session", () => {
  const session = new Session("migration-atomic");
  session.step(120);
  const before = session.update();
  const files = unzipSync(readFileSync(manifest.fixtures[0].name));
  const header = JSON.parse(strFromU8(files["manifest.json"])) as Record<
    string,
    unknown
  >;
  header.saveFormatVersion = 999;
  files["manifest.json"] = strToU8(JSON.stringify(header));
  expect(() => session.importSave(zipSync(files))).toThrow(
    "未知的未來存檔版本",
  );
  expect(session.update()).toEqual(before);
  const corrupt = unzipSync(readFileSync(manifest.fixtures[1].name));
  corrupt["events.ndjson"] = strToU8("[]");
  expect(() => session.importSave(zipSync(corrupt))).toThrow();
  expect(session.update()).toEqual(before);
});
it("migration registry validates both sides and never mutates its input", () => {
  const registry = new SaveMigrationRegistry().register({
    fromVersion: 1,
    toVersion: 2,
    inputSchema: z.object({ count: z.number().int().nonnegative() }),
    outputSchema: z.object({ count: z.number().int().positive() }),
    migrate: (data) => ({ count: (data as { count: number }).count + 1 }),
  });
  const input = { count: 4 };
  expect(registry.migrate(input, 1, 2)).toEqual({ count: 5 });
  expect(input).toEqual({ count: 4 });
  expect(() => registry.migrate({ count: -1 }, 1, 2)).toThrow();
  const broken = new SaveMigrationRegistry().register({
    fromVersion: 1,
    toVersion: 2,
    inputSchema: z.unknown(),
    outputSchema: z.object({ valid: z.literal(true) }),
    migrate: () => ({ valid: false }),
  });
  expect(() => broken.migrate({}, 1, 2)).toThrow();
  expect(() => registry.migrate({}, 3, 2)).toThrow("未來");
});
it("Session continues migrated save, exports V2, closes/recreates and verifies replay", () => {
  const session = new Session("migration-session");
  session.importSave(readFileSync(manifest.fixtures[1].name));
  session.step(180);
  const expected = session.update();
  const exported = session.exportSave();
  const reopened = new Session("fresh-process-state");
  reopened.importSave(exported);
  expect(reopened.update()).toEqual(expected);
  reopened.step(1800);
  expect(reopened.update().view.completed).toBe(true);
  expect(reopened.seek(300).replayVerified).toBe(true);
});
