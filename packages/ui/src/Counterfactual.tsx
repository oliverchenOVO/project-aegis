import { useState } from "react";
import type { CommandInput, OutcomeMetrics } from "../../domain/src/index";
import type {
  AlternativeCommands,
  BranchComparison,
} from "../../application/src/port";
import { statusNames } from "./labels";
import { clock } from "../../shared/src/index";

const types: CommandInput["type"][] = [
  "DISPATCH_UNIT",
  "REASSIGN_UNIT",
  "RECALL_UNIT",
  "REQUEST_STATUS",
  "SET_INCIDENT_PRIORITY",
  "EVACUATE_ZONE",
];
function available(
  key: keyof OutcomeMetrics,
  metrics: OutcomeMetrics,
  legacy: boolean,
): boolean {
  if (
    legacy &&
    ["hospitalOverloadTicks", "recovered", "sheltered"].includes(key)
  )
    return false;
  if (key === "averageResponseTime") return metrics.respondedIncidents > 0;
  if (key === "averageEMSResponseTime")
    return metrics.respondedEMSIncidents > 0;
  if (key === "averageCommandDelay") return metrics.acknowledgedCommands > 0;
  return true;
}
export function CounterfactualPanel({
  commands,
  endTick,
  initialTick,
  comparison,
  busy,
  fork,
  save,
  allowEvacuation,
}: {
  commands: AlternativeCommands;
  endTick: number;
  initialTick: number;
  comparison?: BranchComparison;
  busy: boolean;
  fork: (tick: number, plan: AlternativeCommands) => void;
  save: (id: string) => void;
  allowEvacuation: boolean;
}) {
  const [tick, setTick] = useState(initialTick),
    [plan, setPlan] = useState(() =>
      structuredClone(commands.filter((c) => c.tick >= initialTick)),
    );
  const update = (index: number, value: Partial<AlternativeCommands[number]>) =>
    setPlan((previous) =>
      previous.map((row, i) => (i === index ? { ...row, ...value } : row)),
    );
  return (
    <section
      className="aar-section counterfactual-panel"
      data-testid="counterfactual-panel"
    >
      <h2>反事實分支</h2>
      <p className="muted">
        改動玩家命令後重新模擬。原始時間線保留；結果可能改善，也可能惡化。
      </p>
      <div className="row-actions">
        <label>
          分岔秒數{" "}
          <input
            aria-label="分岔秒數"
            type="number"
            min={0}
            max={endTick}
            value={tick}
            disabled={busy}
            onChange={(e) => {
              const next = Number(e.target.value);
              setTick(next);
              setPlan(structuredClone(commands.filter((c) => c.tick >= next)));
            }}
          />
        </label>
        <button
          disabled={busy}
          onClick={() =>
            setPlan(structuredClone(commands.filter((c) => c.tick >= tick)))
          }
        >
          還原原始命令
        </button>
      </div>
      <p className="muted">
        {clock(tick)} 之前的命令保持不變。以下為分岔後的完整命令清單。
      </p>
      <div className="branch-editor">
        {plan.map((row, index) => (
          <div className="branch-command" key={index}>
            <input
              aria-label={`替代命令 ${index + 1} 秒數`}
              type="number"
              min={tick}
              max={endTick}
              value={row.tick}
              disabled={busy}
              onChange={(e) => update(index, { tick: Number(e.target.value) })}
            />
            <select
              aria-label={`替代命令 ${index + 1} 類型`}
              value={row.input.type}
              disabled={busy}
              onChange={(e) =>
                update(index, {
                  input: {
                    target: row.input.target,
                    type: e.target.value as CommandInput["type"],
                    ...(["DISPATCH_UNIT", "REASSIGN_UNIT"].includes(
                      e.target.value,
                    ) && row.input.incidentId
                      ? { incidentId: row.input.incidentId }
                      : {}),
                    ...(e.target.value === "SET_INCIDENT_PRIORITY"
                      ? { priority: row.input.priority ?? 2 }
                      : {}),
                  },
                })
              }
            >
              {types
                .filter((type) => allowEvacuation || type !== "EVACUATE_ZONE")
                .map((type) => (
                  <option value={type} key={type}>
                    {statusNames[type]}
                  </option>
                ))}
            </select>
            <input
              aria-label={`替代命令 ${index + 1} 目標`}
              value={row.input.target}
              placeholder="單位／設施／區域 ID"
              disabled={busy}
              onChange={(e) =>
                update(index, {
                  input: { ...row.input, target: e.target.value },
                })
              }
            />
            {["DISPATCH_UNIT", "REASSIGN_UNIT"].includes(row.input.type) && (
              <input
                aria-label={`替代命令 ${index + 1} 事件`}
                placeholder="事件 ID"
                value={row.input.incidentId ?? ""}
                disabled={busy}
                onChange={(e) =>
                  update(index, {
                    input: { ...row.input, incidentId: e.target.value },
                  })
                }
              />
            )}
            {row.input.type === "SET_INCIDENT_PRIORITY" && (
              <select
                aria-label={`替代命令 ${index + 1} 優先序`}
                value={row.input.priority ?? 2}
                disabled={busy}
                onChange={(e) =>
                  update(index, {
                    input: { ...row.input, priority: Number(e.target.value) },
                  })
                }
              >
                <option value={1}>一般</option>
                <option value={2}>緊急</option>
                <option value={3}>立即</option>
              </select>
            )}
            <button
              aria-label={`刪除替代命令 ${index + 1}`}
              disabled={busy}
              onClick={() => setPlan((p) => p.filter((_, i) => i !== index))}
            >
              刪除
            </button>
          </div>
        ))}
      </div>
      <div className="row-actions">
        <button
          disabled={busy || plan.length >= 5000}
          onClick={() =>
            setPlan((p) => [
              ...p,
              { tick, input: { type: "REQUEST_STATUS", target: "H-B" } },
            ])
          }
        >
          新增命令
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            fork(
              tick,
              [...plan].sort((a, b) => a.tick - b.tick),
            )
          }
        >
          {busy ? "重跑並驗證中…" : "模擬替代分支"}
        </button>
      </div>
      {comparison && (
        <>
          <p className="muted">
            以下對應上次完成的模擬；編輯命令後需重新模擬。可儲存最近 4 個分支。
          </p>
          <p className="muted">
            Original / Alternative / Δ · 分岔{" "}
            {clock(comparison.lineage.forkTick)} · 原始{" "}
            {comparison.originalDuration}s / 替代{" "}
            {comparison.alternativeDuration}s
          </p>
          <div className="comparison-scroll">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>結果</th>
                  <th>Original</th>
                  <th>Alternative</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["死亡（人）", "fatalities"],
                    ["危重病例（人）", "criticalCases"],
                    ["解除事件", "resolvedIncidents"],
                    ["醫院超載（院秒）", "hospitalOverloadTicks"],
                    ["設施停擺（服務秒）", "infrastructureDowntime"],
                    ["平均應變（秒）", "averageResponseTime"],
                    ["抵達事件數", "respondedIncidents"],
                    ["平均 EMS 應變（秒）", "averageEMSResponseTime"],
                    ["EMS 抵達事件數", "respondedEMSIncidents"],
                    ["平均確認延遲（秒）", "averageCommandDelay"],
                    ["康復（人）", "recovered"],
                    ["抵達避難所（人）", "sheltered"],
                  ] as const
                ).map(([label, key]) => (
                  <tr key={key}>
                    <th>{label}</th>
                    <td>
                      {available(
                        key,
                        comparison.original,
                        comparison.lineage.simulationVersion === "0.1.0",
                      )
                        ? comparison.original[key].toFixed(1)
                        : "不適用"}
                    </td>
                    <td>
                      {available(
                        key,
                        comparison.alternative,
                        comparison.lineage.simulationVersion === "0.1.0",
                      )
                        ? comparison.alternative[key].toFixed(1)
                        : "不適用"}
                    </td>
                    <td>
                      {available(
                        key,
                        comparison.original,
                        comparison.lineage.simulationVersion === "0.1.0",
                      ) &&
                      available(
                        key,
                        comparison.alternative,
                        comparison.lineage.simulationVersion === "0.1.0",
                      )
                        ? `${comparison.delta[key] > 0 ? "+" : ""}${comparison.delta[key].toFixed(1)}`
                        : "不適用"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            抵達事件數為 0 時，平均應變時間不適用。零差異也會保留。
            {comparison.lineage.simulationVersion === "0.1.0" &&
              " 舊版引擎未模擬超載時數、康復與區域疏散；這些欄位不適用。"}
          </p>
          <h3>改變的已記錄結果（最多 12 項）</h3>
          {comparison.changedCausalOutcomes.length ? (
            comparison.changedCausalOutcomes.map((o) => (
              <details key={`${o.type}-${o.subjectId}`}>
                <summary>
                  {o.subjectId} · {o.type} · {o.originalCount} →{" "}
                  {o.alternativeCount}
                </summary>
                <p>
                  {o.originalFirstTick === undefined
                    ? "原始未發生"
                    : `原始 ${clock(o.originalFirstTick)}`}{" "}
                  /{" "}
                  {o.alternativeFirstTick === undefined
                    ? "替代未發生"
                    : `替代 ${clock(o.alternativeFirstTick)}`}
                </p>
                <p>Original：{o.originalEventIds.join(", ") || "無"}</p>
                <p>Alternative：{o.alternativeEventIds.join(", ") || "無"}</p>
                {comparison.alternativeChains
                  .filter((c) => o.alternativeEventIds.includes(c.rootEventId))
                  .map((c) => (
                    <div key={c.rootEventId}>
                      <p>
                        替代因果：{c.rootEventId}
                        {c.truncated
                          ? `（已截斷，省略 ${c.omittedEventIds.length} 個前因）`
                          : ""}
                      </p>
                      {c.edges.map((edge) => (
                        <small
                          className="causal-edge"
                          key={`${edge.causeId}-${edge.effectId}`}
                        >
                          {edge.causeId} → {edge.effectId}
                        </small>
                      ))}
                    </div>
                  ))}
              </details>
            ))
          ) : (
            <p>未記錄到這些結果類別的改變。</p>
          )}
          <p className="muted">
            {comparison.lineage.branchId}
            <br />
            Original {comparison.originalHash}
            <br />
            Alternative {comparison.alternativeHash}
          </p>
          <button
            disabled={busy}
            onClick={() => save(comparison.lineage.branchId)}
          >
            儲存分支存檔
          </button>
        </>
      )}
    </section>
  );
}
