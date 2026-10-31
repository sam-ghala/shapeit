import { useState } from "react";
import { PanelHeading } from "../../shared/components/PanelHeading.jsx";
import { gamePath } from "../../platform/routing.js";
import "./online.css";

const cap = (color) => (color === "black" ? "Black" : "White");

export function CaptureConnect({
  credentials,
  code,
  setCode,
  busy,
  error,
  onCreate,
  onJoin,
  onForget,
  onHome,
}) {
  return (
    <section className="capture-connect card">
      <PanelHeading
        title={credentials ? "Reconnecting…" : "Play a friend"}
        onClose={onHome}
      />
      {credentials ? (
        <>
          <p role="status">Opening room {credentials.code}.</p>
          <button onClick={onForget}>Use another room</button>
        </>
      ) : (
        <>
          <button className="primary" disabled={busy} onClick={onCreate}>
            {busy ? "Connecting…" : "Create room →"}
          </button>
          <form
            className="capture-join"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && /^\d{4}$/.test(code)) onJoin();
            }}
          >
            <label>
              Room code
              <input
                aria-label="Room code"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{4}"
                maxLength={4}
                value={code}
                placeholder="0000"
                disabled={busy}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 4))
                }
                required
              />
            </label>
            <button type="submit" disabled={busy || !/^\d{4}$/.test(code)}>
              Join →
            </button>
          </form>
        </>
      )}
      {error && (
        <p className="capture-online-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function CaptureLobby({ room, busy, onAction, onLeave }) {
  const [copyState, setCopyState] = useState("");
  const invitation = `${globalThis.location?.origin || ""}${gamePath("captureit")}?room=${room.code}`;
  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(invitation);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  };
  return (
    <section className="capture-lobby card">
      <PanelHeading title="Play a friend" onClose={onLeave} />
      <div className="capture-invitation">
        <span>Room code</span>
        <strong aria-label={`Room code ${room.code}`}>{room.code}</strong>
        <button onClick={copyLink}>
          {copyState === "copied" ? "Copied ✓" : "Copy invite link"}
        </button>
        {copyState === "manual" && (
          <label className="capture-invite-fallback">
            Copy this link to invite your friend
            <input
              aria-label="Invite link"
              value={invitation}
              readOnly
              onFocus={(event) => event.target.select()}
            />
          </label>
        )}
        <span className="capture-copy-status" role="status">
          {copyState === "copied" ? "Invite link copied." : ""}
        </span>
      </div>
      <div className="capture-lobby-players">
        {[0, 1].map((index) => {
          const player = room.players[index];
          return (
            <div key={index} className="capture-lobby-player">
              <div className="capture-lobby-player-name">
                <strong>{player?.name || "Waiting for a friend…"}</strong>
                {player && index === room.you && <span>You</span>}
                {player && index === 0 && <span>Host</span>}
              </div>
              {player ? (
                index === 0 && room.you === 0 ? (
                  <div
                    className="capture-color-picker"
                    role="group"
                    aria-label="Your color"
                  >
                    {["white", "black"].map((color) => (
                      <button
                        key={color}
                        aria-label={`Play as ${cap(color)}`}
                        aria-pressed={player.color === color}
                        disabled={busy || room.phase !== "lobby"}
                        onClick={() => onAction({ type: "color", color })}
                      >
                        <i
                          className={`capture-lobby-token capture-lobby-token-${color}`}
                          aria-hidden="true"
                        />
                        {cap(color)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="capture-lobby-color">
                    <i
                      className={`capture-lobby-token capture-lobby-token-${player.color}`}
                      aria-hidden="true"
                    />
                    {cap(player.color)}
                  </span>
                )
              ) : (
                <span className="capture-lobby-wait">
                  Share the code or invite link.
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="capture-lobby-note">White takes the first turn.</p>
      {room.you === 0 ? (
        <button
          className="primary"
          disabled={busy || room.players.length !== 2 || room.phase !== "lobby"}
          onClick={() => onAction({ type: "start" })}
        >
          Start game →
        </button>
      ) : (
        <p className="capture-lobby-wait" role="status">
          Waiting for the host to start.
        </p>
      )}
      <button className="capture-leave-room" onClick={onLeave}>
        Leave room
      </button>
    </section>
  );
}

export function CaptureClosed({ room, onHome }) {
  return (
    <section className="capture-connect card">
      <PanelHeading title="Room closed" onClose={onHome} />
      <p>
        {room.left
          ? `${room.left} left the room.`
          : "This room is no longer active."}
      </p>
      <button className="primary" onClick={onHome}>
        Main menu
      </button>
    </section>
  );
}
