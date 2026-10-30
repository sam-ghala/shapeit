# PushIt

Independent two-player game. `PushIt.jsx` owns navigation, lobby and results; `PushBoard.jsx` renders the stable 4×4 grid and animated token/control layers. `engine.js` contains pure legal actions. `match.js` owns scoring, series and local undo. `rooms.js` validates online permissions and consensus. `server/api.js` owns `/api/pushit/rooms` and authoritative activity; `usePushRoom.js` handles requests and reconnection.

The host selects colors and match length in the lobby. The first starter is random; later rounds alternate. Completed rounds cannot be undone. An unfinished online move requires the opponent's approval; same-device undo is immediate. Series finals use separate round and champion screens, then both players return to the lobby before the host starts again. Auto-rotation defaults on and waits one second after a turn. The rotation controls follow each piece's facing direction.

State keeps the existing `pushit:*` keys and `pushit_rooms` table. Test with `node --test tests/pushit*.test.js`, `node tests/pushit.http.integration.mjs` against the local Worker, and `/tests/pushit.browser.html` in Safari. Shared style/profile contracts are in the root `AGENTS.md`; do not import ShapeIt implementation.
