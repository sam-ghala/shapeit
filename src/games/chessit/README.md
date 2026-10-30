# ChessIt starter

Work only in this folder to implement the future ChessIt game. It is currently a deliberately non-playable placeholder: a shared name editor, branded preview, links to other games and a `visit` activity event. No chess rules or fabricated scores exist yet.

Open `/chessit` with `npm run dev`. Production also supports `chessit.playshapeit.com` once its custom domain is connected. The root URL still opens ShapeIt. The entry point is `ChessIt.jsx`; layout belongs in `chessit.css`.

## Add the game

1. Add `engine.js` for deterministic rules and modules/components beside it. Import no ShapeIt or PushIt code.
2. Use `useProfile()` from `../../shared/useProfile.js` for name and ID. Use shared `Dialog`, `SoundToggle` and `GameLinks` as needed. The platform already loads the theme.
3. Use the shared CSS variables and controls documented in the root `AGENTS.md`. Prefix new layout selectors with `chess-`.
4. Store game state under `chessit:*`. Keep the profile out of game saves; it is shared. All other game state stays independent.
5. Replace the preview activity with real start/finish events through `queueEvent`, using `game: "chessit"` and a stable session/event ID. Register new modes and sizes in `../catalog.js`, and local event permissions in `../../platform/server/GameService.js`. The admin filter already supports ChessIt.
6. If online rooms are needed, add `server/` here with authoritative transitions and filtered views. Add a namespaced `/api/chessit/` handler/table to the platform service; do not reuse another game's room table.
7. Add focused `tests/chessit*.test.js`, then run `npm test`, `npm run format:check`, and `npm run build`.

The only platform registration is already done in `../catalog.js` and `../../platform/App.jsx`. To build ChessIt you do not need to read either existing game's source.
