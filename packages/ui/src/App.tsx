import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Play,
  Pause,
  Save,
  FolderOpen,
  ArrowLeft,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { CommandPort, type SessionUpdate } from "../../application/src/port";
import type { CommandInput } from "../../domain/src/index";
import { clock } from "../../shared/src/index";
import { useUI } from "./store";
import { SituationMap } from "./Map";
import { Resources } from "./Resources";
import { Intelligence } from "./Intelligence";
import { CommandQueue } from "./CommandQueue";
import { AfterAction } from "./AAR";
import { statusNames } from "./labels";
import { ReplayTimeline } from "./ReplayTimeline";
import type { AlternativeCommands } from "../../application/src/port";
declare global {
  interface Window {
    aegisFiles?: {
      save: (bytes: Uint8Array) => Promise<string | null>;
      load: () => Promise<Uint8Array | null>;
    };
  }
}
const SHOWCASE = "AEGIS-2026-001";
export function App() {
  const port = useRef<CommandPort | null>(null),
    input = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<SessionUpdate>(),
    [screen, setScreen] = useState<"MENU" | "COMMAND" | "AAR">("MENU"),
    [seed, setSeed] = useState(SHOWCASE),
    [scenarioId, setScenarioId] = useState("earthquake"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmMenu, setConfirmMenu] = useState(false);
  const { paused, speed, setPaused, setSpeed, select } = useUI();
  const getPort = () => {
    port.current ??= new CommandPort();
    return port.current;
  };
  const accept = (result: SessionUpdate) => {
    setSession(result);
    if (result.view.completed && result.mode === "LIVE") {
      setPaused(true);
      setScreen("AAR");
    }
  };
  const handleError = (e: unknown) => {
    setError(e instanceof Error ? e.message : "操作失敗");
    setPaused(true);
  };
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await getPort().start(seed.trim(), scenarioId);
      accept(result);
      setScreen("COMMAND");
      setPaused(true);
      select(undefined);
      setNotice("情境已就緒。災害與情報持續演化，請留意回報時間與來源。");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const command = (value: CommandInput) => {
    void getPort()
      .command(value)
      .then((result) => {
        accept(result);
        setNotice("命令已送出，等待單位確認。");
      })
      .catch(handleError);
  };
  const step = async (count: number) => {
    if (busy) return;
    setBusy(true);
    try {
      accept(await getPort().step(count));
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (paused || !session || session.view.completed || screen !== "COMMAND")
      return;
    let cancelled = false,
      pending = false,
      accumulated = 0,
      previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      accumulated += ((now - previous) / 1000) * speed;
      previous = now;
      if (pending || accumulated < 1) return;
      const ticks = Math.min(60, Math.floor(accumulated));
      accumulated -= ticks;
      pending = true;
      void getPort()
        .step(ticks)
        .then((result) => {
          if (!cancelled) accept(result);
        })
        .catch(handleError)
        .finally(() => {
          pending = false;
        });
    }, 100);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [paused, speed, screen, session?.view.completed]);
  const seek = async (tick: number) => {
    setBusy(true);
    setPaused(true);
    try {
      accept(await getPort().seek(tick));
      setScreen("COMMAND");
      select(undefined);
      setNotice("重播校驗通過。此時間線無法發布新命令。");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setPaused(true);
    try {
      const bytes = await getPort().save();
      if (window.aegisFiles) {
        const path = await window.aegisFiles.save(bytes);
        if (path) setNotice(`已儲存：${path}`);
      } else {
        const url = URL.createObjectURL(
          new Blob([Uint8Array.from(bytes)], {
            type: "application/octet-stream",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `${session?.view.seed ?? "AEGIS"}.aegis`;
        a.click();
        URL.revokeObjectURL(url);
        setNotice("存檔已下載。");
      }
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const loadBytes = async (bytes: Uint8Array) => {
    setBusy(true);
    setPaused(true);
    setError("");
    try {
      if (!port.current) await getPort().start(SHOWCASE);
      const result = await getPort().load(bytes);
      accept(result);
      setScreen(result.view.completed ? "AAR" : "COMMAND");
      select(undefined);
      setNotice(
        `存檔已驗證並載入 · 引擎 ${result.scenario.simulationVersion}${result.migrations.length ? ` · 存檔格式已遷移 ${result.migrations.map((m) => `${m.fromVersion}→${m.toVersion}`).join(", ")}，保留原始模擬規則` : ""}。`,
      );
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const fork = async (tick: number, plan: AlternativeCommands) => {
    setBusy(true);
    setPaused(true);
    setError("");
    try {
      accept(await getPort().fork(tick, plan));
      setNotice("替代分支已重跑並保留原始時間線。");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const saveBranch = async (id: string) => {
    setBusy(true);
    try {
      const bytes = await getPort().saveBranch(id);
      if (window.aegisFiles) {
        const path = await window.aegisFiles.save(bytes);
        if (path) setNotice(`分支已儲存：${path}`);
      } else {
        const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)]));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${id}.aegis`;
        anchor.click();
        URL.revokeObjectURL(url);
        setNotice("分支存檔已下載。");
      }
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const load = async () => {
    setPaused(true);
    if (window.aegisFiles) {
      try {
        const bytes = await window.aegisFiles.load();
        if (bytes) await loadBytes(bytes);
      } catch (e) {
        handleError(e);
      }
    } else input.current?.click();
  };
  const receivedComms = session?.view.beliefs.find((b) => b.kind === "COMMS");
  return (
    <>
      <input
        type="file"
        accept=".aegis"
        ref={input}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            void file
              .arrayBuffer()
              .then((buffer) => loadBytes(new Uint8Array(buffer)));
          e.target.value = "";
        }}
      />
      {screen === "MENU" ? (
        <main className="menu">
          <div className="menu-top">
            <Activity size={26} />
            <b>PROJECT AEGIS</b>
            <span>AI 災難指揮中心</span>
          </div>
          <div className="menu-content">
            <div className="menu-intro">
              <span className="scenario-label">PHASE 2 / SYSTEMIC CRISIS</span>
              <h1>
                在不完整的情報中，
                <br />
                做出關鍵決策。
              </h1>
              <p>
                你是臨江市緊急應變指揮官。災害、居民風險與醫療壓力持續演化；每份情報都有來源、傳輸路徑與不確定性。
              </p>
              <div className="briefing">
                <h2>
                  {scenarioId === "flood"
                    ? "臨江市・都市暴洪"
                    : "臨江市・都市地震"}
                </h2>
                <p>四個行政區 · 兩家醫院 · 18 個應變單位</p>
                <ul>
                  <li>區分觀察時間與接收時間，查證互相矛盾的消息。</li>
                  <li>派遣消防、救護、警察與搶修隊，等待命令確認。</li>
                  <li>任務結束後，檢視因果、定位重播並模擬替代指令。</li>
                </ul>
              </div>
            </div>
            <form
              className="menu-start"
              onSubmit={(e) => {
                e.preventDefault();
                void start();
              }}
            >
              <Radio className="menu-radio" size={38} />
              <h2>啟動應變中心</h2>
              <label htmlFor="scenario">災害場景</label>
              <select
                id="scenario"
                value={scenarioId}
                onChange={(e) => {
                  setScenarioId(e.target.value);
                  setSeed(
                    e.target.value === "flood"
                      ? "AEGIS-FLOOD-2026-001"
                      : SHOWCASE,
                  );
                }}
              >
                <option value="earthquake">都市地震 · 複合災害</option>
                <option value="flood">都市暴洪 · 居民疏散</option>
              </select>
              <label htmlFor="seed">情境 Seed</label>
              <input
                id="seed"
                value={seed}
                maxLength={100}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="輸入可重現的種子"
                required
              />
              <div className="seed-actions">
                <button
                  type="button"
                  onClick={() =>
                    setSeed(
                      scenarioId === "flood"
                        ? "AEGIS-FLOOD-2026-001"
                        : SHOWCASE,
                    )
                  }
                >
                  展示種子
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSeed(
                      `AEGIS-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`,
                    )
                  }
                >
                  隨機種子
                </button>
              </div>
              <p className="muted">
                相同 seed 與命令可重現相同世界結果。無需 API key。
              </p>
              <button className="primary full" type="submit" disabled={busy}>
                <Play size={16} />
                {busy ? "建立情境…" : "開始新情境"}
              </button>
              <button
                type="button"
                className="full"
                onClick={() => void load()}
                disabled={busy}
              >
                <FolderOpen size={15} />
                載入存檔
              </button>
            </form>
          </div>
          <div className="menu-footer">
            Information Fog · Command · Consequence · Replay
            <span>LOCAL SIMULATION / v0.2.2</span>
          </div>
        </main>
      ) : (
        <>
          <header className="topbar">
            <div className="brand">
              <Activity size={21} />
              <b>PROJECT AEGIS</b>
              <span>AI 災難指揮中心</span>
            </div>
            <div className="scenario-title">{session!.scenario.name}</div>
            <time data-testid="sim-clock">{clock(session!.view.tick)}</time>
            <button
              className={`pause-control ${paused ? "warning" : ""}`}
              aria-label={paused ? "開始模擬" : "暫停模擬"}
              title={paused ? "開始模擬" : "暫停模擬"}
              disabled={busy || session!.view.completed || screen !== "COMMAND"}
              onClick={() => setPaused(!paused)}
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}{" "}
              {paused ? "暫停" : "運行中"}
            </button>
            <div className="speeds">
              {[1, 2, 4, 8].map((n) => (
                <button
                  key={n}
                  className={speed === n ? "active" : ""}
                  aria-label={`速度 ${n} 倍`}
                  onClick={() => setSpeed(n)}
                >
                  ×{n}
                </button>
              ))}
            </div>
            <div className="top-actions">
              <button onClick={() => void save()} disabled={busy}>
                <Save size={14} />
                儲存
              </button>
              <button onClick={() => void load()} disabled={busy}>
                <FolderOpen size={14} />
                載入
              </button>
              <button
                title="返回主選單"
                aria-label="返回主選單"
                onClick={() => {
                  setPaused(true);
                  setConfirmMenu(true);
                }}
              >
                <ArrowLeft size={15} />
              </button>
            </div>
          </header>
          {screen === "AAR" && session?.aar ? (
            <AfterAction
              data={session.aar}
              seek={(tick) => void seek(tick)}
              back={() => setScreen("COMMAND")}
              commands={session.replaySummary?.commands ?? []}
              comparison={session.counterfactual}
              busy={busy}
              fork={(tick, plan) => void fork(tick, plan)}
              saveBranch={(id) => void saveBranch(id)}
            />
          ) : (
            session && (
              <>
                <div
                  className={`operation-banner ${session.mode === "REPLAY" ? "replay-banner" : ""}`}
                >
                  <span>
                    <ShieldCheck size={13} />
                    {session.mode === "REPLAY"
                      ? `重播模式 · ${session.replayVerified ? "完整結果校驗通過" : "校驗中"}`
                      : "指揮中心情報視圖"}
                  </span>
                  <span>
                    電力：
                    {session.view.beliefs.find((b) => b.kind === "POWER")?.claim
                      .value ?? "未知"}
                    <span className="divider">|</span>通訊：
                    {receivedComms
                      ? (statusNames[receivedComms.claim.value] ??
                        receivedComms.claim.value)
                      : "未知"}
                  </span>
                </div>
                <main className="command-layout">
                  <Resources
                    view={session.view}
                    command={command}
                    disabled={
                      session.mode === "REPLAY" ||
                      session.view.completed ||
                      busy
                    }
                  />
                  <div className="center-column">
                    {session.mode === "REPLAY" && (
                      <ReplayTimeline
                        session={session}
                        busy={busy}
                        seek={(tick) => void seek(tick)}
                      />
                    )}
                    <SituationMap
                      view={session.view}
                      identity={session.scenario}
                    />
                    <CommandQueue view={session.view} />
                  </div>
                  <Intelligence
                    view={session.view}
                    command={command}
                    disabled={
                      session.mode === "REPLAY" ||
                      session.view.completed ||
                      busy
                    }
                  />
                </main>
                <footer className="controlbar">
                  <span>{notice || "情報有延遲，請留意來源與觀察時間。"}</span>
                  <div>
                    {session.mode === "REPLAY" && (
                      <>
                        <span>
                          {session.view.tick} / {session.replayEnd}s
                        </span>
                        <button
                          disabled={busy}
                          onClick={() => {
                            setPaused(true);
                            void getPort()
                              .aar()
                              .then((result) => {
                                accept(result);
                                setScreen("AAR");
                              })
                              .catch(handleError);
                          }}
                        >
                          返回 AAR
                        </button>
                      </>
                    )}
                    {!session.view.completed && (
                      <>
                        <button
                          disabled={busy || !paused}
                          onClick={() => void step(10)}
                        >
                          推進 10秒
                        </button>
                        <button
                          disabled={busy || !paused}
                          onClick={() => void step(60)}
                        >
                          推進 1分
                        </button>
                        <button
                          disabled={busy || !paused}
                          onClick={() => void step(300)}
                        >
                          推進 5分
                        </button>
                      </>
                    )}
                    {session.view.completed && session.mode === "LIVE" && (
                      <button onClick={() => setScreen("AAR")}>開啟 AAR</button>
                    )}
                  </div>
                </footer>
              </>
            )
          )}
        </>
      )}
      {error && (
        <div className="modal-backdrop">
          <section
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="error-title"
          >
            <h2 id="error-title">操作未完成</h2>
            <p>{error}</p>
            <p className="muted">目前情境保留，請關閉提示後繼續操作。</p>
            <button className="primary" onClick={() => setError("")}>
              關閉
            </button>
          </section>
        </div>
      )}
      {confirmMenu && (
        <div className="modal-backdrop">
          <section className="dialog" role="dialog" aria-modal="true">
            <h2>返回主選單？</h2>
            <p>新情境會取代目前進度。你可以先儲存。</p>
            <div className="row-actions">
              <button onClick={() => setConfirmMenu(false)}>取消</button>
              <button
                onClick={() => {
                  setConfirmMenu(false);
                  void save();
                }}
              >
                先儲存
              </button>
              <button
                className="primary"
                onClick={() => {
                  setConfirmMenu(false);
                  setScreen("MENU");
                }}
              >
                返回主選單
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
