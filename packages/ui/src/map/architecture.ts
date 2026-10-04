import { Container, Graphics, Text, Matrix } from "pixi.js";
import { PROJECTION, buildingDepth, groundFramePoint } from "./projection";
import type { CommandCenterView } from "../../../domain/src/index";
import {
  cityLayout,
  crossesRiver,
  RIVER,
  roofOffset,
  type Identity,
  type Mass,
} from "./city";
import { mapTheme as t, MAP_LAYERS as z, HEIGHTS, type Detail } from "./theme";

export function layer(parent: Container, order: number) {
  const result = new Container();
  result.zIndex = order;
  parent.addChild(result);
  return result;
}
export function screenFacing(object: Container, x: number, y: number) {
  const { a, b, c, d } = PROJECTION,
    det = a * d - b * c;
  object.setFromMatrix(new Matrix(d / det, -b / det, -c / det, a / det, x, y));
}
export function mapLabel(
  parent: Container,
  text: string,
  x: number,
  y: number,
  fill: number = t.label,
  size = 12,
) {
  const label = new Text({
    text,
    style: {
      fontFamily: "Segoe UI, Microsoft JhengHei",
      fontSize: size,
      fill,
      fontWeight: "bold",
      stroke: { color: t.labelPlate, width: 3 },
    },
  });
  screenFacing(label, x, y);
  label.eventMode = "none";
  parent.addChild(label);
  return label;
}
function shadow(g: Graphics, b: Mass) {
  const h = HEIGHTS[b.heightClass];
  g.poly([
    b.x,
    b.y,
    b.x + b.w,
    b.y,
    b.x + b.w + h * 0.55,
    b.y + b.d + h * 0.45,
    b.x + h * 0.55,
    b.y + b.d + h * 0.45,
  ]).fill({ color: t.shadow, alpha: 0.32 });
}
export function mass(g: Graphics, b: Mass, detail: Detail) {
  const { x: dx, y: dy } = roofOffset(b.heightClass),
    { x, y, w, d } = b;
  g.poly([
    x + w + dx,
    y + dy,
    x + w,
    y,
    x + w,
    y + d,
    x + w + dx,
    y + d + dy,
  ]).fill(t.right);
  g.poly([
    x + dx,
    y + d + dy,
    x + w + dx,
    y + d + dy,
    x + w,
    y + d,
    x,
    y + d,
  ]).fill(t.front);
  g.rect(x + dx, y + dy, w, d)
    .fill(b.roof)
    .stroke({ color: t.edge, width: 0.65, alpha: 0.65 });
  if (detail !== "FAR") {
    g.rect(x + dx + 3, y + dy + 3, w - 6, d - 6).stroke({
      color: t.front,
      width: 0.7,
      alpha: 0.5,
    });
    if (b.heightClass === "LOW")
      g.moveTo(x + dx + 3, y + dy + d / 2)
        .lineTo(x + w + dx - 3, y + dy + d / 2)
        .stroke({ color: t.edge, width: 0.6, alpha: 0.55 });
  }
  if (detail === "NEAR") {
    g.rect(x + dx + 4, y + dy + 4, 5, 4)
      .fill(t.front)
      .stroke({ color: t.edge, width: 0.5 });
    for (let k = 1; k < HEIGHTS[b.heightClass] / 5; k++) {
      const f = (k * 5) / HEIGHTS[b.heightClass];
      g.moveTo(x + dx * (1 - f), y + d + dy * (1 - f))
        .lineTo(x + w + dx * (1 - f), y + d + dy * (1 - f))
        .stroke({ color: t.edge, width: 0.5, alpha: 0.35 });
    }
  }
}

export function drawArchitecture(
  city: CommandCenterView["city"],
  identity: Identity,
  detail: Detail,
) {
  const root = new Container();
  const groundRoot = new Container();
  root.sortableChildren = true;
  groundRoot.sortableChildren = true;
  root.eventMode = "none";
  groundRoot.eventMode = "none";
  const layout = cityLayout(city, identity),
    nodes = new Map(city.nodes.map((n) => [n.id, n]));
  const graphics = (order: number) => {
    const g = new Graphics();
    layer(order <= z.bridges ? groundRoot : root, order).addChild(g);
    return g;
  };
  graphics(z.terrain).rect(0, 0, 800, 590).fill(t.terrain);
  const parcels = graphics(z.parcels);
  for (const p of layout.parcels) {
    parcels
      .roundRect(p.x + 2, p.y + 3, p.w, p.d, 2)
      .fill({ color: t.shadow, alpha: 0.5 });
    parcels
      .roundRect(p.x, p.y, p.w, p.d, 2)
      .fill(p.ground)
      .stroke({ color: t.curb, width: 1.3, alpha: 0.6 });
  }
  const water = graphics(z.water);
  water
    .poly(RIVER)
    .fill(t.water)
    .stroke({ color: t.bank, width: 5, alpha: 0.75 });
  water
    .poly([
      352, 0, 376, 0, 412, 170, 391, 320, 452, 590, 430, 590, 376, 320, 393,
      170,
    ])
    .fill({ color: t.waterDeep, alpha: 0.7 });
  for (let y = 35; y < 590; y += 45) {
    const x =
      y < 170
        ? 365 + y * 0.22
        : y < 320
          ? 403 - (y - 170) * 0.12
          : 385 + (y - 320) * 0.2;
    water
      .moveTo(x, y)
      .lineTo(x + 11, y + 8)
      .stroke({ color: t.bank, width: 1, alpha: 0.22 });
  }
  const roads = graphics(z.roads),
    bridgeShadow = graphics(z.bridgeShadows),
    bridges = graphics(z.bridges);
  for (const r of city.roads) {
    const a = nodes.get(r.from),
      b = nodes.get(r.to);
    if (!a || !b) continue;
    const arterial =
      (a.y === 290 && b.y === 290) || (a.x === 300 && b.x === 300);
    const collector = a.y === b.y;
    const width = arterial ? 15 : collector ? 12 : 10;
    roads
      .moveTo(a.x, a.y)
      .lineTo(b.x, b.y)
      .stroke({ color: t.roadEdge, width: width + 3 });
    roads.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: t.road, width });
    if (detail !== "FAR" || arterial)
      roads
        .moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ color: t.roadLine, width: 0.8, alpha: 0.5 });
    if (crossesRiver(a, b)) {
      bridgeShadow
        .moveTo(a.x + 4, a.y + 7)
        .lineTo(b.x + 4, b.y + 7)
        .stroke({ color: t.shadow, width: width + 9, alpha: 0.5 });
      bridges
        .moveTo(
          groundFramePoint(a.x, a.y, -5).x,
          groundFramePoint(a.x, a.y, -5).y,
        )
        .lineTo(
          groundFramePoint(b.x, b.y, -5).x,
          groundFramePoint(b.x, b.y, -5).y,
        )
        .stroke({ color: t.front, width: width + 6 });
      bridges
        .moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ color: t.edge, width: width + 4 });
      bridges
        .moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ color: t.road, width });
      bridges
        .moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ color: t.roadLine, width: 1 });
      for (const ratio of [0.3, 0.7]) {
        const x = a.x + (b.x - a.x) * ratio,
          y = a.y + (b.y - a.y) * ratio,
          foot = groundFramePoint(x, y, -12);
        bridges
          .moveTo(x, y)
          .lineTo(foot.x, foot.y)
          .stroke({ color: t.front, width: 4 });
      }
    }
  }
  const shadows = graphics(z.shadows),
    buildings = graphics(z.buildings);
  const jobs: { id: string; depth: number; draw: () => void }[] = [];
  for (const b of layout.masses) {
    shadow(shadows, b);
    jobs.push({
      id: b.id,
      depth: buildingDepth(b),
      draw: () => mass(buildings, b, detail),
    });
  }
  const landmarks = buildings,
    labels = layer(root, z.labels);
  const landmark = (id: string, nodeId: string, kind: string, name: string) => {
    const n = nodes.get(nodeId);
    if (!n) return;
    const roof =
      kind === "HOSPITAL"
        ? t.hospitalRoof
        : kind === "FIRE"
          ? t.fireRoof
          : t.roof;
    const b: Mass = {
      id,
      x: n.x + 24,
      y: n.y + 27,
      w: kind === "HOSPITAL" ? 38 : kind === "UTILITY" ? 38 : 28,
      d: kind === "HOSPITAL" ? 30 : 22,
      heightClass:
        kind === "HOSPITAL" ? "LANDMARK" : kind === "POLICE" ? "HIGH" : "MID",
      roof,
      district: n.district,
    };
    shadow(shadows, b);
    jobs.push({
      id,
      depth: buildingDepth({ ...b, d: b.d + 25 }),
      draw: () => {
        mass(landmarks, b, detail);
        const o = roofOffset(b.heightClass),
          x = b.x + o.x,
          y = b.y + o.y;
        if (kind === "HOSPITAL" || kind === "EMS") {
          if (kind === "HOSPITAL")
            mass(
              landmarks,
              {
                ...b,
                x: b.x - 12,
                y: b.y + 17,
                w: 21,
                d: 18,
                heightClass: "LOW",
                roof: t.hospitalWing,
              },
              detail,
            );
          landmarks
            .rect(x + b.w / 2 - 2, y + 5, 4, 14)
            .fill(t.hospital)
            .rect(x + b.w / 2 - 7, y + 10, 14, 4)
            .fill(t.hospital);
          landmarks
            .rect(n.x + 16, n.y + 48, 17, 5)
            .fill(t.roadEdge)
            .stroke({ color: t.hospital, width: 0.7 });
        } else if (kind === "COMMS") {
          landmarks
            .poly([n.x + 38, n.y + 34, n.x + 45, n.y - 11, n.x + 52, n.y + 34])
            .stroke({ color: t.edge, width: 1.5 });
          landmarks
            .moveTo(n.x + 38, n.y + 4)
            .lineTo(n.x + 52, n.y + 4)
            .moveTo(n.x + 36, n.y - 6)
            .lineTo(n.x + 54, n.y - 6)
            .stroke({ color: t.comms, width: 2 });
        } else if (kind === "POWER") {
          for (let k = 0; k < 3; k++)
            mass(
              landmarks,
              {
                ...b,
                x: b.x + k * 10,
                y: b.y + 20,
                w: 6,
                d: 10,
                heightClass: "LOW",
                roof: t.utility,
              },
              detail,
            );
          landmarks
            .moveTo(x + 5, y + 3)
            .lineTo(x + 11, y + 9)
            .lineTo(x + 6, y + 15)
            .stroke({ color: t.utility, width: 2 });
        } else if (kind === "FIRE") {
          for (let k = 0; k < 3; k++)
            landmarks.rect(b.x + k * 8 + 3, b.y + b.d - 5, 5, 5).fill(t.fire);
        } else if (kind === "POLICE") {
          landmarks
            .poly([
              x + 13,
              y + 5,
              x + 20,
              y + 8,
              x + 17,
              y + 17,
              x + 13,
              y + 20,
              x + 9,
              y + 17,
              x + 6,
              y + 8,
            ])
            .fill(t.police);
        } else if (kind === "UTILITY") {
          landmarks
            .rect(b.x + 1, b.y + b.d + 3, 32, 9)
            .stroke({ color: t.utility, width: 1 });
        }
      },
    });
    if (detail !== "FAR")
      mapLabel(
        labels,
        kind === "HOSPITAL" ? id : name,
        n.x + 19,
        n.y + 61,
        t.label,
        9,
      );
  };
  for (const h of city.hospitals) landmark(h.id, h.nodeId, "HOSPITAL", h.id);
  for (const f of city.facilities) landmark(f.id, f.nodeId, f.type, f.name);
  // Public communications geography, with no operational condition encoded.
  for (const net of city.communicationNodes ?? []) {
    if (
      city.facilities.some((f) => f.type === "COMMS" && f.nodeId === net.nodeId)
    )
      continue;
    const n = nodes.get(net.nodeId);
    if (!n) continue;
    jobs.push({
      id: net.id,
      depth: buildingDepth({ x: n.x + 31, y: n.y + 8, w: 10, d: 0 }),
      draw: () => {
        const top = groundFramePoint(n.x + 36, n.y + 8, 28),
          cross = groundFramePoint(n.x + 36, n.y + 8, 21);
        landmarks
          .moveTo(n.x + 31, n.y + 8)
          .lineTo(top.x, top.y)
          .lineTo(n.x + 41, n.y + 8)
          .moveTo(cross.x - 6, cross.y)
          .lineTo(cross.x + 6, cross.y)
          .stroke({ color: t.comms, width: 1, alpha: 0.6 });
      },
    });
  }
  const civic: Mass = {
    id: "visual-city-hall",
    x: 656,
    y: 447,
    w: 43,
    d: 30,
    heightClass: "LANDMARK",
    roof: t.civicRoof,
    district: "D",
  };
  shadow(shadows, civic);
  jobs.push({
    id: civic.id,
    depth: buildingDepth(civic),
    draw: () => {
      mass(landmarks, civic, detail);
      const offset = roofOffset("LANDMARK");
      landmarks
        .poly([
          civic.x + offset.x - 3,
          civic.y + offset.y + 8,
          civic.x + offset.x + 21,
          civic.y + offset.y - 2,
          civic.x + offset.x + 46,
          civic.y + offset.y + 8,
        ])
        .fill(t.edge);
      for (let k = 0; k < 5; k++)
        landmarks
          .rect(civic.x + 4 + k * 8, civic.y + civic.d - 10, 3, 10)
          .fill(t.edge);
    },
  });
  for (const job of jobs.sort(
    (a, b) => a.depth - b.depth || a.id.localeCompare(b.id),
  ))
    job.draw();
  mapLabel(labels, "市政中心", 648, 484, t.label, 10);
  for (const d of city.districts)
    mapLabel(labels, d.name, d.x, d.y + 30, t.label, 16);
  mapLabel(labels, "臨 江", 370, 310, t.waterLabel, 12);
  // The first measured geometry-only scene issued 23 draw calls at T0.
  // Flatten public static geometry once per layout/LOD, not per report or camera pan.
  root.cacheAsTexture({
    resolution: detail === "NEAR" ? 2 : detail === "MEDIUM" ? 1.25 : 1,
    antialias: false,
  });
  groundRoot.cacheAsTexture({
    resolution: detail === "NEAR" ? 2 : detail === "MEDIUM" ? 1.25 : 1,
    antialias: false,
  });
  return { root, groundRoot, key: layout.key, detail };
}
