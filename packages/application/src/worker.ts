import { Session } from "./session";
import type { CommandInput } from "../../domain/src/index";
import { earthquakeSystemic } from "../../scenarios/src/earthquake-systemic";
import { flood } from "../../scenarios/src/flood";
interface Request {
  id: number;
  action: string;
  seed?: string;
  count?: number;
  input?: CommandInput;
  bytes?: Uint8Array;
  tick?: number;
  scenarioId?: string;
  alternatives?: unknown;
  branchId?: string;
}
let session: Session | undefined;
self.onmessage = (event: MessageEvent<Request>) => {
  const r = event.data;
  try {
    if (r.action === "start") {
      if (r.scenarioId !== "earthquake" && r.scenarioId !== "flood")
        throw new Error("未知場景");
      session = new Session(
        r.seed!,
        r.scenarioId === "flood" ? flood : earthquakeSystemic,
      );
    }
    if (!session) throw new Error("尚未開始情境");
    const result =
      r.action === "step"
        ? session.step(r.count!)
        : r.action === "command"
          ? session.command(r.input!)
          : r.action === "save"
            ? session.exportSave()
            : r.action === "load"
              ? session.importSave(r.bytes!)
              : r.action === "seek"
                ? session.seek(r.tick!)
                : r.action === "aar"
                  ? session.returnToAAR()
                  : r.action === "fork"
                    ? session.fork(r.tick!, r.alternatives)
                    : r.action === "saveBranch"
                      ? session.exportBranch(r.branchId!)
                      : session.update();
    self.postMessage({ id: r.id, result });
  } catch (error) {
    self.postMessage({
      id: r.id,
      error: error instanceof Error ? error.message : "系統錯誤",
    });
  }
};
