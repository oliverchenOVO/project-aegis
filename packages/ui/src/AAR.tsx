import { useState } from "react";
import { Play, ArrowLeft } from "lucide-react";
import type { AAR as AARData } from "../../domain/src/index";
import { clock } from "../../shared/src/index";
import { duration, statusNames } from "./labels";
import { IntelAudit } from "./IntelAudit";
export function AfterAction({
  data,
  seek,
  back,
}: {
  data: AARData;
  seek: (tick: number) => void;
  back: () => void;
}) {
  const [eventId, setEventId] = useState<string>();
  const event = data.timeline.find((e) => e.id === eventId);
  return (
    <main className="aar">
      <div className="aar-heading">
        <div>
          <p className="muted">AFTER ACTION REPORT</p>
          <h1>行動檢討報告</h1>
          <p>
            {data.reason} · Seed {data.seed} · {duration(data.duration)}
          </p>
        </div>
        <div className="row-actions">
          <button onClick={back}>
            <ArrowLeft size={15} />
            指揮中心
          </button>
          <button className="primary" onClick={() => seek(0)}>
            <Play size={15} />
            驗證並重播
          </button>
        </div>
      </div>
      <div className="aar-metrics">
        {[
          ["死亡", data.fatalities],
          ["傷患", data.injuries],
          ["事件解除", data.resolved],
          ["醫院超載", data.hospitalOverload],
          ["設施故障", data.infrastructureFailures],
          ["平均指令延遲", `${Math.round(data.averageCommandDelay)}s`],
        ].map(([name, value]) => (
          <div key={name}>
            <strong>{value}</strong>
            <span>{name}</span>
          </div>
        ))}
      </div>
      <div className="aar-grid">
        <section className="aar-timeline">
          <h2>重要時間線</h2>
          <p className="muted">選擇事件查看已記錄因果，或直接重播當時情況。</p>
          {data.timeline.map((e) => (
            <div
              className={`timeline-row ${e.id === eventId ? "selected" : ""}`}
              key={e.id}
            >
              <button
                className="timeline-event"
                onClick={() => setEventId(e.id)}
              >
                <time>{clock(e.tick)}</time>
                <span>
                  {e.type}
                  <small>
                    {Object.entries(e.payload)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(" · ")}
                  </small>
                </span>
              </button>
              <button
                aria-label={`重播 ${e.id}`}
                title="跳至事件重播"
                onClick={() => seek(e.tick)}
              >
                <Play size={13} />
              </button>
            </div>
          ))}
        </section>
        <aside>
          <section className="aar-section">
            <h2>情報失敗分析</h2>
            <dl>
              {Object.entries({
                過時: data.intelFailures.stale,
                觀察誤差: data.intelFailures.inaccurate,
                遺失: data.intelFailures.lost,
                "延遲 >90s": data.intelFailures.delayed,
                低信心: data.intelFailures.lowConfidence,
              }).map(([k, v]) => (
                <div className="metric-pair" key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="muted">
              分類可重疊。過時報告描述的是觀察當時的狀態；觀察誤差與傳輸延遲分開計算。
            </p>
          </section>
          <IntelAudit entries={data.intelAudit} seek={seek} />
          <section className="aar-section">
            <h2>決策紀錄</h2>
            {data.commands.map((c) => (
              <p key={c.id}>
                <time>{clock(c.issueTick)}</time> {statusNames[c.type]}{" "}
                {c.target}
                <small>
                  {statusNames[c.deliveryStatus]} /{" "}
                  {statusNames[c.executionStatus]} {c.failure}
                </small>
              </p>
            ))}
          </section>
          <section className="aar-section">
            <h2>已記錄因果</h2>
            {event ? (
              <>
                <p>
                  {event.id} · {event.type}
                </p>
                <p className="muted">
                  {event.causedByEventIds.length
                    ? "直接原因："
                    : "根事件，無已知前因"}
                </p>
                {event.causedByEventIds.map((id) => {
                  const cause = data.timeline.find((e) => e.id === id);
                  return (
                    <button
                      className="cause-link"
                      key={id}
                      onClick={() => setEventId(id)}
                    >
                      {id} · {cause?.type ?? "情報／通訊事件"}
                    </button>
                  );
                })}
              </>
            ) : (
              <p className="muted">從時間線選取一個事件。</p>
            )}
          </section>
          <section className="aar-section">
            <h2>重播完整性</h2>
            <code>{data.finalHash}</code>
            <p className="muted">
              重播以相同版本、種子與指令流重新模擬，逐一驗證 300-tick 雜湊。
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
