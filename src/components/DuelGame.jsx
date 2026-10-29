import { MenuButton } from "./MenuButton.jsx";
import { SoundToggle } from "./SoundToggle.jsx";
import { previewPlacement } from "../game/placement.js";
import { ExtraOptions } from "./ExtraOptions.jsx";
import { ResultDialog } from "./ResultDialog.jsx";
import { unlockAudio, playSound } from "../game/audio.js";
import { nextPencilColor } from "../game/assistance.js";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  SIZES,
  emptyBoard,
  rotateCells,
  mirrorCells,
  generatePuzzle,
  fireLaser,
  boardFromPlaced,
} from "../game/engine.js";
import { readJSON, writeJSON } from "../game/storage.js";
import { GameBoard } from "./GameBoard.jsx";
import { PiecePreview } from "./PiecePreview.jsx";
import { ColorPicker, PieceList, QueryLog } from "./GameControls.jsx";

async function api(path, token, body, signal) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal,
  });
  const data = await res.json().catch(() => ({
    error: "The online service is unavailable. Please try again.",
  }));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}
export function DuelGame({
  profile,
  onProfileChange,
  mobile,
  onHome,
  effects,
  initialCode = "",
}) {
  const [playerName, setPlayerName] = useState(profile.name);
  const [credentials, setCredentials] = useState(() => {
    const saved = readJSON("shapeit:room", null);
    return saved?.profileId === profile.id &&
      (!initialCode || saved.code === initialCode)
      ? saved
      : null;
  });
  const [room, setRoom] = useState(null),
    [code, setCode] = useState(initialCode),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  const busyRef = useRef(false),
    sequence = useRef(0);
  const run = async (path, token, body) => {
    if (busyRef.current && body) return;
    if (body) {
      busyRef.current = true;
      setBusy(true);
    }
    const seq = ++sequence.current;
    try {
      const data = await api(path, token, body);
      if (seq === sequence.current) {
        setRoom(data.room);
        setError("");
      }
      return data;
    } catch (e) {
      if (seq === sequence.current) setError(e.message);
      return null;
    } finally {
      if (body) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  useEffect(() => {
    if (!credentials) return;
    let alive = true,
      running = false;
    const poll = async () => {
      if (!alive || busyRef.current || running) return;
      running = true;
      await run(`/api/rooms/${credentials.code}`, credentials.token);
      running = false;
    };
    void poll();
    const timer = setInterval(poll, 1500);
    return () => {
      alive = false;
      sequence.current++;
      clearInterval(timer);
    };
  }, [credentials]);
  const enter = async (join) => {
    if (!playerName.trim()) {
      setError("Choose your name first.");
      return;
    }
    const nextProfile = {
      ...profile,
      name: playerName.trim().slice(0, 24),
    };
    onProfileChange(nextProfile);
    const data = await run(
      join ? `/api/rooms/${code}/join` : "/api/rooms",
      null,
      { profile: nextProfile, mobile },
    );
    if (data) {
      const value = {
        code: data.room.code,
        token: data.token,
        profileId: profile.id,
      };
      setCredentials(value);
      writeJSON("shapeit:room", value);
      window.history.replaceState(null, "", `?room=${data.room.code}`);
    }
  };
  const action = async (body) =>
    run(`/api/rooms/${credentials.code}/action`, credentials.token, {
      ...body,
      roundId: room?.id,
    });
  const syncDrawing = useCallback(
    (roundId, drawing, signal) => {
      if (!credentials) return Promise.resolve(null);
      return api(
        `/api/rooms/${credentials.code}/action`,
        credentials.token,
        { type: "draft", roundId, drawing },
        signal,
      ).catch(() => null);
    },
    [credentials],
  );
  const reset = () => {
    setCredentials(null);
    setRoom(null);
    setError("");
    writeJSON("shapeit:room", null);
    window.history.replaceState(null, "", "/");
  };
  const link = room ? `${window.location.origin}/?room=${room.code}` : "";
  return (
    <main className="app-shell game-shell duel-shell">
      <header className="topbar">
        <MenuButton onClick={onHome} />
        <h1>1 vs 1</h1>
        <div className="header-actions">
          <SoundToggle compact />
          {room && (
            <span className="badge">
              Room {room.code} · {room.round || 1}
            </span>
          )}
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          {credentials && <button onClick={reset}>Join another room</button>}
        </p>
      )}
      {!room && !credentials && (
        <label className="card">
          Your player name
          <input
            value={playerName}
            placeholder="Select your name"
            maxLength={24}
            autoComplete="nickname"
            onChange={(e) => setPlayerName(e.target.value)}
            disabled={busy}
          />
        </label>
      )}
      {!room && !credentials && (
        <div className="duel-entry">
          <section className="card">
            <div className="mode-symbol blue">↗</div>
            <h2>Challenge a friend</h2>
            <button
              className="primary"
              onClick={() => enter(false)}
              disabled={busy}
            >
              Create room
            </button>
          </section>
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              enter(true);
            }}
          >
            <h2>Have a code?</h2>
            <label>
              Four-digit room code
              <input
                className="room-code"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="0000"
                required
              />
            </label>
            <button className="primary" disabled={busy || code.length !== 4}>
              Join room
            </button>
          </form>
        </div>
      )}
      {!room && credentials && !error && (
        <p className="notice">Reconnecting to room {credentials.code}…</p>
      )}
      {room?.phase === "lobby" && (
        <div className="lobby-grid">
          <section className="card">
            <h2>Your private room</h2>
            <p className="large-code">{room.code}</p>
            <div className="button-row">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                  } catch {
                    setError("Select and copy the room link below.");
                  }
                }}
              >
                {copied ? "Link copied" : "Copy invite link"}
              </button>
            </div>
            <input
              aria-label="Invite link"
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
            />
            <ul className="player-list">
              {room.players.map((p, i) => (
                <li key={i}>
                  <span className="avatar">
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <strong>
                    {p.name}
                    {i === room.you ? " (you)" : ""}
                  </strong>
                  <span className="muted">
                    {p.mobile ? "Phone" : "Computer"}
                    {i === 0 ? " · Host" : ""}
                  </span>
                </li>
              ))}
              {room.players.length === 1 && (
                <li className="muted">Waiting for your friend…</li>
              )}
            </ul>
          </section>
          <section className="card">
            <h2>Room settings</h2>
            <fieldset disabled={room.you !== 0 || busy}>
              <div
                className="duel-mode-choice"
                role="group"
                aria-label="Duel mode"
              >
                {[
                  [
                    "turns",
                    "Take turns",
                    "Alternate lasers. One final attempt each.",
                  ],
                  [
                    "race",
                    "Score race",
                    "Play together. Time + lasers decide the score.",
                  ],
                ].map(([mode, title, help]) => (
                  <button
                    key={mode}
                    aria-pressed={(room.settings.mode || "turns") === mode}
                    onClick={() =>
                      action({
                        type: "settings",
                        settings: { ...room.settings, mode },
                      })
                    }
                  >
                    <strong>{title}</strong>
                    <small>{help}</small>
                  </button>
                ))}
              </div>
              <ExtraOptions
                value={room.settings.extras}
                onChange={(extras) =>
                  action({
                    type: "settings",
                    settings: { ...room.settings, extras },
                  })
                }
              />
            </fieldset>
            {room.you === 0 ? (
              <button
                className="primary"
                disabled={room.players.length !== 2 || busy}
                onClick={() => action({ type: "start" })}
              >
                Start placing
              </button>
            ) : (
              <p className="notice">
                Your host starts the game when you're both here.
              </p>
            )}
          </section>
        </div>
      )}
      {room && room.phase !== "lobby" && (
        <DuelBoard
          key={room.id}
          room={room}
          action={action}
          syncDrawing={syncDrawing}
          busy={busy}
          effects={effects}
          onNewRoom={reset}
        />
      )}
    </main>
  );
}
export function DuelBoard({
  room,
  action,
  syncDrawing,
  busy,
  effects,
  onNewRoom,
}) {
  const { cols, rows } = SIZES[room.size],
    me = room.players[room.you],
    opponent = room.players[1 - room.you];
  const [orientations, setOrientations] = useState({});
  const [replay, setReplay] = useState(null);
  const [selectedPiece, setSelectedPiece] = useState(me.pieces[0]?.id),
    [error, setError] = useState("");
  const [clock, setClock] = useState(Date.now()),
    [selectedQuery, setSelectedQuery] = useState(null),
    [view, setView] = useState("drawing"),
    [owner, setOwner] = useState(1 - room.you),
    [resultOpen, setResultOpen] = useState(false),
    [reviewMode, setReviewMode] = useState("overlay"),
    [selectionVersion, setSelectionVersion] = useState(0),
    [shareMessage, setShareMessage] = useState("");
  const drawKey = `shapeit:duel-drawing:${room.id}:${room.you}`;
  const [drawing, setDrawing] = useState(() => {
    const saved = readJSON(drawKey, null);
    return saved &&
      Array.isArray(saved.guess) &&
      saved.guess.length === rows &&
      saved.guess.every((row) => Array.isArray(row) && row.length === cols) &&
      saved.edges
      ? saved
      : { guess: emptyBoard(cols, rows), edges: {} };
  });
  const [color, setColor] = useState(opponent.pieces[0]?.color || "red");
  const offset = useRef(room.serverNow - Date.now());
  useEffect(() => {
    offset.current = room.serverNow - Date.now();
  }, [room.serverNow]);
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    writeJSON(drawKey, drawing);
  }, [drawKey, drawing]);
  const countdown = room.deadline
    ? Math.min(
        60,
        Math.max(0, Math.ceil((room.deadline - clock - offset.current) / 1000)),
      )
    : null;
  const race = room.settings.mode === "race";
  const done = room.phase === "finished",
    setup = room.phase === "setup";
  useEffect(() => {
    if (done) {
      setView("solution");
      setResultOpen(true);
    }
  }, [done]);
  const piece = me.pieces.find((p) => p.id === selectedPiece);
  const placedPiece = me.placed.find((p) => p.id === selectedPiece);
  const cells =
    orientations[selectedPiece] ||
    rotateCells(placedPiece?.absCells || piece.cells, 0);
  const preview = (r, c) =>
    previewPlacement(piece, cells, r, c, me.placed, cols, rows);
  const placeAt = async (r, c) => {
    if (me.ready || busy) return;
    const candidate = preview(r, c);
    if (candidate.error) {
      setError(candidate.error);
      return;
    }
    setError("");
    const result = await action({ type: "place", placed: candidate.placed });
    if (result) playSound("draw");
  };
  const transform = async (kind) => {
    const next = kind === "rotate" ? rotateCells(cells, 1) : mirrorCells(cells);
    if (placedPiece) {
      const r = Math.min(...placedPiece.absCells.map((c) => c[0]));
      const c = Math.min(...placedPiece.absCells.map((c) => c[1]));
      const candidate = previewPlacement(
        piece,
        next,
        r,
        c,
        me.placed,
        cols,
        rows,
      );
      if (candidate.error) {
        setError(candidate.error);
        return;
      }
      setError("");
      await action({ type: "place", placed: candidate.placed });
    }
    setOrientations((value) => ({ ...value, [selectedPiece]: next }));
  };
  const canDraw = !done && !setup && !me.submitted;
  const latestDrawing = useRef(drawing);
  latestDrawing.current = drawing;
  useEffect(() => {
    if (!canDraw || !syncDrawing) return;
    const controller = new AbortController();
    let sent = "",
      sending = false;
    const send = async () => {
      const current = latestDrawing.current,
        signature = JSON.stringify(current);
      if (sending || signature === sent) return;
      sending = true;
      const result = await syncDrawing(room.id, current, controller.signal);
      if (result) sent = signature;
      sending = false;
    };
    const timer = setInterval(send, 800);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [canDraw, room.id, syncDrawing]);
  useEffect(() => {
    if (me.submitted && !done) {
      setView("mine");
      setReplay(null);
      setSelectedQuery(null);
    }
  }, [me.submitted, done]);
  const myTurn =
    room.phase === "playing" &&
    !me.submitted &&
    (race || room.turn === room.you);
  const lastTurn = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !lastTurn.current && !race) playSound("turn");
    lastTurn.current = myTurn;
  }, [myTurn, race]);
  const cell = (r, c) => {
    if (!canDraw) return;
    playSound("draw");
    setDrawing((d) => {
      const guess = d.guess.map((row) => [...row]),
        old = guess[r][c];
      guess[r][c] =
        color === "x"
          ? old?.color === "x"
            ? null
            : { color: "x", type: "x" }
          : old?.color !== color
            ? { color, type: "\\" }
            : old.type === "\\"
              ? { color, type: "/" }
              : null;
      return { ...d, guess };
    });
  };
  const edge = (key) => {
    if (!canDraw || color === "x") return;
    playSound("draw");
    setDrawing((d) => {
      const edges = { ...d.edges };
      if (edges[key] === color) delete edges[key];
      else edges[key] = color;
      return { ...d, edges };
    });
  };
  const canSubmit =
    !me.submitted &&
    (room.phase === "final" ||
      (room.phase === "playing" &&
        (race || room.turn === room.you || room.lastActor === room.you)));
  const handleLaser = async (side, idx) => {
    const ownBoard = !done && view === "mine";
    const shooter = done ? 1 - owner : ownBoard ? 1 - room.you : room.you;
    const existing = room.queries.findIndex(
      (q) =>
        q.player === shooter &&
        ((q.side === side && q.idx === idx) ||
          (q.exitSide === side && q.exitIdx === idx)),
    );
    if (done || ownBoard) {
      if (ownBoard && existing < 0) return;
      playSound("laser");
      setSelectedQuery(existing >= 0 ? existing : null);
      setSelectionVersion((v) => v + 1);
      setReplay({
        ...fireLaser(
          boardFromPlaced(
            room.players[done ? owner : room.you].placed,
            cols,
            rows,
          ),
          side,
          idx,
        ),
        side,
        idx,
      });
      return;
    }
    if (existing >= 0) {
      playSound("laser");
      setSelectedQuery(existing);
      setSelectionVersion((v) => v + 1);
      return;
    }
    if (!myTurn) return;
    unlockAudio();
    const data = await action({ type: "laser", side, idx });
    const shot = data?.room?.queries.findLast((q) => q.player === room.you);
    if (shot?.player === room.you) {
      playSound("laser");
      setColor(
        nextPencilColor(
          shot.colors,
          opponent.pieces,
          drawing.guess,
          drawing.edges,
          color,
        ),
      );
      setSelectedQuery(data.room.queries.indexOf(shot));
      setSelectionVersion((v) => v + 1);
    }
  };
  const resultTitle =
    room.winner === "draw"
      ? "Draw!"
      : room.winner === "none"
        ? "Both missed"
        : room.winner === room.you
          ? "You won!"
          : `${opponent.name} wins`;
  const rematchLabel = room.rematch?.includes(room.you)
    ? "Waiting for rematch…"
    : room.rematch?.length
      ? "Accept rematch"
      : "Rematch";
  const shareResult = async () => {
    const text = `ShapeIt 1 vs 1 · ${me.name} vs ${opponent.name} · ${resultTitle}\nhttps://playshapeit.com`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setShareMessage("Result copied.");
      }
    } catch (e) {
      if (e.name !== "AbortError") setShareMessage("Sharing is unavailable.");
    }
  };
  const boardOwner = done ? owner : view === "mine" ? room.you : 1 - room.you;
  const author = 1 - boardOwner;
  const reviewedDrawing = done
    ? room.players[author].submission?.drawing
    : view === "mine"
      ? opponent.draft
      : drawing;
  const ownBoard = boardOwner === room.you;
  const changeBoard = (index) => {
    setOwner(index);
    setView(index === room.you ? "mine" : "drawing");
    setReplay(null);
    setSelectedQuery(null);
  };
  const selectQuery = (index) => {
    const q = room.queries[index],
      target = 1 - q.player;
    changeBoard(target);
    setSelectedQuery(index);
    setSelectionVersion((v) => v + 1);
    if (done || target === room.you)
      setReplay({
        ...fireLaser(
          boardFromPlaced(room.players[target].placed, cols, rows),
          q.side,
          q.idx,
        ),
        side: q.side,
        idx: q.idx,
      });
    playSound("laser");
  };
  const ownSeconds = room.startedAt
    ? Math.max(
        0,
        Math.floor(
          ((me.submittedAt || clock + offset.current) - room.startedAt) / 1000,
        ),
      )
    : 0;
  const status = setup
    ? "Arrange your board"
    : done
      ? resultTitle
      : me.submitted
        ? `${opponent.name} is finishing…`
        : room.phase === "final"
          ? "Final attempt · no more lasers"
          : race
            ? "Score race · Go!"
            : myTurn
              ? "Your turn"
              : `${opponent.name}'s turn`;
  return (
    <>
      {done && resultOpen && (
        <ResultDialog
          title={resultTitle}
          won={room.winner === room.you || room.winner === "draw"}
          score={race ? (me.submission?.score ?? 0) : undefined}
          scoreEligible={false}
          bonus={race ? (me.submission?.bonus ?? 0) : 0}
          detail={
            race
              ? `You ${me.submission?.score ?? 0} · ${opponent.name} ${opponent.submission?.score ?? 0}`
              : `${me.name} vs ${opponent.name}`
          }
          onClose={() => setResultOpen(false)}
          onNext={() => action({ type: "rematch" })}
          nextLabel={rematchLabel}
          nextDisabled={busy || room.rematch?.includes(room.you)}
          onShare={shareResult}
          message={shareMessage}
        />
      )}
      <div className="duel-scoreline" aria-label="Room score">
        <span>{me.name}</span>
        <strong>
          {room.wins?.[room.you] ?? 0} : {room.wins?.[1 - room.you] ?? 0}
        </strong>
        <span>{opponent.name}</span>
      </div>
      <div
        className={`session-bar turn-banner ${myTurn || (room.phase === "final" && !me.submitted) ? "your-turn" : "their-turn"}`}
        role="status"
        key={status}
      >
        <strong>
          {myTurn && !race ? "▶ " : ""}
          {status}
        </strong>
        {countdown !== null && (
          <span className="countdown" role="timer">
            {countdown}s
          </span>
        )}
        {race && !setup && !done && (
          <span className="duel-time">
            {Math.floor(ownSeconds / 60)}:
            {String(ownSeconds % 60).padStart(2, "0")}
          </span>
        )}
      </div>
      {setup ? (
        <>
          <p className="notice">Choose a shape, then place it on the board.</p>
          <div className="play-layout">
            <section className="board-panel">
              <GameBoard
                cols={cols}
                rows={rows}
                guess={emptyBoard(cols, rows)}
                revealed={me.placed}
                selectedPiece={selectedPiece}
                locked={me.ready || busy}
                onCell={placeAt}
                previewPlacement={preview}
              />
            </section>
            <aside className="tools-panel">
              <div className="placement-pieces">
                {me.pieces.map((p) => (
                  <button
                    key={p.id}
                    className={
                      me.placed.some((placed) => placed.id === p.id)
                        ? "is-placed"
                        : ""
                    }
                    aria-pressed={selectedPiece === p.id}
                    aria-label={`${p.color} ${p.name}`}
                    title={`${p.color} ${p.name}`}
                    onClick={() => setSelectedPiece(p.id)}
                    disabled={me.ready || busy}
                  >
                    <PiecePreview piece={p} size={18} />
                  </button>
                ))}
              </div>
              <div className="button-row">
                <button
                  disabled={me.ready || busy}
                  onClick={() => transform("rotate")}
                >
                  Rotate ↻
                </button>
                <button
                  disabled={me.ready || busy}
                  onClick={() => transform("mirror")}
                >
                  Mirror ↔
                </button>
              </div>
              <button
                disabled={me.ready || busy || !placedPiece}
                onClick={() => {
                  setError("");
                  action({
                    type: "place",
                    placed: me.placed.filter((p) => p.id !== selectedPiece),
                  });
                }}
              >
                Remove shape
              </button>
              <button
                disabled={me.ready || busy}
                onClick={() => {
                  try {
                    const placed = generatePuzzle(
                      crypto.randomUUID(),
                      me.pieces,
                      cols,
                      rows,
                    ).placed;
                    setOrientations({});
                    action({ type: "place", placed });
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                Random legal arrangement
              </button>
              <button
                className="primary"
                disabled={
                  me.ready || busy || me.placed.length !== me.pieces.length
                }
                onClick={() => action({ type: "ready", placed: me.placed })}
              >
                {me.ready
                  ? "Your board is locked"
                  : `Ready · ${me.placed.length}/${me.pieces.length} placed`}
              </button>
              <p className="muted">
                {opponent.ready
                  ? `${opponent.name} is ready.`
                  : `${opponent.name} is still arranging.`}
              </p>
            </aside>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="board-switch" role="group" aria-label="Choose board">
            <button
              aria-pressed={!ownBoard}
              onClick={() => changeBoard(1 - room.you)}
            >
              <strong>{opponent.name}'s board</strong>
              <small>{done ? "Your solution" : "Your drawing"}</small>
            </button>
            <button
              aria-pressed={ownBoard}
              onClick={() => changeBoard(room.you)}
            >
              <strong>Your board</strong>
              <small>
                {me.submitted || done
                  ? `${opponent.name}'s drawing`
                  : `${opponent.name}'s lasers`}
              </small>
            </button>
          </div>
          <div className="play-layout duel-play-layout">
            <section className="board-panel">
              <GameBoard
                cols={cols}
                rows={rows}
                guess={reviewedDrawing?.guess || emptyBoard(cols, rows)}
                edges={reviewedDrawing?.edges || {}}
                pieces={room.players[boardOwner].pieces}
                revealed={
                  done
                    ? reviewMode === "drawing"
                      ? null
                      : room.players[boardOwner].placed
                    : ownBoard
                      ? me.placed
                      : null
                }
                compare={
                  done ? reviewMode === "overlay" : ownBoard && me.submitted
                }
                drawingDashed={
                  done ? reviewMode === "overlay" : ownBoard && me.submitted
                }
                hideNotes={done || ownBoard}
                locked={!canDraw || ownBoard}
                onCell={cell}
                onEdge={edge}
                onLaser={handleLaser}
                laserLocked={busy}
                newLaserLocked={!done && (ownBoard || !myTurn)}
                selectedColor={color}
                activeLaser={done || ownBoard ? replay : null}
                replayVersion={selectionVersion}
                animate={effects}
                queries={room.queries.filter((q) => q.player === author)}
                highlight={
                  replay ||
                  (selectedQuery !== null &&
                  room.queries[selectedQuery]?.player === author
                    ? room.queries[selectedQuery]
                    : null)
                }
              />
              {done && !reviewedDrawing && (
                <p className="notice">No drawing submitted.</p>
              )}
            </section>
            <div className="game-sidebar duel-sidebar">
              <aside className="tools-panel">
                {done && (
                  <>
                    <div
                      className="comparison-tabs"
                      role="group"
                      aria-label="Compare drawings"
                    >
                      {[
                        ["solution", "Solution"],
                        ["overlay", "Overlay"],
                        [
                          "drawing",
                          ownBoard
                            ? `${opponent.name}'s drawing`
                            : "Your drawing",
                        ],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          aria-pressed={reviewMode === value}
                          onClick={() => setReviewMode(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="comparison-legend">
                      {reviewMode === "overlay"
                        ? `Filled: ${ownBoard ? "your" : opponent.name + "’s"} board · Dashed: ${ownBoard ? opponent.name + "’s" : "your"} drawing`
                        : reviewMode === "solution"
                          ? `${ownBoard ? "Your" : opponent.name + "’s"} original board`
                          : `${ownBoard ? opponent.name + "’s" : "Your"} submitted drawing`}
                    </p>
                  </>
                )}
                {!done && ownBoard && me.submitted && (
                  <p className="comparison-legend">
                    Filled: your board · Dashed: {opponent.name}'s live drawing
                  </p>
                )}

                <PieceList
                  pieces={room.players[boardOwner].pieces}
                  guess={reviewedDrawing?.guess}
                  edges={reviewedDrawing?.edges}
                  onColor={canDraw && !ownBoard ? setColor : undefined}
                />
                {canDraw && !ownBoard && (
                  <ColorPicker
                    pieces={opponent.pieces}
                    value={color}
                    onChange={setColor}
                  />
                )}

                {!done && (
                  <button
                    className="primary"
                    disabled={!canSubmit || busy}
                    onClick={() => {
                      unlockAudio();
                      action({ type: "submit", drawing });
                    }}
                  >
                    {me.submitted ? "Solution locked" : "Submit solution"}
                  </button>
                )}
                {room.phase === "final" && !me.submitted && (
                  <button
                    disabled={busy}
                    onClick={() => action({ type: "pass" })}
                  >
                    Skip my final attempt
                  </button>
                )}
              </aside>
              <div className="duel-logs">
                {[room.you, 1 - room.you].map((shooter) => {
                  const queries = room.queries
                    .map((q, index) => ({ ...q, index }))
                    .filter((q) => q.player === shooter);
                  return (
                    <QueryLog
                      key={shooter}
                      title={shooter === room.you ? "You" : opponent.name}
                      history={queries}
                      cols={cols}
                      rows={rows}
                      selected={
                        queries.some((q) => q.index === selectedQuery)
                          ? queries.findIndex((q) => q.index === selectedQuery)
                          : null
                      }
                      selectionVersion={selectionVersion}
                      onSelect={(i) => selectQuery(queries[i].index)}
                    />
                  );
                })}
              </div>
              {done && (
                <div className="secondary-tools duel-result-tools">
                  {race && (
                    <div className="round-points">
                      <span>
                        You <strong>{me.submission?.score ?? 0}</strong>
                      </span>
                      <span>
                        {opponent.name}{" "}
                        <strong>{opponent.submission?.score ?? 0}</strong>
                      </span>
                    </div>
                  )}
                  <button
                    className="primary next-board"
                    disabled={busy || room.rematch?.includes(room.you)}
                    onClick={() => action({ type: "rematch" })}
                  >
                    {rematchLabel} →
                  </button>
                  <div className="button-row">
                    <button onClick={() => setResultOpen(true)}>Result</button>
                    <button onClick={onNewRoom}>New room</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
