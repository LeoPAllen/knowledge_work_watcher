const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /(?:\+?\d[\s().-]*){7,}/;
const SECRET =
  /\b(?:api[_-]?key|password|passwd|secret|token)\s*[:=]\s*\S+|\bsk-[a-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;

export function redactSearchQuery(value) {
  if (typeof value !== "string") {
    return { query: null, redacted: false, reason: "missing" };
  }
  const query = value.replace(/\s+/g, " ").trim().slice(0, 500);
  if (!query) {
    return { query: null, redacted: false, reason: "missing" };
  }
  if (EMAIL.test(query)) {
    return { query: null, redacted: true, reason: "email" };
  }
  if (SECRET.test(query)) {
    return { query: null, redacted: true, reason: "secret" };
  }
  if (PHONE.test(query)) {
    return { query: null, redacted: true, reason: "phone" };
  }
  return { query, redacted: false, reason: null };
}
