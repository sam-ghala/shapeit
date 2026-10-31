import { useEffect, useRef, useState } from "react";
import { Dialog } from "../../shared/components/Dialog.jsx";
import { playSound, resultSound } from "../../shared/audio.js";
import { BlockHeader } from "./BlockHeader.jsx";
import { BlockGame } from "./BlockGame.jsx";
import { useBlockRoom } from "./useBlockRoom.js";
import { BlockConnect, BlockLobby, BlockClosed } from "./BlockOnline.jsx";

export function BlockOnlineGame({
  profile,
  setProfile,
  initialCode,
  onHome,
  onRules,
}) {
  const [code, setCode] = useState(initialCode || ""),
    [name, setName] = useState(profile.name);
  const [overlay, setOverlay] = useState(null);
  const invited = useRef(false);
  const service = useBlockRoom(profile, initialCode, !!profile.name.trim());
  const { room, credentials, busy, error } = service;
  const game = room?.game,
    me = room?.players[room.you],
    opponent = room?.players[1 - room.you];
  const ownTurn = room?.phase === "playing" && game.current === me?.color;
  const interactive = ownTurn && !room?.undoRequest && !room?.reset?.length;
  const winner = room?.players.find((player) => player.color === game?.winner);
  const rematchRequested = !!room?.rematch?.includes(room.you);
  useEffect(() => {
    if (credentials) {
      invited.current = true;
      return;
    }
    if (!profile.name.trim() || !/^\d{4}$/.test(initialCode) || invited.current)
      return;
    const timer = setTimeout(() => {
      invited.current = true;
      void service.enter(initialCode, profile);
    }, 0);
    return () => clearTimeout(timer);
  }, [initialCode, profile.name, credentials]);
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
    if (response && ["move", "wall"].includes(action.type)) playSound("turn");
    return response;
  };
  const confirmAction = async (type) => {
    const response = await send({ type });
    if (response)
      setOverlay(response.room.phase === "finished" ? "result" : null);
  };
  const leave = async () => {
    if (await service.forget(true)) onHome();
  };
  const rematch = (
    <button
      className="primary"
      disabled={busy || rematchRequested}
      onClick={() => void send({ type: "rematch" })}
    >
      {rematchRequested ? "Waiting for opponent…" : "Play again"}
    </button>
  );
  const request = room?.undoRequest
    ? {
        by: room.undoRequest.by,
        question: `${opponent?.name} wants to undo their last turn.`,
        waiting: "Waiting for the undo decision.",
        yes: "Allow undo",
        type: "undo-response",
      }
    : room?.reset?.length
      ? {
          by: room.reset[0],
          question: `${opponent?.name} wants to restart this round.`,
          waiting: "Waiting for the restart decision.",
          yes: "Restart round",
          type: "reset-response",
        }
      : null;
  const requestPanel = request && (
    <section className="block-request" role="status">
      <p>{request.by === room.you ? request.waiting : request.question}</p>
      {request.by !== room.you && (
        <div className="button-row">
          <button
            className="primary"
            disabled={busy}
            onClick={() => void send({ type: request.type, accept: true })}
          >
            {request.yes}
          </button>
          <button
            disabled={busy}
            onClick={() => void send({ type: request.type, accept: false })}
          >
            Decline
          </button>
        </div>
      )}
    </section>
  );
  return (
    <main
      className={`block-app block-online ${["playing", "finished"].includes(room?.phase) ? "block-playing" : ""}`}
    >
      <BlockHeader
        onHome={onHome}
        onRules={onRules}
        onMenu={
          room && room.phase !== "closed" ? () => setOverlay("menu") : null
        }
      />
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
        <BlockConnect
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
        <BlockClosed
          room={room}
          onHome={() => {
            service.forget();
            onHome();
          }}
        />
      ) : room.phase === "lobby" ? (
        <BlockLobby
          room={room}
          busy={busy}
          onAction={send}
          onLeave={() => setOverlay("leave")}
        />
      ) : (
        <>
          <div className="block-online-round">
            <span>
              Room <strong>{room.code}</strong> · Round {room.round}
            </span>
            <span aria-label={`Match score ${room.wins[0]} to ${room.wins[1]}`}>
              {room.wins[0]} : {room.wins[1]}
            </span>
          </div>
          <BlockGame
            key={room.gameId}
            game={game}
            players={room.players}
            you={room.you}
            interactive={interactive}
            busy={busy}
            paused={!!request}
            status={
              game.winner
                ? ""
                : request
                  ? request.waiting
                  : busy
                    ? "Updating game…"
                    : !ownTurn
                      ? `Waiting for ${opponent?.name}.`
                      : ""
            }
            canUndo={room.canUndo}
            onUndo={() => void send({ type: "undo" })}
            onAction={send}
            footer={
              game.winner ? (
                <>
                  {rematch}
                  <p className="block-save-note">
                    Swap sides. The other player starts.
                  </p>
                </>
              ) : (
                <p className="block-save-note">
                  Rejoin from this browser if you disconnect.
                </p>
              )
            }
          >
            {requestPanel}
          </BlockGame>
        </>
      )}
      {overlay === "menu" && (
        <Dialog
          title="Game menu"
          onClose={() => setOverlay(null)}
          className="block-menu"
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
                disabled={busy || !!request}
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
          <p className="muted">Rejoin from this browser if you disconnect.</p>
        </Dialog>
      )}
      {overlay === "resign" && (
        <Dialog title="Resign this game?" onClose={() => setOverlay(null)}>
          <p>{opponent?.name} will win this round.</p>
          <div className="button-row">
            <button onClick={() => setOverlay(null)}>Keep playing</button>
            <button
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
        <Dialog title={`${winner.name} wins!`} onClose={() => setOverlay(null)}>
          <p>
            {game.reason === "goal"
              ? "Reached the opposite edge."
              : "The other player resigned."}
          </p>
          <p>
            Match score: {room.players[0].name} {room.wins[0]} ·{" "}
            {room.players[1].name} {room.wins[1]}
          </p>
          <p className="muted">Swap sides. The other player starts.</p>
          <div className="button-row">
            <button onClick={() => setOverlay(null)}>View board</button>
            {rematch}
          </div>
        </Dialog>
      )}
      {error && overlay && (
        <Dialog
          title="Couldn’t update the room"
          onClose={() => service.setError("")}
        >
          <p role="alert">{error}</p>
          <button className="primary" onClick={() => service.setError("")}>
            Try again
          </button>
        </Dialog>
      )}
    </main>
  );
}
