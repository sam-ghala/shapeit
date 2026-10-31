import { useEffect, useRef, useState } from "react";
import { Dialog } from "../../shared/components/Dialog.jsx";
import { SoundToggle } from "../../shared/components/SoundToggle.jsx";
import { playSound, resultSound } from "../../shared/audio.js";
import { legalMoves, canExchange, describeAction } from "./engine.js";
import { CaptureBoard } from "./CaptureBoard.jsx";
import { PlayerCard } from "./CapturePlayers.jsx";
import { useCaptureRoom } from "./useCaptureRoom.js";
import {
  CaptureConnect,
  CaptureLobby,
  CaptureClosed,
} from "./CaptureOnline.jsx";

export function CaptureOnlineGame({
  profile,
  setProfile,
  initialCode,
  onHome,
  onRules,
}) {
  const [code, setCode] = useState(
    /^\d{4}$/.test(initialCode) ? initialCode : "",
  );
  const [name, setName] = useState(profile.name);
  const [selected, setSelected] = useState(null);
  const [exchanging, setExchanging] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [overlay, setOverlay] = useState(null);
  const invited = useRef(false);
  const service = useCaptureRoom(profile, initialCode, !!profile.name.trim());
  const { room, credentials, busy, error } = service;
  const game = room?.game;
  const me = room?.players[room.you];
  const opponent = room?.players[1 - room.you];
  const ownTurn = room?.phase === "playing" && game?.current === me?.color;
  const interactive =
    ownTurn && !busy && !room?.undoRequest && !room?.reset?.length;
  const targets = interactive && selected ? legalMoves(game, selected) : [];
  const winner = room?.players.find((player) => player.color === game?.winner);
  const rematchRequested = !!room?.rematch?.includes(room.you);

  useEffect(() => {
    if (credentials) {
      invited.current = true;
      return;
    }
    if (
      !profile.name.trim() ||
      !/^\d{4}$/.test(initialCode) ||
      credentials ||
      invited.current
    )
      return;
    const timer = setTimeout(() => {
      invited.current = true;
      void service.enter(initialCode, profile);
    }, 0);
    return () => clearTimeout(timer);
  }, [initialCode, profile.name, credentials]);
  useEffect(() => {
    setSelected(null);
    setExchanging(false);
  }, [room?.revision, room?.gameId]);
  useEffect(() => {
    setOverlay(null);
  }, [room?.gameId]);
  useEffect(() => {
    if (room?.phase !== "finished" || !game?.winner) return;
    setOverlay("result");
    return resultSound(game.winner === me?.color);
  }, [room?.gameId, game?.winner]);
  useEffect(() => {
    if (room?.phase === "closed") setOverlay(null);
  }, [room?.phase]);

  const send = async (action) => {
    const response = await service.send(action);
    if (response) {
      setSelected(null);
      setExchanging(false);
      if (["move", "exchange"].includes(action.type)) playSound("turn");
    }
    return response;
  };
  const confirmAction = async (type) => {
    const response = await send({ type });
    setOverlay(response?.room.phase === "finished" ? "result" : null);
  };
  const select = (id) => {
    if (!interactive) return;
    if (exchanging) {
      void send({ type: "exchange", target: id });
      return;
    }
    if (selected && targets.includes(id)) {
      void send({ type: "move", from: selected, to: id });
      return;
    }
    setSelected(selected === id ? null : id);
    playSound();
  };
  const leave = async () => {
    if (await service.forget(true)) onHome();
    else setOverlay(null);
  };
  const header = (
    <header className="capture-topbar">
      <button
        className="capture-wordmark"
        onClick={onHome}
        aria-label="CaptureIt home"
      >
        Capture<span>It</span>
      </button>
      <div>
        <SoundToggle compact />
        <button
          className="capture-help"
          aria-label="How to play"
          onClick={onRules}
        >
          ?
        </button>
        {room && room.phase !== "closed" && (
          <button onClick={() => setOverlay("menu")}>Menu</button>
        )}
      </div>
    </header>
  );
  const hasMove =
    game &&
    game.pieces.some(
      (piece) =>
        piece.color === game.current && legalMoves(game, piece.cell).length,
    );
  const instruction = game?.winner
    ? `${winner?.name} wins!`
    : busy
      ? "Updating game…"
      : room?.undoRequest
        ? "Waiting for the undo decision."
        : room?.reset?.length
          ? "Waiting for the restart decision."
          : !ownTurn
            ? `Waiting for ${opponent?.name || "your opponent"}.`
            : exchanging
              ? "Choose an opposing piece to capture."
              : selected
                ? targets.length
                  ? "Choose a highlighted field."
                  : "This piece has no moves. Choose another."
                : !hasMove
                  ? canExchange(game)
                    ? "No moves available. Exchange two tiles to capture."
                    : "No moves or exchanges available. You can resign from the menu."
                  : `Select a ${me?.color} piece.`;
  const rematch = (
    <button
      className="primary"
      disabled={busy || rematchRequested}
      onClick={() => void send({ type: "rematch" })}
    >
      {rematchRequested ? "Waiting for opponent…" : "Play again"}
    </button>
  );

  return (
    <main className="capture-app capture-online-app">
      {header}
      {error && !overlay && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {!profile.name.trim() ? (
        <Dialog title="Your name" onClose={onHome}>
          <p>Choose a name so your friend can recognize you.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim())
                setProfile({ ...profile, name: name.trim().slice(0, 24) });
            }}
          >
            <label>
              Name
              <input
                autoFocus
                required
                maxLength={24}
                autoComplete="nickname"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button className="primary" type="submit">
              Continue
            </button>
          </form>
        </Dialog>
      ) : !room ? (
        <CaptureConnect
          credentials={credentials}
          code={code}
          setCode={setCode}
          busy={busy}
          onCreate={() => service.enter("", profile)}
          onJoin={() => service.enter(code, profile)}
          onForget={() => {
            invited.current = true;
            setCode("");
            service.forget();
          }}
          onHome={onHome}
        />
      ) : room.phase === "closed" ? (
        <CaptureClosed
          room={room}
          onHome={() => {
            service.forget();
            onHome();
          }}
        />
      ) : room.phase === "lobby" ? (
        <CaptureLobby
          room={room}
          busy={busy}
          onAction={send}
          onLeave={() => setOverlay("leave")}
        />
      ) : (
        <>
          <div className="capture-online-round">
            <span>
              Room <strong>{room.code}</strong> · Round {room.round}
            </span>
            <span
              className="capture-series-score"
              aria-label={`Match score: ${room.players[0].name} ${room.wins[0]}, ${room.players[1].name} ${room.wins[1]}`}
            >
              <span>{room.players[0].name}</span>
              <b>
                {room.wins[0]} : {room.wins[1]}
              </b>
              <span>{room.players[1].name}</span>
            </span>
          </div>
          {room.undoRequest && (
            <section className="capture-online-request card" role="status">
              {room.undoRequest.by === room.you ? (
                <p>Waiting for {opponent.name} to approve your undo.</p>
              ) : (
                <>
                  <p>{opponent.name} wants to undo their last turn.</p>
                  <div className="button-row">
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void send({ type: "undo-response", accept: true })
                      }
                    >
                      Allow undo
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send({ type: "undo-response", accept: false })
                      }
                    >
                      Decline
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          {!!room.reset?.length && (
            <section className="capture-online-request card" role="status">
              {room.reset.includes(room.you) ? (
                <p>Waiting for {opponent.name} to agree to restart.</p>
              ) : (
                <>
                  <p>{opponent.name} wants to restart this round.</p>
                  <div className="button-row">
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void send({ type: "reset" })}
                    >
                      Restart round
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send({ type: "reset-response", accept: false })
                      }
                    >
                      Keep playing
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          <section className="capture-play-layout" aria-label="Online game">
            <div className="capture-arena">
              <div className="capture-scoreboard">
                {["white", "black"].map((color) => {
                  const player = room.players.find(
                    (item) => item.color === color,
                  );
                  return (
                    <PlayerCard
                      key={color}
                      color={color}
                      game={game}
                      name={player.name}
                      online
                      you={player === me}
                    />
                  );
                })}
              </div>
              <div
                className={`capture-turn-banner ${exchanging ? "capture-exchange-banner" : ""}`}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <strong>
                  {game.winner
                    ? "Game over"
                    : ownTurn
                      ? "Your turn"
                      : "Opponent’s turn"}
                </strong>
                <span>{instruction}</span>
              </div>
              <CaptureBoard
                game={game}
                selected={selected}
                targets={targets}
                exchanging={exchanging}
                onCell={select}
                zoomed={zoomed}
                disabled={!interactive}
              />
              <div className="capture-board-caption">
                <span>
                  Turn {game.turn} · {game.tiles.length} tiles on board
                </span>
                <button
                  onClick={() => setZoomed(!zoomed)}
                  aria-pressed={zoomed}
                >
                  {zoomed ? "Fit board" : "Zoom board"}
                </button>
              </div>
            </div>
            <aside className="capture-sidebar">
              <section
                className="card capture-actions"
                aria-label="Turn actions"
              >
                <h2>
                  {game.winner
                    ? `${winner.name} wins!`
                    : ownTurn
                      ? "Make your move"
                      : "Opponent’s turn"}
                </h2>
                {game.winner ? (
                  <>
                    {rematch}
                    <p>Colors switch for the next round. White moves first.</p>
                  </>
                ) : (
                  <>
                    <p>
                      Move one piece, or spend two collected tiles to capture
                      any opponent.
                    </p>
                    <button
                      className={`primary ${exchanging ? "capture-exchange-active" : ""}`}
                      disabled={!interactive || !canExchange(game)}
                      aria-pressed={exchanging}
                      onClick={() => {
                        setExchanging(!exchanging);
                        setSelected(null);
                      }}
                    >
                      {exchanging ? "Cancel exchange" : "Exchange 2 tiles"}
                    </button>
                    <span className="capture-bank-hint">
                      {game.collected[me.color]} tiles in your bank
                    </span>
                    <button
                      disabled={busy || !room.canUndo || !!room.reset?.length}
                      onClick={() => void send({ type: "undo" })}
                    >
                      Request undo
                    </button>
                  </>
                )}
              </section>
              <section className="capture-last-turn" aria-label="Last turn">
                <h3>Last turn</h3>
                <p>{describeAction(game.lastAction)}</p>
              </section>
              <p className="capture-save-note">
                Rejoin this room from this browser if you disconnect.
              </p>
            </aside>
          </section>
        </>
      )}
      {overlay === "menu" && (
        <Dialog
          title="Game menu"
          onClose={() => setOverlay(null)}
          className="capture-menu"
        >
          <button className="primary" onClick={() => setOverlay(null)}>
            Back to game
          </button>
          <button
            onClick={() => {
              setOverlay(null);
              onRules();
            }}
          >
            How to play
          </button>
          {room.phase === "playing" && (
            <>
              <button
                disabled={busy || !!room.undoRequest || !!room.reset?.length}
                onClick={() => setOverlay("reset")}
              >
                Restart round
              </button>
              <button disabled={busy} onClick={() => setOverlay("resign")}>
                Resign
              </button>
            </>
          )}
          <button onClick={onHome}>Home · keep room</button>
          <button onClick={() => setOverlay("leave")}>Leave room</button>
        </Dialog>
      )}
      {overlay === "resign" && (
        <Dialog title="Resign this game?" onClose={() => setOverlay(null)}>
          <p>{opponent?.name} will win this round.</p>
          <div className="button-row">
            <button onClick={() => setOverlay(null)}>Keep playing</button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void confirmAction("resign")}
            >
              Resign game
            </button>
          </div>
        </Dialog>
      )}
      {overlay === "reset" && (
        <Dialog title="Restart this round?" onClose={() => setOverlay(null)}>
          <p>Your opponent must agree. The match score will stay the same.</p>
          <div className="button-row">
            <button onClick={() => setOverlay(null)}>Keep playing</button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void confirmAction("reset")}
            >
              Request restart
            </button>
          </div>
        </Dialog>
      )}
      {overlay === "leave" && (
        <Dialog title="Leave this room?" onClose={() => setOverlay(null)}>
          <p>This closes the room for both players.</p>
          <div className="button-row">
            <button onClick={() => setOverlay(null)}>Stay</button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void leave()}
            >
              Leave room now
            </button>
          </div>
        </Dialog>
      )}
      {overlay === "result" && room?.phase === "finished" && (
        <Dialog
          title={`${winner.name} wins!`}
          onClose={() => setOverlay(null)}
          className="capture-result"
        >
          <div className="capture-rule-icon" aria-hidden="true">
            ✦
          </div>
          <p>
            {winner.color === me.color
              ? "You won this round."
              : `${winner.name} won this round.`}{" "}
            {game.reason === "resignation"
              ? winner.color === me.color
                ? "Your opponent resigned."
                : "You resigned."
              : "Every opposing piece captured."}
          </p>
          <p>Colors switch in the next round.</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            {rematch}
            <button onClick={() => setOverlay(null)}>View board</button>
            <button onClick={() => setOverlay("leave")}>Leave room</button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
