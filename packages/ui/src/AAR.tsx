import { useState, useMemo } from "react";
import { Play, ArrowLeft } from "lucide-react";
import type { AAR as AARData } from "../../domain/src/index";
import { clock } from "../../shared/src/index";
import { duration, statusNames } from "./labels";
import { IntelAudit } from "./IntelAudit";
import { CounterfactualPanel } from "./Counterfactual";
import type {
  AlternativeCommands,
  BranchComparison,
} from "../../application/src/port";
export function AfterAction({
  data,
  seek,
  back,
  commands,
  comparison,
  busy,
  fork,
  saveBranch,
}: {
  data: AARData;
  seek: (tick: number) => void;
  back: () => void;
  commands: AlternativeCommands;
  comparison?: BranchComparison;
  busy: boolean;
  fork: (tick: number, plan: AlternativeCommands) => void;
  saveBranch: (id: string) => void;
}) {
  const [eventId, setEventId] = useState<string>(),
    [page, setPage] = useState(0),
    [forkTick, setForkTick] = useState(commands[0]?.tick ?? 0),
    [branchOpen, setBranchOpen] = useState(false);
  const eventIndex = useMemo(
    () =>
      new Map(
        [
          ...data.timeline,
          ...(data.systemic?.criticalChains.flatMap((c) => c.nodes) ?? []),
        ].map((e) => [e.id, e]),
      ),
    [data],
  );
  const event = eventIndex.get(eventId ?? "");
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
      <div className="row-actions">
        <button disabled={busy} onClick={() => setBranchOpen(!branchOpen)}>
          {branchOpen ? "收起分支編輯" : "建立反事實分支"}
        </button>
      </div>
      {branchOpen && (
        <CounterfactualPanel
          key={forkTick}
          commands={commands}
          endTick={data.duration}
          initialTick={forkTick}
          comparison={comparison}
          busy={busy}
          fork={fork}
          save={saveBranch}
          allowEvacuation={Boolean(data.systemic)}
        />
      )}
      {data.systemic && (
        <section className="aar-section systemic-overview">
          <h2>應變與系統壓力</h2>
          <p>
            平均 EMS 抵達：
            {data.systemic.metrics.respondedEMSIncidents
              ? `${data.systemic.metrics.averageEMSResponseTime.toFixed(1)}秒（${data.systemic.metrics.respondedEMSIncidents} 個事件）`
              : "未記錄到抵達"}{" "}
            · 電網中斷 {data.systemic.metrics.powerDowntime}秒 · 通訊中斷{" "}
            {data.systemic.metrics.communicationDowntime}節點秒 · 單位利用率估計{" "}
            {(data.systemic.metrics.unitUtilization * 100).toFixed(1)}%
          </p>
          <div className="comparison-scroll">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>醫院</th>
                  <th>結束狀態</th>
                  <th>尖峰在院</th>
                  <th>尖峰佇列</th>
                  <th>尖峰 ICU</th>
                  <th>超載秒數</th>
                  <th>供電緊急秒數</th>
                  <th>交接車秒</th>
                </tr>
              </thead>
              <tbody>
                {data.systemic.hospitals.map((h) => (
                  <tr key={h.id}>
                    <th>{h.id}</th>
                    <td>{statusNames[h.status] ?? h.status}</td>
                    <td>{h.peakCensus}</td>
                    <td>{h.peakQueue}</td>
                    <td>{h.peakICU}</td>
                    <td>{h.overloadTicks}</td>
                    <td>{h.powerEmergencyTicks}</td>
                    <td>{h.handoverTicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
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
          <div className="row-actions">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              上一頁
            </button>
            <span>
              {page + 1} / {Math.max(1, Math.ceil(data.timeline.length / 100))}{" "}
              · {data.timeline.length} 個事件
            </span>
            <button
              disabled={(page + 1) * 100 >= data.timeline.length}
              onClick={() => setPage((p) => p + 1)}
            >
              下一頁
            </button>
          </div>
          {data.timeline.slice(page * 100, (page + 1) * 100).map((e) => (
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
              {Object.entries(
                data.systemic?.intelligence ?? {
                  過時: data.intelFailures.stale,
                  觀察誤差: data.intelFailures.inaccurate,
                  遺失: data.intelFailures.lost,
                  "延遲 >90s": data.intelFailures.delayed,
                  低信心: data.intelFailures.lowConfidence,
                },
              ).map(([k, v]) => (
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
                {data.systemic?.decisions.find(
                  (d) => d.command.id === c.id,
                ) && (
                  <small>
                    實際執行：
                    {
                      statusNames[
                        data.systemic.decisions.find(
                          (d) => d.command.id === c.id,
                        )!.command.executionStatus
                      ]
                    }{" "}
                    · 確認事件{" "}
                    {data.systemic.decisions
                      .find((d) => d.command.id === c.id)!
                      .acknowledgementEventIds.join(", ") || "無"}
                  </small>
                )}
                <button
                  disabled={busy}
                  onClick={() => {
                    setForkTick(c.issueTick);
                    setBranchOpen(true);
                  }}
                >
                  從 {c.id} 分岔
                </button>
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
                  const cause = eventIndex.get(id);
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
          {data.systemic && (
            <section className="aar-section">
              <h2>關鍵因果鏈</h2>
              {data.systemic.criticalChains.map((chain) => (
                <details key={chain.rootEventId}>
                  <summary>
                    {chain.rootEventId} ·{" "}
                    {chain.nodes.find((n) => n.id === chain.rootEventId)?.type}
                  </summary>
                  <p className="muted">
                    {chain.truncated
                      ? `顯示範圍已截斷：${chain.omittedEventIds.join(", ")}`
                      : "已記錄的直接前因"}
                  </p>
                  {chain.nodes.map((n) => (
                    <button
                      className="cause-link"
                      key={n.id}
                      onClick={() => setEventId(n.id)}
                    >
                      {n.id} · {n.type} · {clock(n.tick)}
                    </button>
                  ))}
                  {chain.edges.map((edge) => (
                    <small
                      className="causal-edge"
                      key={`${edge.causeId}-${edge.effectId}`}
                    >
                      {edge.causeId} → {edge.effectId}
                    </small>
                  ))}
                </details>
              ))}
            </section>
          )}
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
