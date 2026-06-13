async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashAllowedUrl(input) {
  const url = new URL(input);
  const normalized = `${url.protocol}//${url.host.toLowerCase()}${url.pathname}`;
  return sha256(normalized);
}

export async function pseudonymizeBrowserId(sessionId, kind, browserId) {
  if (!sessionId) {
    throw new TypeError("sessionId is required");
  }
  if (!["tab", "window"].includes(kind)) {
    throw new TypeError("kind must be tab or window");
  }
  return `${kind}_${await sha256(`${sessionId}\0${kind}\0${browserId}`)}`;
}
