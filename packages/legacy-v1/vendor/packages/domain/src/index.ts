import { z } from "zod";
export const SIM_VERSION = "0.1.0";
const id = z.string().min(1).max(100);
const tick = z.number().int().nonnegative().max(100000);
const positive = z.number().nonnegative().finite();
export const AgencySchema = z.enum(["FIRE", "EMS", "POLICE", "UTILITY"]);
export type Agency = z.infer<typeof AgencySchema>;
export const IncidentTypeSchema = z.enum([
  "FIRE",
  "BUILDING_COLLAPSE",
  "MASS_CASUALTY",
  "ROAD_BLOCKAGE",
  "POWER_FAILURE",
  "COMMUNICATION_FAILURE",
]);
export const NodeSchema = z.object({
  id,
  x: z.number().finite(),
  y: z.number().finite(),
  district: id,
  name: id,
});
export const RoadSchema = z.object({
  id,
  from: id,
  to: id,
  travelTicks: z.number().int().positive(),
  state: z.enum(["NORMAL", "DEGRADED", "BLOCKED"]),
  cause: id.optional(),
});
export const UnitSchema = z.object({
  id,
  agency: AgencySchema,
  type: id,
  nodeId: id,
  homeId: id,
  state: z.enum([
    "AVAILABLE",
    "DISPATCHED",
    "EN_ROUTE",
    "OPERATING",
    "RETURNING",
    "DISABLED",
  ]),
  capabilities: z.array(id),
  personnel: positive,
  equipment: positive,
  fatigue: positive,
  communicationStatus: z.enum(["NORMAL", "DEGRADED", "OFFLINE"]),
  assignment: id.optional(),
  route: z.array(id),
  edgeProgress: positive,
  eta: positive,
  missionCause: id.optional(),
  patients: z.array(id),
  destinationHospital: id.optional(),
  blockedSince: tick.optional(),
});
export const IncidentSchema = z.object({
  id,
  type: IncidentTypeSchema,
  nodeId: id,
  severity: z.number().min(0).max(100),
  status: z.enum(["ACTIVE", "STABILIZED", "RESOLVED"]),
  creationTick: tick,
  cause: id,
  required: z.array(AgencySchema),
  affectedEntities: z.array(id),
  hazard: positive,
  priority: z.number().int().min(1).max(3),
  work: positive,
});
export const PatientSchema = z.object({
  id,
  incidentId: id,
  state: z.enum(["WAITING", "IN_TRANSIT", "ADMITTED", "RECOVERED", "DEAD"]),
  health: z.number().min(0).max(100),
  critical: z.boolean(),
  unitId: id.optional(),
  hospitalId: id.optional(),
  cause: id,
});
export const HospitalSchema = z.object({
  id,
  nodeId: id,
  capacity: z.number().int().positive(),
  emergencyCapacity: z.number().int().nonnegative(),
  baselinePatients: positive,
  criticalPatients: positive,
  currentPatients: positive,
  power: z.boolean(),
  generator: z.enum(["OPERATIONAL", "FAILED"]),
  fuel: positive,
  cause: id.optional(),
  overloadReported: z.boolean(),
});
export const EventTypes = [
  "EARTHQUAKE_OCCURRED",
  "INCIDENT_CREATED",
  "BUILDING_COLLAPSED",
  "FIRE_STARTED",
  "FIRE_SPREAD",
  "ROAD_BLOCKED",
  "POWER_NODE_FAILED",
  "COMMUNICATION_DEGRADED",
  "COMMUNICATION_RESTORED",
  "UNIT_DISPATCHED",
  "UNIT_RECEIVED_ORDER",
  "UNIT_DEPARTED",
  "UNIT_ARRIVED",
  "UNIT_REASSIGNED",
  "UNIT_DISABLED",
  "UNIT_REROUTED",
  "UNIT_ARRIVAL_DELAYED",
  "REPORT_CREATED",
  "REPORT_TRANSMITTED",
  "REPORT_RECEIVED",
  "REPORT_LOST",
  "COMMAND_ISSUED",
  "COMMAND_RECEIVED",
  "COMMAND_ACKNOWLEDGED",
  "COMMAND_FAILED",
  "COMMAND_COMPLETED",
  "PATIENT_TRANSPORTED",
  "PATIENT_ADMITTED",
  "PATIENT_DIED",
  "HOSPITAL_OVER_CAPACITY",
  "GENERATOR_FAILED",
  "POWER_RESTORED",
  "ROAD_CLEARED",
  "INCIDENT_STABILIZED",
  "INCIDENT_RESOLVED",
  "SCENARIO_COMPLETED",
] as const;
export const EventSchema = z.object({
  id,
  tick,
  type: z.enum(EventTypes),
  payload: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  ),
  causedByEventIds: z.array(id),
});
export type DomainEvent = z.infer<typeof EventSchema>;
export const ReportSchema = z.object({
  id,
  sourceId: id,
  subjectId: id,
  subjectKind: z.enum([
    "INCIDENT",
    "UNIT",
    "HOSPITAL",
    "ROAD",
    "POWER",
    "COMMS",
  ]),
  claim: z.object({
    value: z.string(),
    nodeId: id.optional(),
    incidentType: IncidentTypeSchema.optional(),
    severity: positive.optional(),
    unitState: UnitSchema.shape.state.optional(),
    assignment: id.optional(),
    route: z.array(id).optional(),
    eta: positive.optional(),
    comms: UnitSchema.shape.communicationStatus.optional(),
  }),
  observedTick: tick,
  transmittedTick: tick.optional(),
  deliveryTick: tick,
  receivedTick: tick.optional(),
  expiry: tick,
  sourceReliability: z.number().min(0).max(1),
  observationConfidence: z.number().min(0).max(1),
  status: z.enum(["CREATED", "IN_TRANSIT", "RECEIVED", "LOST", "EXPIRED"]),
  truthRef: z.object({
    value: z.string(),
    cause: id.optional(),
    receivedValue: z.string().optional(),
  }),
  createdEventId: id,
});
export const CommandInputSchema = z
  .object({
    type: z.enum([
      "DISPATCH_UNIT",
      "REASSIGN_UNIT",
      "RECALL_UNIT",
      "REQUEST_STATUS",
      "SET_INCIDENT_PRIORITY",
    ]),
    target: id,
    incidentId: id.optional(),
    priority: z.number().int().min(1).max(3).optional(),
  })
  .strict();
export const CommandSchema = CommandInputSchema.extend({
  id,
  issueTick: tick,
  actor: z.literal("PLAYER"),
  deliveryTick: tick,
  deliveryStatus: z.enum(["SENT", "RECEIVED", "ACKNOWLEDGED", "FAILED"]),
  executionStatus: z.enum(["PENDING", "EXECUTING", "COMPLETED", "FAILED"]),
  acknowledgementTick: tick.optional(),
  failure: z.string().optional(),
  cause: id,
});
export const ScheduledSchema = z.object({
  tick,
  kind: z.enum(["AFTERSHOCK", "POWER_DAMAGE", "RADIO_DAMAGE", "ROAD_DAMAGE"]),
  target: id,
  cause: id,
});
export const ScenarioSchema = z.object({
  id,
  version: id,
  name: id,
  maxTicks: z.number().int().min(300).max(14400),
  districts: z
    .array(z.object({ id, name: id, x: z.number(), y: z.number() }))
    .min(4),
  nodes: z.array(NodeSchema).min(10),
  roads: z.array(RoadSchema).min(10),
  units: z.array(UnitSchema).length(18),
  hospitals: z.array(HospitalSchema).length(2),
  facilities: z.array(
    z.object({
      id,
      nodeId: id,
      type: z.enum(["FIRE", "EMS", "POLICE", "UTILITY", "POWER", "COMMS"]),
      name: id,
    }),
  ),
  hazardSites: z.array(
    z.object({
      nodeId: id,
      type: IncidentTypeSchema,
      severity: positive,
      injuries: z.number().int().nonnegative(),
      chance: z.number().min(0).max(1),
    }),
  ),
  powerFailureTick: tick,
  radioFailureTick: tick,
  aftershockTick: tick,
  observationInterval: z.number().int().positive(),
  reportDelay: z.tuple([tick, tick]),
  degradedReportDelay: z.tuple([tick, tick]),
  reportLoss: z.number().min(0).max(1),
  degradedReportLoss: z.number().min(0).max(1),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
export const WorldSchema = z.object({
  version: z.literal(SIM_VERSION),
  scenarioId: id,
  scenarioVersion: id,
  seed: id,
  tick,
  rng: z.record(z.string(), z.number().int().min(0).max(4294967295)),
  units: z.array(UnitSchema),
  roads: z.array(RoadSchema),
  hospitals: z.array(HospitalSchema),
  incidents: z.array(IncidentSchema),
  patients: z.array(PatientSchema),
  reports: z.array(ReportSchema),
  commands: z.array(CommandSchema),
  events: z.array(EventSchema),
  schedule: z.array(ScheduledSchema),
  power: z.boolean(),
  comms: z.enum(["NORMAL", "DEGRADED", "OFFLINE"]),
  powerCause: id.optional(),
  commsCause: id.optional(),
  completed: z.boolean(),
  completionReason: z.string().optional(),
  counters: z.object({
    event: tick,
    report: tick,
    command: tick,
    incident: tick,
  }),
});
export type WorldState = z.infer<typeof WorldSchema>;
export type Unit = z.infer<typeof UnitSchema>;
export type Incident = z.infer<typeof IncidentSchema>;
export type IntelReport = z.infer<typeof ReportSchema>;
export type PlayerCommand = z.infer<typeof CommandSchema>;
export type CommandInput = z.infer<typeof CommandInputSchema>;

// Public DTOs contain received claims, never truth references or transport queues.
export type PublicReport = Omit<
  IntelReport,
  "truthRef" | "deliveryTick" | "createdEventId" | "status"
> & { status: "RECEIVED" };
export interface Belief {
  subjectId: string;
  kind: IntelReport["subjectKind"];
  claim: IntelReport["claim"];
  observedTick: number;
  receivedTick: number;
  age: number;
  confidence: number;
  sources: string[];
  corroboration: string[];
  conflicts: string[];
  stale: boolean;
  reportId: string;
}
export interface PublicUnit {
  id: string;
  agency: Agency;
  type: string;
  capabilities: string[];
  homeId: string;
  belief?: Belief;
}
export interface CommandReceipt {
  id: string;
  issueTick: number;
  type: CommandInput["type"];
  target: string;
  incidentId?: string;
  deliveryStatus: string;
  executionStatus: string;
  acknowledgementTick?: number;
  failure?: string;
}
export interface CommandCenterView {
  tick: number;
  seed: string;
  completed: boolean;
  completionReason?: string;
  reports: PublicReport[];
  beliefs: Belief[];
  units: PublicUnit[];
  commands: CommandReceipt[];
  city: Pick<Scenario, "nodes" | "districts" | "facilities"> & {
    roads: { id: string; from: string; to: string }[];
    hospitals: {
      id: string;
      nodeId: string;
      capacity: number;
      emergencyCapacity: number;
    }[];
  };
}
export interface AAR {
  seed: string;
  duration: number;
  reason: string;
  fatalities: number;
  injuries: number;
  resolved: number;
  hospitalOverload: number;
  infrastructureFailures: number;
  intelFailures: {
    stale: number;
    inaccurate: number;
    lost: number;
    delayed: number;
    lowConfidence: number;
  };
  intelAudit: IntelAudit[];
  commands: CommandReceipt[];
  averageCommandDelay: number;
  timeline: DomainEvent[];
  finalHash: string;
}
export interface IntelAudit {
  id: string;
  source: string;
  subject: string;
  claim: string;
  observedTruth: string;
  receivedTruth?: string;
  observedTick: number;
  receivedTick?: number;
  classifications: string[];
}
