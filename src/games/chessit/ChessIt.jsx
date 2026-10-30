import { useEffect, useState } from "react";
import { useProfile } from "../../shared/useProfile.js";
import { Dialog } from "../../shared/components/Dialog.jsx";
import { GameLinks } from "../../shared/components/GameLinks.jsx";
import { queueEvent } from "../../shared/activity.js";
import "./chessit.css";

export default function ChessIt() {
  const [profile, setProfile] = useProfile();
  const [name, setName] = useState(profile.name),
    [editing, setEditing] = useState(false);
  const [visitId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    document.title = "ChessIt";
    queueEvent(
      {
        id: `chessit:${visitId}:visit`,
        sessionId: visitId,
        game: "chessit",
        kind: "visit",
        mode: "preview",
        size: "8x8",
      },
      profile,
    );
  }, [visitId]);
  return (
    <main className="chess-app">
      <header className="chess-header">
        <h1>
          Chess<span>It</span>
        </h1>
        <button
          onClick={() => {
            setName(profile.name);
            setEditing(true);
          }}
        >
          {profile.name || "Choose your name"} <span aria-hidden="true">✎</span>
        </button>
      </header>
      <section className="chess-placeholder card">
        <div className="chess-preview" aria-hidden="true">
          ♞
        </div>
        <h2>Coming soon</h2>
        <p>A new game is on its way.</p>
        <GameLinks current="chessit" />
      </section>
      <footer className="menu-credit">Robin &amp; Sam</footer>
      {editing && (
        <Dialog title="Your name" onClose={() => setEditing(false)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) {
                setProfile({ ...profile, name: name.trim().slice(0, 24) });
                setEditing(false);
              }
            }}
          >
            <label>
              Name
              <input
                autoFocus
                required
                maxLength={24}
                value={name}
                autoComplete="nickname"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button className="primary" type="submit">
              Save name
            </button>
          </form>
        </Dialog>
      )}
    </main>
  );
}
