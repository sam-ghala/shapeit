import { GAMES } from "../../games/catalog.js";
import { gameHref } from "../../platform/routing.js";
export function GameLinks({ current }) {
  return (
    <nav className="game-links" aria-label="More games">
      {GAMES.filter((game) => game.id !== current).map((game) => (
        <a key={game.id} href={gameHref(game.id)}>
          <span aria-hidden="true">{game.icon}</span> {game.name}
          <span aria-hidden="true">↗</span>
        </a>
      ))}
    </nav>
  );
}
