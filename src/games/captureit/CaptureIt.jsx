import { useEffect, useState } from "react";
import { Dialog } from "../../shared/components/Dialog.jsx";
import { SoundToggle } from "../../shared/components/SoundToggle.jsx";
import { GameLinks } from "../../shared/components/GameLinks.jsx";
import { useProfile } from "../../shared/useProfile.js";
import { readJSON, writeJSON } from "../../shared/storage.js";
import { readTabState, writeTabState } from "../../shared/navigation.js";
import { queueEvent } from "../../shared/activity.js";
import { playSound, resultSound } from "../../shared/audio.js";
import { gameHref, gamePath } from "../../platform/routing.js";
import { createGame, legalMoves, canExchange } from "./engine.js";
import {
  createSession,
  playSession,
  undoSession,
  restoreSession,
} from "./session.js";
import { CaptureBoard } from "./CaptureBoard.jsx";
import { PlayerCard } from "./CapturePlayers.jsx";
import { CaptureOnlineGame } from "./CaptureOnlineGame.jsx";
import "./captureit.css";

const SAVE_KEY = "captureit:session:v1";
const cap = (color) => (color === "white" ? "White" : "Black");
const previewGame = createGame();

function Rules({ onClose }) {
  const [page, setPage] = useState(0);
  const pages = [
    {
      title: "Surround them. Capture them all.",
      icon: "△",
      text: "Two players share one board, with 18 pieces each. White starts. Capture your opponent’s last piece to win.",
      detail:
        "The board begins with 19 hexagonal tiles in the Laurentius arrangement.",
    },
    {
      title: "One piece. One step.",
      icon: "↗",
      text: "Tap one of your pieces, then a highlighted empty triangle. Move to a same-color triangle that touches your field at a corner.",
      detail:
        "White uses upward triangles; Black uses downward triangles. You cannot jump, move onto a piece, or skip a turn. Use Tab or arrow keys and Enter to play with a keyboard.",
    },
    {
      title: "Close all three sides.",
      icon: "◬",
      text: "Capture an opposing piece by enclosing all three edges of its triangle with your pieces or the edge of the board.",
      detail:
        "Moving into an already surrounded field is safe. Your own turn never captures your own pieces; a neutral piece stays safe until it is enclosed afresh.",
    },
    {
      title: "A smaller board. More possibilities.",
      icon: "⬡",
      text: "After a move, empty tiles attached along three or fewer consecutive sides are removed and added to your tile bank.",
      detail:
        "Separated attachments keep a tile on the board. Tile removal can expose more empty tiles or enclose opponents. Tiles emptied by captures are removed when eligible, but never collected.",
    },
    {
      title: "Two tiles for any opponent.",
      icon: "2 → 1",
      text: "Instead of moving, spend two collected tiles to remove any opposing piece. Choose Exchange, then tap the piece you want to capture.",
      detail:
        "Tiles removed during an exchange are discarded. Further enclosures are resolved automatically. This game uses the standard two-tile rule; optional Cura and one-tile exchange rules are not enabled.",
    },
  ];
  return (
    <Dialog title="How to play" onClose={onClose} className="capture-rules">
      <div className="capture-rule-icon" aria-hidden="true">
        {pages[page].icon}
      </div>
      <h3>{pages[page].title}</h3>
      <p>{pages[page].text}</p>
      <p className="muted">{pages[page].detail}</p>
      <div className="capture-guide-nav">
        <button onClick={() => (page ? setPage(page - 1) : onClose())}>
          {page ? "← Back" : "Close"}
        </button>
        <span aria-label={`Page ${page + 1} of ${pages.length}`}>
          {page + 1} / {pages.length}
        </span>
        <button
          className="primary"
          onClick={() =>
            page === pages.length - 1 ? onClose() : setPage(page + 1)
          }
        >
          {page === pages.length - 1 ? "Got it" : "Next →"}
        </button>
      </div>
    </Dialog>
  );
}

export default function CaptureIt() {
  const [profile, setProfile] = useProfile();
  const [session, setSession] = useState(() =>
    restoreSession(readJSON(SAVE_KEY, null)),
  );
  const roomParam =
    new URLSearchParams(globalThis.location?.search || "").get("room") || "";
  const initialCode = /^\d{4}$/.test(roomParam) ? roomParam : "";
  const [screen, setScreen] = useState(() =>
    /^\d{4}$/.test(initialCode)
      ? "online"
      : readTabState("captureit:view", "menu"),
  );
  const savedRoom = readJSON("captureit:room", null);
  const canRejoin =
    savedRoom?.profileId === profile.id &&
    /^\d{4}$/.test(savedRoom?.code) &&
    typeof savedRoom?.token === "string";
  const [selected, setSelected] = useState(null);
  const [exchanging, setExchanging] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(true);
  const [visitId] = useState(() => crypto.randomUUID());
  const game = session?.game;
  const targets = game && selected ? legalMoves(game, selected) : [];
  const playing = screen === "game" && !!session;
  const emit = (kind, match = session) => {
    queueEvent(
      {
        id: `captureit:${match.id}:${kind}`,
        sessionId: match.id,
        game: "captureit",
        kind,
        mode: "local",
        size: "classic",
        ...(kind === "finish"
          ? {
              result: "completed",
              winnerColor: match.game.winner,
              turns: match.game.turn,
              seconds: Math.max(
                0,
                Math.round((match.endedAt - match.startedAt) / 1000),
              ),
            }
          : {}),
      },
      profile,
    );
  };

  useEffect(() => {
    document.title = "CaptureIt";
    queueEvent(
      {
        id: `captureit:${visitId}:visit`,
        sessionId: visitId,
        game: "captureit",
        kind: "visit",
        mode: "local",
        size: "classic",
      },
      profile,
    );
  }, [visitId]);
  useEffect(() => {
    if (session) setSaved(writeJSON(SAVE_KEY, session));
  }, [session]);
  useEffect(() => {
    writeTabState("captureit:view", screen);
  }, [screen]);

  const start = () => {
    if (session && !game.winner) emit("abort");
    const next = createSession();
    setSession(next);
    setScreen("game");
    setSelected(null);
    setExchanging(false);
    setDialog(null);
    setError("");
    emit("start", next);
    playSound("turn");
  };
  const act = (action) => {
    try {
      const next = playSession(session, action);
      setSession(next);
      setSelected(null);
      setExchanging(false);
      setError("");
      if (next.game.winner) {
        emit("finish", next);
        setDialog("result");
        resultSound(true);
      } else
        playSound(
          next.game.pieces.length < game.pieces.length ? "clear" : "turn",
        );
    } catch (problem) {
      setError(problem.message);
    }
  };
  const select = (id) => {
    if (exchanging) {
      act({ type: "exchange", target: id });
      return;
    }
    if (selected && targets.includes(id)) {
      act({ type: "move", from: selected, to: id });
      return;
    }
    setSelected(id === selected ? null : id);
    setError("");
    playSound();
  };
  const home = () => {
    if (screen === "online")
      window.history.replaceState(null, "", gamePath("captureit"));
    setScreen("menu");
    setDialog(null);
    setSelected(null);
    setExchanging(false);
  };
  const hasMove =
    game &&
    !game.winner &&
    game.pieces.some(
      (piece) =>
        piece.color === game.current && legalMoves(game, piece.cell).length,
    );
  const instruction = !game
    ? ""
    : game.winner
      ? `${cap(game.winner)} wins!`
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
            : `Select a ${game.current} piece.`;

  if (screen === "online")
    return (
      <>
        <CaptureOnlineGame
          profile={profile}
          setProfile={setProfile}
          initialCode={initialCode}
          onHome={home}
          onRules={() => setDialog("rules")}
        />
        {dialog === "rules" && <Rules onClose={() => setDialog(null)} />}
      </>
    );

  return (
    <main
      className={`capture-app ${playing ? "capture-playing" : "capture-home"}`}
    >
      {playing ? (
        <>
          <header className="capture-topbar">
            <button
              className="capture-wordmark"
              onClick={home}
              aria-label="CaptureIt home"
            >
              Capture<span>It</span>
            </button>
            <div>
              <SoundToggle compact />
              <button
                className="capture-help"
                aria-label="How to play"
                onClick={() => setDialog("rules")}
              >
                ?
              </button>
              <button onClick={() => setDialog("menu")}>Menu</button>
            </div>
          </header>
          <section
            className="capture-play-layout"
            aria-label="Same-device game"
          >
            <div className="capture-arena">
              <div className="capture-scoreboard">
                <PlayerCard color="white" game={game} />
                <PlayerCard color="black" game={game} />
              </div>
              <div
                className={`capture-turn-banner ${exchanging ? "capture-exchange-banner" : ""}`}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <strong>
                  {game.winner ? "Game over" : `${cap(game.current)}’s turn`}
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
                  {game.winner ? `${cap(game.winner)} wins!` : "Make your move"}
                </h2>
                {game.winner ? (
                  <>
                    <p>
                      {game.reason === "resignation"
                        ? "The other player resigned."
                        : "Every opposing piece captured."}
                    </p>
                    <button className="primary" onClick={start}>
                      Play again
                    </button>
                  </>
                ) : (
                  <>
                    <p>
                      Move one piece, or spend two collected tiles to capture
                      any opponent.
                    </p>
                    <button
                      className={`primary ${exchanging ? "capture-exchange-active" : ""}`}
                      disabled={!canExchange(game)}
                      aria-pressed={exchanging}
                      onClick={() => {
                        setExchanging(!exchanging);
                        setSelected(null);
                      }}
                    >
                      {exchanging ? "Cancel exchange" : "Exchange 2 tiles"}
                    </button>
                    {!canExchange(game) && (
                      <span className="capture-bank-hint">
                        {game.collected[game.current]} of 2 tiles collected
                      </span>
                    )}
                    <button
                      disabled={!session.history.length}
                      onClick={() => {
                        setSession(undoSession(session));
                        setSelected(null);
                        setExchanging(false);
                        setError("");
                        playSound();
                      }}
                    >
                      Undo last turn
                    </button>
                  </>
                )}
              </section>
              <section className="capture-last-turn" aria-label="Last turn">
                <h3>Last turn</h3>
                <p>{session.notice}</p>
              </section>
              <p className="capture-save-note">
                {saved
                  ? "Saved on this device."
                  : "This browser couldn’t save your game. Keep this page open to continue."}
              </p>
            </aside>
          </section>
        </>
      ) : (
        <>
          <div className="capture-home-top">
            <a href={gameHref("shapeit")}>← ShapeIt</a>
            <button
              className="capture-profile-button"
              onClick={() => {
                setDraftName(profile.name);
                setDialog("name");
              }}
            >
              {profile.name || "Choose your name"}{" "}
              <span aria-hidden="true">✎</span>
            </button>
          </div>
          <div className="capture-home-title">
            <h1>
              Capture<span>It</span>
            </h1>
            <p>Surround your opponent. Shrink the board.</p>
          </div>
          <div className="capture-preview">
            <CaptureBoard game={previewGame} preview />
          </div>
          <nav className="capture-home-modes" aria-label="CaptureIt game modes">
            <button
              className="arcade-mode daily-mode"
              onClick={() =>
                session && !game.winner ? setScreen("game") : start()
              }
            >
              <span className="mode-icon" aria-hidden="true">
                ◧
              </span>
              <span>
                <strong>
                  {session && !game.winner ? "Continue game" : "Same device"}
                </strong>
                <small>Two players · White moves first</small>
              </span>
              <span aria-hidden="true">▶</span>
            </button>
            <button
              className="arcade-mode train-mode"
              onClick={() => setScreen("online")}
            >
              <span className="mode-icon" aria-hidden="true">
                ⚔
              </span>
              <span>
                <strong>{canRejoin ? "Rejoin room" : "Play a friend"}</strong>
                <small>Online 1 vs 1 · Invite with a code</small>
              </span>
              <span aria-hidden="true">▶</span>
            </button>
            <button
              className="arcade-mode duel-mode"
              onClick={() => setDialog("rules")}
            >
              <span className="mode-icon" aria-hidden="true">
                ?
              </span>
              <strong>How to play</strong>
              <span aria-hidden="true">↗</span>
            </button>
          </nav>
          <GameLinks current="captureit" />
          <footer className="menu-credit">
            Robin &amp; Sam <span aria-hidden="true">·</span> <SoundToggle />
          </footer>
        </>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {dialog === "rules" && <Rules onClose={() => setDialog(null)} />}
      {dialog === "name" && (
        <Dialog title="Your name" onClose={() => setDialog(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (draftName.trim()) {
                setProfile({ ...profile, name: draftName.trim().slice(0, 24) });
                setDialog(null);
              }
            }}
          >
            <label>
              Name
              <input
                autoFocus
                required
                maxLength={24}
                autoComplete="nickname"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </label>
            <button className="primary" type="submit">
              Save name
            </button>
          </form>
        </Dialog>
      )}
      {dialog === "menu" && (
        <Dialog
          title="Game menu"
          onClose={() => setDialog(null)}
          className="capture-menu"
        >
          <button className="primary" onClick={() => setDialog(null)}>
            Back to game
          </button>
          <button onClick={() => setDialog("rules")}>How to play</button>
          <button
            onClick={() => (game.winner ? start() : setDialog("restart"))}
          >
            New game
          </button>
          {!game.winner && (
            <button onClick={() => setDialog("resign")}>Resign</button>
          )}
          <button onClick={home}>Save & go home</button>
          <GameLinks current="captureit" />
        </Dialog>
      )}
      {dialog === "restart" && (
        <Dialog title="Start a new game?" onClose={() => setDialog("menu")}>
          <p>This replaces the game saved on this device.</p>
          <div className="button-row">
            <button onClick={() => setDialog("menu")}>Keep playing</button>
            <button className="primary" onClick={start}>
              Start new game
            </button>
          </div>
        </Dialog>
      )}
      {dialog === "resign" && (
        <Dialog
          title={`${cap(game.current)} resigns?`}
          onClose={() => setDialog("menu")}
        >
          <p>
            {cap(game.current === "white" ? "black" : "white")} will win this
            game.
          </p>
          <div className="button-row">
            <button onClick={() => setDialog(null)}>Keep playing</button>
            <button className="primary" onClick={() => act({ type: "resign" })}>
              Resign game
            </button>
          </div>
        </Dialog>
      )}
      {dialog === "result" && (
        <Dialog
          title={`${cap(game.winner)} wins!`}
          onClose={() => setDialog(null)}
          className="capture-result"
        >
          <div className="capture-rule-icon" aria-hidden="true">
            ✦
          </div>
          <p>
            {game.reason === "resignation"
              ? `${cap(game.current)} resigned.`
              : "Every opposing piece captured."}
          </p>
          <div className="button-row">
            <button className="primary" onClick={start}>
              Play again
            </button>
            <button onClick={() => setDialog(null)}>View board</button>
            <button onClick={home}>Home</button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
