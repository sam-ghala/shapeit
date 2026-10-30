export function normalizeExtras(value) {
  return {
    diamond: value === true || value?.diamond === true,
    black: value === true || value?.black === true,
  };
}
