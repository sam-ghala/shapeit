import "./shapeit.css";
import { useProfile } from "../../shared/useProfile.js";
import { GameLinks } from "../../shared/components/GameLinks.jsx";
import { restoreNavigation, writeTabState } from "./game/navigation.js";
import { useEffect, useState } from "react";
import { mobilePlayer } from "../../shared/device.js";
import { dailyDate, buildPieces } from "./game/engine.js";
import {
  readJSON,
  writeJSON,
  flushEvents,
  sessionKey,
  createSession,
  validSession,
} from "./game/storage.js";
import { SoloGame } from "./components/SoloGame.jsx";
import { DuelGame } from "./components/DuelGame.jsx";
import { AdminPage } from "../../platform/admin/AdminPage.jsx";
import { InstallButton } from "./components/InstallButton.jsx";
import { HowToPlayModal } from "./components/HowToPlayModal.jsx";
import { Dialog } from "../../shared/components/Dialog.jsx";
import { Scoreboard } from "./components/Scoreboard.jsx";
export default function ShapeIt() {
  const initialCode = new URLSearchParams(location.search).get("room") || "";
  const phone = mobilePlayer();
  const [initial] = useState(() =>
    restoreNavigation(
      location,
      phone || window.matchMedia("(max-width:860px)").matches
        ? "compact"
        : "classic",
      phone,
    ),
  );
  const [screen, setScreen] = useState(initial.screen);
  const [profile, setProfile] = useProfile();
  const needsMultiplayerName = screen === "duel" && !profile.name.trim();
  const [name, setName] = useState(profile.name),
    [profileOpen, setProfileOpen] = useState(initial.dialog === "profile");
  const [size, setSize] = useState(initial.size);
  const [scoresOpen, setScoresOpen] = useState(initial.dialog === "scores"),
    [howTo, setHowTo] = useState(initial.dialog === "howto");
  const [config, setConfig] = useState(initial.config),
    [today, setToday] = useState(dailyDate());
  useEffect(() => {
    writeTabState("shapeit:view", {
      screen,
      size,
      config,
      dialog: scoresOpen
        ? "scores"
        : howTo
          ? "howto"
          : profileOpen
            ? "profile"
            : null,
    });
  }, [screen, size, config, scoresOpen, howTo, profileOpen]);
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
      extras:
        mode === "training"
          ? readJSON("shapeit:training-extras", false)
          : false,
      timed: true,
    };
    const previous = readJSON(sessionKey(mode, size, next.date), null);
    if (fresh || (mode === "training" && previous?.status !== "playing"))
      writeJSON(sessionKey(mode, size, next.date), createSession(next));
    setConfig(next);
    setScreen("solo");
  };
  if (screen === "admin") return <AdminPage onHome={home} />;
  if (screen === "solo" && config)
    return (
      <SoloGame
        key={`${config.mode}:${config.size}:${config.date}`}
        config={config}
        onConfigChange={setConfig}
        profile={profile}
        effects
        onHome={home}
        onDaily={() => start("daily")}
      />
    );
  if (screen === "duel" && !needsMultiplayerName)
    return (
      <DuelGame
        profile={profile}
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
  return (
    <main className="arcade-menu">
      <header className="menu-top">
        <div className="game-title">
          <h1>
            Shape<span>It</span>
          </h1>
        </div>
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
      {!phone && (
        <div className="board-choice" role="group" aria-label="Board size">
          <button
            aria-pressed={size === "compact"}
            onClick={() => setSize("compact")}
          >
            <span aria-hidden="true">{size === "compact" ? "✓" : "◇"}</span>{" "}
            Small board
          </button>
          <button
            aria-pressed={size === "classic"}
            onClick={() => setSize("classic")}
          >
            <span aria-hidden="true">{size === "classic" ? "✓" : "◇"}</span> Big
            board
          </button>
        </div>
      )}
      <nav className="arcade-modes" aria-label="Game modes">
        <button
          className={`arcade-mode daily-mode ${complete ? "complete" : "pending"}`}
          onClick={() => start("daily")}
        >
          <span className="mode-icon" aria-hidden="true">
            ◈
          </span>
          <span className="daily-copy">
            <strong>Daily puzzle</strong>
            <small>{status}</small>
          </span>
          <span aria-hidden="true">{complete ? "✓" : "▶"}</span>
        </button>
        <button
          className="arcade-mode train-mode"
          onClick={() => start("training")}
        >
          <span className="mode-icon" aria-hidden="true">
            △
          </span>
          <strong>Train mode</strong>
          <span aria-hidden="true">▶</span>
        </button>
        <button
          className="arcade-mode duel-mode"
          onClick={() => {
            setName(profile.name);
            setScreen("duel");
          }}
        >
          <span className="mode-icon" aria-hidden="true">
            ⚔
          </span>
          <strong>Multiplayer</strong>
          <span aria-hidden="true">▶</span>
        </button>
      </nav>
      <div className="menu-shortcuts">
        <button onClick={() => setScoresOpen(true)}>★ Scores</button>
        <button onClick={() => setHowTo(true)}>How to play</button>
      </div>
      <GameLinks current="shapeit" />
      <div className="menu-install">
        <InstallButton />
      </div>
      <footer className="menu-credit">Robin & Sam</footer>
      {(profileOpen || needsMultiplayerName) && (
        <Dialog
          title="Your name"
          onClose={() => {
            setProfileOpen(false);
            if (needsMultiplayerName) home();
          }}
        >
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
              {needsMultiplayerName ? "Continue" : "Save name"}
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
