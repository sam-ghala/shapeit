const cap = (color) => (color === "white" ? "White" : "Black");

export function PlayerCard({
  color,
  game,
  name = cap(color),
  online = false,
  you = false,
}) {
  const count = game.pieces.filter((piece) => piece.color === color).length;
  return (
    <div
      className={`capture-player ${game.current === color && !game.winner ? "capture-player-active" : ""}`}
    >
      <div className="capture-player-name">
        <span
          className={`capture-token capture-token-${color}`}
          aria-hidden="true"
        />
        <strong title={name}>{name}</strong>
        {game.current === color && !game.winner && (
          <span className="capture-turn-tag">
            {online && !you ? "Their turn" : "Your turn"}
          </span>
        )}
      </div>
      {online && (
        <span className="capture-player-detail">
          {cap(color)}
          {you ? " · You" : ""}
        </span>
      )}
      <div className="capture-player-numbers">
        <span>
          <b>{count}</b> pieces
        </span>
        <span>
          <b>{game.collected[color]}</b> tiles
        </span>
      </div>
    </div>
  );
}
