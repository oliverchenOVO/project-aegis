import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Simulation, assertInvariants } from '../packages/simulation/src/index';
import { earthquake } from '../packages/scenarios/src/earthquake';
import { ReplayRecorder, replay } from '../packages/replay/src/index';
import { hash } from '../packages/shared/src/index';
const count = Number(process.argv[2] ?? 100);
if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('Seed count must be 1–1000');
const runtimes: number[] = [], failures: { seed: string; message: string }[] = [];
let ticks = 0, maxEvents = 0, mismatches = 0, invariantFailures = 0, crashes = 0;
for (let i = 0; i < count; i++) {
  const seed = `benchmark-${i.toString().padStart(4, '0')}`;
  try {
    const start = performance.now(), sim = new Simulation(earthquake, seed), recorder = new ReplayRecorder(sim);
    let guard = 0;
    while (!sim.state.completed && guard++ <= earthquake.maxTicks + 1) {
      if (sim.state.tick === 90) for (const [unit, incident] of [['ENG-01', 'INC-1'], ['ENG-02', 'INC-2'], ['AMB-01', 'INC-1'], ['AMB-02', 'INC-2'], ['AMB-03', 'INC-3']] as const) recorder.command(sim, { type: 'DISPATCH_UNIT', target: unit, incidentId: incident });
      if (sim.state.tick === 310) { const incident = sim.state.incidents.find(i => i.type === 'POWER_FAILURE'); if (incident) recorder.command(sim, { type: 'DISPATCH_UNIT', target: 'UTL-01', incidentId: incident.id }); }
      sim.step(); recorder.checkpoint(sim); if (sim.state.tick % 30 === 0) assertInvariants(sim.state, earthquake);
    }
    if (!sim.state.completed) throw new Error('No-hang maximum tick guard');
    const elapsed = performance.now() - start; runtimes.push(elapsed); ticks += sim.state.tick; maxEvents = Math.max(maxEvents, sim.state.events.length);
    const second = replay(earthquake, recorder.record);
    if (sim.hash() !== second.hash() || hash(sim.state.events) !== hash(second.state.events) || hash(sim.aar()) !== hash(second.aar())) { mismatches++; throw new Error('Replay mismatch'); }
  } catch (error) { const message = String(error); failures.push({ seed, message }); if (message.includes('Invariant')) invariantFailures++; else if (!message.includes('Replay mismatch')) crashes++; }
  if ((i + 1) % 10 === 0) console.log(`Validated ${i + 1}/${count} seeds`);
}
runtimes.sort((a, b) => a - b);
const report = { seedsRequested: count, seedsCompleted: count - failures.length, crashes, invariantFailures, replayMismatches: mismatches, averageTicksPerSecond: ticks / (runtimes.reduce((a, b) => a + b, 0) / 1000), p95RuntimeMs: runtimes[Math.min(runtimes.length - 1, Math.ceil(runtimes.length * 0.95) - 1)] ?? 0, maximumEventCount: maxEvents, failures };
mkdirSync('docs/qa', { recursive: true }); writeFileSync('docs/qa/benchmark.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); if (failures.length) process.exitCode = 1;
