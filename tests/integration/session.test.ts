import { it, expect } from "vitest";
import { Session } from "../../packages/application/src/session";
it("session exposes only received views, verifies replay and preserves live save", () => {
  const session = new Session("session");
  session.step(90);
  session.command({
    type: "DISPATCH_UNIT",
    target: "ENG-01",
    incidentId: "INC-1",
  });
  const bytes = session.exportSave();
  const restored = new Session("other");
  expect(restored.importSave(bytes).view.tick).toBe(90);
  const final = session.step(1800);
  expect(final.aar).toBeDefined();
  const replay = session.seek(100);
  expect(replay.replayVerified).toBe(true);
  expect(replay.mode).toBe("REPLAY");
  expect(() =>
    session.command({ type: "REQUEST_STATUS", target: "H-B" }),
  ).toThrow();
  expect(session.step(1800).aar?.finalHash).toBe(final.aar?.finalHash);
});
