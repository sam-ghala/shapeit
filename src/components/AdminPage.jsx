import { useState } from "react";
export function AdminPage({ onHome }) {
  const [key, setKey] = useState(""),
    [events, setEvents] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/events", {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load activity.");
      setEvents(data.events);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="app-shell">
      <header className="topbar">
        <button onClick={onHome}>← Menu</button>
        <h1>Player activity</h1>
        {events && (
          <button
            onClick={() => {
              setEvents(null);
              setKey("");
            }}
          >
            Sign out
          </button>
        )}
      </header>
      <p className="muted">
        Private activity overview · last 30 days, up to 500 recent events. Names
        are self-chosen; solo results are reported by the player's browser.
      </p>
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
          <div className="session-bar">
            <span>
              {events.filter((e) => e.kind === "start").length} starts ·{" "}
              {events.filter((e) => e.kind === "finish").length} finishes ·{" "}
              {new Set(events.map((e) => e.profileId)).size} player IDs in this
              view
            </span>
            <button onClick={load} disabled={busy}>
              Refresh
            </button>
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
            {events.length === 0 && <p>No activity yet.</p>}
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
