import { it, expect } from "vitest";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { Simulation } from "../../packages/simulation/src/index";
import { ReplayRecorder } from "../../packages/replay/src/index";
import { earthquake } from "../../packages/scenarios/src/earthquake";
import { save, load } from "../../packages/persistence/src/index";
it("save/load resumes RNG and pending transmissions exactly", () => {
  const s = new Simulation(earthquake, "save"),
    r = new ReplayRecorder(s);
  for (let n = 0; n < 450; n++) {
    if (n === 400) r.command(s, { type: "REQUEST_STATUS", target: "H-B" });
    s.step();
    r.checkpoint(s);
  }
  const restored = load(save(s, r.record));
  expect(restored.simulation.hash()).toBe(s.hash());
  s.step(1000);
  restored.simulation.step(1000);
  expect(restored.simulation.hash()).toBe(s.hash());
});
it("corrupt container, incompatible version, edited event log are rejected", () => {
  const s = new Simulation(earthquake, "broken"),
    r = new ReplayRecorder(s);
  s.step(30);
  r.checkpoint(s);
  const original = save(s, r.record);
  expect(() => load(new Uint8Array([1, 2]))).toThrow("無法讀取");
  const files = unzipSync(original),
    manifest = JSON.parse(strFromU8(files["manifest.json"])) as Record<
      string,
      unknown
    >;
  manifest.saveFormatVersion = 999;
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  expect(() => load(zipSync(files))).toThrow();
  const altered = unzipSync(original);
  altered["events.ndjson"] = strToU8("[]");
  expect(() => load(zipSync(altered))).toThrow("校驗失敗");
});
