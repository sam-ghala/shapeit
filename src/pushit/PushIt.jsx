import { useEffect, useRef, useState } from "react";
import { Dialog } from "../components/Dialog.jsx";
import { SoundToggle } from "../components/SoundToggle.jsx";
import { getProfile, readJSON, writeJSON } from "../game/storage.js";
import { readTabState, writeTabState } from "../game/navigation.js";
import { playSound, resultSound } from "../game/audio.js";
import { createGame } from "./engine.js";
import {
  newMatch,
  nextRound,
  playMatch,
  resetRound,
  restoreLocalMatch,
  undoMatch,
} from "./match.js";
import { PushBoard, PushPiece } from "./PushBoard.jsx";
import { usePushRoom } from "./usePushRoom.js";
import "./pushit.css";

const cap = (value) => value[0].toUpperCase() + value.slice(1);
const reducedMotion = () =>
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
export function FormatPicker({ value, onChange, disabled = false }) {
  return (
    <div className="push-format">
      <div
        className="push-format-options"
        role="group"
        aria-label="Match format"
      >
        {[0, 3, 5, 7, value >= 9 ? value : 9].map((n) => (
          <button
            key={n}
            aria-pressed={value === n}
            disabled={disabled}
            onClick={() => onChange(n)}
          >
            {n ? `Best of ${n}` : "Free play"}
          </button>
        ))}
      </div>
      {value >= 9 && (
        <div className="push-format-stepper">
          <button
            aria-label="Shorter series"
            disabled={disabled}
            onClick={() => onChange(value - 2)}
          >
            −
          </button>
          <strong>Best of {value}</strong>
          <button
            aria-label="Longer series"
            disabled={disabled || value >= 99}
            onClick={() => onChange(value + 2)}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
function ColorSwitch({ value, onChange, disabled }) {
  return (
    <div className="push-color-switch" role="group" aria-label="Your color">
      {["black", "white"].map((color) => (
        <button
          key={color}
          aria-label={`Play as ${cap(color)}`}
          aria-pressed={value === color}
          disabled={disabled}
          onClick={() => onChange(color)}
        >
          <span className={`push-color-dot ${color}`} />
          {cap(color)}
        </button>
      ))}
    </div>
  );
}
export function Rules({ onClose }) {
  const [page, setPage] = useState(0);
  const pages = [
    {
      title: "Push one opponent off to win.",
      text: "On your turn, take exactly 1 or 3 actions. Tap your piece, then move forward or rotate 90°.",
      visual: <PushBoard game={createGame()} small />,
    },
    {
      title: "Push a whole row.",
      text: "A forward move pushes every touching piece in that direction. A piece facing you blocks the entire push — even your own.",
      visual: (
        <div className="push-rule-demo">
          <PushPiece color="black" facing={1} />
          <span>⇢</span>
          <PushPiece color="white" facing={0} />
          <PushPiece color="white" facing={1} />
        </div>
      ),
    },
    {
      title: "One action, or all three.",
      text: "After one action, you can end your turn. After two, you must take a third. You can’t move yourself off the edge. Online undo needs your opponent’s approval.",
      visual: (
        <div className="push-rule-count">
          <span>1</span>
          <b>or</b>
          <span>3</span>
        </div>
      ),
    },
  ];
  return (
    <Dialog
      title="How to play"
      onClose={onClose}
      className="push-dialog push-rules"
    >
      <div className="push-guide-page">
        {pages[page].visual}
        <h3>{pages[page].title}</h3>
        <p>{pages[page].text}</p>
      </div>
      <div className="push-guide-nav">
        <button onClick={() => (page ? setPage(page - 1) : onClose())}>
          {page ? "← Back" : "Close"}
        </button>
        <span>
          {page + 1} / {pages.length}
        </span>
        <button
          className="primary"
          onClick={() => (page === 2 ? onClose() : setPage(page + 1))}
        >
          {page === 2 ? "Play →" : "Next →"}
        </button>
      </div>
    </Dialog>
  );
}
function MatchScore({ match, name, online, myColor }) {
  const current = match.game.current;
  const ownTurn = match.phase === "playing" && (!online || current === myColor);
  return (
    <div
      className="push-match-score"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {["black", "white"].map((color, i) => (
        <div
          key={color}
          className={`push-score-side ${color} ${match.phase === "playing" && current === color ? "active" : ""}`}
          style={{ gridColumn: i ? 3 : 1 }}
        >
          <span className={`push-color-dot ${color}`} />
          <strong>{name(color)}</strong>
          {online && color === myColor && <span className="push-you">You</span>}
        </div>
      ))}
      <div className="push-score-middle">
        <b aria-label={`Score ${match.wins.black} to ${match.wins.white}`}>
          {match.wins.black}
          <span>:</span>
          {match.wins.white}
        </b>
        <span className={`push-turn-label ${ownTurn ? "is-yours" : ""}`}>
          {match.game.winner
            ? "ROUND OVER"
            : online
              ? ownTurn
                ? "YOUR TURN"
                : "OPPONENT’S TURN"
              : `${cap(current)}’s turn`}
        </span>
      </div>
    </div>
  );
}
function Victory({
  match,
  name,
  online,
  waiting,
  onNext,
  onClose,
  onUndo,
  canUndo,
  busy,
}) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), 1000);
    return () => clearTimeout(timer);
  }, []);
  const winner = match.matchWinner || match.game.winner;
  return (
    <Dialog
      title={`${name(winner)} wins!`}
      onClose={onClose}
      className={`push-dialog push-victory ${settled ? "is-settled" : ""}`}
    >
      <div className="push-win-art" aria-hidden="true">
        <div className="push-win-ring" />
        <PushPiece color={winner} />
        {Array.from({ length: 14 }, (_, i) => (
          <i
            key={i}
            style={{
              "--i": i,
              "--confetti-color": ["#ffd253", "#65c9ea", "#fa9180"][i % 3],
            }}
          />
        ))}
        <span>✦</span>
      </div>
      <span className="push-result-label">
        {match.matchWinner
          ? `BEST OF ${match.bestOf} · SERIES WON`
          : `ROUND ${match.round}`}
      </span>
      <div className="push-result-score">
        <span>
          <i className="push-color-dot black" />
          {name("black")}
        </span>
        <b key={`${match.wins.black}:${match.wins.white}`}>
          {match.wins.black} : {match.wins.white}
        </b>
        <span>
          <i className="push-color-dot white" />
          {name("white")}
        </span>
      </div>
      <button
        className="primary push-next-round"
        disabled={busy || waiting}
        onClick={onNext}
      >
        {waiting
          ? "Waiting for opponent…"
          : match.matchWinner
            ? "New series →"
            : "Next round →"}
      </button>
      <div className="push-result-actions">
        <button onClick={onClose}>See board</button>
        <button disabled={!canUndo || busy} onClick={onUndo}>
          {online ? "Request undo" : "Undo"}
        </button>
      </div>
    </Dialog>
  );
}

export function PushIt() {
  const [initialCode] = useState(
    () => new URLSearchParams(location.search).get("room") || "",
  );
  const [profile, setProfile] = useState(getProfile);
  const [screen, setScreen] = useState(() =>
    /^\d{4}$/.test(initialCode)
      ? "online"
      : readTabState("pushit:view", "menu"),
  );
  const online = screen === "online";
  const service = usePushRoom(profile, initialCode, online);
  const { room, credentials, busy, error, setError, send } = service;
  const [local, setLocal] = useState(() =>
    restoreLocalMatch(
      readJSON("pushit:match:v2", null),
      readJSON("pushit:local:v1", null),
    ),
  );
  const match = online ? room : local;
  const game = match?.game;
  const [code, setCode] = useState(initialCode),
    [name, setName] = useState(profile.name);
  const [nameOpen, setNameOpen] = useState(
    !profile.name && /^\d{4}$/.test(initialCode),
  );
  const pendingName = useRef(
    !profile.name && /^\d{4}$/.test(initialCode) ? "join" : null,
  );
  const [rules, setRules] = useState(false),
    [setup, setSetup] = useState(false),
    [leave, setLeave] = useState(false),
    [reset, setReset] = useState(false);
  const [bestOf, setBestOf] = useState(0),
    [selected, setSelected] = useState(null),
    [copied, setCopied] = useState(false);
  const [rotateBoard, setRotateBoard] = useState(
    () => readJSON("pushit:rotate-board", false) === true,
  );
  const [resultOpen, setResultOpen] = useState(false);
  const myColor = online ? room?.players[room.you]?.color : game?.current;
  const desiredView = online
    ? myColor || "white"
    : rotateBoard
      ? game?.current || "white"
      : "white";
  const [view, setView] = useState(desiredView),
    [boardAngle, setBoardAngle] = useState(desiredView === "black" ? 180 : 0),
    [rotating, setRotating] = useState(false);
  const lastViewTurn = useRef(game?.turn),
    firstView = useRef(true),
    lastViewGame = useRef(match?.gameId),
    lastRotateSetting = useRef(rotateBoard);
  const playing = match?.phase === "playing";
  const isMyTurn = playing && (!online || game.current === myColor);
  const blocked = !!room?.undoRequest;
  const canPlay = isMyTurn && !busy && !rotating && !blocked;
  const playerName = (color) =>
    online
      ? room?.players.find((p) => p.color === color)?.name || cap(color)
      : cap(color);
  const canUndo = online ? room?.canUndo : !!local?.undoStack.length;
  const showName = (action) => {
    pendingName.current = action;
    setName(profile.name);
    setNameOpen(true);
  };
  const home = () => {
    setScreen("menu");
    setError("");
    setResultOpen(false);
    window.history.replaceState(null, "", "/pushit");
  };
  const openOnline = () =>
    profile.name ? setScreen("online") : showName("online");
  useEffect(() => {
    writeJSON("shapeit:profile", profile);
  }, [profile]);
  useEffect(() => {
    writeTabState("pushit:view", screen);
    setSelected(null);
  }, [screen]);
  useEffect(() => {
    if (local) {
      writeJSON("pushit:match:v2", local);
      writeJSON("pushit:local:v1", local.game);
    }
  }, [local]);
  useEffect(() => {
    writeJSON("pushit:rotate-board", rotateBoard);
  }, [rotateBoard]);
  useEffect(() => {
    setSelected(null);
  }, [game?.turn, match?.gameId]);
  useEffect(() => {
    if (firstView.current && !game) return;
    const initial = firstView.current;
    firstView.current = false;
    const changedTurn = lastViewTurn.current !== game?.turn;
    const changedRound = lastViewGame.current !== match?.gameId;
    const wasRotating = lastRotateSetting.current;
    lastViewTurn.current = game?.turn;
    lastViewGame.current = match?.gameId;
    lastRotateSetting.current = rotateBoard;
    if (initial || changedRound) {
      setView(desiredView);
      setBoardAngle(desiredView === "black" ? 180 : 0);
      setRotating(false);
      return;
    }
    if (desiredView === view) return;
    setRotating(true);
    setSelected(null);
    const delay =
      !online && rotateBoard && wasRotating && changedTurn ? 1000 : 0;
    const timer = setTimeout(() => {
      setView(desiredView);
      setBoardAngle((angle) => angle + 180);
    }, delay);
    const done = setTimeout(
      () => setRotating(false),
      delay + (reducedMotion() ? 1 : 440),
    );
    return () => {
      clearTimeout(timer);
      clearTimeout(done);
    };
  }, [desiredView, match?.gameId, online, rotateBoard]);
  useEffect(() => {
    setResultOpen(false);
    if (!game?.winner || screen === "menu" || room?.undoRequest) return;
    const cancel = resultSound(true);
    const timer = setTimeout(
      () => setResultOpen(true),
      reducedMotion() ? 100 : 1100,
    );
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, [game?.winner, match?.gameId, screen, room?.undoRequest?.by]);
  const lastTurn = useRef(null);
  useEffect(() => {
    const key = online && playing ? `${room.gameId}:${game.turn}` : null;
    if (key && key !== lastTurn.current && isMyTurn) playSound("turn");
    lastTurn.current = key;
    document.title =
      game && screen !== "menu" && match.phase !== "lobby"
        ? `${game.winner ? `${playerName(game.winner)} wins!` : online ? (isMyTurn ? "Your turn" : "Opponent’s turn") : `${cap(game.current)} to play`} · PushIt`
        : "PushIt";
  }, [
    screen,
    game?.turn,
    game?.winner,
    match?.gameId,
    match?.phase,
    online,
    isMyTurn,
  ]);
  const enter = async (join, nextProfile = profile) => {
    if (!nextProfile.name.trim()) {
      showName(join ? "join" : "create");
      return;
    }
    if (join && !/^\d{4}$/.test(code)) {
      setError("Enter a four-digit room code.");
      return;
    }
    await service.enter(join ? code : "", nextProfile);
  };
  const saveName = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const next = { ...profile, name: name.trim().slice(0, 24) };
    setProfile(next);
    writeJSON("shapeit:profile", next);
    setNameOpen(false);
    const action = pendingName.current;
    pendingName.current = null;
    if (action) setScreen("online");
    if (action === "join" || action === "create")
      await enter(action === "join", next);
  };
  const changeLocal = (fn) => {
    const next = structuredClone(local);
    fn(next);
    setLocal(next);
  };
  const takeAction = async (type) => {
    if (!canPlay) return;
    const body = { type, ...(type === "end" ? {} : { pieceId: selected }) };
    if (online) {
      if (await send(body)) playSound(type === "end" ? "turn" : "draw");
    } else
      try {
        changeLocal((next) => playMatch(next, body, game.current));
        playSound(type === "end" ? "turn" : "draw");
      } catch (e) {
        setError(e.message);
      }
  };
  const undo = async () => {
    if (!canUndo || busy || rotating) return;
    if (online) {
      if (await send({ type: "undo" })) setResultOpen(false);
    } else {
      changeLocal(undoMatch);
      setResultOpen(false);
      setSelected(null);
    }
  };
  const advance = async () => {
    if (online) {
      if (await send({ type: match.matchWinner ? "new-series" : "rematch" }))
        setResultOpen(false);
    } else {
      if (local.matchWinner) setLocal(newMatch(local.bestOf));
      else changeLocal(nextRound);
      setResultOpen(false);
    }
  };
  const beginLocal = () => {
    setLocal(newMatch(bestOf));
    setSetup(false);
    setScreen("local");
    setSelected(null);
    setError("");
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/pushit?room=${room.code}`,
      );
      setCopied(true);
    } catch {
      setError(`Room code: ${room.code}`);
    }
  };
  const header = (
    <header className="push-topbar">
      <button
        className="push-wordmark"
        onClick={home}
        aria-label="PushIt main menu"
      >
        Push<span>It</span>
      </button>
      <div>
        {online && room && (
          <span className="push-room-label">#{room.code}</span>
        )}
        <button
          className="push-help"
          aria-label="How to play"
          onClick={() => setRules(true)}
        >
          ?
        </button>
        <SoundToggle compact />
        {online && credentials && (
          <button
            className="push-leave-icon"
            aria-label="Leave room"
            onClick={() => setLeave(true)}
          >
            ×
          </button>
        )}
      </div>
    </header>
  );
  const overlays = (
    <>
      {nameOpen && (
        <Dialog
          title="Your name"
          onClose={() => {
            setNameOpen(false);
            pendingName.current = null;
          }}
          className="push-dialog"
        >
          <form className="push-name-form" onSubmit={saveName}>
            <label>
              Name
              <input
                autoFocus
                autoComplete="nickname"
                maxLength={24}
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <button className="primary" type="submit">
              Save name
            </button>
          </form>
        </Dialog>
      )}
      {rules && <Rules onClose={() => setRules(false)} />}
      {setup && (
        <Dialog
          title={local ? "New match" : "Same device"}
          onClose={() => setSetup(false)}
          className="push-dialog"
        >
          <FormatPicker value={bestOf} onChange={setBestOf} />
          <button className="primary" onClick={beginLocal}>
            Start match →
          </button>
        </Dialog>
      )}
      {leave && (
        <Dialog
          title="Leave room?"
          onClose={() => setLeave(false)}
          className="push-dialog"
        >
          <div className="button-row">
            <button onClick={() => setLeave(false)}>Stay</button>
            <button
              className="primary"
              onClick={() => {
                service.forget(true);
                setLeave(false);
                home();
              }}
            >
              Leave
            </button>
          </div>
        </Dialog>
      )}
      {reset && (
        <Dialog
          title={online ? "Offer a reset?" : "Reset this round?"}
          onClose={() => setReset(false)}
          className="push-dialog"
        >
          <div className="button-row">
            <button onClick={() => setReset(false)}>Cancel</button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                if (online) {
                  if (await send({ type: "reset" })) setReset(false);
                } else {
                  changeLocal(resetRound);
                  setReset(false);
                }
              }}
            >
              Reset round
            </button>
          </div>
        </Dialog>
      )}
      {resultOpen && game?.winner && (
        <Victory
          match={match}
          name={playerName}
          online={online}
          waiting={online && room.rematch.includes(room.you)}
          onNext={advance}
          onClose={() => setResultOpen(false)}
          onUndo={undo}
          canUndo={canUndo}
          busy={busy || blocked}
        />
      )}
    </>
  );
  const errorMessage = error && (
    <div className="push-error" role="alert">
      <span>{error}</span>
      <button aria-label="Dismiss error" onClick={() => setError("")}>
        ×
      </button>
    </div>
  );
  if (screen === "menu" || (!online && !local))
    return (
      <main className="push-app push-home">
        <div className="push-home-top">
          <a href="/">← ShapeIt</a>
          <button
            className="push-profile-button"
            onClick={() => showName(null)}
          >
            {profile.name || "Choose your name"}{" "}
            <span aria-hidden="true">✎</span>
          </button>
        </div>
        <div className="push-home-title">
          <h1>
            Push<span>It</span>
          </h1>
        </div>
        <nav className="push-home-modes" aria-label="PushIt game modes">
          <button
            className="arcade-mode daily-mode"
            onClick={() => (local ? setScreen("local") : setSetup(true))}
          >
            <span className="mode-icon" aria-hidden="true">
              ◧
            </span>
            <strong>{local ? "Continue game" : "Same device"}</strong>
            <span>▶</span>
          </button>
          <button className="arcade-mode train-mode" onClick={openOnline}>
            <span className="mode-icon" aria-hidden="true">
              ⚔
            </span>
            <strong>{credentials ? "Rejoin room" : "Play a friend"}</strong>
            <span>▶</span>
          </button>
          <button
            className="arcade-mode duel-mode"
            onClick={() => setRules(true)}
          >
            <span className="mode-icon" aria-hidden="true">
              ?
            </span>
            <strong>How to play</strong>
            <span>↗</span>
          </button>
        </nav>
        <footer className="menu-credit">Robin &amp; Sam</footer>
        {errorMessage}
        {overlays}
      </main>
    );
  if (online && !room)
    return (
      <main className="push-app">
        {header}
        <section className="push-connect card">
          <h2>{credentials ? "Reconnecting…" : "Play a friend"}</h2>
          {credentials ? (
            <button onClick={() => service.forget()}>Use another room</button>
          ) : (
            <>
              <button
                className="primary"
                disabled={busy}
                onClick={() => enter(false)}
              >
                {busy ? "Connecting…" : "Create room →"}
              </button>
              <form
                className="push-join"
                onSubmit={(e) => {
                  e.preventDefault();
                  void enter(true);
                }}
              >
                <label>
                  Room code
                  <input
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    value={code}
                    placeholder="0000"
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                </label>
                <button disabled={busy || code.length !== 4}>Join →</button>
              </form>
            </>
          )}
        </section>
        {errorMessage}
        {overlays}
      </main>
    );
  if (online && room.phase === "closed")
    return (
      <main className="push-app">
        {header}
        <section className="push-connect card">
          <h2>Room closed</h2>
          <p>{room.left} left.</p>
          <button
            className="primary"
            onClick={() => {
              service.forget();
              home();
            }}
          >
            Main menu
          </button>
        </section>
        {overlays}
      </main>
    );
  if (online && room.phase === "lobby")
    return (
      <main className="push-app">
        {header}
        <section className="push-lobby card">
          <div className="push-lobby-heading">
            <h2>Room {room.code}</h2>
            <button onClick={copyLink}>
              {copied ? "Copied ✓" : "Invite friend ↗"}
            </button>
          </div>
          <div className="push-lobby-players">
            {[0, 1].map((index) => {
              const p = room.players[index];
              return (
                <div key={index} className="push-lobby-player">
                  <strong>
                    {p?.name || "Waiting…"}
                    {index === room.you && <span>You</span>}
                  </strong>
                  {p ? (
                    index === room.you ? (
                      <ColorSwitch
                        value={p.color}
                        disabled={busy}
                        onChange={(color) => send({ type: "color", color })}
                      />
                    ) : (
                      <span className="push-opponent-color">
                        <i className={`push-color-dot ${p.color}`} />
                        {cap(p.color)}
                      </span>
                    )
                  ) : (
                    <div
                      className="push-waiting-dots"
                      aria-label="Waiting for a second player"
                    >
                      <i />
                      <i />
                      <i />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <FormatPicker
            value={room.bestOf}
            disabled={busy || room.you !== 0}
            onChange={(value) => send({ type: "format", bestOf: value })}
          />
          {room.you === 0 ? (
            <button
              className="primary"
              disabled={busy || room.players.length !== 2}
              onClick={() => send({ type: "start" })}
            >
              Start match →
            </button>
          ) : (
            <p className="push-lobby-wait">Waiting for host to start</p>
          )}
        </section>
        {errorMessage}
        {overlays}
      </main>
    );
  return (
    <main className="push-app">
      {header}
      <section className="push-play">
        <MatchScore
          match={match}
          name={playerName}
          online={online}
          myColor={myColor}
        />
        <div className="push-board-area">
          <PushBoard
            key={match.gameId}
            game={game}
            selected={selected}
            perspective={view}
            boardAngle={boardAngle}
            rotating={rotating}
            interactive={canPlay}
            onSelect={setSelected}
            onForward={() => takeAction("forward")}
            onRotate={takeAction}
          />
        </div>
        <div className="push-play-tools">
          <div className="push-main-tools">
            <button
              className="push-undo"
              disabled={!canUndo || busy || rotating || blocked}
              onClick={undo}
              aria-label={online ? "Request undo" : "Undo action"}
            >
              ↶<span>Undo</span>
            </button>
            <div
              className="push-action-meter"
              aria-label={`${game.used} of three actions used`}
            >
              {[1, 2, 3].map((n) => (
                <span key={n} className={game.used >= n ? "used" : ""}>
                  {game.used >= n ? "✓" : n}
                </span>
              ))}
            </div>
            {game.winner ? (
              <button
                className="primary"
                disabled={
                  busy || blocked || (online && room.rematch.includes(room.you))
                }
                onClick={advance}
              >
                {online && room.rematch.includes(room.you)
                  ? "Waiting…"
                  : match.matchWinner
                    ? "New series →"
                    : "Next round →"}
              </button>
            ) : (
              <button
                className="primary push-end"
                disabled={!canPlay || game.used !== 1}
                onClick={() => takeAction("end")}
              >
                End turn →
              </button>
            )}
          </div>
          <div className="push-secondary-tools">
            {!online && (
              <button
                className="push-auto-rotate"
                aria-pressed={rotateBoard}
                onClick={() => {
                  setRotateBoard(!rotateBoard);
                  setSelected(null);
                }}
              >
                ⟳ Auto-rotate
              </button>
            )}
            <span>
              {match.bestOf ? `Best of ${match.bestOf} · ` : ""}Round{" "}
              {match.round}
            </span>
            {!game.winner && (
              <button disabled={busy || blocked} onClick={() => setReset(true)}>
                Reset
              </button>
            )}
            {!online && (
              <button
                onClick={() => {
                  setBestOf(local.bestOf);
                  setSetup(true);
                }}
              >
                New match
              </button>
            )}
          </div>
        </div>
      </section>
      {online && room.undoRequest && (
        <div
          className="push-request-banner"
          role="alertdialog"
          aria-label="Undo request"
        >
          {room.undoRequest.by === room.you ? (
            <strong>Undo requested · waiting…</strong>
          ) : (
            <>
              <strong>
                {room.players[room.undoRequest.by].name} requests undo
              </strong>
              <button
                disabled={busy}
                onClick={() => send({ type: "undo-response", accept: false })}
              >
                Decline
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => send({ type: "undo-response", accept: true })}
              >
                Allow undo
              </button>
            </>
          )}
        </div>
      )}
      {online && room.reset.length > 0 && (
        <div className="push-request-banner" role="status">
          {room.reset.includes(room.you) ? (
            <strong>Reset offered · waiting…</strong>
          ) : (
            <>
              <strong>Reset this round?</strong>
              <button
                className="primary"
                disabled={busy}
                onClick={() => send({ type: "reset" })}
              >
                Accept reset
              </button>
            </>
          )}
        </div>
      )}
      {errorMessage}
      {overlays}
    </main>
  );
}
