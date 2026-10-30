# ShapeIt

A laser deduction game by Robin and Sam. React/Vite frontend and a Cloudflare Worker with SQLite-backed Durable Objects for private duels and recent activity.

## Local development

Use Node.js 22 or newer and install with `npm ci`.

```sh
npm run build
npx wrangler dev --port 8787 --var ADMIN_KEY:local-test-only
```

Open http://localhost:8787 for the production build, API and service worker. In another terminal, `npm run dev` starts the frontend with hot reload at http://localhost:5173; it proxies `/api` to port 8787. The sample admin key is for local development only. Alternatively store a local key in an ignored `.dev.vars` file as `ADMIN_KEY="your-local-key"`.

```sh
npm test
npm run format:check
npm run build
node tests/http.integration.mjs
```

The HTTP integration test needs the local Worker running with the sample key. Override `TEST_BASE_URL` and `TEST_ADMIN_KEY` if needed. Run it against a development instance: it creates rooms and activity records. GitHub Actions runs formatting, unit tests and the production build.

## Game behavior

- Daily puzzles are deterministic per UTC date and board size. Running games survive midnight; the player explicitly opens the new daily. Engine version 2 isolates the new rules and saved games.
- Daily and training always track time. The transparent diamond and black square can be enabled independently in training and private rooms; daily puzzles never use extras. Saved drawings, laser history and completed boards survive refresh. A new round replaces the previous training round for that board size. Per-tab navigation also restores the current mode and solo dialog on reload; direct room links take priority.
- Exact solution checks reject extra colored lines and missing boundaries. Empty-cell X notes do not affect correctness. Submission immediately opens the result with an animated score and optional sound. See board reveals the solution with the drawing overlaid transparently, hides X notes and preserves the board size. All border lasers can be explored after the result, always starting at the clicked label, without changing the recorded score or laser count. New board starts the next training round. Successful results celebrate with confetti, a score meter and the previous personal best for that mode and board size. Meter tones share its animation clock; loss, drawing and laser cues are also controlled by the persistent sound toggle. Reduced-motion preferences skip the celebration animation.
- Compact boards use four distinct shapes on 7×5; classic boards use five on 10×8. No duplicate shapes under rotation or reflection in the normal shape pool.
- The transparent diamond reflects without adding a color. The black one-cell square absorbs the laser without adding a color or producing an exit. Only its position matters. These are documented adaptations of the supplied rules.
- Colors are presented as a set, not mixed or ordered. There is no direct-cell scan. The guide uses the same board, laser animation and log as the game. Try lasers explains flight paths; Try game shows the target piece and celebrates an exact solution. Switching tabs preserves practice drawings and clues until the guide closes.
- Training offers three hint levels per piece: approximate area, top-left cell and an outline overlay. Hint progress persists and shared results identify assisted rounds. Rounds with hints are excluded from personal scores, including previously saved assisted results. Daily and duels have no hints.
- Laser hits keep the selected color if it was hit; otherwise they choose an unfinished hit color randomly, based on complete shapes in the drawing. Completed piece icons dim regardless of whether their positions are correct. The single-column log scrolls the selected shot into view without moving the page.
- Profiles use a freely chosen name and a random local ID. There is no account recovery or cross-device identity. The menu marks the daily as pending, in progress or finished. A personal local scoreboard separates daily/training and board sizes. It excludes all rounds with hints, has no time-based expiry, and keeps the top 20 per category plus the 200 most recent results; no database or public ranking is required.

## PushIt

Open `/pushit` for the two-player strategy game, styled to match ShapeIt. The ShapeIt menu links to it; `/` still opens ShapeIt. PushIt is played on a 4×4 board with six directional pieces.

- Rotate 90°, advance one square, or push a contiguous row. Each costs one action. Take exactly one or three actions per turn, distributed among any of your pieces; after two, a third is mandatory. Three actions automatically pass the turn. Opposing or friendly pieces facing the pusher block the entire chain. Pushed pieces retain their orientation. Moving yourself off the edge is forbidden; pushing an opponent off wins immediately. Friendly ejection alone does not win. There are no extra timers or automatic draw rules.
- **Same device:** both players share a board. The player who most recently saw a sunrise chooses their starting color. An optional “Rotate board after each turn” setting keeps the active side at the bottom; the setting, board and action count survive refresh. Games use `pushit:local:v1`; undo is available only within the unfinished local turn. Starting a replacement game requires confirmation.
- **Play a friend:** create or join a four-digit private room, or use `/pushit?room=1234`. The host sets their color and starting side. Each player sees their own side at the bottom. This view rotation never changes server coordinates, facing directions or action validation. A prominent banner distinguishes your turn from the opponent’s turn, including a sound cue and browser-tab title when your turn starts. Both players see the full board, with server-enforced actions and revision checks. Polling runs every 1.5 seconds. A move takes priority over a background poll. Refresh reconnects the saved browser seat. Both players must request a rematch or agree to reset a stuck position; room wins remain. Leaving closes the room without awarding an unfinished win. Rooms expire after two hours.
- The built-in guide explains play and illustrates the starting position. Selecting a piece reveals two curved rotation arrows on the board with 44×48 px touch targets; tap the highlighted forward square to move or push. Movement controls are on the board; end-turn and local undo remain beside it. All controls work by touch or keyboard. Four equal rows and columns keep every square fixed even when an entire row is empty. Sound uses ShapeIt's existing preference. Same-device play works offline after the app has been cached; online rooms require a connection.

PushIt shares the existing Worker and Durable Object binding, with its own `pushit_rooms` table and `/api/pushit/rooms` routes. It requires no extra Cloudflare resources or deployment settings. Source lives in `src/pushit/`. Rule and UI tests run with `npm test`; run `node tests/pushit.http.integration.mjs` against a local Worker to verify private rooms and direct URLs.

For browser layout checks, start Vite and open `/tests/pushit.browser.html`. It checks equal square sizes, stable positions with each row empty, both board perspectives and touch targets at 320, 390, 430 and 1000 px. Test real online sessions against the built Worker at port 8787 so the browser and API share an origin.

## Scoring

A correct board scores time × laser efficiency, rounded to an integer; a wrong board scores zero. Time is `200 / (seconds / 60 + 2)`. Laser efficiency is 100 for 0–5 shots, `120 - 4 × shots` for 6–10, then `80 × exp(-0.05 × (shots - 10))`. This preserves the original early scoring and time curve while removing the sharp penalty after ten shots.

Each enabled extra adds `0.12 × raw score × (1 - raw score / 10000)`, rounded once for the combined bonus. This gives at most 300 points per extra and tapers near 10,000. With at most five lasers, 9,000 requires less than 14 seconds without extras or less than 18 seconds with both. Existing personal results are recalculated from their stored duration, shots and extras so old and new records remain comparable; puzzle generation is unchanged.

## Private duels

Create a room or join with a four-digit code/invite link. Take turns and Score race support two players; Random race supports 2–8. All-computer rooms use 10×8; if any participant reports a phone-sized device, everyone uses 7×5. Both players receive identical sets from the same normal piece pool as daily puzzles for that board size. The host chooses Take turns, Score race or Random race and can enable either special piece. Shape sets are public, placements are private.

In Take turns and Score race, players start with empty boards and place their selected pieces with a translucent preview. Random race skips setup: the server generates one identical secret board for every participant, including the chosen extras. Each rematch generates a fresh shared board. The puzzle seed is never exposed. There is no setup time limit: both must confirm complete legal boards to start. Partial placements persist and can be moved, rotated, mirrored or removed. The server validates geometry, boundaries, non-touching edges and reachability. Point contact is allowed. In Take turns it selects the starting player and enforces alternating lasers. Both players see each shot's entry, exit and colors, but no hidden path or opponent placement.

In Take turns, after a player submits, the opponent gets one final submission without another laser, with a 60-second deadline. At expiry the server automatically submits and grades the latest saved draft, including incomplete drawings, instead of discarding it. Drafts sync as they change, at most once per 350 ms, and editing locks when the local deadline reaches zero. Both correct is a draw, one correct wins, both incorrect lose. Both race modes share a server-controlled three-second countdown. Shooting, drawing and submission are locked until the shared start timestamp; scoring excludes the countdown. Each player fires independently and their time freezes when they submit. The other player can finish without a final-attempt deadline. Correct solutions receive the same score as training; incorrect solutions receive zero. When every participant submits, the highest correct score wins. Equal highest correct scores tie for first; lower scores lose and an entirely incorrect field has no winner. The server computes time, clue counts and scores.

In Take turns, each player has a separate laser log. Clicking an opponent shot reveals its path on your own known board. In Take turns, after submitting irrevocably, you can watch the opponent’s drawing update on your board; a player who can still edit never receives the opponent’s draft or hidden layout. Both race modes show only your own laser log and hide the created board and opponent draft throughout play, including while waiting after your submission. The API filters these fields. Race results animate both score bars together on the same 10,000-point scale, then reveal the winner; wrong solutions explicitly show zero. Each result also shows the player's laser count and elapsed time. Every completed board, submission and laser log is revealed after the result. Player-attempt buttons select the matching drawing and laser log together, with separate original/overlay/drawing views. Two-player results keep side-by-side meters; larger groups receive a compact animated ranking. Leave room is always available in the header and clears local room credentials. A two-player departure or the host leaving closes the room. In a larger Random race, a departing guest leaves the other players' race running: an unfinished attempt forfeits with zero points; a lobby departure frees the slot. Leaving an unfinished game does not award a win. Rooms expire two hours after creation; a saved room token reconnects the same browser until then. Reloads retain the local deduction drawing. Rooms use 1.5-second polling; deadlines advance on the next request. All remaining players must accept a rematch in the same room. Departed guests are removed when the new round starts, with tokens and win totals remapped to the remaining members. It keeps their settings and room access, starts a fresh empty placement phase and alternates the starting player. Room wins persist across rematches and reconnects until the room expires. Take-turns draft updates run separately from polling and are rate-limited, validated and tied to the current round. Race drawings persist locally and are sent only when submitted; no opponent draft is shared during play. API read limits accommodate eight participants sharing a network.

## Admin and data

`/admin` currently accepts the temporary test key `Admin` when no server-side `ADMIN_KEY` is configured. A configured secret replaces this fallback. The key is supplied as an Authorization header. The UI keeps it only in memory. The last 30 days of start/finish activity are retained. The player list covers all retained events, groups by player ID and shows each player's latest chosen name, distinct games, completed games and last play time. Search by name/ID and select a player to filter activity server-side; the view shows up to 500 events for that selection: local player ID, chosen name, mode, result, laser count, duration and score. Solo events are reported by the browser and can be delayed while offline; their play time and receipt time are separate. Duel results are generated by the server. Names and solo scores are not verified identities or competitive evidence.

Room tokens and opponent layouts never appear in public activity. Requests are rate-limited using a daily hash of the connecting IP; the admin view does not collect device hardware details. Expired data is cleaned on subsequent API activity. The former `/api/log` endpoint is inert and no longer forwards logs to Google Sheets.

## Installing and offline play

The menu shows Install app only after the browser supplies a native installation event. It hides after prompting, installation or standalone launch. iPhone/iPad instead show a clearly labeled guide to Safari’s Share → Add to Home Screen flow. The manifest launches the app standalone. After the first successful production load and service-worker installation, daily and training modes can run offline. Duels and admin require a connection. Development mode does not register the service worker. Native installation and offline launch also need checking on physical iOS and Android devices; desktop responsive mode cannot reproduce those operating-system flows.

## Deployment

The existing GitHub → Cloudflare Workers Builds integration publishes pushes to `main`; no local Cloudflare login is required for that route. An admin secret is optional and does not block gameplay.

For manual deployment, use the existing Cloudflare account/project that owns the live site. The checked-in `wrangler.toml` binds `GAME_SERVICE`, adds its first SQLite Durable Object migration, and serves `dist` with SPA fallback. Do not create a separate temporary deployment as a substitute for that account.

```sh
npx wrangler login
npx wrangler secret put ADMIN_KEY
npm run deploy
```

Supply a strong private key interactively; never put it into `VITE_*`, source control or an invite link. If the existing GitHub integration deploys the Worker, it must run the build and deploy with this Wrangler configuration so the binding and migration are applied. A static-assets-only publication cannot run duels or admin. Keep the existing domain routing/account settings. After deployment, verify a two-device duel, `/admin`, phone installation and a subsequent offline launch on the live origin.

## Code map

- `src/game/engine.js`: shared deterministic geometry, generation, tracing and scoring.
- `src/hooks/useGameSession.js`, `src/game/storage.js`: solo lifecycle, local persistence and activity queue.
- `src/components/`: board, guide, menu flows, duels, installation and admin UI.
- `src/server/duel.js`: authoritative multiplayer state transitions and filtered views.
- `src/worker.js`: API, transactional room storage, activity, authentication and rate limits.
- `tests/`: engine properties, saved-game lifecycle, duel rules and real-Worker HTTP integration.
