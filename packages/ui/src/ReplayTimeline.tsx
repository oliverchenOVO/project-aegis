import { useState } from "react";
import type { SessionUpdate } from "../../application/src/port";
import { clock } from "../../shared/src/index";
export function ReplayTimeline({
  session,
  busy,
  seek,
}: {
  session: SessionUpdate;
  busy: boolean;
  seek: (tick: number) => void;
}) {
  const [draft, setDraft] = useState<number>();
  const summary = session.replaySummary;
  if (!summary) return null;
  const target = draft ?? session.view.tick,
    width = 1000,
    x = (tick: number) => (tick / Math.max(1, session.replayEnd)) * width;
  return (
    <section className="replay-timeline" aria-label="重播時間線">
      <div className="row-actions">
        <b>重播定位</b>
        <time>{clock(target)}</time>
        <span className="muted">● 命令 · │ 快照 · 細線：回顧事件</span>
      </div>
      <svg viewBox="0 0 1000 26" preserveAspectRatio="none" aria-hidden="true">
        {summary.events.map((e) => (
          <line
            key={e.id}
            x1={x(e.tick)}
            x2={x(e.tick)}
            y1={14}
            y2={24}
            stroke="#7796aa"
            strokeOpacity=".28"
          />
        ))}
        {summary.checkpoints.map((tick) => (
          <line
            key={tick}
            x1={x(tick)}
            x2={x(tick)}
            y1={2}
            y2={24}
            stroke="#dac17b"
          />
        ))}
        {summary.commands.map((c, i) => (
          <circle key={i} cx={x(c.tick)} cy={7} r={3} fill="#7fbae2" />
        ))}
      </svg>
      <input
        id="replay-seek"
        aria-label="重播秒數"
        type="range"
        min={0}
        max={session.replayEnd}
        value={target}
        disabled={busy}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={(e) => {
          const value = Number(e.currentTarget.value);
          setDraft(undefined);
          seek(value);
        }}
        onKeyUp={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(e.key)
          ) {
            const value = Number(e.currentTarget.value);
            setDraft(undefined);
            seek(value);
          }
        }}
      />
      <div className="row-actions">
        <input
          aria-label="精確重播秒數"
          type="number"
          min={0}
          max={session.replayEnd}
          value={target}
          disabled={busy}
          onChange={(e) => setDraft(Number(e.target.value))}
        />
        <button
          disabled={busy}
          onClick={() => {
            setDraft(undefined);
            seek(target);
          }}
        >
          定位
        </button>
        <span className="muted">
          {summary.checkpoints.length} 個完整快照 · {summary.commands.length}{" "}
          條命令 · {summary.events.length} 個回顧事件
        </span>
      </div>
    </section>
  );
}
