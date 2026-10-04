import { useState } from "react";
import { Radio, Send, Clock3, AlertTriangle } from "lucide-react";
import type {
  CommandCenterView,
  CommandInput,
  PublicReport,
} from "../../domain/src/index";
import { clock } from "../../shared/src/index";
import { useUI } from "./store";
import { incidentNames, statusNames, duration } from "./labels";
import { incidentPriority } from "./map/clusters";
export function Intelligence({
  view,
  command,
  disabled,
}: {
  view: CommandCenterView;
  command: (input: CommandInput) => void;
  disabled: boolean;
}) {
  const selected = useUI((s) => s.selected),
    select = useUI((s) => s.select);
  const cluster = useUI((s) => s.cluster);
  const members = cluster
    ? view.beliefs
        .filter((b) => b.kind === "INCIDENT" && cluster.includes(b.subjectId))
        .sort(incidentPriority())
    : [];
  const [filter, setFilter] = useState("ALL"),
    [reportId, setReportId] = useState<string>(),
    [selectedUnits, setSelectedUnits] = useState<string[]>([]),
    [priority, setPriority] = useState(2);
  const [evacuationZone, setEvacuationZone] = useState("");
  const belief = view.beliefs.find((b) => b.subjectId === selected),
    report = view.reports.find((r) => r.id === reportId);
  const feed = view.reports
    .filter((r) => filter === "ALL" || r.subjectKind === filter)
    .slice(-120)
    .reverse();
  const chooseReport = (r: PublicReport) => {
    setReportId(r.id);
    select(r.subjectId);
  };
  const incident = belief?.kind === "INCIDENT",
    type = belief?.claim.incidentType;
  const needed =
    type === "FIRE"
      ? ["FIRE", "EMS"]
      : type === "BUILDING_COLLAPSE"
        ? ["FIRE", "EMS", "POLICE"]
        : type === "FLOOD" || type === "STRANDED_CIVILIANS"
          ? ["FIRE", "EMS", "POLICE", "UTILITY"]
          : type === "MASS_CASUALTY"
            ? ["EMS"]
            : type === "ROAD_BLOCKAGE"
              ? ["POLICE"]
              : ["UTILITY"];
  const eligible = view.units.filter((u) => needed.includes(u.agency));
  return (
    <aside className="intel-panel">
      <div className="panel-title">
        <h2>情報動態</h2>
        <select
          aria-label="情報篩選"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="ALL">全部來源</option>
          <option value="INCIDENT">事件</option>
          <option value="HOSPITAL">醫院</option>
          <option value="UNIT">單位</option>
          <option value="POWER">電力</option>
          <option value="COMMS">通訊</option>
          <option value="ROAD">道路</option>
          <option value="FLOOD">淹水觀測</option>
          <option value="CIVILIANS">居民風險</option>
        </select>
      </div>
      <div className="feed-heading">
        <span>來源 / 情報</span>
        <span>接收時間</span>
      </div>
      <div className="feed" data-testid="intel-feed">
        {feed.length ? (
          feed.map((r) => (
            <button
              key={r.id}
              className={`report-row ${reportId === r.id ? "selected" : ""}`}
              onClick={() => chooseReport(r)}
            >
              <div>
                <b>{r.sourceId}</b>
                <time>{clock(r.receivedTick!)}</time>
              </div>
              <p>
                {r.subjectId} · {statusNames[r.claim.value] ?? r.claim.value}
              </p>
              <small>
                <Clock3 size={11} />
                觀察 {clock(r.observedTick)}
                <span>{Math.round(r.observationConfidence * 100)}%</span>
              </small>
            </button>
          ))
        ) : (
          <div className="empty">
            等待第一份情報。<small>尚未收到消息，不代表現場安全。</small>
          </div>
        )}
      </div>
      {report && report.subjectId === selected && (
        <div className="report-detail">
          <div className="rail-caption">
            報告 {report.id}
            <button
              aria-label="關閉報告詳情"
              onClick={() => setReportId(undefined)}
            >
              ×
            </button>
          </div>
          <dl>
            <dt>觀察</dt>
            <dd>{clock(report.observedTick)}</dd>
            <dt>接收</dt>
            <dd>{clock(report.receivedTick!)}</dd>
            <dt>年齡 / 傳輸</dt>
            <dd>
              {duration(view.tick - report.observedTick)} /{" "}
              {duration(report.receivedTick! - report.observedTick)}
            </dd>
            <dt>來源可靠度</dt>
            <dd>{Math.round(report.sourceReliability * 100)}%</dd>
            <dt>驗證狀態</dt>
            <dd>
              {belief?.corroboration.length ? "多來源佐證" : "待驗證"}
              {view.tick > report.expiry && " · 過時"}
            </dd>
          </dl>
        </div>
      )}
      <div className="incident-inspector">
        {cluster ? (
          <div className="inspector-body" data-testid="cluster-inspector">
            <div className="panel-title">
              <h2>事件聚合</h2>
              <b className="orange">{members.length} 件已接收</b>
            </div>
            <p className="muted">選取成員以檢視情報與派遣單位。</p>
            {members.map((b) => (
              <button
                className="report-row full"
                key={b.subjectId}
                data-testid={`cluster-member-${b.subjectId}`}
                onClick={() => select(b.subjectId)}
              >
                <div>
                  <b>
                    {b.subjectId} ·{" "}
                    {incidentNames[b.claim.incidentType!] ?? b.claim.value}
                  </b>
                  <time>
                    {duration(Math.max(0, view.tick - b.receivedTick))}前接收
                  </time>
                </div>
                <small>
                  回報嚴重度 {b.claim.severity ?? "未知"} · {b.claim.value}
                </small>
              </button>
            ))}
            {!members.length && <p>這組情報已不在目前接收視圖中。</p>}
          </div>
        ) : belief ? (
          <>
            <div className="panel-title">
              <h2>{incident ? "事件詳情" : "情報詳情"}</h2>
              <b className="orange">{belief.subjectId}</b>
            </div>
            <div className="inspector-body">
              <h3>
                {incident
                  ? incidentNames[type!]
                  : belief.subjectId === "H-B"
                    ? "東川醫院"
                    : belief.subjectId === "H-A"
                      ? "西城醫院"
                      : belief.subjectId}
              </h3>
              <p className="estimate">
                {statusNames[belief.claim.value] ?? belief.claim.value}
                <span>
                  {belief.stale && (
                    <>
                      <AlertTriangle size={12} /> 過時
                    </>
                  )}
                </span>
              </p>
              <div className="confidence">
                <span>估計信心</span>
                <b>{Math.round(belief.confidence * 100)}%</b>
              </div>
              <progress max="1" value={belief.confidence} />
              <dl>
                <dt>位置</dt>
                <dd>
                  {view.city.nodes.find((n) => n.id === belief.claim.nodeId)
                    ?.name ?? "未知"}
                </dd>
                <dt>最新觀察</dt>
                <dd>
                  {clock(belief.observedTick)} · {duration(belief.age)}前
                </dd>
                <dt>來源</dt>
                <dd>{belief.sources.join("、")}</dd>
                <dt>佐證 / 衝突</dt>
                <dd>
                  {belief.corroboration.length} / {belief.conflicts.length}
                  {belief.conflicts.length > 0 &&
                    ` (${belief.conflicts.slice(0, 3).join(", ")})`}
                </dd>
                {incident && (
                  <>
                    <dt>所需能力</dt>
                    <dd>{needed.join(" / ")}</dd>
                    <dt>回報投入</dt>
                    <dd>
                      {view.units
                        .filter((u) => u.belief?.claim.assignment === selected)
                        .map((u) => u.id)
                        .join(", ") || "尚未回報"}
                    </dd>
                  </>
                )}
                {belief.kind === "HOSPITAL" && (
                  <>
                    <dt>回報在院 / 名目容量</dt>
                    <dd>
                      {belief.claim.currentPatients ?? "未知"} /{" "}
                      {view.city.hospitals.find((h) => h.id === selected)
                        ?.capacity ?? "未知"}
                    </dd>
                    <dt>回報急診佇列</dt>
                    <dd>{belief.claim.emergencyQueue ?? "未知"}</dd>
                    <dt>回報 ICU 占用</dt>
                    <dd>
                      {belief.claim.icuOccupied ?? "未知"} /{" "}
                      {view.city.hospitals.find((h) => h.id === selected)
                        ?.icuCapacity ?? "未知"}
                    </dd>
                    <dt>回報救護車交接</dt>
                    <dd>{belief.claim.ambulanceHandover ?? "未知"}</dd>
                    <dt>回報電力</dt>
                    <dd>
                      {belief.claim.powered === undefined
                        ? "未知"
                        : belief.claim.powered
                          ? "供電中"
                          : "失去供電"}
                    </dd>
                  </>
                )}
                {belief.kind === "FLOOD" && (
                  <>
                    <dt>估計水深</dt>
                    <dd>
                      {belief.claim.estimatedDepth === undefined
                        ? "未知"
                        : `${belief.claim.estimatedDepth.toFixed(2)}m`}
                    </dd>
                  </>
                )}
                {belief.kind === "CIVILIANS" && (
                  <>
                    <dt>估計居民</dt>
                    <dd>{belief.claim.estimatedPopulation ?? "未知"}</dd>
                    <dt>估計受傷 / 危重</dt>
                    <dd>
                      {belief.claim.estimatedInjured ?? "未知"} /{" "}
                      {belief.claim.estimatedCritical ?? "未知"}
                    </dd>
                  </>
                )}
              </dl>
              <button
                className="full"
                disabled={
                  disabled ||
                  !["INCIDENT", "HOSPITAL", "UNIT", "POWER", "COMMS"].includes(
                    belief.kind,
                  )
                }
                onClick={() =>
                  command({ type: "REQUEST_STATUS", target: belief.subjectId })
                }
              >
                <Radio size={14} />
                查詢最新狀態
              </button>
              {incident && (
                <div className="dispatch">
                  <div className="rail-caption">
                    派遣命令
                    <select
                      aria-label="指令優先序"
                      value={priority}
                      disabled={disabled}
                      onChange={(e) => setPriority(Number(e.target.value))}
                    >
                      <option value={1}>一般</option>
                      <option value={2}>緊急</option>
                      <option value={3}>立即</option>
                    </select>
                  </div>
                  <div className="dispatch-units">
                    {eligible.map((u) => (
                      <label key={u.id}>
                        <input
                          type="checkbox"
                          aria-label={`派遣 ${u.id}`}
                          disabled={disabled}
                          checked={selectedUnits.includes(u.id)}
                          onChange={(e) =>
                            setSelectedUnits((previous) =>
                              e.target.checked
                                ? [...previous, u.id]
                                : previous.filter((id) => id !== u.id),
                            )
                          }
                        />
                        <span>{u.id}</span>
                        <small>
                          {statusNames[u.belief?.claim.unitState ?? ""] ??
                            "未知"}
                        </small>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="local-timeline">
                <h4>已接收情報時間線</h4>
                {view.reports
                  .filter((r) => r.subjectId === selected)
                  .slice(-3)
                  .reverse()
                  .map((r) => (
                    <button key={r.id} onClick={() => chooseReport(r)}>
                      {clock(r.receivedTick!)} ·{" "}
                      {statusNames[r.claim.value] ?? r.claim.value}
                    </button>
                  ))}
              </div>
            </div>
          </>
        ) : (
          <div className="empty">
            {selected
              ? `${selected}：狀態未知，尚無已接收情報。`
              : "選擇地圖事件或報告，評估情報後下令。"}
          </div>
        )}
      </div>
      {view.city.evacuationZones && (
        <div className="evacuation-control">
          <label htmlFor="evacuation-zone">區域疏散命令</label>
          <div className="row-actions">
            <select
              id="evacuation-zone"
              aria-label="疏散區域"
              value={evacuationZone}
              onChange={(e) => setEvacuationZone(e.target.value)}
            >
              <option value="">選擇區域</option>
              {view.city.evacuationZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.id}
                </option>
              ))}
            </select>
            <button
              disabled={disabled || !evacuationZone}
              onClick={() =>
                command({ type: "EVACUATE_ZONE", target: evacuationZone })
              }
            >
              發布疏散
            </button>
          </div>
          <small className="muted">
            送達後居民依路線與遵從率行動；不保證安全抵達。
          </small>
        </div>
      )}
      {incident && belief && (
        <div className="dispatch-submit">
          {" "}
          <button
            className="primary full"
            disabled={
              disabled ||
              !selectedUnits.some((id) => eligible.some((u) => u.id === id))
            }
            onClick={() => {
              command({
                type: "SET_INCIDENT_PRIORITY",
                target: belief.subjectId,
                priority,
              });
              for (const id of selectedUnits.filter((id) =>
                eligible.some((u) => u.id === id),
              )) {
                const u = view.units.find((u) => u.id === id)!;
                command({
                  type:
                    u.belief?.claim.unitState === "AVAILABLE"
                      ? "DISPATCH_UNIT"
                      : "REASSIGN_UNIT",
                  target: id,
                  incidentId: belief.subjectId,
                });
              }
              setSelectedUnits([]);
            }}
          >
            <Send size={15} />
            發布命令
          </button>
        </div>
      )}
    </aside>
  );
}
