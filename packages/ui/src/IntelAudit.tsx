import type { IntelAudit as AuditEntry } from "../../domain/src/index";
import { clock } from "../../shared/src/index";
import { useMemo, useState } from "react";
export function IntelAudit({
  entries,
  seek,
}: {
  entries: AuditEntry[];
  seek: (tick: number) => void;
}) {
  const [page, setPage] = useState(0);
  const ordered = useMemo(
    () =>
      [...entries]
        .filter((r) => r.classifications.length)
        .sort(
          (a, b) =>
            Number(
              b.subject === "H-B" &&
                b.observedTruth !== b.receivedTruth &&
                b.claim === "備用發電機運轉中" &&
                b.receivedTick !== undefined,
            ) -
              Number(
                a.subject === "H-B" &&
                  a.observedTruth !== a.receivedTruth &&
                  a.claim === "備用發電機運轉中" &&
                  a.receivedTick !== undefined,
              ) || a.observedTick - b.observedTick,
        ),
    [entries],
  );
  return (
    <section className="aar-section">
      <h2>逐筆情報稽核</h2>
      <div className="row-actions">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          上一批
        </button>
        <span>
          {page + 1} / {Math.max(1, Math.ceil(ordered.length / 40))}
        </span>
        <button
          disabled={(page + 1) * 40 >= ordered.length}
          onClick={() => setPage((p) => p + 1)}
        >
          下一批
        </button>
      </div>
      <div className="audit-list">
        {ordered.slice(page * 40, (page + 1) * 40).map((r) => (
          <article className="audit-entry" key={r.id}>
            <b>
              {r.subject} · {r.id}
            </b>
            <p>{r.claim}</p>
            <dl>
              <dt>來源</dt>
              <dd>{r.source}</dd>
              <dt>觀察 / 接收</dt>
              <dd>
                {clock(r.observedTick)} /{" "}
                {r.receivedTick !== undefined
                  ? clock(r.receivedTick)
                  : "未接收"}
              </dd>
              <dt>觀察當時</dt>
              <dd>{r.observedTruth}</dd>
              <dt>送達時真相</dt>
              <dd>{r.receivedTruth ?? "無送達紀錄"}</dd>
              <dt>分類</dt>
              <dd>{r.classifications.join(" · ")}</dd>
              {r.missingFields?.length ? (
                <>
                  <dt>未回報欄位</dt>
                  <dd>{r.missingFields.join(", ")}</dd>
                </>
              ) : null}
              {r.conflictingReportIds?.length ? (
                <>
                  <dt>衝突報告</dt>
                  <dd>{r.conflictingReportIds.join(", ")}</dd>
                </>
              ) : null}
              {r.corroboratingReportIds?.length ? (
                <>
                  <dt>佐證報告</dt>
                  <dd>{r.corroboratingReportIds.join(", ")}</dd>
                </>
              ) : null}
            </dl>
            {r.claim === r.observedTruth &&
              r.receivedTruth !== undefined &&
              r.receivedTruth !== r.observedTruth && (
                <p className="orange">
                  觀察當時內容正確；狀態在傳輸途中改變，這是一份過時情報。
                </p>
              )}
            <button onClick={() => seek(r.receivedTick ?? r.observedTick)}>
              重播此時情報
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
