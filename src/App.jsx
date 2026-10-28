import { useEffect, useState } from "react";
import { mobilePlayer } from "./game/device.js";
import { dailyDate, buildPieces } from "./game/engine.js";
import {
  getProfile,
  readJSON,
  writeJSON,
  flushEvents,
  sessionKey,
  createSession,
  validSession,
} from "./game/storage.js";
import { SoloGame } from "./components/SoloGame.jsx";
import { DuelGame } from "./components/DuelGame.jsx";
import { AdminPage } from "./components/AdminPage.jsx";
import { InstallButton } from "./components/InstallButton.jsx";
import { HowToPlayModal } from "./components/HowToPlayModal.jsx";
import { Dialog } from "./components/Dialog.jsx";
import { ExtraOptions } from "./components/ExtraOptions.jsx";
import { Scoreboard } from "./components/Scoreboard.jsx";
export default function ShapeIt() {
  const initialCode = new URLSearchParams(location.search).get("room") || "";
  const [screen, setScreen] = useState(
    location.pathname === "/admin"
      ? "admin"
      : /^\d{4}$/.test(initialCode)
        ? "duel"
        : "menu",
  );
  const [profile, setProfile] = useState(getProfile),
    [name, setName] = useState(profile.name),
    [profileOpen, setProfileOpen] = useState(false);
  const [size, setSize] = useState(() =>
    window.matchMedia("(max-width:860px)").matches ? "compact" : "classic",
  );
  const [extras, setExtras] = useState(() =>
    readJSON("shapeit:training-extras", false),
  );
  const [trainingOpen, setTrainingOpen] = useState(false),
    [scoresOpen, setScoresOpen] = useState(false),
    [howTo, setHowTo] = useState(false);
  const [config, setConfig] = useState(null),
    [today, setToday] = useState(dailyDate());
  useEffect(() => {
    writeJSON("shapeit:profile", profile);
  }, [profile]);
  useEffect(() => {
    writeJSON("shapeit:training-extras", extras);
  }, [extras]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);
  useEffect(() => {
    const tick = () => setToday(dailyDate());
    const timer = setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    window.addEventListener("online", flushEvents);
    void flushEvents();
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      window.removeEventListener("online", flushEvents);
    };
  }, []);
  const home = () => {
    setScreen("menu");
    history.replaceState(null, "", "/");
  };
  const start = (mode, fresh = false) => {
    const next = {
      mode,
      size,
      date: dailyDate(),
      extras: mode === "training" ? extras : false,
      timed: true,
    };
    if (fresh)
      writeJSON(sessionKey(mode, size, next.date), createSession(next));
    setConfig(next);
    setTrainingOpen(false);
    setScreen("solo");
  };
  if (screen === "admin") return <AdminPage onHome={home} />;
  if (screen === "solo" && config)
    return (
      <SoloGame
        key={`${config.mode}:${config.size}:${config.date}`}
        config={config}
        profile={profile}
        effects
        onHome={home}
        onDaily={() => start("daily")}
      />
    );
  if (screen === "duel")
    return (
      <DuelGame
        profile={profile}
        onProfileChange={setProfile}
        mobile={mobilePlayer()}
        effects
        initialCode={/^\d{4}$/.test(initialCode) ? initialCode : ""}
        onHome={home}
      />
    );
  const cols = size === "compact" ? 7 : 10,
    rows = size === "compact" ? 5 : 8;
  const saved = readJSON(sessionKey("daily", size, today), null);
  const daily = validSession(saved, { mode: "daily", size, date: today })
    ? saved
    : null;
  const complete = daily && daily.status !== "playing";
  const status =
    daily?.status === "won"
      ? "Completed ✓"
      : daily?.status === "lost"
        ? "Finished · view board"
        : daily?.startedAt
          ? "In progress"
          : "Not played yet";
  const train = readJSON(sessionKey("training", size, today), null);
  const canResume =
    validSession(train, { mode: "training", size, date: today }) &&
    train.status === "playing";
  return (
    <main className="arcade-menu">
      <header className="menu-top">
        <button
          className="name-button"
          onClick={() => {
            setName(profile.name);
            setProfileOpen(true);
          }}
        >
          {profile.name || "Select your name"} <span aria-hidden="true">✎</span>
        </button>
      </header>
      <div className="game-title">
        <div className="title-shapes" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <h1>
          Shape<span>It</span>
        </h1>
      </div>
      <div className="board-choice" role="group" aria-label="Board size">
        <button
          aria-pressed={size === "compact"}
          onClick={() => setSize("compact")}
        >
          7 × 5
        </button>
        <button
          aria-pressed={size === "classic"}
          onClick={() => setSize("classic")}
        >
          10 × 8
        </button>
      </div>
      <nav className="arcade-modes" aria-label="Game modes">
        <button
          className={`arcade-mode daily-mode ${complete ? "complete" : "pending"}`}
          onClick={() => start("daily")}
        >
          <span className="mode-icon" aria-hidden="true">
            ◈
          </span>
          <span>
            <strong>Daily puzzle</strong>
            <small>{status}</small>
          </span>
          <span aria-hidden="true">{complete ? "✓" : "▶"}</span>
        </button>
        <button
          className="arcade-mode train-mode"
          onClick={() => setTrainingOpen(true)}
        >
          <span className="mode-icon" aria-hidden="true">
            △
          </span>
          <strong>Train mode</strong>
          <span aria-hidden="true">▶</span>
        </button>
        <button
          className="arcade-mode duel-mode"
          onClick={() => setScreen("duel")}
        >
          <span className="mode-icon" aria-hidden="true">
            ⚔
          </span>
          <strong>1 vs 1</strong>
          <span aria-hidden="true">▶</span>
        </button>
      </nav>
      <div className="menu-shortcuts">
        <button onClick={() => setScoresOpen(true)}>★ Scores</button>
        <button onClick={() => setHowTo(true)}>How to play</button>
      </div>
      <div className="menu-install">
        <InstallButton />
      </div>
      <footer className="menu-credit">
        Robin & Sam · Daily resets at midnight UTC
      </footer>
      {trainingOpen && (
        <Dialog title="Train mode" onClose={() => setTrainingOpen(false)}>
          <ExtraOptions value={extras} onChange={setExtras} />
          <p className="muted small">
            For your next board. The clock is always on.
          </p>
          <div className="training-actions">
            {canResume && (
              <button onClick={() => start("training")}>Continue board</button>
            )}
            <button
              className="primary next-board"
              onClick={() => start("training", true)}
            >
              New board →
            </button>
          </div>
        </Dialog>
      )}
      {profileOpen && (
        <Dialog title="Your name" onClose={() => setProfileOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) {
                setProfile({ ...profile, name: name.trim().slice(0, 24) });
                setProfileOpen(false);
              }
            }}
          >
            <label>
              Name
              <input
                autoFocus
                value={name}
                maxLength={24}
                placeholder="Select your name"
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="nickname"
              />
            </label>
            <button className="primary" type="submit">
              Save name
            </button>
          </form>
        </Dialog>
      )}
      {scoresOpen && (
        <Scoreboard initialSize={size} onClose={() => setScoresOpen(false)} />
      )}
      {howTo && (
        <HowToPlayModal
          pieces={buildPieces(`guide:${today}`, size, false)}
          cols={cols}
          rows={rows}
          onClose={() => setHowTo(false)}
        />
      )}
    </main>
  );
}
