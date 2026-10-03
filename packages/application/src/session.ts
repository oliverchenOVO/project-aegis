import type {
  CommandInput,
  CommandCenterView,
  AAR,
  Scenario,
} from "../../domain/src/index";
import { Simulation } from "../../simulation/src/index";
import { earthquake } from "../../scenarios/src/earthquake";
import {
  ReplayRecorder,
  VerifiedTimeline,
  type ReplayBranch,
  type AlternativeCommands,
} from "../../replay/src/index";
import { save, load } from "../../persistence/src/index";
import type { MigrationMetadata } from "../../persistence/src/index";
import {
  compareBranch,
  type BranchComparison,
} from "../../counterfactual/src/index";
export interface SessionUpdate {
  migrations: MigrationMetadata[];
  scenario: {
    id: string;
    name: string;
    version: string;
    simulationVersion: string;
    hazardKind: string;
  };
  replaySummary?: {
    checkpoints: number[];
    commands: AlternativeCommands;
    events: { id: string; tick: number; type: string }[];
  };
  view: CommandCenterView;
  mode: "LIVE" | "REPLAY";
  replayEnd: number;
  replayVerified: boolean;
  aar?: AAR;
  counterfactual?: BranchComparison;
}
export class Session {
  #sim: Simulation;
  #recorder: ReplayRecorder;
  #original?: Simulation;
  #mode: "LIVE" | "REPLAY" = "LIVE";
  #cursor = 0;
  #verified = false;
  #timeline?: VerifiedTimeline;
  #migrations: MigrationMetadata[] = [];
  #branches = new Map<
    string,
    { branch: ReplayBranch; comparison: BranchComparison }
  >();
  #comparison?: BranchComparison;
  constructor(seed: string, scenario: Scenario = earthquake) {
    this.#sim = new Simulation(scenario, seed);
    this.#recorder = new ReplayRecorder(this.#sim);
  }
  update(): SessionUpdate {
    const original = this.#original ?? this.#sim;
    return {
      migrations: structuredClone(this.#migrations),
      scenario: {
        id: this.#sim.scenario.id,
        name: this.#sim.scenario.name,
        version: this.#sim.scenario.version,
        simulationVersion: this.#sim.state.version,
        hazardKind: this.#sim.scenario.hazardKind ?? "EARTHQUAKE",
      },
      replaySummary: original.state.completed
        ? {
            checkpoints:
              this.#recorder.record.checkpoints?.map((c) => c.tick) ?? [],
            commands: structuredClone(this.#recorder.record.commands),
            events: original.state.events
              .filter(
                (e) =>
                  !e.type.startsWith("REPORT_") &&
                  !e.type.startsWith("MESSAGE_"),
              )
              .map((e) => ({ id: e.id, type: e.type, tick: e.tick })),
          }
        : undefined,
      view: this.#sim.view(),
      mode: this.#mode,
      replayEnd: this.#recorder.record.endTick,
      replayVerified: this.#verified,
      aar: this.#sim.state.completed ? this.#sim.aar() : undefined,
      counterfactual: this.#comparison
        ? structuredClone(this.#comparison)
        : undefined,
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
    return save(
      this.#original ?? this.#sim,
      this.#recorder.record,
      this.#migrations,
    );
  }
  importSave(bytes: Uint8Array): SessionUpdate {
    const loaded = load(bytes);
    this.#sim = loaded.simulation;
    this.#migrations = loaded.migrations;
    this.#recorder = new ReplayRecorder(this.#sim);
    this.#recorder.record = loaded.replay;
    this.#original = undefined;
    this.#mode = "LIVE";
    this.#verified = false;
    this.#timeline = undefined;
    this.#branches.clear();
    this.#comparison = undefined;
    return this.update();
  }
  seek(tick: number): SessionUpdate {
    if (this.#mode === "LIVE" && !this.#sim.state.completed)
      throw new Error("請先完成情境");
    if (this.#mode === "LIVE") {
      this.#timeline ??= new VerifiedTimeline(
        this.#sim.scenario,
        this.#recorder.record,
      );
      if (this.#timeline.finalHash !== this.#sim.hash())
        throw new Error("Replay final hash mismatch");
      this.#verified = true;
      this.#original = this.#sim;
    }
    this.#sim = this.#timeline!.seek(tick);
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
  fork(forkTick: number, alternatives: unknown): SessionUpdate {
    const original = this.#original ?? this.#sim;
    if (!original.state.completed)
      throw new Error("請先完成情境再建立反事實分支");
    this.#timeline ??= new VerifiedTimeline(
      original.scenario,
      this.#recorder.record,
    );
    if (this.#timeline.finalHash !== original.hash())
      throw new Error("Counterfactual parent mismatch");
    const branch = this.#timeline.fork(forkTick, alternatives),
      comparison = compareBranch(original.state, original.scenario, branch);
    this.#branches.set(branch.lineage.branchId, { branch, comparison });
    while (this.#branches.size > 4)
      this.#branches.delete(this.#branches.keys().next().value!);
    this.#comparison = comparison;
    this.#verified = true;
    return this.update();
  }
  exportBranch(branchId: string): Uint8Array {
    const stored = this.#branches.get(branchId);
    if (!stored) throw new Error("分支不存在");
    return save(stored.branch.simulation, stored.branch.record);
  }
}
