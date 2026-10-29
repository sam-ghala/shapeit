import { useRef, useState } from "react";
export function AdminPage({ onHome }) {
  const [key, setKey] = useState(""),
    [events, setEvents] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [players, setPlayers] = useState([]),
    [selectedPlayer, setSelectedPlayer] = useState(""),
    [search, setSearch] = useState("");
  const sequence = useRef(0);
  const load = async (e, playerId = selectedPlayer) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    const current = ++sequence.current;
    try {
      const params = playerId ? `?player=${encodeURIComponent(playerId)}` : "";
      const res = await fetch(`/api/admin/events${params}`, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load activity.");
      if (current !== sequence.current) return;
      setEvents(data.events);
      setPlayers(data.players || []);
    } catch (e) {
      if (current === sequence.current) setError(e.message);
    } finally {
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
              setSearch("");
              setKey("");
            }}
          >
            Sign out
          </button>
        )}
      </header>
      <p className="muted">Last 30 days</p>
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
              aria-pressed={!selectedPlayer}
              onClick={() => selectPlayer("")}
            >
              All players
            </button>
            <ul className="admin-player-list">
              {matchingPlayers.map((p) => (
                <li key={p.profileId}>
                  <button
                    aria-pressed={selectedPlayer === p.profileId}
                    onClick={() => selectPlayer(p.profileId)}
                  >
                    <span className="admin-player-name">
                      <strong>{p.name}</strong>
                      <small>{p.profileId.slice(0, 8)}</small>
                    </span>
                    <span>
                      {p.games} games · {p.finishes} finished
                    </span>
                    <time dateTime={p.lastPlayed}>
                      {new Date(p.lastPlayed).toLocaleString()}
                    </time>
                  </button>
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
                    "Mode",
                    "Event",
                    "Result",
                    "Lasers",
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
                    <td>
                      {e.mode} · {e.size}
                    </td>
                    <td>{e.kind}</td>
                    <td>{e.result || "—"}</td>
                    <td>{e.queries ?? "—"}</td>
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
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </main>
  );
}
