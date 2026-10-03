import { z } from 'zod';
import { SIM_VERSION, CommandInputSchema, ScenarioSchema, type Scenario, type CommandInput } from '../../domain/src/index';
import { Simulation } from '../../simulation/src/index';
export const ReplaySchema = z.object({ formatVersion: z.literal(1), simulationVersion: z.literal(SIM_VERSION), scenarioId: z.string(), scenarioVersion: z.string(), seed: z.string().min(1).max(100), endTick: z.number().int().nonnegative().max(14400), commands: z.array(z.object({ tick: z.number().int().nonnegative().max(14400), input: CommandInputSchema })), hashes: z.array(z.object({ tick: z.number().int().nonnegative(), hash: z.string().regex(/^[0-9a-f]{16}$/) })) });
export type ReplayRecord = z.infer<typeof ReplaySchema>;
export class ReplayRecorder {
  record: ReplayRecord;
  constructor(sim: Simulation) { this.record = { formatVersion: 1, simulationVersion: SIM_VERSION, scenarioId: sim.scenario.id, scenarioVersion: sim.scenario.version, seed: sim.state.seed, endTick: sim.state.tick, commands: [], hashes: [{ tick: 0, hash: sim.hash() }] }; }
  command(sim: Simulation, input: CommandInput): void { sim.issue(input); this.record.commands.push({ tick: sim.state.tick, input: structuredClone(input) }); }
  checkpoint(sim: Simulation): void { this.record.endTick = sim.state.tick; if (sim.state.tick % 300 === 0 && !this.record.hashes.some(h => h.tick === sim.state.tick)) this.record.hashes.push({ tick: sim.state.tick, hash: sim.hash() }); }
}
export function validateReplay(input: unknown, scenario: Scenario): ReplayRecord {
  const record = ReplaySchema.parse(input); ScenarioSchema.parse(scenario);
  if (record.scenarioId !== scenario.id || record.scenarioVersion !== scenario.version || record.endTick > scenario.maxTicks) throw new Error('重播場景版本不相容');
  if (record.commands.some((c, i) => c.tick > record.endTick || (i > 0 && c.tick < record.commands[i - 1].tick))) throw new Error('重播指令時間序列損壞');
  if (!record.hashes.length || record.hashes[0].tick !== 0 || record.hashes.some((h, i) => h.tick > record.endTick || (i > 0 && h.tick <= record.hashes[i - 1].tick))) throw new Error('重播校驗索引損壞');
  return record;
}
export function replay(scenario: Scenario, input: unknown, targetTick?: number): Simulation {
  const record = validateReplay(input, scenario), target = targetTick ?? record.endTick;
  if (!Number.isInteger(target) || target < 0 || target > record.endTick) throw new Error('重播時間超出範圍');
  const sim = new Simulation(scenario, record.seed); let cursor = 0;
  const checks = new Map(record.hashes.map(h => [h.tick, h.hash]));
  while (sim.state.tick <= target) {
    const expected = checks.get(sim.state.tick); if (expected && expected !== sim.hash()) throw new Error(`DETERMINISM REGRESSION at tick ${sim.state.tick}`);
    while (record.commands[cursor]?.tick === sim.state.tick) { sim.issue(record.commands[cursor].input); cursor++; }
    if (sim.state.tick === target) break;
    if (sim.state.completed) throw new Error('重播提前結束'); sim.step(1);
  }
  return sim;
}
