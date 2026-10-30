import { GAMES } from "../../games/catalog.js";
import { gameHref } from "../../platform/routing.js";
export function GameLinks({ current }) {
  return (
    <nav
      className={`game-links ${current === "shapeit" ? "game-links-compact" : ""}`}
      aria-label="More games"
    >
      {GAMES.filter((game) => game.id !== current && game.listed !== false).map(
        (game) => (
          <a key={game.id} href={gameHref(game.id)}>
            <span aria-hidden="true">{game.icon}</span> {game.name}
            {game.isNew && <span className="game-new-badge">New</span>}
            <span aria-hidden="true">↗</span>
          </a>
        ),
      )}
    </nav>
  );
}
