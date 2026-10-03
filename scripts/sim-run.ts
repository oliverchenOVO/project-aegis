import { Simulation, assertInvariants } from '../packages/simulation/src/index';
import { earthquake, SHOWCASE_SEED } from '../packages/scenarios/src/earthquake';
const seedIndex = process.argv.indexOf('--seed');
const simulation = new Simulation(earthquake, seedIndex >= 0 ? process.argv[seedIndex + 1] : SHOWCASE_SEED);
while (!simulation.state.completed) { simulation.step(1); if (simulation.state.tick % 60 === 0) assertInvariants(simulation.state, earthquake); }
console.log(JSON.stringify(simulation.aar(), null, 2));
