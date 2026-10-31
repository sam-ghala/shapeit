# CaptureIt

A two-player game at `/captureit`, played on the same device or online, based on the supplied **Rules of Coerceo, v.020** (2011). CaptureIt uses the platform's shared theme, profile, dialogs, sound controls and game links. It imports no other game's implementation.

## Ownership

- `engine.js`: deterministic rules, exact Laurentius setup, tile/cell geometry, legal actions and saved-position validation.
- `session.js`: local session identity, full-turn undo, move summaries and save recovery.
- `rooms.js`: online seats, colors, permissions, consensus undo, restarts and rematches.
- `server/api.js`: `/api/captureit/rooms`, room persistence and authoritative online activity.
- `useCaptureRoom.js`: room requests, polling and saved-access reconnection.
- `CaptureOnline.jsx`: online connection, lobby and closed-room screens.
- `CaptureOnlineGame.jsx`: online play, profile gate, turn controls and result dialogs.
- `CapturePlayers.jsx`: shared local/online player cards.
- `CaptureIt.jsx`: menu, game, rules, shared profile editor, activity and result screens.
- `CaptureBoard.jsx`: responsive SVG board with legal targets, keyboard activation and directional focus.
- `captureit.css`, `online.css`: game-specific layout, scoped with `capture-` selectors.

## Rules

The initial board contains 19 hexagons, each split into six triangular fields. Both players start with 18 pieces in the rulebook's Laurentius arrangement; White starts. A turn moves one piece to an empty, same-color triangle sharing a corner with its current field, or exchanges two previously collected tiles for any opposing piece. Passing is not allowed.

An enemy piece is captured when all three edges of its triangle are enclosed by opposing pieces or missing board. Only newly enclosed enemies are captured. Moving into an already enclosed field creates a neutral position: a piece is never captured by its own turn and remains safe while that enclosure persists. Breaking and then restoring its enclosure can capture it.

After a move, an empty tile must be removed when its remaining neighbors occupy one consecutive run of at most three sides. Nonconsecutive attachments preserve bridge tiles. Removal is sequential: process the vacated tile first, then remaining eligible tiles in stable board order, rechecking adjacency after each removal. The moving player collects these tiles. Captures and exchanges can cause further tile removals and enclosures; tiles emptied this way are discarded, never banked. Exchange turns spend two banked tiles, replace the movement, and discard all removed tiles.

Capturing the last enemy piece wins. Resigning awards the other player the win. The optional Cura warning and one-tile exchange are not enabled. The supplied rulebook defines neither repetition nor stalemate outcomes, so the engine does not invent an automatic draw or loss. It also does not prescribe the tie order among several removable tiles; the deterministic order above keeps replays and saves consistent.

The rulebook was used as a rules reference; its text and artwork are not bundled with the app. The board and pieces are rendered from original SVG geometry.

## State and activity

`captureit:session:v1` holds a validated local session with up to 50 undo snapshots. `captureit:view` stores per-tab navigation; `captureit:sound` uses the shared audio helper. Refreshing or returning home preserves the game. Completed games cannot be undone. Starting another game explicitly replaces the saved game, recording an abort for an unfinished session.

Shared activity uses `game: "captureit"`, `mode: "local"`, `size: "classic"`, with stable visit/start/finish/abort IDs. Completed games report the winner's color, turns and elapsed time; visits do not count as completed games. The profile remains in the shared profile store. No game boards or history are included in events.

## Online 1v1

Choose Play a friend, enter a public player name if needed, and create or join a private four-digit room. Invite links use `?room=1234`; room tokens are never included. The host chooses colors in the lobby and starts once both players join. White always starts. Only the current player can move or exchange tiles, and every action is validated on the server against the current revision.

Only the player who made the latest turn can request undo. Both boards pause until the opponent accepts or declines; completed games cannot be undone. Both players must agree to restart an unfinished game or play a rematch. Restart requests pause play and can be declined. A restart keeps colors and room score; a rematch swaps colors and keeps the score assigned to players. Either player can resign. Leaving closes the room and records an unfinished game as aborted, without granting a win.

`captureit:room` stores origin-local room credentials tied to the shared profile ID. Refreshing reconnects and polling updates the board every 1.5 seconds; rooms expire two hours after creation. Room state is stored separately in `captureit_rooms` in the existing game service. Online play preserves `captureit:session:v1`. Online activity uses `mode: "online"` and is created by the server, including results, restarts, departures and expiry. The public activity endpoint does not accept browser-fabricated online results.

## Validation

Run `node --test tests/captureit*.test.js` for rules, local sessions, online permissions and interaction coverage, then `npm test`, `npm run format:check` and `npm run build`. The rules tests cover setup, legal moves, enclosure/neutral positions, sequential shrinking, exchange costs, wins and saved-state recovery, including seeded sequences that verify board connectivity and tile conservation.

For HTTP integration, run a local Worker with `ADMIN_KEY:local-test-only`, then `node tests/captureit.http.integration.mjs`. For shared platform checks, run `node tests/pushit.http.integration.mjs` to create its required series fixture, then `node tests/platform.http.integration.mjs`. The platform suite covers CaptureIt pages and local activity permissions. Never target production with these tests.

Check `/captureit` in Safari at desktop, phone and landscape sizes: start, select/move with pointer and keyboard, undo, refresh, zoom/pan, exchange, rules, resign and replay. The page may scroll vertically on smaller screens; the board preserves triangular geometry and zoom scrolls inside its own container. Safari WebDriver needs Allow Remote Automation enabled. WebKit automation can supplement layout checks but must not be reported as a Safari run.

Check online play using the built Worker at port 8787 so the UI and API share an origin. Use two independent browser profiles/devices to verify invite join, color choice, turn locking, exchange, undo approval, reconnect, resignation, rematch and leaving the room.
