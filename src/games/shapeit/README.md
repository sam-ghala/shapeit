# ShapeIt

This folder contains the original ShapeIt game, separated without changing its rules or persistence keys.

- `ShapeIt.jsx`: menu, daily/training navigation and profile entry.
- `game/`: deterministic geometry, puzzles, scores, persistence, placement and assistance.
- `hooks/useGameSession.js`: solo lifecycle.
- `components/`: board, game tools, guides, results and multiplayer UI. Multiplayer inherits the shared profile name; unnamed players choose a name before the multiplayer view opens, including direct invite links and restored tabs. Name editing stays in the main menu.
- `server/duel.js`: authoritative duel state and filtered views.
- `server/api.js`: existing `/api/rooms` HTTP handler and server activity.
- `shapeit.css`: ShapeIt-specific layouts.

Generic controls, audio, profile, base styles and activity queue live in `src/shared`; admin and API infrastructure live in `src/platform`. The root remains ShapeIt. Existing `shapeit:*` storage keys, `/api/rooms`, table `rooms`, and durable object identity are retained.

Run `npm test` and `node tests/http.integration.mjs` against the local Worker. The root `AGENTS.md` documents the shared visual language and game isolation contract. Do not import PushIt or ChessIt implementation.

Extra pieces each add up to 500 bonus points (score version 3). Existing personal records are recalculated from their stored time, laser count and extras. Absorbed laser feedback automatically selects the black pencil. Transparent diamonds retain their original behavior: no extra hit indicator and no automatic switch to their pencil. On phones and coarse-pointer devices, laser targets are separated from border drawing targets by an empty gap; desktop board geometry is unchanged. Completed daily menu buttons use a muted neutral background and remain accessible for review.
