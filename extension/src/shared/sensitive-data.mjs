const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?:\+?\d[\s().-]*){7,}/g;
const SECRET =
  /\b(?:api[_-]?key|password|passwd|secret|token)\s*[:=]\s*\S+|\bsk-[a-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi;
const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
]);
const SECRET_PARAMETERS =
  /^(?:access[_-]?token|api[_-]?key|auth|authorization|code|credential|key|password|secret|session|signature|token|.*[_-](?:auth|key|password|secret|signature|token))$/i;

export const LLM_RESPONSE_TEXT_LIMIT = 8000;
export const SEARCH_SNIPPET_TEXT_LIMIT = 1000;
export const FULL_URL_LIMIT = 2048;

export function containsSensitiveText(value) {
  if (typeof value !== "string") {
    return false;
  }
  EMAIL.lastIndex = 0;
  PHONE.lastIndex = 0;
  SECRET.lastIndex = 0;
  return EMAIL.test(value) || PHONE.test(value) || SECRET.test(value);
}

export function sanitizeSensitiveText(value, limit) {
  if (typeof value !== "string" || !Number.isInteger(limit) || limit < 1) {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  const charCountOriginal = normalized.length;
  let redactionApplied = false;
  const redact = (pattern, replacement) => {
    pattern.lastIndex = 0;
    if (pattern.test(normalized)) {
      redactionApplied = true;
    }
    pattern.lastIndex = 0;
    return pattern;
  };
  const redacted = normalized
    .replace(redact(SECRET), "[REDACTED_SECRET]")
    .replace(redact(EMAIL), "[REDACTED_EMAIL]")
    .replace(redact(PHONE), "[REDACTED_PHONE]");
  const text = redacted.slice(0, limit);
  return {
    text,
    char_count_original: charCountOriginal,
    char_count_stored: text.length,
    truncated: redacted.length > limit,
    redaction_applied: redactionApplied,
  };
}

export function normalizeSearchResultUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    return null;
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    const normalized = key.toLowerCase();
    if (
      normalized.startsWith("utm_") ||
      TRACKING_PARAMETERS.has(normalized) ||
      SECRET_PARAMETERS.test(normalized)
    ) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  const normalized = url.href;
  return normalized.length <= FULL_URL_LIMIT &&
    !containsSensitiveText(normalized)
    ? normalized
    : null;
}
