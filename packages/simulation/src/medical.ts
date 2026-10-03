import type { WorldState } from '../../domain/src/index';
import { emit } from './events';
export function infrastructure(w: WorldState): void {
  for (const h of w.hospitals) {
    if (!h.power && h.generator === 'OPERATIONAL') {
      h.fuel = Math.max(0, h.fuel - 1);
      if (h.fuel === 0) { h.generator = 'FAILED'; h.cause = emit(w, 'GENERATOR_FAILED', { hospitalId: h.id }, [h.cause]); }
    }
    h.currentPatients = h.baselinePatients + w.patients.filter(p => p.hospitalId === h.id && p.state === 'ADMITTED').length;
    if (h.currentPatients > h.capacity + h.emergencyCapacity && !h.overloadReported) { h.overloadReported = true; emit(w, 'HOSPITAL_OVER_CAPACITY', { hospitalId: h.id, load: h.currentPatients }, [h.cause, ...w.patients.filter(p => p.hospitalId === h.id).map(p => p.cause)]); }
    if (!h.power && h.generator === 'FAILED' && h.criticalPatients > 0 && w.tick % 100 === 0) {
      h.criticalPatients--; h.baselinePatients--; h.currentPatients--;
      emit(w, 'PATIENT_DIED', { hospitalId: h.id, baseline: true }, [h.cause]);
    }
  }
  if (!w.power && w.tick % 240 === 0 && w.comms === 'DEGRADED') { w.comms = 'OFFLINE'; w.commsCause = emit(w, 'COMMUNICATION_DEGRADED', { status: 'OFFLINE' }, [w.powerCause, w.commsCause]); }
  for (const u of w.units) u.communicationStatus = w.comms;
}
export function medical(w: WorldState): void {
  for (const p of w.patients) {
    if (p.state === 'DEAD' || p.state === 'RECOVERED') continue;
    const i = w.incidents.find(i => i.id === p.incidentId)!;
    if (p.state === 'WAITING') {
      const care = w.units.some(u => u.assignment === i.id && u.state === 'OPERATING' && u.agency === 'EMS');
      p.health = Math.max(0, p.health - (p.critical ? 0.065 : 0.022) * (care ? 0.3 : 1) * (i.status === 'ACTIVE' ? 1 + i.hazard / 100 : 0.7));
    } else if (p.state === 'IN_TRANSIT') p.health = Math.max(0, p.health - (p.critical ? 0.025 : 0.008));
    else if (p.state === 'ADMITTED') {
      const h = w.hospitals.find(h => h.id === p.hospitalId)!;
      const powered = h.power || h.generator === 'OPERATIONAL';
      const overloaded = h.currentPatients > h.capacity + h.emergencyCapacity;
      p.health = Math.max(0, Math.min(100, p.health + (powered && !overloaded ? 0.11 : -0.08)));
      if (p.health >= 100) p.state = 'RECOVERED';
    }
    if (p.health === 0) {
      p.state = 'DEAD'; const unit = w.units.find(u => u.id === p.unitId);
      if (unit) unit.patients = unit.patients.filter(id => id !== p.id);
      const h = w.hospitals.find(h => h.id === p.hospitalId);
      p.cause = emit(w, 'PATIENT_DIED', { patientId: p.id, incidentId: i.id }, [p.cause, i.cause, h?.cause, unit?.missionCause]);
    }
  }
}
