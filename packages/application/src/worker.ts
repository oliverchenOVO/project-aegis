import { Session } from "./session";
import type { CommandInput } from "../../domain/src/index";
interface Request {
  id: number;
  action: string;
  seed?: string;
  count?: number;
  input?: CommandInput;
  bytes?: Uint8Array;
  tick?: number;
}
let session: Session | undefined;
self.onmessage = (event: MessageEvent<Request>) => {
  const r = event.data;
  try {
    if (r.action === "start") session = new Session(r.seed!);
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
                  : session.update();
    self.postMessage({ id: r.id, result });
  } catch (error) {
    self.postMessage({
      id: r.id,
      error: error instanceof Error ? error.message : "系統錯誤",
    });
  }
};
