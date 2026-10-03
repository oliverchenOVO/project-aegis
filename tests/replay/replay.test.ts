import { it, expect } from 'vitest';
import { Simulation } from '../../packages/simulation/src/index';
import { ReplayRecorder, replay } from '../../packages/replay/src/index';
import { earthquake } from '../../packages/scenarios/src/earthquake';
import { hash } from '../../packages/shared/src/index';
it.each(['one', 'two', 'three', 'AEGIS-2026-001'])('replay from zero validates checkpoints, commands, events and AAR %s', seed => {
  const s = new Simulation(earthquake, seed), r = new ReplayRecorder(s);
  while (!s.state.completed) {
    if (s.state.tick === 90) r.command(s, { type: 'DISPATCH_UNIT', target: 'ENG-01', incidentId: 'INC-1' });
    if (s.state.tick === 300) r.command(s, { type: 'REQUEST_STATUS', target: 'H-B' });
    s.step(); r.checkpoint(s);
  }
  const reconstructed = replay(earthquake, r.record);
  expect(reconstructed.hash()).toBe(s.hash()); expect(hash(reconstructed.state.events)).toBe(hash(s.state.events)); expect(reconstructed.aar()).toEqual(s.aar());
  expect(replay(earthquake, r.record, 300).state.tick).toBe(300);
  r.record.hashes[1].hash = '0000000000000000'; expect(() => replay(earthquake, r.record)).toThrow('DETERMINISM REGRESSION');
});
