import { saveResult } from "../game/scores.js";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  SIZES,
  buildPieces,
  generatePuzzle,
  fireLaser,
  checkSolution,
  calcScore,
  emptyBoard,
} from "../game/engine.js";
import {
  loadSession,
  sessionKey,
  writeJSON,
  queueEvent,
  createSession,
} from "../game/storage.js";

export function useGameSession(config, profile) {
  const [game, setGame] = useState(() => loadSession(config));
  const [storageError, setStorageError] = useState(false);
  const { cols, rows } = SIZES[game.size];
  const pieces = useMemo(
    () => buildPieces(game.seed, game.size, game.extras),
    [game.seed, game.size, game.extras],
  );
  const puzzle = useMemo(
    () => generatePuzzle(game.seed, pieces, cols, rows),
    [game.seed, pieces, cols, rows],
  );
  const history = useMemo(
    () =>
      game.history.map((h) => ({
        ...h,
        ...fireLaser(puzzle.board, h.side, h.idx),
      })),
    [game.history, puzzle],
  );
  const recorded = useRef(new Set());
  useEffect(() => {
    setStorageError(
      !writeJSON(sessionKey(game.mode, game.size, game.date), game),
    );
    if (game.startedAt && !recorded.current.has(`${game.id}:start`)) {
      recorded.current.add(`${game.id}:start`);
      queueEvent(
        {
          id: `${game.id}:start`,
          sessionId: game.id,
          kind: "start",
          at: new Date(game.startedAt).toISOString(),
          mode: game.mode,
          size: game.size,
          seed: game.seed,
        },
        profile,
      );
    }
    if (game.status !== "playing") saveResult(game);
    if (
      game.status !== "playing" &&
      !recorded.current.has(`${game.id}:finish`)
    ) {
      recorded.current.add(`${game.id}:finish`);
      queueEvent(
        {
          id: `${game.id}:finish`,
          sessionId: game.id,
          kind: "finish",
          at: new Date(game.finishedAt).toISOString(),
          mode: game.mode,
          size: game.size,
          result: game.status,
          score: game.score,
          queries: game.history.length,
          seconds: Math.floor((game.finishedAt - game.startedAt) / 1000),
        },
        profile,
      );
    }
  }, [game, profile]);
  const edit = (fn) =>
    setGame((g) =>
      g.status !== "playing"
        ? g
        : { ...fn(g), startedAt: g.startedAt ?? Date.now() },
    );
  const cell = (r, c, color) =>
    edit((g) => {
      const guess = g.guess.map((row) => [...row]),
        old = guess[r][c];
      guess[r][c] =
        color === "x"
          ? old?.color === "x"
            ? null
            : { color: "x", type: "x" }
          : old?.color !== color
            ? { color, type: "\\" }
            : old.type === "\\"
              ? { color, type: "/" }
              : null;
      return { ...g, guess };
    });
  const edge = (key, color) => {
    if (color === "x") return;
    edit((g) => {
      const edges = { ...g.edges };
      if (edges[key] === color) delete edges[key];
      else edges[key] = color;
      return { ...g, edges };
    });
  };
  const fire = (side, idx) =>
    edit((g) => {
      const result = fireLaser(puzzle.board, side, idx);
      const used = g.history.some((h) => {
        const old = fireLaser(puzzle.board, h.side, h.idx);
        return (
          (h.side === side && h.idx === idx) ||
          (old.exitSide === side && old.exitIdx === idx)
        );
      });
      if (used) return g;
      // Colourless reflection can come from a transparent diamond. Only truly
      // untouched, straight paths are safe to mark as empty.
      const guess = g.guess.map((row) => [...row]);
      if (result.hits.length === 0)
        result.path.forEach(([r, c]) => {
          if (!guess[r][c]) guess[r][c] = { color: "x", type: "x" };
        });
      return { ...g, guess, history: [...g.history, { side, idx }] };
    });
  const submit = () =>
    setGame((g) => {
      if (g.status !== "playing") return g;
      const now = Date.now(),
        startedAt = g.startedAt ?? now,
        seconds = Math.floor((now - startedAt) / 1000);
      const won = checkSolution(g.guess, g.edges, puzzle.placed, cols, rows);
      return {
        ...g,
        status: won ? "won" : "lost",
        startedAt,
        finishedAt: now,
        score: won ? calcScore(seconds, g.history.length) : 0,
      };
    });
  return {
    game,
    pieces,
    puzzle,
    history,
    cols,
    rows,
    storageError,
    hint: () => {
      if (game.mode === "training")
        edit((g) => ({
          ...g,
          hintStep: Math.min((g.hintStep || 0) + 1, pieces.length * 3),
        }));
    },
    cell,
    edge,
    fire,
    submit,
    clear: () =>
      edit((g) => ({ ...g, guess: emptyBoard(cols, rows), edges: {} })),
    newTraining: (extras = game.extras) =>
      setGame(
        createSession({
          ...config,
          mode: "training",
          extras,
        }),
      ),
  };
}
