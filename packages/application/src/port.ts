import type { CommandInput } from "../../domain/src/index";
import type { SessionUpdate } from "./session";
export type { SessionUpdate } from "./session";
export class CommandPort {
  private worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  private serial = 0;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  constructor() {
    this.worker.onmessage = (
      e: MessageEvent<{ id: number; result?: unknown; error?: string }>,
    ) => {
      const pending = this.pending.get(e.data.id);
      if (!pending) return;
      this.pending.delete(e.data.id);
      if (e.data.error) pending.reject(new Error(e.data.error));
      else pending.resolve(e.data.result);
    };
    this.worker.onerror = () => {
      for (const p of this.pending.values())
        p.reject(new Error("模擬工作執行緒失敗，請重新開啟情境"));
      this.pending.clear();
    };
  }
  private request<T>(
    action: string,
    values: Record<string, unknown> = {},
  ): Promise<T> {
    const id = ++this.serial;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
      this.worker.postMessage({ id, action, ...values });
    });
  }
  start(seed: string) {
    return this.request<SessionUpdate>("start", { seed });
  }
  step(count: number) {
    return this.request<SessionUpdate>("step", { count });
  }
  command(input: CommandInput) {
    return this.request<SessionUpdate>("command", { input });
  }
  save() {
    return this.request<Uint8Array>("save");
  }
  load(bytes: Uint8Array) {
    return this.request<SessionUpdate>("load", { bytes });
  }
  seek(tick: number) {
    return this.request<SessionUpdate>("seek", { tick });
  }
  aar() {
    return this.request<SessionUpdate>("aar");
  }
}
