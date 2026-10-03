import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Text, Polygon } from "pixi.js";
import "pixi.js/unsafe-eval";
import { ZoomIn, ZoomOut, LocateFixed } from "lucide-react";
import type { CommandCenterView } from "../../domain/src/index";
import { useUI, type Layer } from "./store";
import { color, incidentNames } from "./labels";
import { drawArchitecture, layer, mapLabel } from "./map/architecture";
import { cityKey, type Identity } from "./map/city";
import { detailForScale, MAP_LAYERS, mapTheme, type Detail } from "./map/theme";
import {
  positionedUnits,
  floodAppearance,
  incidentCallouts,
} from "./map/knowledge";
import { cameraPosition, invalidator } from "./map/camera";
const layerNames: Record<Layer, string> = {
  INCIDENTS: "事件",
  UNITS: "單位",
  MEDICAL: "醫療",
  POWER: "電力",
  COMMS: "通訊",
  TRAFFIC: "道路",
  FLOOD: "淹水",
  CIVILIANS: "居民",
  INTELLIGENCE: "情報",
};
interface MapProps {
  view: CommandCenterView;
  identity: Identity;
}
export function SituationMap({ view, identity }: MapProps) {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<{
      app: Application;
      scene: Container;
      content: Container;
      architecture?: ReturnType<typeof drawArchitecture>;
      staticHost: Container;
      publicCity: CommandCenterView["city"];
      identity: Identity;
      invalidation: ReturnType<typeof invalidator>;
      base: number;
      zoom: number;
      pan: { x: number; y: number };
    } | null>(null);
  const [ready, setReady] = useState(0),
    [hover, setHover] = useState("拖曳平移 · 滾輪縮放 · 點選事件或單位");
  const selected = useUI((s) => s.selected),
    select = useUI((s) => s.select),
    layers = useUI((s) => s.layers),
    toggle = useUI((s) => s.toggleLayer);
  const refreshArchitecture = (
    e: NonNullable<typeof engine.current>,
    detail: Detail,
  ) => {
    const key = cityKey(e.publicCity, e.identity);
    if (e.architecture?.key === key && e.architecture.detail === detail) return;
    e.architecture?.root.destroy({ children: true });
    e.architecture = drawArchitecture(e.publicCity, e.identity, detail);
    e.staticHost.addChild(e.architecture.root);
  };
  const transform = () => {
    const e = engine.current;
    if (!e) return;
    e.scene.scale.set(e.base * e.zoom);
    const position = cameraPosition(
      e.app.screen.width,
      e.app.screen.height,
      e.base * e.zoom,
      e.pan,
    );
    e.scene.position.set(position.x, position.y);
    refreshArchitecture(e, detailForScale(e.base * e.zoom));
    e.invalidation.request();
  };
  const zoom = (factor: number) => {
    const e = engine.current;
    if (e) {
      e.zoom = Math.max(0.65, Math.min(3, e.zoom * factor));
      transform();
    }
  };
  useEffect(() => {
    let disposed = false;
    const app = new Application();
    const element = host.current!;
    const init = async () => {
      await app.init({
        // The map has no time-based animation. Render when its view or camera changes
        // instead of competing with replay validation on software-rendering hosts.
        autoStart: false,
        background: "#121a22",
        resizeTo: element,
        antialias: true,
        resolution: window.devicePixelRatio,
        autoDensity: true,
      });
      if (disposed) {
        app.destroy(true);
        return;
      }
      element.appendChild(app.canvas);
      const scene = new Container(),
        content = new Container();
      const staticHost = new Container();
      scene.addChild(staticHost, content);
      content.sortableChildren = true;
      app.stage.addChild(scene);
      engine.current = {
        app,
        scene,
        content,
        staticHost,
        publicCity: view.city,
        identity,
        invalidation: invalidator(
          requestAnimationFrame,
          cancelAnimationFrame,
          () => app.render(),
        ),
        base: Math.min(element.clientWidth / 800, element.clientHeight / 590),
        zoom: 1,
        pan: { x: 0, y: 0 },
      };
      transform();
      setReady((n) => n + 1);
    };
    void init().catch((error) => {
      console.error("Map initialization failed", error);
      setHover(
        `地圖無法載入：${error instanceof Error ? error.message : String(error)}`,
      );
    });
    const resize = new ResizeObserver(() => {
      const e = engine.current;
      if (e) {
        e.base = Math.min(
          element.clientWidth / 800,
          element.clientHeight / 590,
        );
        e.app.renderer.resize(element.clientWidth, element.clientHeight);
        transform();
      }
    });
    resize.observe(element);
    let last: { x: number; y: number } | undefined;
    const down = (e: PointerEvent) => {
      if (e.button === 0) last = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (last && engine.current && e.buttons) {
        engine.current.pan.x += e.clientX - last.x;
        engine.current.pan.y += e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        transform();
      }
    };
    const up = () => {
      last = undefined;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    element.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      disposed = true;
      resize.disconnect();
      element.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      element.removeEventListener("wheel", wheel);
      if (engine.current?.app === app) {
        engine.current.invalidation.dispose();
        engine.current = null;
        app.destroy(true, { children: true });
      }
    };
    // Initialization intentionally independent of live view updates.
  }, []);
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    e.content
      .removeChildren()
      .forEach((child) => child.destroy({ children: true }));
    e.publicCity = view.city;
    e.identity = identity;
    refreshArchitecture(e, detailForScale(e.base * e.zoom));
    const floodLayer = layer(e.content, MAP_LAYERS.flood);
    const infrastructure = layer(e.content, MAP_LAYERS.infrastructure);
    const ground = layer(e.content, MAP_LAYERS.incidentGround);
    const routeLayer = layer(e.content, MAP_LAYERS.routes);
    const unitsLayer = layer(e.content, MAP_LAYERS.units);
    const callouts = layer(e.content, MAP_LAYERS.callouts);
    const labels = layer(e.content, MAP_LAYERS.labels);
    const selectionLayer = layer(e.content, MAP_LAYERS.selection);
    const g = new Graphics();
    infrastructure.addChild(g);
    const label = (
      text: string,
      x: number,
      y: number,
      fill: number = mapTheme.label,
      size = 13,
      weight: "normal" | "bold" = "normal",
    ) => {
      const result = mapLabel(labels, text, x, y, fill, size);
      result.style.fontWeight = weight;
      return result;
    };
    const nodes = new Map(view.city.nodes.map((n) => [n.id, n]));
    for (const r of view.city.roads) {
      const a = nodes.get(r.from)!,
        b = nodes.get(r.to)!,
        known = view.beliefs.find(
          (k) => k.kind === "ROAD" && k.subjectId === r.id,
        );
      const blocked =
        layers.includes("TRAFFIC") && known?.claim.value === "BLOCKED";
      if (
        blocked ||
        (layers.includes("TRAFFIC") && known?.claim.value === "DEGRADED")
      ) {
        g.moveTo(a.x, a.y)
          .lineTo(b.x, b.y)
          .stroke({
            color: blocked ? mapTheme.blocked : mapTheme.degraded,
            width: 4,
            alpha: 0.95,
          });
      }
      if (blocked)
        label(
          "×",
          (a.x + b.x) / 2 - 6,
          (a.y + b.y) / 2 - 11,
          0xf8a374,
          22,
          "bold",
        );
    }
    if (layers.includes("FLOOD"))
      for (const zone of view.city.floodZones ?? []) {
        const points = zone.nodeIds.map((id) => nodes.get(id)!).filter(Boolean),
          belief = view.beliefs.find(
            (b) => b.kind === "FLOOD" && b.subjectId === zone.id,
          );
        if (!points.length) continue;
        const left = Math.min(...points.map((n) => n.x)) - 18,
          top = Math.min(...points.map((n) => n.y)) - 18,
          depth = belief?.claim.estimatedDepth;
        const overlay = new Graphics();
        for (const node of points)
          overlay
            .roundRect(node.x - 40, node.y - 40, 80, 80, 4)
            .fill({
              ...floodAppearance(depth),
            })
            .stroke({
              color: belief?.stale ? 0xc9b47b : 0x648aa4,
              width: 1,
              alpha: 0.5,
            });
        overlay.eventMode = "static";
        overlay.cursor = "pointer";
        overlay.on("pointertap", () => select(zone.id));
        overlay.on("pointerover", () =>
          setHover(
            belief
              ? `${zone.id} · 估計 ${depth?.toFixed(2) ?? "未知"}m · ${belief.age}秒前 · 信心 ${Math.round(belief.confidence * 100)}%${belief.stale ? " · 過時" : ""}`
              : `${zone.id} · 水深未知，尚無已接收觀測`,
          ),
        );
        floodLayer.addChild(overlay);
        label(
          `${zone.id} ${depth === undefined ? "未知" : `約 ${depth.toFixed(1)}m`}${belief?.stale ? " *" : ""}`,
          left + 8,
          top + 4,
          0x9ec7de,
          11,
        );
      }
    if (layers.includes("CIVILIANS")) {
      for (const shelter of view.city.shelters ?? []) {
        const n = nodes.get(shelter.nodeId)!;
        g.poly([n.x - 6, n.y + 22, n.x, n.y + 12, n.x + 6, n.y + 22]).fill(
          0x89ad92,
        );
        label(shelter.id, n.x + 8, n.y + 12, 0x89ad92, 9);
      }
      for (const b of view.beliefs.filter((b) => b.kind === "CIVILIANS")) {
        const n = nodes.get(b.claim.nodeId ?? "");
        if (!n) continue;
        const risk = (b.claim.estimatedCritical ?? 0) > 0;
        g.circle(n.x + 22, n.y + 22, 11).fill({
          color: risk ? 0xce9867 : 0x90ad8d,
          alpha: b.stale ? 0.3 : 0.6,
        });
        const marker = new Graphics()
          .circle(n.x + 22, n.y + 22, 14)
          .fill({ color: 0xffffff, alpha: 0.001 });
        marker.eventMode = "static";
        marker.cursor = "pointer";
        marker.on("pointertap", () => select(b.subjectId));
        marker.on("pointerover", () =>
          setHover(
            `${b.subjectId} · 估計居民 ${b.claim.estimatedPopulation ?? "未知"} · 危重 ${b.claim.estimatedCritical ?? "未知"} · ${b.age}秒前`,
          ),
        );
        infrastructure.addChild(marker);
      }
    }
    if (layers.includes("COMMS"))
      for (const [index, net] of (
        view.city.communicationNodes ?? []
      ).entries()) {
        const n = nodes.get(net.nodeId)!,
          b = view.beliefs.find(
            (b) =>
              b.kind === "COMMS" &&
              (b.subjectId === net.id ||
                (net.role === "REPEATER" && b.subjectId === "RAD")),
          ),
          x = n.x + 30 + (index % 2) * 15,
          y = n.y - 10;
        const marker = new Graphics().circle(x, y, 5).stroke({
          color: b
            ? b.claim.value === "DOWN"
              ? 0xe89377
              : 0x96bac9
            : 0x647582,
          width: 1.4,
        });
        marker.eventMode = "static";
        marker.cursor = "pointer";
        marker.on("pointertap", () => select(b?.subjectId ?? net.id));
        marker.on("pointerover", () =>
          setHover(
            `${net.id} · ${net.role} · ${b ? `回報 ${b.claim.value} · ${b.age}秒前` : "狀態未知"}`,
          ),
        );
        infrastructure.addChild(marker);
      }
    for (const h of view.city.hospitals)
      if (layers.includes("MEDICAL")) {
        const n = nodes.get(h.nodeId)!;
        const hospitalBelief = view.beliefs.find(
          (b) => b.kind === "HOSPITAL" && b.subjectId === h.id,
        );
        const marker = new Container();
        marker.position.set(n.x, n.y);
        const icon = new Graphics()
          .roundRect(-14, -14, 28, 28, 3)
          .fill(0x263944)
          .stroke({ color: 0xd98686, width: 1.3 })
          .rect(-3, -9, 6, 18)
          .fill(0xe9aaaa)
          .rect(-9, -3, 18, 6)
          .fill(0xe9aaaa);
        marker.addChild(icon);
        marker.eventMode = "static";
        marker.cursor = "pointer";
        marker.on("pointertap", () => select(h.id));
        marker.on("pointerover", () =>
          setHover(
            `${h.id} · ${hospitalBelief?.claim.value ?? "狀態未知"}${hospitalBelief ? ` · ${hospitalBelief.age}秒前` : ""}`,
          ),
        );
        infrastructure.addChild(marker);
        label(
          h.id +
            (hospitalBelief?.claim.hospitalStatus &&
            hospitalBelief.claim.hospitalStatus !== "NORMAL"
              ? " !"
              : "") +
            (selected === h.id ? " ◂" : ""),
          n.x + 19,
          n.y - 10,
          0xe5b4b4,
          12,
          "bold",
        );
      }
    for (const f of view.city.facilities) {
      if (
        (f.type === "POWER" && !layers.includes("POWER")) ||
        (f.type === "COMMS" && !layers.includes("COMMS"))
      )
        continue;
      const n = nodes.get(f.nodeId)!;
      const c = color[f.type] ?? 0x85a5bc;
      g.roundRect(n.x - 10, n.y - 10, 20, 20, 3)
        .fill(0x1b2731)
        .stroke({ color: c, width: 1.5 });
      label(
        f.type === "POWER" ? "P" : f.type === "COMMS" ? "R" : f.type[0],
        n.x - 5,
        n.y - 9,
        c,
        12,
        "bold",
      );
      label(f.name, n.x - 32, n.y + 16, 0x8da2b2, 10);
      if (f.type === "POWER" || f.type === "COMMS") {
        const hit = new Graphics()
          .circle(n.x, n.y, 17)
          .fill({ color: 0xffffff, alpha: 0.001 });
        hit.eventMode = "static";
        hit.cursor = "pointer";
        hit.on("pointertap", () => select(f.id));
        infrastructure.addChild(hit);
      }
    }
    const calloutPositions = incidentCallouts(view);
    if (layers.includes("INCIDENTS"))
      for (const b of view.beliefs.filter((b) => b.kind === "INCIDENT")) {
        const n = nodes.get(b.claim.nodeId!)!;
        if (!n) continue;
        const c = b.claim.value === "已解除" ? 0x7fa18b : 0xe58b54;
        const marker = new Container();
        const callout = calloutPositions.get(b.subjectId)!;
        marker.position.set(callout.x, callout.y);
        const anchor = new Graphics()
          .circle(n.x, n.y, 10)
          .stroke({ color: c, width: 2, alpha: 0.9 })
          .moveTo(n.x, n.y - 10)
          .lineTo(callout.x, callout.y + 17)
          .stroke({ color: c, width: 1.3 });
        ground.addChild(anchor);
        if (b.claim.value !== "已解除" && b.claim.incidentType === "FIRE") {
          anchor
            .circle(n.x + 5, n.y - 5, 6)
            .fill({ color: c, alpha: 0.25 })
            .ellipse(n.x + 8, n.y - 15, 5, 9)
            .fill({ color: mapTheme.smoke, alpha: 0.32 });
        }
        if (
          b.claim.value !== "已解除" &&
          b.claim.incidentType === "BUILDING_COLLAPSE"
        ) {
          for (let k = 0; k < 4; k++)
            anchor
              .poly([
                n.x - 8 + k * 5,
                n.y + 4,
                n.x - 6 + k * 5,
                n.y - 2 - (k % 2) * 3,
                n.x - 3 + k * 5,
                n.y + 5,
              ])
              .fill({ color: mapTheme.roof, alpha: 0.85 });
        }
        marker.addChild(
          new Graphics()
            .roundRect(-13, -13, 93, 30, 3)
            .fill({ color: 0x151d25, alpha: 0.95 })
            .stroke({
              color: selected === b.subjectId ? 0xf5c090 : c,
              width: selected === b.subjectId ? 2 : 1,
            })
            .poly([-5, 7, 3, -7, 11, 7])
            .fill(c),
        );
        const text = new Text({
          text: `${b.subjectId}\n${incidentNames[b.claim.incidentType!] ?? b.claim.value}`,
          style: {
            fontFamily: "Segoe UI, Microsoft JhengHei",
            fontSize: 10,
            fill: c,
            lineHeight: 13,
          },
        });
        text.position.set(18, -10);
        marker.addChild(text);
        marker.eventMode = "static";
        marker.cursor = "pointer";
        marker.on("pointertap", () => select(b.subjectId));
        marker.on("pointerover", () =>
          setHover(
            `${b.subjectId} · ${b.claim.value} · 觀察距今 ${b.age}秒 · 信心 ${Math.round(b.confidence * 100)}%`,
          ),
        );
        callouts.addChild(marker);
        if (layers.includes("INTELLIGENCE") && b.stale)
          label("過時", n.x + 43, n.y - 40, 0xdac17b, 10);
      }
    if (layers.includes("UNITS")) {
      const groups = positionedUnits(view);
      for (const [nodeId, units] of groups) {
        const n = nodes.get(nodeId)!;
        for (const [index, u] of units.entries()) {
          const x = n.x - 16 + (index % 4) * 11,
            y = n.y + 31 + Math.floor(index / 4) * 11;
          const marker = new Graphics()
            .roundRect(x - 5, y - 4, 11, 8, 2)
            .fill(mapTheme.shadow)
            .roundRect(x - 5, y - 7, 10, 7, 2)
            .fill(color[u.agency])
            .stroke({ color: mapTheme.edge, width: 0.7 })
            .rect(x + 1, y - 6, 2, 4)
            .fill(mapTheme.front);
          if (selected === u.id)
            selectionLayer.addChild(
              new Graphics()
                .circle(x, y - 3, 9)
                .stroke({ color: mapTheme.route, width: 1.5 }),
            );
          marker.eventMode = "static";
          marker.cursor = "pointer";
          marker.on("pointertap", () => select(u.id));
          marker.on("pointerover", () =>
            setHover(
              `${u.id} · 回報位置 ${n.name} · 情報距今 ${u.belief!.age}秒`,
            ),
          );
          unitsLayer.addChild(marker);
          if (selected === u.id) {
            label(u.id, x + 9, y - 7, 0xc2def3, 12, "bold");
            let last = n;
            for (const id of u.belief!.claim.route ?? []) {
              const next = nodes.get(id)!;
              if (!next) continue;
              const route = new Graphics()
                .moveTo(last.x, last.y)
                .lineTo(next.x, next.y)
                .stroke({ color: mapTheme.shadow, width: 6 })
                .moveTo(last.x, last.y)
                .lineTo(next.x, next.y)
                .stroke({ color: mapTheme.route, width: 3, alpha: 0.95 });
              const dx = next.x - last.x,
                dy = next.y - last.y,
                len = Math.hypot(dx, dy);
              if (len) {
                const mx = (last.x + next.x) / 2,
                  my = (last.y + next.y) / 2,
                  ux = dx / len,
                  uy = dy / len;
                route
                  .poly([
                    mx + ux * 6,
                    my + uy * 6,
                    mx - ux * 4 - uy * 4,
                    my - uy * 4 + ux * 4,
                    mx - ux * 4 + uy * 4,
                    my - uy * 4 - ux * 4,
                  ])
                  .fill(mapTheme.route);
                route.hitArea = new Polygon([
                  last.x - uy * 7,
                  last.y + ux * 7,
                  next.x - uy * 7,
                  next.y + ux * 7,
                  next.x + uy * 7,
                  next.y - ux * 7,
                  last.x + uy * 7,
                  last.y - ux * 7,
                ]);
                route.eventMode = "static";
                const routeLabel = `${u.id} · 已回報路線 ${last.name} → ${next.name}`;
                route.on("pointerover", () => setHover(routeLabel));
              }
              routeLayer.addChild(route);
              last = next;
            }
            if (u.belief!.claim.route?.length)
              routeLayer.addChild(
                new Graphics()
                  .circle(last.x, last.y, 7)
                  .stroke({ color: mapTheme.route, width: 2 }),
              );
          }
        }
      }
    }
    e.invalidation.request();
  }, [view, identity.id, identity.version, selected, layers, select, ready]);
  return (
    <section className="map-panel">
      <div className="panel-title">
        <h2>態勢地圖</h2>
        <span className="muted">已接收情報</span>
        <span className="map-city">臨江市</span>
      </div>
      <div className="layers">
        {(Object.keys(layerNames) as Layer[]).map((l) => (
          <button
            key={l}
            className={layers.includes(l) ? "active" : ""}
            aria-pressed={layers.includes(l)}
            onClick={() => toggle(l)}
          >
            {layerNames[l]}
          </button>
        ))}
      </div>
      <div className="map-host" ref={host} aria-label="城市態勢地圖" />
      <div className="map-zoom">
        <button
          title="放大地圖"
          aria-label="放大地圖"
          onClick={() => zoom(1.2)}
        >
          <ZoomIn size={16} />
        </button>
        <button
          title="縮小地圖"
          aria-label="縮小地圖"
          onClick={() => zoom(1 / 1.2)}
        >
          <ZoomOut size={16} />
        </button>
        <button
          title="重設地圖"
          aria-label="重設地圖"
          onClick={() => {
            const e = engine.current;
            if (e) {
              e.zoom = 1;
              e.pan = { x: 0, y: 0 };
              transform();
            }
          }}
        >
          <LocateFixed size={16} />
        </button>
      </div>
      <div className="map-footer">
        <span>{hover}</span>
        <span>△ 事件　● 單位　＋ 醫院</span>
      </div>
    </section>
  );
}
