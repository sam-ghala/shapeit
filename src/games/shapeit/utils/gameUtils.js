import { diagOf } from "../game/engine.js";
export * from "../game/engine.js";

export function fillPoints(x, y, s, type) {
  switch (type) {
    case "/":
      return `${x},${y + s} ${x + s},${y} ${x},${y}`;
    case "\\":
      return `${x},${y} ${x + s},${y} ${x + s},${y + s}`;
    case "/b":
      return `${x},${y + s} ${x + s},${y} ${x + s},${y + s}`;
    case "\\b":
      return `${x},${y} ${x},${y + s} ${x + s},${y + s}`;
    case "/f":
    case "\\f":
      return `${x},${y} ${x + s},${y} ${x + s},${y + s} ${x},${y + s}`;
    default:
      return `${x},${y} ${x + s},${y} ${x + s},${y + s} ${x},${y + s}`;
  }
}

export function diagLine(x, y, s, type) {
  const d = diagOf(type);
  if (d === "/") return { x1: x, y1: y + s, x2: x + s, y2: y };
  return { x1: x, y1: y, x2: x + s, y2: y + s };
}
