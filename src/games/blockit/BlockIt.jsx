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
import { colorName, opposite } from "./engine.js";
import {
  createSession,
  playSession,
  undoSession,
  restoreSession,
} from "./session.js";
import { BlockHeader } from "./BlockHeader.jsx";
import { BlockGame } from "./BlockGame.jsx";
import { BlockOnlineGame } from "./BlockOnlineGame.jsx";
import "./blockit.css";

const SAVE_KEY = "blockit:session:v1";
function Rules({ onClose }) {
  const [page, setPage] = useState(0);
  const pages = [
    [
      "Race to the other side.",
      "Each player starts with one pawn and ten walls. Reach any square on the opposite edge to win. The first player is drawn at random.",
      "White heads to the top; Black heads to the bottom. This is the two-player game.",
    ],
    [
      "Move a pawn. Or place a wall.",
      "On your turn, move one square up, down, left or right — or use one of your walls. A wall blocks two adjacent passages.",
      "Tap a green dot to move. To build, choose Place wall, tap a slot, choose a direction, then confirm. Placed walls stay put.",
    ],
    [
      "Leave a way through.",
      "Walls cannot overlap or cross. You can slow either player down, but you must leave both players at least one route to their goal.",
      "Red previews cannot be placed. When you run out of walls, keep moving your pawn.",
    ],
    [
      "Jump your opponent.",
      "When the pawns meet without a wall between them, jump straight over the other pawn. If a wall or the board edge blocks that jump, step diagonally around it instead.",
      "Diagonal steps must still avoid walls. The green dots always show every legal destination. There are no captures.",
    ],
  ];
  return (
    <Dialog title="How to play" onClose={onClose} className="block-rules">
      <div className="block-rule-icon" aria-hidden="true">
        {["▥", "◉", "⊞", "↗"][page]}
      </div>
      <h3>{pages[page][0]}</h3>
      <p>{pages[page][1]}</p>
      <p className="muted">{pages[page][2]}</p>
      <div className="block-guide-nav">
        <button onClick={() => (page ? setPage(page - 1) : onClose())}>
          {page ? "← Back" : "Close"}
        </button>
        <span>
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
export default function BlockIt() {
  const [profile, setProfile] = useProfile();
  const [session, setSession] = useState(() =>
    restoreSession(readJSON(SAVE_KEY, null)),
  );
  const roomParam =
    new URLSearchParams(globalThis.location?.search || "").get("room") || "";
  const initialCode = /^\d{4}$/.test(roomParam) ? roomParam : "";
  const [screen, setScreen] = useState(() =>
    initialCode ? "online" : readTabState("blockit:view", "menu"),
  );
  const [dialog, setDialog] = useState(null),
    [name, setName] = useState("");
  const [error, setError] = useState(""),
    [saved, setSaved] = useState(true);
  const [visitId] = useState(() => crypto.randomUUID());
  const game = session?.game,
    playing = screen === "game" && !!game;
  const credentials = readJSON("blockit:room", null);
  const canRejoin =
    credentials?.profileId === profile.id &&
    /^\d{4}$/.test(credentials?.code) &&
    typeof credentials?.token === "string";
  const emit = (kind, match = session) =>
    queueEvent(
      {
        id: `blockit:${match.id}:${kind}`,
        sessionId: match.id,
        game: "blockit",
        kind,
        mode: "local",
        size: "9x9",
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
  useEffect(() => {
    document.title = "BlockIt";
    queueEvent(
      {
        id: `blockit:${visitId}:visit`,
        sessionId: visitId,
        game: "blockit",
        kind: "visit",
        mode: "local",
        size: "9x9",
      },
      profile,
    );
  }, [visitId]);
  useEffect(() => {
    if (session) setSaved(writeJSON(SAVE_KEY, session));
  }, [session]);
  useEffect(() => {
    writeTabState("blockit:view", screen);
  }, [screen]);
  const start = () => {
    if (session && !game.winner) emit("abort");
    const next = createSession();
    setSession(next);
    setScreen("game");
    setDialog(null);
    setError("");
    emit("start", next);
    playSound("turn");
  };
  const home = () => {
    window.history.replaceState(null, "", gamePath("blockit"));
    setScreen("menu");
    setDialog(null);
    setError("");
  };
  const act = (action) => {
    try {
      const next = playSession(session, action);
      setSession(next);
      setError("");
      if (next.game.winner) {
        emit("finish", next);
        setDialog("result");
        resultSound(true);
      } else playSound("turn");
    } catch (problem) {
      setError(problem.message);
    }
  };
  if (screen === "online")
    return (
      <>
        <BlockOnlineGame
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
    <main className={`block-app ${playing ? "block-playing" : "block-home"}`}>
      {playing ? (
        <>
          <BlockHeader
            onHome={home}
            onRules={() => setDialog("rules")}
            onMenu={() => setDialog("menu")}
          />
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <BlockGame
            game={game}
            canUndo={!!session.history.length}
            onUndo={() => {
              setSession(undoSession(session));
              setError("");
              playSound();
            }}
            onAction={act}
            footer={
              game.winner ? (
                <button className="primary" onClick={start}>
                  Play again
                </button>
              ) : (
                <p className="block-save-note">
                  {saved
                    ? "Saved on this device."
                    : "Couldn’t save. Keep this page open."}
                </p>
              )
            }
          />
        </>
      ) : (
        <>
          <div className="block-home-top">
            <a href={gameHref("shapeit")}>← ShapeIt</a>
            <button
              onClick={() => {
                setName(profile.name);
                setDialog("name");
              }}
            >
              {profile.name || "Choose your name"}{" "}
              <span aria-hidden="true">✎</span>
            </button>
          </div>
          <div className="block-home-title">
            <h1>
              Block<span>It</span>
            </h1>
            <p>Build a wall. Find your way.</p>
          </div>
          <nav className="block-home-modes" aria-label="BlockIt game modes">
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
                <small>Two players · One board</small>
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
          <GameLinks current="blockit" />
          <footer className="menu-credit">
            Robin &amp; Sam <span aria-hidden="true">·</span> <SoundToggle />
          </footer>
        </>
      )}
      {dialog === "rules" && <Rules onClose={() => setDialog(null)} />}
      {dialog === "name" && (
        <Dialog title="Your name" onClose={() => setDialog(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) {
                setProfile({ ...profile, name: name.trim().slice(0, 24) });
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
                value={name}
                onChange={(event) => setName(event.target.value)}
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
          className="block-menu"
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
          <button onClick={home}>Save &amp; go home</button>
          <p className="muted">
            {saved
              ? "Saved on this device."
              : "Couldn’t save. Keep this page open."}
          </p>
          <GameLinks current="blockit" />
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
          title={`${colorName(game.current)} resigns?`}
          onClose={() => setDialog("menu")}
        >
          <p>{colorName(opposite(game.current))} will win this game.</p>
          <div className="button-row">
            <button onClick={() => setDialog("menu")}>Keep playing</button>
            <button onClick={() => act({ type: "resign" })}>Resign game</button>
          </div>
        </Dialog>
      )}
      {dialog === "result" && (
        <Dialog
          title={`${colorName(game.winner)} wins!`}
          onClose={() => setDialog(null)}
        >
          <p>
            {game.reason === "goal"
              ? "Reached the opposite edge."
              : "The other player resigned."}
          </p>
          <div className="button-row">
            <button onClick={() => setDialog(null)}>View board</button>
            <button className="primary" onClick={start}>
              Play again
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
