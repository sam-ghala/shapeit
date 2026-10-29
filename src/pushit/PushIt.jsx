import { useEffect, useRef, useState } from "react";
import { Dialog } from "../components/Dialog.jsx";
import { MenuButton } from "../components/MenuButton.jsx";
import { SoundToggle } from "../components/SoundToggle.jsx";
import { getProfile, readJSON, writeJSON } from "../game/storage.js";
import { readTabState, writeTabState } from "../game/navigation.js";
import { playSound, resultSound } from "../game/audio.js";
import {
  act,
  coordinate,
  createGame,
  describeAction,
  DIRECTIONS,
  forwardMove,
  RULEBOOK,
  validGame,
} from "./engine.js";
import "./pushit.css";

const titleCase = (value) => value[0].toUpperCase() + value.slice(1);
const savedGame = () => {
  const saved = readJSON("pushit:local:v1", null);
  return validGame(saved) ? saved : null;
};

export function PushPiece({ color, facing = 0 }) {
  return (
    <span
      className={`push-piece ${color}`}
      style={{ "--facing": `${facing * 90}deg` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="13" r="5" fill="currentColor" />
        <path
          d="M32 23v28M22 33l10-10 10 10M21 44h22"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function PushBoard({
  game,
  selected,
  onSelect,
  onForward,
  interactive = false,
  small = false,
}) {
  const move = selected ? forwardMove(game, selected) : null;
  const destination = interactive && move?.legal ? move.destination : null;
  return (
    <div className={`push-board-frame ${small ? "push-board-small" : ""}`}>
      <div className="push-board" role="group" aria-label="PushIt 4 by 4 board">
        {Array.from({ length: 16 }, (_, i) => {
          const x = i % 4,
            y = Math.floor(i / 4);
          const piece = game.pieces.find((p) => p.x === x && p.y === y);
          const target = destination?.[0] === x && destination?.[1] === y;
          const active = interactive && piece?.color === game.current;
          const label = `${coordinate(x, y)}${piece ? `, ${piece.color}, facing ${DIRECTIONS[piece.facing]}` : ", empty"}${target ? ", move here" : ""}`;
          return (
            <button
              key={i}
              className={`push-cell ${(x + y) % 2 ? "tinted" : ""} ${piece?.id === selected ? "selected" : ""} ${target ? "destination" : ""}`}
              aria-label={label}
              aria-pressed={piece ? piece.id === selected : undefined}
              disabled={!active && !target}
              title={label}
              onClick={() => (target ? onForward() : onSelect(piece.id))}
            >
              <span className="push-cell-coordinate" aria-hidden="true">
                {coordinate(x, y)}
              </span>
              {piece && <PushPiece color={piece.color} facing={piece.facing} />}
              {target && (
                <span className="push-target" aria-hidden="true">
                  {piece ? "⇢" : "+"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Rules({ onClose }) {
  return (
    <Dialog title="How to play PushIt" onClose={onClose} className="push-rules">
      <p className="push-rule-intro">
        Six pieces. Sixteen squares. One push to win.
      </p>
      <h3>01 · Set up</h3>
      <p>
        Use the arrangement below. The sun dot marks each piece’s front. The
        person who most recently saw a sunrise starts and chooses Black or
        White.
      </p>
      <PushBoard game={createGame()} small />
      <h3>02 · Take one or three actions</h3>
      <p>
        On every turn, use exactly <strong>one or three</strong> actions, spread
        across any of your pieces. After one, end your turn or continue. After
        two, you must take a third.
      </p>
      <div className="push-rule-actions">
        <div>
          <b>↶ Rotate</b>
          <p>Turn a piece 90° left or right. A half-turn costs two actions.</p>
        </div>
        <div>
          <b>↑ Move</b>
          <p>
            Advance one square toward its sun. You cannot move yourself off the
            board.
          </p>
        </div>
        <div>
          <b>⇢ Push</b>
          <p>
            Advance into a piece to move the entire touching row one square,
            including friendly pieces. This costs one action.
          </p>
        </div>
      </div>
      <h3>03 · Protect your front</h3>
      <p>
        A push is blocked if{" "}
        <strong>any piece in the row faces the pusher</strong>, even a friendly
        piece farther along the row. Pushed pieces keep their facing direction.
      </p>
      <div
        className="push-example"
        aria-label="An upward-facing piece cannot push a downward-facing piece above it"
      >
        <span>↓</span>
        <span>↑</span>
        <b>Front to front = blocked</b>
      </div>
      <h3>04 · Push one opponent off to win</h3>
      <p>
        The game ends immediately when you push an opposing piece over the edge,
        even before your third action. Removing your own piece does not count as
        a win. If both players agree the position is stuck, reset together.
      </p>
      <p className="muted small">
        Rules based on DUAT by Caleb Carvalho, published by Unphazed Games.{" "}
        <a href={RULEBOOK} target="_blank" rel="noreferrer">
          Read the official 2026 rulebook ↗
        </a>
      </p>
      <button className="primary" onClick={onClose}>
        Got it · let’s play
      </button>
    </Dialog>
  );
}

async function api(path, token, body, signal) {
  const response = await fetch(`/api/pushit/rooms${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal,
  });
  const data = await response
    .json()
    .catch(() => ({ error: "Online play is unavailable. Please try again." }));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export function PushIt() {
  const [initialCode] = useState(
    () => new URLSearchParams(location.search).get("room") || "",
  );
  const [profile, setProfile] = useState(getProfile);
  const [local, setLocal] = useState(savedGame);
  const [credentials, setCredentials] = useState(() => {
    const saved = readJSON("pushit:room", null);
    return saved?.profileId === profile.id &&
      (!initialCode || initialCode === saved.code)
      ? saved
      : null;
  });
  const [screen, setScreen] = useState(() =>
    /^\d{4}$/.test(initialCode)
      ? "online"
      : readTabState("pushit:view", "menu"),
  );
  const [room, setRoom] = useState(null);
  const [name, setName] = useState(profile.name || "");
  const [code, setCode] = useState(initialCode);
  const [starter, setStarter] = useState("black");
  const [hostColor, setHostColor] = useState("black");
  const [selected, setSelected] = useState(null);
  const [undo, setUndo] = useState([]);
  const [rules, setRules] = useState(false);
  const [setup, setSetup] = useState(false);
  const [reset, setReset] = useState(false);
  const [leave, setLeave] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const pending = useRef(false),
    inFlight = useRef(null),
    sequence = useRef(0),
    roomRef = useRef(room);
  roomRef.current = room;
  const online = screen === "online";
  const game = online ? room?.game : local;
  const playing = online ? room?.phase === "playing" : !!game && !game.winner;
  const myColor = online ? room?.players[room.you]?.color : game?.current;
  const canPlay = playing && !busy && (!online || game.current === myColor);
  const chosen = game?.pieces.find((p) => p.id === selected);
  const move = chosen ? forwardMove(game, chosen.id) : null;
  const playerName = (color) =>
    online
      ? room?.players.find((p) => p.color === color)?.name || titleCase(color)
      : titleCase(color);

  useEffect(() => {
    document.title = "PushIt · A game of one or three";
    const meta = document.querySelector('meta[name="description"]');
    if (meta)
      meta.content =
        "A two-player strategy game. Rotate, move and push. Take one or three actions and push an opponent off to win.";
  }, []);
  useEffect(() => {
    writeTabState("pushit:view", screen);
  }, [screen]);
  useEffect(() => {
    if (local) writeJSON("pushit:local:v1", local);
  }, [local]);
  useEffect(() => {
    setSelected(null);
    setUndo([]);
  }, [game?.turn, room?.round, screen]);
  useEffect(() => {
    if (game?.winner && screen !== "menu") {
      setResultOpen(true);
      return resultSound(true);
    }
    setResultOpen(false);
  }, [game?.winner, room?.round, screen]);

  const request = async (path, token, body) => {
    if (pending.current) {
      if (!body || inFlight.current?.mutation) return null;
      // A player action takes priority over a background poll.
      inFlight.current?.controller.abort();
    }
    const controller = new AbortController();
    const flight = { controller, mutation: !!body };
    const timeout = setTimeout(
      () =>
        controller.abort(
          new DOMException("Connection timed out. Retrying…", "TimeoutError"),
        ),
      12000,
    );
    inFlight.current = flight;
    pending.current = true;
    if (body) setBusy(true);
    const current = ++sequence.current;
    try {
      const data = await api(path, token, body, controller.signal);
      if (current !== sequence.current) return null;
      if (
        !roomRef.current ||
        data.room.revision >= roomRef.current.revision ||
        data.room.id !== roomRef.current.id
      )
        setRoom(data.room);
      setError("");
      return data;
    } catch (e) {
      if (current === sequence.current && e.name !== "AbortError")
        setError(
          e.name === "TimeoutError"
            ? "Connection timed out. Retrying…"
            : e.message,
        );
      return null;
    } finally {
      clearTimeout(timeout);
      if (inFlight.current === flight) {
        pending.current = false;
        inFlight.current = null;
        if (body) setBusy(false);
      }
    }
  };
  useEffect(() => {
    if (!credentials || !online) return;
    const poll = () => {
      void request(`/${credentials.code}`, credentials.token);
    };
    poll();
    const timer = setInterval(poll, 1500);
    window.addEventListener("online", poll);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", poll);
      sequence.current++;
    };
  }, [credentials, online]);

  const goHome = () => {
    setScreen("menu");
    setError("");
    window.history.replaceState(null, "", "/pushit");
  };
  const beginLocal = () => {
    setLocal(createGame(starter));
    setSelected(null);
    setUndo([]);
    setSetup(false);
    setReset(false);
    setError("");
    setScreen("local");
  };
  const send = (body) =>
    request(`/${credentials.code}/action`, credentials.token, {
      ...body,
      revision: room.revision,
    });
  const takeAction = async (type) => {
    if (!canPlay) return;
    const action = { type, ...(type !== "end" ? { pieceId: selected } : {}) };
    if (online) {
      const data = await send(action);
      if (data)
        playSound(
          type === "end" || data.room.game.turn !== game.turn ? "turn" : "draw",
        );
    } else {
      try {
        const next = act(local, action);
        setUndo(
          next.turn === local.turn && !next.winner ? [...undo, local] : [],
        );
        setLocal(next);
        setError("");
        playSound(next.turn !== local.turn ? "turn" : "draw");
      } catch (e) {
        setError(e.message);
      }
    }
  };
  const enterRoom = async (join) => {
    const nextProfile = { ...profile, name: name.trim().slice(0, 24) };
    if (!nextProfile.name) {
      setError("Choose your name first.");
      return;
    }
    if (join && !/^\d{4}$/.test(code)) {
      setError("Enter a four-digit room code.");
      return;
    }
    const data = await request(join ? `/${code}/join` : "", null, {
      profile: nextProfile,
      hostColor,
      starter,
    });
    if (!data) return;
    setProfile(nextProfile);
    writeJSON("shapeit:profile", nextProfile);
    const access = {
      code: data.room.code,
      token: data.token,
      profileId: profile.id,
    };
    writeJSON("pushit:room", access);
    setCredentials(access);
    window.history.replaceState(null, "", `/pushit?room=${access.code}`);
  };
  const disconnect = async () => {
    if (busy || pending.current) return;
    if (room && room.phase !== "closed") {
      const data = await send({ type: "leave" });
      if (!data) return;
    }
    sequence.current++;
    writeJSON("pushit:room", null);
    setCredentials(null);
    setRoom(null);
    setLeave(false);
    goHome();
  };
  const forgetRoom = () => {
    sequence.current++;
    writeJSON("pushit:room", null);
    setCredentials(null);
    setRoom(null);
    setError("");
    window.history.replaceState(null, "", "/pushit");
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/pushit?room=${room.code}`,
      );
      setCopied(true);
    } catch {
      setError("Copy the invite link below to share this room.");
    }
  };

  const header = (
    <header className="topbar push-header">
      <MenuButton onClick={goHome} />
      <a href="/pushit" className="push-wordmark">
        Push<span>It</span>
      </a>
      <div>
        <button
          className="push-help"
          onClick={() => setRules(true)}
          aria-label="How to play"
        >
          ?
        </button>
        <SoundToggle compact />
      </div>
    </header>
  );
  const errorMessage = error && (
    <p className="push-error" role="alert">
      {error}
    </p>
  );
  const overlays = (
    <>
      {rules && <Rules onClose={() => setRules(false)} />}
      {setup && (
        <Dialog title="Play on one device" onClose={() => setSetup(false)}>
          <p>
            Black and White share this board. Pass the device after each turn.
          </p>
          <p className="muted">
            The player who last saw a sunrise chooses their color and starts.
          </p>
          <label>
            Starting side
            <select
              value={starter}
              onChange={(e) => setStarter(e.target.value)}
            >
              <option value="black">Black starts</option>
              <option value="white">White starts</option>
            </select>
          </label>
          <button className="primary" onClick={beginLocal}>
            Start game →
          </button>
        </Dialog>
      )}
      {reset && (
        <Dialog
          title={online ? "Reset this board?" : "Start a new game?"}
          onClose={() => setReset(false)}
        >
          <p>
            {online
              ? "A reset starts a fresh board only when both players agree. It does not award a win."
              : "This replaces your saved board. Choose who starts the new game."}
          </p>
          {!online && (
            <label>
              Starting side
              <select
                value={starter}
                onChange={(e) => setStarter(e.target.value)}
              >
                <option value="black">Black starts</option>
                <option value="white">White starts</option>
              </select>
            </label>
          )}
          <div className="button-row">
            <button onClick={() => setReset(false)}>Keep playing</button>
            <button
              className="primary"
              onClick={async () => {
                if (online) {
                  if (await send({ type: "reset" })) setReset(false);
                } else beginLocal();
              }}
            >
              {online ? "Offer reset" : "New game"}
            </button>
          </div>
          {errorMessage}
        </Dialog>
      )}
      {leave && (
        <Dialog title="Leave this room?" onClose={() => setLeave(false)}>
          <p>
            Leaving closes the room for both players. An unfinished game does
            not award a win.
          </p>
          <div className="button-row">
            <button onClick={() => setLeave(false)}>Stay</button>
            <button className="primary" disabled={busy} onClick={disconnect}>
              Leave room
            </button>
          </div>
          {errorMessage}
        </Dialog>
      )}
      {resultOpen && game?.winner && (
        <Dialog
          title={`${playerName(game.winner)} wins!`}
          onClose={() => setResultOpen(false)}
          className="push-result"
        >
          <div className="push-trophy" aria-hidden="true">
            ✦
          </div>
          <p>An opponent’s piece is off the board.</p>
          <p className="muted">
            {game.turn} turns · {titleCase(game.winner)} brought the final push.
          </p>
          <div className="button-row">
            <button onClick={() => setResultOpen(false)}>See board</button>
            <button
              className="primary"
              disabled={busy || (online && room.rematch.includes(room.you))}
              onClick={() => {
                if (online) void send({ type: "rematch" });
                else {
                  setResultOpen(false);
                  setSetup(true);
                }
              }}
            >
              {online && room.rematch.includes(room.you)
                ? "Waiting for rematch…"
                : "Play again →"}
            </button>
          </div>
          {errorMessage}
        </Dialog>
      )}
    </>
  );

  if (screen === "menu" || (!online && !game))
    return (
      <main className="arcade-menu push-menu">
        <header className="menu-top">
          <a className="push-back-shape" href="/">
            ← ShapeIt
          </a>
          <div className="game-title">
            <h1>
              Push<span>It</span>
            </h1>
          </div>
          <p className="push-tagline">A game of one or three.</p>
        </header>
        <div className="push-menu-preview" aria-hidden="true">
          <PushPiece color="black" facing={1} />
          <span>⇢</span>
          <PushPiece color="white" facing={0} />
        </div>
        <nav className="arcade-modes push-modes" aria-label="PushIt game modes">
          <button
            className="arcade-mode daily-mode"
            onClick={() =>
              local && !local.winner ? setScreen("local") : setSetup(true)
            }
          >
            <span className="mode-icon" aria-hidden="true">
              ◧
            </span>
            <span>
              <strong>
                {local && !local.winner ? "Resume game" : "Same device"}
              </strong>
              <small>
                {local && !local.winner
                  ? `Turn ${local.turn} · ${titleCase(local.current)} to play`
                  : "Two players, one board"}
              </small>
            </span>
            <span aria-hidden="true">▶</span>
          </button>
          <button
            className="arcade-mode train-mode"
            onClick={() => {
              setScreen("online");
              setError("");
            }}
          >
            <span className="mode-icon" aria-hidden="true">
              ⚔
            </span>
            <span>
              <strong>{credentials ? "Rejoin room" : "Play a friend"}</strong>
              <small>
                {credentials
                  ? `Room ${credentials.code}`
                  : "A private online duel"}
              </small>
            </span>
            <span aria-hidden="true">▶</span>
          </button>
          <button
            className="arcade-mode duel-mode"
            onClick={() => setRules(true)}
          >
            <span className="mode-icon" aria-hidden="true">
              ?
            </span>
            <span>
              <strong>How to play</strong>
              <small>Rotate. Move. Push to win.</small>
            </span>
            <span aria-hidden="true">↗</span>
          </button>
        </nav>
        <p className="push-menu-objective">
          Push one opposing piece off the board to win.
        </p>
        <footer className="menu-credit">
          Robin &amp; Sam · Based on{" "}
          <a href={RULEBOOK} target="_blank" rel="noreferrer">
            DUAT
          </a>{" "}
          by Caleb Carvalho
        </footer>
        {overlays}
      </main>
    );

  if (online && !room)
    return (
      <main className="app-shell push-shell">
        {header}
        <section className="card push-lobby">
          <span className="push-eyebrow">PRIVATE DUEL</span>
          <h2>
            {credentials
              ? `Reconnecting to room ${credentials.code}`
              : "A friend. A board. A little rivalry."}
          </h2>
          {errorMessage}
          {credentials ? (
            <>
              <p className="muted">
                Your seat and game are saved in this browser.
              </p>
              <button onClick={forgetRoom} disabled={busy}>
                Use another room
              </button>
            </>
          ) : (
            <>
              <label>
                Your name
                <input
                  value={name}
                  maxLength={24}
                  placeholder="Choose your name"
                  autoComplete="nickname"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div className="push-room-options">
                <label>
                  Your side
                  <select
                    value={hostColor}
                    onChange={(e) => setHostColor(e.target.value)}
                  >
                    <option value="black">Black</option>
                    <option value="white">White</option>
                  </select>
                </label>
                <label>
                  Starting side
                  <select
                    value={starter}
                    onChange={(e) => setStarter(e.target.value)}
                  >
                    <option value="black">Black starts</option>
                    <option value="white">White starts</option>
                  </select>
                </label>
              </div>
              <p className="small muted">
                The player who last saw a sunrise chooses their side and starts.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => enterRoom(false)}
              >
                {busy ? "Connecting…" : "Create room →"}
              </button>
              <div className="push-divider">or join a friend</div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void enterRoom(true);
                }}
                className="push-join"
              >
                <label>
                  Room code
                  <input
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="0000"
                    required
                  />
                </label>
                <button type="submit" disabled={busy || code.length !== 4}>
                  Join room
                </button>
              </form>
            </>
          )}
        </section>
        {overlays}
      </main>
    );

  if (online && room.phase === "closed")
    return (
      <main className="app-shell push-shell">
        {header}
        <section className="card push-lobby">
          <h2>Room closed</h2>
          <p>
            {room.left} left the room.{" "}
            {game.winner
              ? "The result is saved for this room."
              : "No win was awarded."}
          </p>
          <button
            className="primary"
            onClick={() => {
              forgetRoom();
              goHome();
            }}
          >
            Back to PushIt
          </button>
        </section>
        {overlays}
      </main>
    );

  return (
    <main className="app-shell push-shell">
      {header}
      {online && (
        <div className="push-room-bar">
          <span>
            Room <strong>{room.code}</strong> · Round {room.round}
          </span>
          <button onClick={() => setLeave(true)}>Leave room</button>
        </div>
      )}
      {errorMessage}
      {online && room.phase === "waiting" && (
        <section className="card push-invite">
          <h2>Waiting for your friend…</h2>
          <p>
            You’re {titleCase(myColor)}. Share the code or invite link to start.
          </p>
          <div className="push-invite-code">{room.code}</div>
          <div className="button-row">
            <button className="primary" onClick={copyLink}>
              {copied ? "Link copied ✓" : "Copy invite link"}
            </button>
          </div>
          <input
            aria-label="Invite link"
            readOnly
            value={`${location.origin}/pushit?room=${room.code}`}
            onFocus={(e) => e.target.select()}
          />
          <p className="small muted">
            Rooms last two hours. Use a second browser or device for your
            friend.
          </p>
        </section>
      )}
      <div className="push-play-layout">
        <section className="push-board-panel">
          <div className="push-players">
            {["black", "white"].map((color) => (
              <div
                key={color}
                className={`push-player ${game.current === color && !game.winner ? "active" : ""} ${color}`}
              >
                <span
                  className={`push-player-dot ${color}`}
                  aria-hidden="true"
                />
                <span>
                  <strong>
                    {playerName(color)}
                    {online && myColor === color ? " (you)" : ""}
                  </strong>
                  <small>
                    {titleCase(color)}
                    {online ? ` · ${room.wins[color]} wins` : ""}
                  </small>
                </span>
                {game.current === color && !game.winner && (
                  <span className="push-turn-arrow" aria-label="Current turn">
                    ◀
                  </span>
                )}
              </div>
            ))}
          </div>
          <PushBoard
            game={game}
            selected={selected}
            interactive={canPlay}
            onSelect={(id) => {
              setSelected(id);
              setError("");
            }}
            onForward={() => takeAction("forward")}
          />
          <p className="push-board-caption">
            <span aria-hidden="true">●</span> The sun marks the front. A piece’s
            front cannot be pushed.
          </p>
        </section>
        <aside className="push-sidebar">
          <section className="card push-turn-card" aria-live="polite">
            <span className="push-eyebrow">
              {game.winner ? "GAME OVER" : `TURN ${game.turn}`}
            </span>
            <h2>
              {game.winner
                ? `${playerName(game.winner)} wins!`
                : online && room.phase === "waiting"
                  ? "Ready when you are."
                  : canPlay
                    ? `${playerName(game.current)} to play`
                    : `${playerName(game.current)}’s turn`}
            </h2>
            {!game.winner && (
              <>
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
                <p className="push-turn-hint">
                  {game.used === 0
                    ? "Take one action or a combination of three."
                    : game.used === 1
                      ? "End your turn, or take two more actions."
                      : "One more action. You can’t stop at two."}
                </p>
              </>
            )}
            {game.winner && (
              <button
                className="primary"
                disabled={busy || (online && room.rematch.includes(room.you))}
                onClick={() =>
                  online ? void send({ type: "rematch" }) : setSetup(true)
                }
              >
                {online && room.rematch.includes(room.you)
                  ? "Waiting for rematch…"
                  : "Play again →"}
              </button>
            )}
          </section>
          {!game.winner && (
            <section className="card push-controls">
              <h3>
                {chosen && canPlay
                  ? `${titleCase(chosen.color)} · ${coordinate(chosen.x, chosen.y)}`
                  : canPlay
                    ? "Choose one of your pieces"
                    : "Watch the board"}
              </h3>
              <p className="small muted">
                {chosen && canPlay
                  ? `Facing ${DIRECTIONS[chosen.facing]}. Each button uses one action.`
                  : online && room.phase === "waiting"
                    ? "The game starts when your friend joins."
                    : canPlay
                      ? "Tap a piece, then rotate or move it."
                      : "Your opponent’s moves appear here."}
              </p>
              <div className="push-rotate-controls">
                <button
                  disabled={!canPlay || !chosen}
                  onClick={() => takeAction("left")}
                >
                  <span aria-hidden="true">↶</span> Left 90°
                </button>
                <button
                  disabled={!canPlay || !chosen}
                  onClick={() => takeAction("right")}
                >
                  <span aria-hidden="true">↷</span> Right 90°
                </button>
              </div>
              <button
                className="primary push-forward"
                disabled={!canPlay || !move?.legal}
                onClick={() => takeAction("forward")}
              >
                {move?.pushed?.length
                  ? `⇢ Push ${move.pushed.length} ${move.pushed.length === 1 ? "piece" : "pieces"}`
                  : "↑ Move forward"}
              </button>
              {canPlay && chosen && !move?.legal && (
                <p className="push-blocked">{move.reason}</p>
              )}
              <button
                className="push-end"
                disabled={!canPlay || game.used !== 1}
                onClick={() => takeAction("end")}
              >
                End turn {game.used === 1 ? "→" : ""}
              </button>
              {!online && (
                <button
                  className="text-button push-undo"
                  disabled={!undo.length}
                  onClick={() => {
                    setLocal(undo.at(-1));
                    setUndo(undo.slice(0, -1));
                    setError("");
                  }}
                >
                  ↶ Undo action
                </button>
              )}
            </section>
          )}
          {online && room.reset.length > 0 && (
            <div className="card push-reset-offer">
              <p>
                {room.reset.includes(room.you)
                  ? "Reset offered. Waiting for your friend."
                  : "Your friend offered to reset this board."}
              </p>
              {!room.reset.includes(room.you) && (
                <button disabled={busy} onClick={() => send({ type: "reset" })}>
                  Agree to reset
                </button>
              )}
            </div>
          )}
          <details className="push-history">
            <summary>
              Move history{" "}
              <span>
                {game.log.length === 90
                  ? "last 90 actions"
                  : `${game.log.length} actions`}
              </span>
            </summary>
            <ol>
              {game.log
                .slice()
                .reverse()
                .map((entry, i) => (
                  <li key={`${game.turn}:${i}`}>
                    <span
                      className={`push-history-dot ${entry.color}`}
                      aria-label={entry.color}
                    />
                    <span>
                      <small>Turn {entry.turn}</small>
                      {describeAction(entry)}
                    </span>
                  </li>
                ))}
            </ol>
            {!game.log.length && (
              <p className="muted small">Your first move goes here.</p>
            )}
          </details>
          <div className="push-game-links">
            <button onClick={() => setRules(true)}>How to play</button>
            {!game.winner && (!online || room.phase === "playing") && (
              <button
                disabled={busy || (online && room.reset.includes(room.you))}
                onClick={() => setReset(true)}
              >
                {online ? "Offer reset" : "New game"}
              </button>
            )}
          </div>
        </aside>
      </div>
      {overlays}
    </main>
  );
}
