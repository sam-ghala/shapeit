import { MenuButton } from "./MenuButton.jsx";
import { SoundToggle } from "./SoundToggle.jsx";
import { previewPlacement } from "../game/placement.js";
import { ExtraOptions } from "./ExtraOptions.jsx";
import { ResultDialog } from "./ResultDialog.jsx";
import { unlockAudio, playSound } from "../game/audio.js";
import { nextPencilColor } from "../game/assistance.js";
import { useState, useEffect, useRef } from "react";
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

async function api(path, token, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
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
    run(`/api/rooms/${credentials.code}/action`, credentials.token, body);
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
          busy={busy}
          effects={effects}
          onNewRoom={reset}
        />
      )}
    </main>
  );
}
function DuelBoard({ room, action, busy, effects, onNewRoom }) {
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
    [overlay, setOverlay] = useState(true),
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
        (room.turn === room.you || room.lastActor === room.you)));
  const handleLaser = async (side, idx) => {
    const shooter = done ? 1 - owner : room.you;
    const existing = room.queries.findIndex(
      (q) =>
        q.player === shooter &&
        ((q.side === side && q.idx === idx) ||
          (q.exitSide === side && q.exitIdx === idx)),
    );
    if (done) {
      playSound("laser");
      setSelectedQuery(existing >= 0 ? existing : null);
      setSelectionVersion((v) => v + 1);
      setReplay({
        ...fireLaser(
          boardFromPlaced(room.players[owner].placed, cols, rows),
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
    if (done || room.phase !== "playing" || room.turn !== room.you) return;
    unlockAudio();
    const data = await action({ type: "laser", side, idx });
    const shot = data?.room?.queries.at(-1);
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
      setSelectedQuery(data.room.queries.length - 1);
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
  const reviewedDrawing = done
    ? room.players[1 - owner].submission?.drawing
    : null;
  return (
    <>
      {done && resultOpen && (
        <ResultDialog
          title={resultTitle}
          won={me.submission?.correct === true}
          detail={`${room.queries.filter((q) => q.player === room.you).length} lasers · ${me.name} vs ${opponent.name}`}
          onClose={() => setResultOpen(false)}
          onNext={() => action({ type: "rematch" })}
          nextLabel={rematchLabel}
          nextDisabled={busy || room.rematch?.includes(room.you)}
          onShare={shareResult}
          message={shareMessage}
        />
      )}
      <div className="session-bar">
        <strong>
          {setup
            ? "Arrange your hidden board"
            : done
              ? room.winner === "draw"
                ? "Both solved it — a draw!"
                : room.winner === "none"
                  ? "Neither board was solved"
                  : `${room.players[room.winner].name} wins!`
              : room.phase === "final"
                ? me.submitted
                  ? "Waiting for final response"
                  : "Final attempt"
                : room.turn === room.you
                  ? "Your turn"
                  : `${opponent.name}'s turn`}
        </strong>
        {countdown !== null && (
          <span className="countdown" role="timer">
            {countdown}s
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
          {done ? (
            <div className="review-tabs">
              <label>
                Review board
                <select
                  value={owner}
                  onChange={(e) => {
                    setOwner(Number(e.target.value));
                    setSelectedQuery(null);
                    setReplay(null);
                  }}
                >
                  {room.players.map((p, i) => (
                    <option key={i} value={i}>
                      {p.name}'s board
                    </option>
                  ))}
                </select>
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={overlay}
                  onChange={(e) => setOverlay(e.target.checked)}
                />
                Overlay drawing
              </label>
              <button onClick={() => setResultOpen(true)}>Result</button>
              <button
                className="primary"
                disabled={busy || room.rematch?.includes(room.you)}
                onClick={() => action({ type: "rematch" })}
              >
                {room.rematch?.includes(room.you)
                  ? "Waiting for rematch…"
                  : room.rematch?.length
                    ? "Accept rematch"
                    : "Rematch"}
              </button>
              <button onClick={onNewRoom}>New room</button>
            </div>
          ) : (
            <div className="review-tabs">
              <button
                aria-pressed={view === "drawing"}
                onClick={() => setView("drawing")}
              >
                Find {opponent.name}'s board
              </button>
              <button
                aria-pressed={view === "mine"}
                onClick={() => setView("mine")}
              >
                My hidden board
              </button>
            </div>
          )}
          <div className="play-layout">
            <section className="board-panel">
              <GameBoard
                cols={cols}
                rows={rows}
                guess={
                  done
                    ? reviewedDrawing?.guess || emptyBoard(cols, rows)
                    : drawing.guess
                }
                edges={done ? reviewedDrawing?.edges || {} : drawing.edges}
                pieces={done ? room.players[owner].pieces : opponent.pieces}
                revealed={
                  done
                    ? room.players[owner].placed
                    : view === "mine"
                      ? me.placed
                      : null
                }
                compare={done && overlay}
                hideNotes={done}
                locked={!canDraw || view !== "drawing"}
                onCell={cell}
                onEdge={edge}
                onLaser={view !== "mine" ? handleLaser : undefined}
                laserLocked={busy}
                newLaserLocked={
                  !done && (room.phase !== "playing" || room.turn !== room.you)
                }
                selectedColor={color}
                activeLaser={done ? replay : null}
                replayVersion={selectionVersion}
                animate={effects}
                queries={room.queries.filter(
                  (q) => q.player === (done ? 1 - owner : room.you),
                )}
                highlight={
                  done
                    ? replay
                    : selectedQuery !== null
                      ? room.queries[selectedQuery]
                      : null
                }
              />
              {done && !reviewedDrawing && view === "drawing" && (
                <p className="notice">
                  No final drawing was submitted for this board.
                </p>
              )}
            </section>
            <div className="game-sidebar">
              <aside className="tools-panel">
                <PieceList
                  pieces={done ? room.players[owner].pieces : opponent.pieces}
                  guess={done ? reviewedDrawing?.guess : drawing.guess}
                  edges={done ? reviewedDrawing?.edges : drawing.edges}
                  onColor={canDraw ? setColor : undefined}
                />
                {canDraw && (
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
              <QueryLog
                history={room.queries}
                cols={cols}
                rows={rows}
                players={room.players}
                selected={selectedQuery}
                selectionVersion={selectionVersion}
                onSelect={(i) => {
                  setSelectedQuery(i);
                  setSelectionVersion((v) => v + 1);
                  if (done) {
                    const q = room.queries[i];
                    const target = 1 - q.player;
                    setOwner(target);
                    setReplay({
                      ...fireLaser(
                        boardFromPlaced(
                          room.players[target].placed,
                          cols,
                          rows,
                        ),
                        q.side,
                        q.idx,
                      ),
                      side: q.side,
                      idx: q.idx,
                    });
                    setView("solution");
                  }
                }}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
