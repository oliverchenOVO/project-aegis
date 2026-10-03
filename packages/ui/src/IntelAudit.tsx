import type { IntelAudit as AuditEntry } from "../../domain/src/index";
import { clock } from "../../shared/src/index";
export function IntelAudit({
  entries,
  seek,
}: {
  entries: AuditEntry[];
  seek: (tick: number) => void;
}) {
  const ordered = [...entries].sort(
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
  );
  return (
    <section className="aar-section">
      <h2>逐筆情報稽核</h2>
      <div className="audit-list">
        {ordered
          .filter((r) => r.classifications.length)
          .map((r) => (
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
