import { Dialog } from "../../shared/components/Dialog.jsx";
import { GAMES, gameInfo } from "../../games/catalog.js";
import "./admin.css";
import { useRef, useState } from "react";
export function AdminPage({ onHome }) {
  const [key, setKey] = useState(""),
    [events, setEvents] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [players, setPlayers] = useState([]),
    [selectedPlayer, setSelectedPlayer] = useState(""),
    [selectedGame, setSelectedGame] = useState(""),
    [search, setSearch] = useState(""),
    [deleteTarget, setDeleteTarget] = useState(null),
    [deleting, setDeleting] = useState(false);
  const sequence = useRef(0),
    deleteFlight = useRef(false);
  const load = async (e, playerId = selectedPlayer, gameId = selectedGame) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    const current = ++sequence.current;
    try {
      const query = new URLSearchParams();
      if (playerId) query.set("player", playerId);
      if (gameId) query.set("game", gameId);
      const params = query.size ? `?${query}` : "";
      const res = await fetch(`/api/admin/events${params}`, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load activity.");
      if (current !== sequence.current) return;
      setEvents(
        data.events.filter((event) => ["finish", "abort"].includes(event.kind)),
      );
      setPlayers(data.players || []);
    } catch (e) {
      if (current === sequence.current) setError(e.message);
    } finally {
      if (current === sequence.current) setBusy(false);
    }
  };
  const removePlayer = async () => {
    if (!deleteTarget || deleteFlight.current) return;
    deleteFlight.current = true;
    setDeleting(true);
    setBusy(true);
    setError("");
    const current = ++sequence.current;
    try {
      const res = await fetch("/api/admin/events/delete-player", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profileId: deleteTarget.profileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete activity.");
      if (current !== sequence.current) return;
      const nextPlayer =
        selectedPlayer === deleteTarget.profileId ? "" : selectedPlayer;
      setSelectedPlayer(nextPlayer);
      setPlayers((old) =>
        old.filter((p) => p.profileId !== deleteTarget.profileId),
      );
      setEvents((old) =>
        old.filter((event) => event.profileId !== deleteTarget.profileId),
      );
      setDeleteTarget(null);
      await load(null, nextPlayer);
    } catch (error) {
      if (current === sequence.current) setError(error.message);
    } finally {
      deleteFlight.current = false;
      setDeleting(false);
      if (current === sequence.current) setBusy(false);
    }
  };
  const selectPlayer = (id) => {
    setSelectedPlayer(id);
    setEvents([]);
    void load(null, id);
  };
  const matchingPlayers = players.filter((p) =>
    `${p.name} ${p.profileId}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const selected = players.find((p) => p.profileId === selectedPlayer);
  return (
    <main className="app-shell">
      <header className="topbar">
        <button onClick={onHome}>← Menu</button>
        <h1>Player activity</h1>
        {events && (
          <button
            onClick={() => {
              sequence.current++;
              setBusy(false);
              setEvents(null);
              setPlayers([]);
              setSelectedPlayer("");
              setSelectedGame("");
              setSearch("");
              setKey("");
              setDeleteTarget(null);
            }}
          >
            Sign out
          </button>
        )}
      </header>
      <p className="muted">Finished and aborted games · Last 30 days</p>
      {events === null ? (
        <form className="card admin-login" onSubmit={load}>
          <label>
            Admin access key
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Checking…" : "Unlock activity"}
          </button>
        </form>
      ) : (
        <>
          <label className="admin-game-filter">
            Game
            <select
              disabled={deleting}
              value={selectedGame}
              onChange={(event) => {
                const value = event.target.value;
                setSelectedGame(value);
                setSelectedPlayer("");
                setEvents([]);
                void load(null, "", value);
              }}
            >
              <option value="">All games</option>
              {GAMES.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
          </label>
          <section className="card admin-players" aria-label="Players">
            <div className="admin-player-heading">
              <h2>
                Players <span>{players.length}</span>
              </h2>
              <button onClick={load} disabled={busy}>
                Refresh
              </button>
            </div>
            <label>
              Find player
              <input
                type="search"
                value={search}
                placeholder="Name or player ID"
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              className="admin-all-players"
              disabled={deleting}
              aria-pressed={!selectedPlayer}
              onClick={() => selectPlayer("")}
            >
              All players
            </button>
            <ul className="admin-player-list">
              {matchingPlayers.map((p) => (
                <li
                  key={p.profileId}
                  className={
                    selectedPlayer === p.profileId ? "is-selected" : ""
                  }
                >
                  <div className="admin-player-name">
                    <button
                      className="admin-player-select"
                      disabled={deleting}
                      aria-pressed={selectedPlayer === p.profileId}
                      onClick={() => selectPlayer(p.profileId)}
                    >
                      <strong>{p.name}</strong>
                      <small>{p.profileId.slice(0, 8)}</small>
                    </button>
                    <button
                      className="admin-delete-player"
                      disabled={busy || deleting}
                      aria-label={`Delete all events for ${p.name}`}
                      title={`Delete all events for ${p.name}`}
                      onClick={() => {
                        setError("");
                        setDeleteTarget(p);
                      }}
                    >
                      <svg
                        width="19"
                        height="19"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
                      </svg>
                    </button>
                  </div>
                  <span>
                    {p.games} games · {p.finishes} finished · {p.aborts || 0}{" "}
                    aborted
                  </span>
                  <time dateTime={p.lastPlayed}>
                    {new Date(p.lastPlayed).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
            {matchingPlayers.length === 0 && <p>No players found.</p>}
          </section>
          <div className="admin-player-heading admin-activity-heading">
            <h2>{selected ? `${selected.name}’s games` : "All activity"}</h2>
            <span className="muted">
              {busy ? "Loading…" : `${events.length} events · up to 500`}
            </span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "When",
                    "Player",
                    "Game",
                    "Mode",
                    "Event",
                    "Result",
                    "Actions",
                    "Time",
                    "Points",
                  ].map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td
                      title={`Received: ${new Date(e.receivedAt).toLocaleString()}`}
                    >
                      {new Date(e.occurredAt || e.receivedAt).toLocaleString()}
                    </td>
                    <td>
                      {e.name}
                      <small className="muted">
                        {" "}
                        {e.profileId.slice(0, 8)}
                      </small>
                    </td>
                    <td>{gameInfo(e.game || "shapeit")?.name || e.game}</td>
                    <td>
                      {e.mode} · {e.size}
                    </td>
                    <td>{e.kind === "abort" ? "Aborted" : "Finished"}</td>
                    <td>
                      {e.result === "completed" && e.winnerColor
                        ? `${e.winnerColor} wins`
                        : e.result || "—"}
                      {e.blackWins != null
                        ? ` · ${e.blackWins}:${e.whiteWins}`
                        : ""}
                    </td>
                    <td>
                      {e.turns != null
                        ? `${e.turns} turns`
                        : e.queries != null
                          ? `${e.queries} lasers`
                          : "—"}
                    </td>
                    <td>{e.seconds != null ? `${e.seconds}s` : "—"}</td>
                    <td>{e.score ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {events.length === 0 && !busy && <p>No activity yet.</p>}
          </div>
        </>
      )}
      {deleteTarget && (
        <Dialog
          title={`Delete ${deleteTarget.name}’s events?`}
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        >
          <p>
            All stored events for {deleteTarget.name} across every game will be
            permanently deleted.
          </p>
          <div className="button-row">
            <button disabled={deleting} onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button
              className="admin-confirm-delete"
              disabled={deleting}
              onClick={removePlayer}
            >
              {deleting ? "Deleting…" : "Delete all events"}
            </button>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </Dialog>
      )}
      {error && !deleteTarget && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </main>
  );
}
