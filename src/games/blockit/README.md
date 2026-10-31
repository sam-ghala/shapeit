# BlockIt

Two-player Quoridor, presented in the platform's shared visual language. The supplied `Quoridor.pdf` (10/2003 rules) is the rule reference; its artwork and text are not bundled. Original SVG/CSS renders the board. Open `/blockit` for same-device or online play. Four-player rules are outside this game's scope.

## Rules

- Nine by nine squares, one pawn at the center of each opposing base row, ten walls each. White aims for the top row; Black for the bottom. The first player is drawn at random.
- Each turn moves a pawn one orthogonal square or places one wall spanning two adjacent passages. Walls remain fixed. They cannot overlap or cross, and both players must retain a path to their opposite edge. Reachability ignores pawn occupancy.
- An adjacent opposing pawn can be jumped straight over if neither passage is blocked. Only when a wall or board edge prevents that jump may the pawn step diagonally around the opponent, through an unblocked side passage. Pawns cannot be captured.
- Reaching any square on the opposite edge wins immediately. A player with no walls must move. There is no invented repetition, turn-limit or stalemate result.

## UI and state

`engine.js` is the immutable rules engine. `session.js` validates and restores local saves, retains up to 50 undo snapshots, and gives each attempt a stable ID. Storage is namespaced under `blockit:*`; shared public names/IDs come from `useProfile`.

`BlockBoard` renders legal destinations, selectable wall slots and a preview. Wall placement requires confirmation; invalid placements explain why they cannot be committed. Both endpoints of the last pawn move, or the last wall, retain a green highlight until the next action. Board controls support Tab, arrow keys, Enter and Space. `BlockGame` is shared by local and online play, with a responsive board and controls that fit the viewport. Dialogs and a very short lobby may scroll internally.

Local play saves after every move, survives refresh, and allows immediate undo before the game ends. Returning home preserves the session. Replacing an unfinished session records an abort; a win or resignation records one completed game. Online play does not overwrite the local session.

## Online rooms

`rooms.js` owns the room model, `server/api.js` the namespaced HTTP handlers, and `useBlockRoom` the credential, polling and request lifecycle. Rooms use `/api/blockit/rooms`, a separate `blockit_rooms` table, four-digit codes, private seat tokens, revision checks and two-hour expiry. The existing Worker, Durable Object class/ID, migration and other games' tables are unchanged.

The host chooses a color, then starts after the second player joins. The server draws the first starter and validates every move and wall. Only the latest action's author can request undo; the opponent accepts or declines, and pending decisions pause gameplay. Restart requires both players and preserves the starter and match score. Rematches require both players, swap their colors and keep the starting color, so the starting person alternates. Winning actions are final. Either player may resign, including off-turn. Leaving closes the room without assigning a winner.

Invite links use `/blockit?room=1234`. A saved seat reconnects after refresh. Polls cannot overwrite a newer revision, concurrent action clicks send one mutation, and leaving cancels pending work. Wall previews survive unchanged polls. Public views omit credentials and undo history. Online starts/results/aborts are recorded by the server, with stable IDs; public activity never includes tokens or board state.

## Validation

Run `npm test`, `npm run format:check` and `npm run build`. Rule tests cover all jump directions, blocked and edge jumps, wall geometry, path preservation, inventories, goal wins, restoration and seeded games. Session, room, transport and UI tests cover undo, preview/confirmation, persistence, request races, rematch/reset and activity.

Start the built local Worker with `ADMIN_KEY:local-test-only`, then run `node tests/blockit.http.integration.mjs`. The test refuses production targets and plays a complete race, plus room authorization, walls, undo, rematches, reset, reconnect and activity. Use `TEST_BASE_URL` to override the local port. Check responsive layouts and two browser contexts on the same Worker origin; Vite's API proxy must preserve the Worker origin for CSRF protection.
