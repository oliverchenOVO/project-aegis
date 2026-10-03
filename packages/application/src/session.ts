import type {
  CommandInput,
  CommandCenterView,
  AAR,
} from "../../domain/src/index";
import { Simulation } from "../../simulation/src/index";
import { earthquake } from "../../scenarios/src/earthquake";
import { ReplayRecorder, replay } from "../../replay/src/index";
import { save, load } from "../../persistence/src/index";
export interface SessionUpdate {
  view: CommandCenterView;
  mode: "LIVE" | "REPLAY";
  replayEnd: number;
  replayVerified: boolean;
  aar?: AAR;
}
export class Session {
  #sim: Simulation;
  #recorder: ReplayRecorder;
  #original?: Simulation;
  #mode: "LIVE" | "REPLAY" = "LIVE";
  #cursor = 0;
  #verified = false;
  constructor(seed: string) {
    this.#sim = new Simulation(earthquake, seed);
    this.#recorder = new ReplayRecorder(this.#sim);
  }
  update(): SessionUpdate {
    return {
      view: this.#sim.view(),
      mode: this.#mode,
      replayEnd: this.#recorder.record.endTick,
      replayVerified: this.#verified,
      aar: this.#sim.state.completed ? this.#sim.aar() : undefined,
    };
  }
  command(input: CommandInput): SessionUpdate {
    if (this.#mode !== "LIVE") throw new Error("重播中不能發布指令");
    this.#recorder.command(this.#sim, input);
    this.#recorder.record.endTick = this.#sim.state.tick;
    return this.update();
  }
  step(count: number): SessionUpdate {
    if (!Number.isInteger(count) || count < 0 || count > 1800)
      throw new Error("Step limit exceeded");
    for (let i = 0; i < count; i++) {
      if (
        this.#sim.state.completed ||
        (this.#mode === "REPLAY" &&
          this.#sim.state.tick >= this.#recorder.record.endTick)
      )
        break;
      this.#sim.step();
      if (this.#mode === "LIVE") this.#recorder.checkpoint(this.#sim);
      else {
        const expected = this.#recorder.record.hashes.find(
          (h) => h.tick === this.#sim.state.tick,
        );
        if (expected && expected.hash !== this.#sim.hash())
          throw new Error(
            `DETERMINISM REGRESSION at tick ${this.#sim.state.tick}`,
          );
        while (
          this.#recorder.record.commands[this.#cursor]?.tick ===
          this.#sim.state.tick
        ) {
          this.#sim.issue(this.#recorder.record.commands[this.#cursor].input);
          this.#cursor++;
        }
      }
    }
    return this.update();
  }
  exportSave(): Uint8Array {
    return save(this.#original ?? this.#sim, this.#recorder.record);
  }
  importSave(bytes: Uint8Array): SessionUpdate {
    const loaded = load(bytes);
    this.#sim = loaded.simulation;
    this.#recorder = new ReplayRecorder(this.#sim);
    this.#recorder.record = loaded.replay;
    this.#original = undefined;
    this.#mode = "LIVE";
    this.#verified = false;
    return this.update();
  }
  seek(tick: number): SessionUpdate {
    if (this.#mode === "LIVE" && !this.#sim.state.completed)
      throw new Error("請先完成情境");
    if (this.#mode === "LIVE") {
      const verified = replay(this.#sim.scenario, this.#recorder.record);
      if (verified.hash() !== this.#sim.hash())
        throw new Error("Replay final hash mismatch");
      this.#verified = true;
      this.#original = this.#sim;
    }
    this.#sim = replay(this.#sim.scenario, this.#recorder.record, tick);
    this.#mode = "REPLAY";
    this.#cursor = this.#recorder.record.commands.findIndex(
      (c) => c.tick > tick,
    );
    if (this.#cursor < 0) this.#cursor = this.#recorder.record.commands.length;
    return this.update();
  }
  returnToAAR(): SessionUpdate {
    if (this.#original) {
      this.#sim = this.#original;
      this.#original = undefined;
      this.#mode = "LIVE";
    }
    return this.update();
  }
}
