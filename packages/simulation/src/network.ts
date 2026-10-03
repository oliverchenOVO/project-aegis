import type {
  WorldState,
  Scenario,
  NetworkMessage,
  PlayerCommand,
} from "../../domain/src/index";
import { emit } from "./events";
import { SeededRandom } from "./random";
const routeCaches = new WeakMap<
  NonNullable<WorldState["network"]>,
  { signature: string; paths: Map<string, string[] | undefined> }
>();
export function initializeNetwork(w: WorldState, s: Scenario): void {
  if (!s.communications) return;
  w.network = {
    ...structuredClone(s.communications),
    messages: [],
    messageSequence: 0,
    peakQueued: 0,
  };
  const net = w.network,
    ids = new Set(net.nodes.map((n) => n.id)),
    cityIds = new Set(s.nodes.map((n) => n.id));
  if (
    ids.size !== net.nodes.length ||
    !ids.has(net.dispatchNode) ||
    new Set(net.edges.map((e) => e.id)).size !== net.edges.length ||
    new Set(net.sources.map((source) => source.id)).size !==
      net.sources.length ||
    net.edges.some((e) => !ids.has(e.from) || !ids.has(e.to)) ||
    net.sources.some(
      (source) => !ids.has(source.endpoint) || !cityIds.has(source.nodeId),
    ) ||
    net.nodes.some(
      (n) =>
        !cityIds.has(n.nodeId) ||
        (n.powerDependency === "HOSPITAL" &&
          !w.hospitals.some((h) => h.id === n.hospitalId)),
    )
  )
    throw new Error("Invalid communication topology");
}
export function targetEndpoint(w: WorldState, target: string): string {
  const net = w.network!;
  if (target === "PWR") return "NET-UTILITY";
  if (target === "RAD") return "NET-RAD";
  const source = net.sources.find((s) => s.id === target);
  if (source) return source.endpoint;
  if (net.nodes.some((n) => n.id === `NET-Z-${target}`))
    return `NET-Z-${target}`;
  const incident = w.incidents.find((i) => i.id === target);
  if (incident)
    return net.sources.find((s) => s.id === `CIV-${incident.nodeId}`)!.endpoint;
  return net.dispatchNode;
}
export function enqueueMessage(
  w: WorldState,
  kind: NetworkMessage["kind"],
  referenceId: string,
  source: string,
  destination: string,
  cause: string,
  reportedExecution?: PlayerCommand["executionStatus"],
  reportedFailure?: string,
): NetworkMessage {
  const net = w.network!;
  assertNetworkCapacity(w);
  if (
    !net.nodes.some((n) => n.id === source) ||
    !net.nodes.some((n) => n.id === destination)
  )
    throw new Error("Unknown network endpoint");
  const id = `MSG-${++net.messageSequence}`;
  const message: NetworkMessage = {
    id,
    kind,
    referenceId,
    source,
    destination,
    currentNode: source,
    status: "QUEUED",
    queuedTick: w.tick,
    visited: [source],
    queueDelay: 0,
    cause: emit(
      w,
      "MESSAGE_QUEUED",
      { messageId: id, kind, referenceId, source, destination },
      [cause],
    ),
    ...(reportedExecution ? { reportedExecution } : {}),
    ...(reportedFailure ? { reportedFailure } : {}),
  };
  net.messages.push(message);
  return message;
}
export function queueAcknowledgement(
  w: WorldState,
  c: PlayerCommand,
  status: PlayerCommand["executionStatus"],
  failure?: string,
): void {
  if (!w.network) return;
  const ack = enqueueMessage(
    w,
    "ACK",
    c.id,
    targetEndpoint(w, c.target),
    w.network.dispatchNode,
    c.cause,
    status,
    failure,
  );
  c.acknowledgementMessageId = ack.id;
}
export function assertNetworkCapacity(w: WorldState): void {
  if (
    w.network &&
    w.network.messages.filter(
      (m) => m.status === "QUEUED" || m.status === "IN_TRANSIT",
    ).length +
      w.schedule.length >=
      20000
  )
    throw new Error("Network queue explosion guard");
}
export function sourcePermitted(
  w: WorldState,
  sourceId: string,
  kind: WorldState["reports"][number]["subjectKind"],
  claim: WorldState["reports"][number]["claim"],
  subjectId: string,
): boolean {
  if (!w.network) return true;
  const source = w.network.sources.find((s) => s.id === sourceId);
  if (!source?.capabilities.includes(kind)) return false;
  if (kind === "UNIT") return subjectId === source.id;
  if (kind === "HOSPITAL") return subjectId === source.id;
  if (kind === "FLOOD" || kind === "CIVILIANS") {
    const zone =
      kind === "CIVILIANS" ? subjectId.replace(/^POP-/, "") : subjectId;
    return sourceId === `CIV-${zone}` || sourceId === `SENSOR-${zone}`;
  }
  if (kind === "POWER") return subjectId === "PWR";
  if (kind === "COMMS") return subjectId === "RAD";
  if (kind === "INCIDENT") {
    const unit = w.units.find((u) => u.id === sourceId);
    if (unit)
      return unit.assignment === subjectId && unit.state === "OPERATING";
    if (claim.nodeId !== source.nodeId) return false;
    if (
      source.incidentTypes &&
      (!claim.incidentType ||
        !source.incidentTypes.includes(claim.incidentType))
    )
      return false;
  }
  return true;
}
export function updateNetworkPower(w: WorldState): void {
  const net = w.network;
  if (!net) return;
  for (const node of net.nodes) {
    let powered = true,
      cause: string | undefined;
    if (node.powerDependency === "GRID") {
      if (w.power) node.backupFuel = node.backupCapacity;
      else {
        node.backupFuel = Math.max(0, node.backupFuel - 1);
        powered = node.backupFuel > 0;
        cause = w.powerCause;
      }
    } else if (node.powerDependency === "HOSPITAL") {
      const h = w.hospitals.find((h) => h.id === node.hospitalId)!;
      powered = h.power || h.generator === "OPERATIONAL";
      cause = h.cause;
    }
    const flooded = w.flood?.zones.find(
      (z) =>
        z.nodeIds.includes(node.nodeId) &&
        node.floodLimit !== undefined &&
        z.waterDepth > node.floodLimit,
    );
    const radioFailure =
      node.role === "REPEATER"
        ? w.incidents.find(
            (i) => i.type === "COMMUNICATION_FAILURE" && i.status === "ACTIVE",
          )
        : undefined;
    const status =
      !powered || flooded
        ? "DOWN"
        : radioFailure || (!w.power && node.powerDependency === "GRID")
          ? "DEGRADED"
          : "NORMAL";
    if (status !== node.status) {
      node.status = status;
      node.cause = emit(
        w,
        "NETWORK_NODE_STATUS_CHANGED",
        { networkNodeId: node.id, status, backupFuel: node.backupFuel },
        [node.cause, cause, flooded?.cause, radioFailure?.cause],
      );
    }
  }
  for (const u of w.units)
    u.communicationStatus =
      net.nodes.find((n) => n.id === `NET-${u.agency}`)!.status === "DOWN"
        ? "OFFLINE"
        : net.nodes.find((n) => n.id === "NET-RAD")!.status === "NORMAL"
          ? "NORMAL"
          : "DEGRADED";
}
export function networkPath(
  w: WorldState,
  from: string,
  to: string,
  avoid: readonly string[] = [],
  nominal = false,
): string[] | undefined {
  const net = w.network!,
    distance = new Map([[from, 0]]),
    previous = new Map<string, { node: string; edge: string }>(),
    pending = new Set(
      net.nodes
        .filter(
          (n) => (nominal || n.status !== "DOWN") && !avoid.includes(n.id),
        )
        .map((n) => n.id),
    );
  if (!pending.has(from) || !pending.has(to)) return undefined;
  while (pending.size) {
    const at = [...pending].sort(
      (a, b) =>
        (distance.get(a) ?? Infinity) - (distance.get(b) ?? Infinity) ||
        a.localeCompare(b, "en"),
    )[0];
    if (!Number.isFinite(distance.get(at) ?? Infinity)) break;
    pending.delete(at);
    if (at === to) break;
    for (const edge of net.edges.filter((e) => e.from === at || e.to === at)) {
      const next = edge.from === at ? edge.to : edge.from;
      if (!pending.has(next)) continue;
      const degraded =
          !nominal &&
          [at, next].some(
            (id) => net.nodes.find((n) => n.id === id)!.status === "DEGRADED",
          ),
        value = distance.get(at)! + edge.latency * (degraded ? 2 : 1);
      if (value < (distance.get(next) ?? Infinity)) {
        distance.set(next, value);
        previous.set(next, { node: at, edge: edge.id });
      }
    }
  }
  if (!distance.has(to)) return undefined;
  const edges: string[] = [];
  let at = to;
  while (at !== from) {
    const entry = previous.get(at);
    if (!entry) return undefined;
    edges.unshift(entry.edge);
    at = entry.node;
  }
  return edges;
}
export function advanceNetwork(w: WorldState): void {
  const net = w.network;
  if (!net) return;
  const signature =
    JSON.stringify(net.nodes.map((n) => [n.id, n.status])) +
    JSON.stringify(net.edges.map((e) => [e.id, e.from, e.to, e.latency]));
  if (routeCaches.get(net)?.signature !== signature)
    routeCaches.set(net, { signature, paths: new Map() });
  const paths = routeCaches.get(net)!.paths;
  const active = net.messages.filter(
    (m) => m.status === "QUEUED" || m.status === "IN_TRANSIT",
  );
  net.peakQueued = Math.max(net.peakQueued, active.length);
  const lost = (
    m: NetworkMessage,
    reason: string,
    causes: (string | undefined)[],
  ) => {
    m.status = "LOST";
    m.cause = emit(
      w,
      "MESSAGE_LOST",
      { messageId: m.id, kind: m.kind, referenceId: m.referenceId, reason },
      [m.cause, ...causes],
    );
  };
  for (const m of active) {
    if (w.tick - m.queuedTick > net.maxMessageAge) {
      lost(m, "TTL_EXPIRED", [
        net.nodes.find((n) => n.id === m.currentNode)?.cause,
      ]);
      continue;
    }
    if (m.status !== "IN_TRANSIT" || m.arrivalTick! > w.tick) continue;
    const destination = net.nodes.find((n) => n.id === m.hopDestination)!;
    if (destination.status === "DOWN") {
      lost(m, "RECEIVER_UNAVAILABLE", [destination.cause]);
      continue;
    }
    m.currentNode = destination.id;
    m.visited.push(destination.id);
    m.cause = emit(
      w,
      "MESSAGE_HOP_RECEIVED",
      { messageId: m.id, nodeId: destination.id },
      [m.cause],
    );
    m.status = "QUEUED";
    m.hopDestination = undefined;
    m.hopEdge = undefined;
  }
  const used = new Map<string, number>();
  for (const m of active) {
    if (m.status !== "QUEUED") continue;
    if (m.currentNode === m.destination) {
      m.status = "DELIVERED";
      m.deliveredTick = w.tick;
      m.cause = emit(
        w,
        "MESSAGE_DELIVERED",
        {
          messageId: m.id,
          kind: m.kind,
          referenceId: m.referenceId,
          latency: w.tick - m.queuedTick,
          queueDelay: m.queueDelay,
        },
        [m.cause],
      );
      continue;
    }
    const avoid = m.visited.filter((id) => id !== m.currentNode),
      key = JSON.stringify([m.currentNode, m.destination, avoid]);
    if (!paths.has(key))
      paths.set(key, networkPath(w, m.currentNode, m.destination, avoid));
    const path = paths.get(key);
    if (!path?.length) {
      m.queueDelay++;
      continue;
    }
    const edge = net.edges.find((e) => e.id === path[0])!,
      next = edge.from === m.currentNode ? edge.to : edge.from;
    const endpoints = [m.currentNode, next].map(
        (id) => net.nodes.find((n) => n.id === id)!,
      ),
      degraded = endpoints.some((n) => n.status === "DEGRADED"),
      capacity = degraded
        ? Math.max(1, Math.floor(edge.capacity / 2))
        : edge.capacity;
    if ((used.get(edge.id) ?? 0) >= capacity) {
      m.queueDelay++;
      continue;
    }
    const nominalKey = `nominal:${key}`;
    if (!paths.has(nominalKey))
      paths.set(
        nominalKey,
        networkPath(w, m.currentNode, m.destination, avoid, true),
      );
    const nominalPath = paths.get(nominalKey),
      backupRoute = nominalPath?.join(",") !== path.join(",");
    const routeFaults = backupRoute
      ? (nominalPath ?? []).flatMap((id) => {
          const link = net.edges.find((e) => e.id === id)!;
          return net.nodes
            .filter(
              (n) =>
                [link.from, link.to].includes(n.id) && n.status !== "NORMAL",
            )
            .map((n) => n.cause);
        })
      : [];
    used.set(edge.id, (used.get(edge.id) ?? 0) + 1);
    m.transmittedTick ??= w.tick;
    m.status = "IN_TRANSIT";
    m.hopEdge = edge.id;
    m.hopDestination = next;
    m.arrivalTick = w.tick + edge.latency * (degraded ? 2 : 1);
    m.cause = emit(
      w,
      "MESSAGE_HOP_SENT",
      {
        messageId: m.id,
        edgeId: edge.id,
        from: m.currentNode,
        to: next,
        arrivalTick: m.arrivalTick,
        backupRoute,
      },
      [m.cause, ...endpoints.map((n) => n.cause), ...routeFaults],
    );
    if (
      new SeededRandom(w.seed, w.rng, `network:${m.id}`).chance(
        1 - edge.reliability * (degraded ? 0.9 : 1),
      )
    )
      lost(
        m,
        "LINK_LOSS",
        endpoints.map((n) => n.cause),
      );
  }
}
export function cleanupNetwork(w: WorldState): void {
  if (!w.network) return;
  // Completed transmissions remain in the immutable event ledger; checkpoints only need active packets.
  w.network.messages = w.network.messages.filter(
    (m) => m.status === "QUEUED" || m.status === "IN_TRANSIT",
  );
}
