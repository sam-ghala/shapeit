export function cleanProfile(input) {
  if (
    !input ||
    typeof input.id !== "string" ||
    !/^[a-zA-Z0-9-]{8,64}$/.test(input.id) ||
    typeof input.name !== "string"
  )
    throw new Error("Choose a player name first.");
  const name = input.name
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 24);
  if (!name) throw new Error("Choose a player name first.");
  return { id: input.id, name };
}
