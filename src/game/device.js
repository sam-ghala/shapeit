// A narrow desktop window is still a computer in a cross-device duel.
export function mobilePlayer(nav = navigator) {
  return (
    /iPhone|iPad|iPod|Android/i.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1)
  );
}
