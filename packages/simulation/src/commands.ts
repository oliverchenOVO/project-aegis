import { CommandInputSchema, type WorldState, type Scenario, type CommandInput, type PlayerCommand } from '../../domain/src/index';
import { emit } from './events';
import { SeededRandom } from './random';
import { route } from './routing';
import { observe, unitReport } from './intelligence';
export function issue(w: WorldState, input: CommandInput): PlayerCommand {
  const parsed = CommandInputSchema.parse(input);
  if (w.completed) throw new Error('情境已結束');
  const exists = [...w.units, ...w.incidents, ...w.hospitals].some(e => e.id === parsed.target) || ['PWR', 'RAD'].includes(parsed.target);
  if (!exists) throw new Error('指令目標不存在');
  if (parsed.incidentId && !w.incidents.some(i => i.id === parsed.incidentId)) throw new Error('事件不存在');
  if ((parsed.type === 'DISPATCH_UNIT' || parsed.type === 'REASSIGN_UNIT') && !parsed.incidentId) throw new Error('請選擇事件');
  if (parsed.type === 'SET_INCIDENT_PRIORITY' && (!parsed.priority || !w.incidents.some(i => i.id === parsed.target))) throw new Error('請選擇事件優先序');
  const rng = new SeededRandom(w.seed, w.rng, 'comms:commands');
  const delay = w.comms === 'NORMAL' ? rng.integer(4, 14) : w.comms === 'DEGRADED' ? rng.integer(20, 65) : rng.integer(90, 180);
  const id = `CMD-${++w.counters.command}`;
  const cause = emit(w, 'COMMAND_ISSUED', { commandId: id, target: parsed.target, type: parsed.type, incidentId: parsed.incidentId ?? '' }, [w.commsCause]);
  const command: PlayerCommand = { ...parsed, id, issueTick: w.tick, actor: 'PLAYER', deliveryTick: w.tick + delay, deliveryStatus: 'SENT', executionStatus: 'PENDING', cause };
  w.commands.push(command); return command;
}
export function deliverCommands(w: WorldState, s: Scenario): void {
  for (const c of w.commands.filter(c => c.deliveryStatus === 'SENT' && c.deliveryTick <= w.tick)) {
    if (w.comms === 'OFFLINE' && new SeededRandom(w.seed, w.rng, `comms:delivery:${c.id}`).chance(0.35)) { fail(w, c, '無線電離線，指令未送達', w.commsCause); continue; }
    c.deliveryStatus = 'RECEIVED'; c.cause = emit(w, 'COMMAND_RECEIVED', { commandId: c.id }, [c.cause, w.commsCause]);
    const u = w.units.find(u => u.id === c.target), i = w.incidents.find(i => i.id === c.incidentId);
    if (c.type === 'REQUEST_STATUS') { observe(w, s, c.target); acknowledge(w, c); c.executionStatus = 'COMPLETED'; emit(w, 'COMMAND_COMPLETED', { commandId: c.id }, [c.cause]); continue; }
    if (c.type === 'SET_INCIDENT_PRIORITY') { w.incidents.find(i => i.id === c.target)!.priority = c.priority!; acknowledge(w, c); c.executionStatus = 'COMPLETED'; continue; }
    if (!u || u.state === 'DISABLED') { fail(w, c, '單位無法執行'); continue; }
    if (c.type === 'DISPATCH_UNIT' && u.state !== 'AVAILABLE') { fail(w, c, '單位忙碌，請使用改派'); continue; }
    if (u.patients.length > 0) { fail(w, c, '單位正在運送傷患，無法中止'); continue; }
    if (c.type !== 'RECALL_UNIT' && (!i || i.status === 'RESOLVED' || !i.required.includes(u.agency))) { fail(w, c, '目標已解除或單位能力不符'); continue; }
    const destination = c.type === 'RECALL_UNIT' ? u.homeId : i!.nodeId;
    const path = route(w, u.nodeId, destination);
    if (!path) { fail(w, c, '道路阻斷，無可用路線'); continue; }
    acknowledge(w, c); emit(w, 'UNIT_RECEIVED_ORDER', { unitId: u.id, commandId: c.id }, [c.cause]);
    const priorAssignment = u.assignment;
    u.assignment = c.type === 'RECALL_UNIT' ? undefined : i!.id; u.missionCause = c.cause;
    u.route = path.nodes; u.edgeProgress = 0; u.eta = path.eta; u.blockedSince = undefined;
    u.state = c.type === 'RECALL_UNIT' ? 'RETURNING' : 'DISPATCHED'; c.executionStatus = 'EXECUTING';
    emit(w, priorAssignment ? 'UNIT_REASSIGNED' : 'UNIT_DISPATCHED', { unitId: u.id, incidentId: u.assignment ?? 'BASE', commandId: c.id }, [c.cause]);
    unitReport(w, s, u.id);
  }
}
function acknowledge(w: WorldState, c: PlayerCommand): void { c.deliveryStatus = 'ACKNOWLEDGED'; c.acknowledgementTick = w.tick; c.cause = emit(w, 'COMMAND_ACKNOWLEDGED', { commandId: c.id, delay: w.tick - c.issueTick }, [c.cause]); }
function fail(w: WorldState, c: PlayerCommand, reason: string, cause?: string): void { c.deliveryStatus = 'FAILED'; c.executionStatus = 'FAILED'; c.failure = reason; emit(w, 'COMMAND_FAILED', { commandId: c.id, reason }, [c.cause, cause]); }
