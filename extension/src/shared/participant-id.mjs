export async function hashParticipantId(participantId) {
  const normalized = participantId.trim();
  if (!normalized) {
    throw new TypeError("participant ID must not be empty");
  }

  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
