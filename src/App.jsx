import { useEffect, useState } from "react";
import { dailyDate, buildPieces } from "./game/engine.js";
import {
  getProfile,
  writeJSON,
  readJSON,
  flushEvents,
} from "./game/storage.js";
import { SoloGame } from "./components/SoloGame.jsx";
import { DuelGame } from "./components/DuelGame.jsx";
import { AdminPage } from "./components/AdminPage.jsx";
import { InstallButton } from "./components/InstallButton.jsx";
import { HowToPlayModal } from "./components/HowToPlayModal.jsx";
import { Dialog } from "./components/Dialog.jsx";

function smallDevice() {
  return (
    window.matchMedia("(max-width:860px)").matches ||
    (navigator.maxTouchPoints > 0 &&
      Math.min(screen.width, screen.height) <= 860)
  );
}
export default function ShapeIt() {
  const initialCode =
    new URLSearchParams(window.location.search).get("room") || "";
  const [screenName, setScreenName] = useState(
    window.location.pathname === "/admin"
      ? "admin"
      : /^\d{4}$/.test(initialCode)
        ? "duel"
        : "menu",
  );
  const [profile, setProfile] = useState(getProfile),
    [name, setName] = useState(profile.name),
    [profileOpen, setProfileOpen] = useState(false);
  const [size, setSize] = useState(() =>
      smallDevice() ? "compact" : "classic",
    ),
    [extras, setExtras] = useState(false),
    [timed, setTimed] = useState(false);
  const [effects, setEffects] = useState(() =>
      readJSON("shapeit:effects", false),
    ),
    [howTo, setHowTo] = useState(false),
    [config, setConfig] = useState(null),
    [today, setToday] = useState(dailyDate());
  useEffect(() => {
    writeJSON("shapeit:profile", profile);
  }, [profile]);
  useEffect(() => {
    writeJSON("shapeit:effects", effects);
  }, [effects]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screenName]);
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
    setScreenName("menu");
    window.history.replaceState(null, "", "/");
  };
  const start = (mode) => {
    setConfig({
      mode,
      size,
      date: dailyDate(),
      extras: mode === "training" && extras,
      timed: mode === "daily" || timed,
    });
    setScreenName("solo");
  };
  if (screenName === "admin") return <AdminPage onHome={home} />;
  if (screenName === "solo" && config)
    return (
      <SoloGame
        key={`${config.mode}:${config.size}:${config.date}`}
        config={config}
        profile={profile}
        effects={effects}
        onHome={home}
        onDaily={() => start("daily")}
      />
    );
  if (screenName === "duel")
    return (
      <DuelGame
        profile={profile}
        onProfileChange={setProfile}
        mobile={smallDevice()}
        effects={effects}
        initialCode={/^\d{4}$/.test(initialCode) ? initialCode : ""}
        onHome={home}
      />
    );
  const { cols, rows } =
    size === "compact" ? { cols: 7, rows: 5 } : { cols: 10, rows: 8 };
  return (
    <main className="app-shell menu-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="ShapeIt home">
          Shape<span>It</span>
        </a>
        <div className="button-row">
          <button
            onClick={() => {
              setName(profile.name);
              setProfileOpen(true);
            }}
          >
            <span className="avatar small-avatar">
              {profile.name.slice(0, 1).toUpperCase()}
            </span>
            {profile.name}
          </button>
          <button onClick={() => setHowTo(true)}>How to play</button>
        </div>
      </header>
      <div className="mode-grid">
        <button className="mode-card" onClick={() => start("daily")}>
          <span className="mode-symbol yellow">◈</span>

          <h2>Daily puzzle</h2>
          <p>
            {today} · {cols} × {rows}
          </p>
          <span className="mode-link">
            Play today's puzzle <span>↗</span>
          </span>
        </button>
        <button className="mode-card" onClick={() => start("training")}>
          <span className="mode-symbol blue">◇</span>

          <h2>Training</h2>
          <p>With timer or special pieces.</p>
          <span className="mode-link">
            Play or continue <span>↗</span>
          </span>
        </button>
        <button className="mode-card" onClick={() => setScreenName("duel")}>
          <span className="mode-symbol red">↔</span>

          <h2>1 vs 1</h2>
          <p>Challenge a friend.</p>
          <span className="mode-link">
            Create or join a room <span>↗</span>
          </span>
        </button>
      </div>
      <section className="preferences card">
        <div>
          <h3>Options</h3>
          <p className="muted small">Applies to your next round.</p>
        </div>
        <div className="preferences-controls">
          <label>
            Solo board
            <select value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="compact">Compact · 7 × 5</option>
              <option value="classic">Classic · 10 × 8</option>
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={timed}
              onChange={(e) => setTimed(e.target.checked)}
            />
            Timed training
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={extras}
              onChange={(e) => setExtras(e.target.checked)}
            />
            Special pieces in training
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={effects}
              onChange={(e) => setEffects(e.target.checked)}
            />
            Animate laser replays
          </label>
        </div>
      </section>
      <footer className="site-footer">
        <div>
          <InstallButton />
          <p className="muted small">
            Daily reset: midnight UTC · Progress saved on this device
          </p>
        </div>
        <p>
          Made by{" "}
          <a
            href="https://robinerb.github.io"
            target="_blank"
            rel="noopener noreferrer"
          >
            Robin Erb
          </a>{" "}
          &{" "}
          <a
            href="https://samghalayini.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Sam Ghalayini
          </a>
        </p>
      </footer>
      {profileOpen && (
        <Dialog title="Player name" onClose={() => setProfileOpen(false)}>
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
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="nickname"
              />
            </label>
            <p className="muted">
              Saved on this device. Game activity is visible to the site admin.
            </p>
            <button className="primary" type="submit">
              Save name
            </button>
          </form>
        </Dialog>
      )}
      {howTo && (
        <HowToPlayModal
          pieces={buildPieces(`guide:${today}`, size, extras)}
          cols={cols}
          rows={rows}
          onClose={() => setHowTo(false)}
        />
      )}
    </main>
  );
}
