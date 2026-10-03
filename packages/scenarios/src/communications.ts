import type { Scenario, CommunicationConfig } from "../../domain/src/index";
export function communicationConfig(s: Scenario): CommunicationConfig {
  const zones =
    s.flood?.zones.map((z) => ({
      id: z.id,
      nodeId: z.nodeIds[0],
      nodeIds: z.nodeIds,
    })) ??
    s.districts.map((d) => ({
      id: d.id,
      nodeId: s.nodes.find((n) => n.district === d.id)!.id,
      nodeIds: s.nodes.filter((n) => n.district === d.id).map((n) => n.id),
    }));
  const nodes: CommunicationConfig["nodes"] = [
    {
      id: "NET-DC",
      nodeId: "N34",
      role: "DISPATCH",
      powerDependency: "INDEPENDENT",
      backupCapacity: 0,
      backupFuel: 0,
      status: "NORMAL",
    },
    {
      id: "NET-RAD",
      nodeId: "N10",
      role: "REPEATER",
      powerDependency: "GRID",
      backupCapacity: 120,
      backupFuel: 120,
      status: "NORMAL",
    },
    {
      id: "NET-CELL",
      nodeId: "N18",
      role: "CELL",
      powerDependency: "GRID",
      backupCapacity: 180,
      backupFuel: 180,
      floodLimit: 0.8,
      status: "NORMAL",
    },
    ...(["FIRE", "EMS", "POLICE", "UTILITY"] as const).map((agency) => ({
      id: `NET-${agency}`,
      nodeId: s.units.find((u) => u.agency === agency)!.homeId,
      role: "AGENCY" as const,
      powerDependency: "INDEPENDENT" as const,
      backupCapacity: 0,
      backupFuel: 0,
      status: "NORMAL" as const,
    })),
    ...s.hospitals.map((h) => ({
      id: `NET-${h.id}`,
      nodeId: h.nodeId,
      role: "HOSPITAL" as const,
      powerDependency: "HOSPITAL" as const,
      hospitalId: h.id,
      backupCapacity: 0,
      backupFuel: 0,
      status: "NORMAL" as const,
    })),
    ...zones.map((z) => ({
      id: `NET-Z-${z.id}`,
      nodeId: z.nodeId,
      role: "ZONE" as const,
      powerDependency: "GRID" as const,
      backupCapacity: 900,
      backupFuel: 900,
      status: "NORMAL" as const,
    })),
  ];
  const edges: CommunicationConfig["edges"] = [];
  const link = (
    from: string,
    to: string,
    latency: number,
    capacity: number,
    reliability: number,
  ) =>
    edges.push({
      id: `LINK-${edges.length + 1}`,
      from,
      to,
      latency,
      capacity,
      reliability,
    });
  link("NET-DC", "NET-RAD", 4, 2, 0.99);
  link("NET-DC", "NET-CELL", 8, 2, 0.98);
  for (const agency of ["FIRE", "EMS", "POLICE", "UTILITY"])
    link("NET-RAD", `NET-${agency}`, 5, 2, 0.99);
  // Independent narrow backup circuits remain usable after the shared repeater loses power.
  link("NET-DC", "NET-EMS", 16, 1, 0.98);
  link("NET-DC", "NET-UTILITY", 22, 1, 0.97);
  link("NET-EMS", "NET-POLICE", 12, 1, 0.97);
  link("NET-UTILITY", "NET-FIRE", 14, 1, 0.96);
  for (const h of s.hospitals) {
    link(`NET-${h.id}`, "NET-RAD", 6, 1, 0.98);
    link(`NET-${h.id}`, "NET-EMS", 18, 1, 0.97);
  }
  for (const z of zones) {
    link(`NET-Z-${z.id}`, "NET-CELL", 7, 2, 0.96);
    link(`NET-Z-${z.id}`, "NET-POLICE", 20, 1, 0.94);
  }
  const sources: CommunicationConfig["sources"] = [];
  const add = (
    id: string,
    endpoint: string,
    nodeId: string,
    capabilities: CommunicationConfig["sources"][number]["capabilities"],
    reliability: number,
    confidence: [number, number],
    incidentTypes?: CommunicationConfig["sources"][number]["incidentTypes"],
  ) =>
    sources.push({
      id,
      endpoint,
      nodeId,
      capabilities,
      reliability,
      confidence,
      ...(incidentTypes ? { incidentTypes } : {}),
    });
  for (const unit of s.units)
    add(
      unit.id,
      `NET-${unit.agency}`,
      unit.homeId,
      ["UNIT", "INCIDENT"],
      0.94,
      [0.78, 0.96],
    );
  for (const node of s.nodes) {
    const zone = zones.find((z) => z.nodeIds.includes(node.id))!;
    add(
      `CIV-${node.id}`,
      `NET-Z-${zone.id}`,
      node.id,
      ["INCIDENT", "CIVILIANS"],
      0.6,
      [0.45, 0.65],
    );
    add(
      `FD-OBSERVER-${node.id}`,
      "NET-FIRE",
      node.id,
      ["INCIDENT"],
      0.91,
      [0.75, 0.92],
      ["FIRE", "BUILDING_COLLAPSE", "ROAD_BLOCKAGE"],
    );
  }
  for (const zone of zones) {
    add(
      `CIV-${zone.id}`,
      `NET-Z-${zone.id}`,
      zone.nodeId,
      ["FLOOD", "CIVILIANS"],
      0.6,
      [0.45, 0.65],
    );
    if (s.flood)
      add(
        `SENSOR-${zone.id}`,
        `NET-Z-${zone.id}`,
        zone.nodeId,
        ["FLOOD"],
        0.97,
        [0.86, 0.97],
      );
  }
  for (const h of s.hospitals)
    add(h.id, `NET-${h.id}`, h.nodeId, ["HOSPITAL"], 0.97, [0.86, 0.97]);
  add("UTILITY-CONTROL", "NET-UTILITY", "N18", ["POWER"], 0.96, [0.82, 0.97]);
  add("RADIO-CONTROL", "NET-RAD", "N10", ["COMMS"], 0.96, [0.82, 0.97]);
  add("TRAFFIC-CONTROL", "NET-POLICE", "N34", ["ROAD"], 0.88, [0.72, 0.9]);
  return { nodes, edges, sources, dispatchNode: "NET-DC", maxMessageAge: 450 };
}
