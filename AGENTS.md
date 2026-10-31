# Shared game platform

Read this file and the README inside the game being changed. Start in that game's folder; there is no need to read another game's implementation.

## Ownership

- `src/games/shapeit/`: ShapeIt UI, rules, sessions, scoring, multiplayer API and styles.
- `src/games/pushit/`: PushIt UI, rules, matches, multiplayer API and styles.
- `src/games/captureit/`: CaptureIt UI, Coerceo rules, local sessions, multiplayer API and styles.
- `src/games/blockit/`: BlockIt UI, two-player Quoridor rules, local sessions, multiplayer API and styles.
- `src/games/chessit/`: independent ChessIt starter. Add its future engine and game UI here.
- `src/shared/`: reusable controls, design tokens, public player profile, persistence helpers, sound and event queue. Never import a game's engine or UI into shared code.
- `src/platform/`: game routing, global admin UI, Worker storage/auth/rate limiting. Game-specific HTTP handlers live with their game.
- `src/games/catalog.js`: metadata registry. `src/platform/App.jsx`: lazy entry points.

No game may import another game's implementation. Shared utilities must remain game-neutral. Each game's styles must use its own class prefix or existing scoped selectors. Do not change another game's behavior as a side effect.

## One visual language

Import `src/shared/theme.css` once in the application entry. Use its existing `.primary`, `.card`, `.arcade-mode`, `.dialog`, `.button-row` controls and `Dialog`, `SoundToggle`, `GameLinks` components.

Use `--ink`, `--canvas`, `--paper`, `--muted`, `--gold`, `--sky`, `--coral`, `--mint`, `--border`, `--raised-shadow`. Keep the rounded system typography, dark outlines, cream backgrounds, bright accent colors and solid offset shadows. Add shared design changes here, not copies in each game. Game-specific layouts stay in the game's CSS.

Controls need clear labels, visible keyboard focus and practical touch targets (normally 44px). Game boards must fit available space without distorting cells. Respect reduced motion. Explain only what controls cannot make clear.

## Profile, state and activity

Use `useProfile()` to read/edit the shared public name and ID. Do not invent a new name key. Existing `shapeit:profile` IDs are retained; a secure parent-domain cookie shares only name/ID across production game subdomains. Room credentials, game progress and scores remain game-specific and origin-local.

Namespace each game's localStorage/sessionStorage keys and API paths. Preserve existing keys, API URLs, Worker name, `GameService` class, durable object ID `shapeit-v2`, tables and migrations unless the requested change requires a deliberate migration. `/` remains ShapeIt; `/pushit`, `/captureit`, `/blockit` and `/chessit` remain supported. Game subdomains resolve to their own game. Do not enable subdomain links until their DNS/TLS is verified.

Activity uses `game`, `sessionId`, `profileId`, `kind`, `mode`, `size` and optional result metrics. Register modes/sizes in the catalog. Send local activity through `queueEvent`; generate online results on the server, not the client. Use stable event IDs for deduplication. Never include room tokens or private boards in events. Old events without `game` belong to ShapeIt. Preview visits are not completed games.

## Validation

Run `npm test`, `npm run format:check`, and `npm run build`. For server changes, start the local Worker with `ADMIN_KEY:local-test-only`, then run the relevant `tests/*.http.integration.mjs` (ShapeIt uses `tests/http.integration.mjs`). These tests create local test data and must not target production.

Use Safari for browser checks. `/tests/pushit.browser.html` is the responsive layout harness. Report any browser/hosting verification that could not run accurately. Do not claim a previous run validates newly changed layouts.
