import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import "pixi.js/unsafe-eval";
import { ZoomIn, ZoomOut, LocateFixed } from "lucide-react";
import type { CommandCenterView } from "../../domain/src/index";
import { useUI, type Layer } from "./store";
import { color, incidentNames } from "./labels";
const layerNames: Record<Layer, string> = {
  INCIDENTS: "事件",
  UNITS: "單位",
  MEDICAL: "醫療",
  POWER: "電力",
  COMMS: "通訊",
  TRAFFIC: "道路",
  INTELLIGENCE: "情報",
};
interface MapProps {
  view: CommandCenterView;
}
export function SituationMap({ view }: MapProps) {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<{
      app: Application;
      scene: Container;
      content: Container;
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
  const transform = () => {
    const e = engine.current;
    if (!e) return;
    e.scene.scale.set(e.base * e.zoom);
    e.scene.position.set(
      (e.app.screen.width - 800 * e.base * e.zoom) / 2 + e.pan.x,
      (e.app.screen.height - 590 * e.base * e.zoom) / 2 + e.pan.y,
    );
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
      scene.addChild(content);
      app.stage.addChild(scene);
      engine.current = {
        app,
        scene,
        content,
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
    const g = new Graphics();
    e.content.addChild(g);
    // Public cartography, generated only from static city topology.
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 6; col++) {
        const x = 91 + col * 110,
          y = 71 + row * 115;
        g.rect(x, y, 88, 91).fill({
          color: (row + col) % 3 === 0 ? 0x192b2a : 0x1d2933,
        });
        for (let a = 0; a < 3; a++)
          for (let b = 0; b < 3; b++)
            g.rect(
              x + 6 + a * 27,
              y + 6 + b * 29,
              17 + ((a + row) % 6),
              18 + ((b + col) % 7),
            )
              .fill(0x283641)
              .stroke({ color: 0x33434e, width: 0.7 });
      }
    g.poly([
      345, 0, 382, 0, 421, 170, 401, 320, 461, 590, 418, 590, 361, 320, 382,
      170,
    ]).fill(0x1c3546);
    const label = (
      text: string,
      x: number,
      y: number,
      fill = 0x93a5b4,
      size = 13,
      weight: "normal" | "bold" = "normal",
    ) => {
      const t = new Text({
        text,
        style: {
          fontFamily: "Segoe UI, Microsoft JhengHei",
          fontSize: size,
          fill,
          fontWeight: weight,
        },
      });
      t.position.set(x, y);
      e.content.addChild(t);
      return t;
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
      g.moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ color: 0x293945, width: 12 });
      g.moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({
          color: blocked ? 0xc77e50 : 0x65727b,
          width: blocked ? 4 : 1.3,
          alpha: blocked ? 0.85 : 0.65,
        });
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
    for (const d of view.city.districts)
      label(d.name, d.x, d.y + 30, 0x8596a4, 19, "bold");
    label("臨 江", 370, 300, 0x7da2b8, 14);
    for (const h of view.city.hospitals)
      if (layers.includes("MEDICAL")) {
        const n = nodes.get(h.nodeId)!;
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
        e.content.addChild(marker);
        label(
          h.id + (selected === h.id ? " ◂" : ""),
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
        e.content.addChild(hit);
      }
    }
    if (layers.includes("INCIDENTS"))
      for (const b of view.beliefs.filter((b) => b.kind === "INCIDENT")) {
        const n = nodes.get(b.claim.nodeId!)!;
        if (!n) continue;
        const c = b.claim.value === "已解除" ? 0x7fa18b : 0xe58b54;
        const marker = new Container();
        marker.position.set(n.x, n.y - 23);
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
        e.content.addChild(marker);
        if (layers.includes("INTELLIGENCE") && b.stale)
          label("過時", n.x + 43, n.y - 40, 0xdac17b, 10);
      }
    if (layers.includes("UNITS")) {
      const groups = new Map<string, typeof view.units>();
      for (const u of view.units) {
        const nodeId = u.belief?.claim.nodeId;
        if (nodeId) groups.set(nodeId, [...(groups.get(nodeId) ?? []), u]);
      }
      for (const [nodeId, units] of groups) {
        const n = nodes.get(nodeId)!;
        for (const [index, u] of units.entries()) {
          const x = n.x - 16 + (index % 4) * 11,
            y = n.y + 31 + Math.floor(index / 4) * 11;
          const marker = new Graphics()
            .circle(x, y, selected === u.id ? 7 : 4)
            .fill(color[u.agency])
            .stroke({ color: 0x182028, width: 1 });
          marker.eventMode = "static";
          marker.cursor = "pointer";
          marker.on("pointertap", () => select(u.id));
          marker.on("pointerover", () =>
            setHover(
              `${u.id} · 回報位置 ${n.name} · 情報距今 ${u.belief!.age}秒`,
            ),
          );
          e.content.addChild(marker);
          if (selected === u.id) {
            label(u.id, x + 9, y - 7, 0xc2def3, 12, "bold");
            let last = n;
            for (const id of u.belief!.claim.route ?? []) {
              const next = nodes.get(id)!;
              g.moveTo(last.x, last.y)
                .lineTo(next.x, next.y)
                .stroke({ color: 0x85bce6, width: 3, alpha: 0.7 });
              last = next;
            }
          }
        }
      }
    }
  }, [view, selected, layers, select, ready]);
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
