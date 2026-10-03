import type { WorldState, Scenario, Unit } from '../../domain/src/index';
import { route, edge, cost } from './routing';
import { emit } from './events';
import { unitReport } from './intelligence';
function travelTo(w: WorldState, u: Unit, target: string): boolean {
  const path = route(w, u.nodeId, target); if (!path) return false;
  u.route = path.nodes; u.edgeProgress = 0; u.eta = path.eta; u.state = 'EN_ROUTE'; return true;
}
export function responders(w: WorldState, s: Scenario): void {
  for (const u of w.units) {
    if (u.state === 'DISABLED' || u.state === 'AVAILABLE') continue;
    if (u.state === 'DISPATCHED') { u.state = 'EN_ROUTE'; emit(w, 'UNIT_DEPARTED', { unitId: u.id }, [u.missionCause]); }
    if (u.state === 'EN_ROUTE' || u.state === 'RETURNING') {
      if (u.route.length) {
        const r = edge(w, u.nodeId, u.route[0]);
        if (!r || r.state === 'BLOCKED') {
          const target = u.route[u.route.length - 1], newPath = route(w, u.nodeId, target);
          const cause = emit(w, 'UNIT_REROUTED', { unitId: u.id, oldEta: u.eta }, [u.missionCause, r?.cause]);
          if (newPath) { u.route = newPath.nodes; u.edgeProgress = 0; u.eta = newPath.eta; u.blockedSince = undefined; emit(w, 'UNIT_ARRIVAL_DELAYED', { unitId: u.id, eta: u.eta }, [cause]); }
          else { u.blockedSince ??= w.tick; if (w.tick - u.blockedSince > 180) { u.state = 'DISABLED'; emit(w, 'UNIT_DISABLED', { unitId: u.id, reason: 'ROUTING_DEADLOCK' }, [cause]); } }
          unitReport(w, s, u.id); continue;
        }
        u.edgeProgress++; u.eta = Math.max(0, u.eta - 1);
        if (u.edgeProgress >= cost(r)) { u.nodeId = u.route.shift()!; u.edgeProgress = 0; }
        if (u.route.length) continue;
      }
      emit(w, 'UNIT_ARRIVED', { unitId: u.id, nodeId: u.nodeId }, [u.missionCause]);
      if (u.destinationHospital) {
        const h = w.hospitals.find(h => h.id === u.destinationHospital)!;
        for (const patientId of u.patients) {
          const p = w.patients.find(p => p.id === patientId)!;
          if (p.state !== 'DEAD') { p.state = 'ADMITTED'; p.hospitalId = h.id; p.unitId = undefined; p.cause = emit(w, 'PATIENT_ADMITTED', { patientId: p.id, hospitalId: h.id }, [p.cause, u.missionCause]); }
        }
        u.patients = []; u.destinationHospital = undefined;
        const i = w.incidents.find(i => i.id === u.assignment);
        if (i && i.status !== 'RESOLVED' && w.patients.some(p => p.incidentId === i.id && p.state === 'WAITING') && travelTo(w, u, i.nodeId)) { unitReport(w, s, u.id); continue; }
        u.assignment = undefined; travelTo(w, u, u.homeId); u.state = 'RETURNING';
      } else if (u.state === 'RETURNING') { u.state = 'AVAILABLE'; u.assignment = undefined; completeOrder(w, u); }
      else { u.state = 'OPERATING'; completeOrder(w, u); }
      unitReport(w, s, u.id);
    }
    if (u.state !== 'OPERATING') continue;
    u.fatigue = Math.min(100, u.fatigue + 0.008);
    const i = w.incidents.find(i => i.id === u.assignment);
    if (!i || i.status === 'RESOLVED') { u.assignment = undefined; travelTo(w, u, u.homeId); u.state = 'RETURNING'; unitReport(w, s, u.id); continue; }
    if (u.agency !== 'EMS' || w.tick % 12 !== 0) continue;
    const patients = w.patients.filter(p => p.incidentId === i.id && p.state === 'WAITING').sort((a, b) => Number(b.critical) - Number(a.critical) || a.health - b.health).slice(0, 2);
    if (!patients.length) continue;
    const hospitals = w.hospitals.map(h => ({ h, path: route(w, u.nodeId, h.nodeId) })).filter((h): h is { h: WorldState['hospitals'][number]; path: { nodes: string[]; eta: number } } => !!h.path).sort((a, b) => (a.path.eta + (a.h.power || a.h.generator === 'OPERATIONAL' ? 0 : 500) + Math.max(0, a.h.currentPatients - a.h.capacity) * 20) - (b.path.eta + (b.h.power || b.h.generator === 'OPERATIONAL' ? 0 : 500) + Math.max(0, b.h.currentPatients - b.h.capacity) * 20) || a.h.id.localeCompare(b.h.id, 'en'));
    const destination = hospitals[0]; if (!destination) continue;
    u.patients = patients.map(p => p.id); u.destinationHospital = destination.h.id;
    u.route = destination.path.nodes; u.eta = destination.path.eta; u.edgeProgress = 0; u.state = 'EN_ROUTE';
    for (const p of patients) { p.state = 'IN_TRANSIT'; p.unitId = u.id; p.cause = emit(w, 'PATIENT_TRANSPORTED', { patientId: p.id, unitId: u.id, hospitalId: destination.h.id }, [p.cause, u.missionCause, i.cause]); }
    unitReport(w, s, u.id);
  }
}
function completeOrder(w: WorldState, u: Unit): void { for (const c of w.commands.filter(c => c.target === u.id && c.executionStatus === 'EXECUTING')) { c.executionStatus = 'COMPLETED'; emit(w, 'COMMAND_COMPLETED', { commandId: c.id }, [c.cause]); } }
