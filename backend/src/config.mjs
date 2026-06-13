import { resolve } from "node:path";

const DEFAULT_MAX_PAYLOAD_BYTES = 256 * 1024;

function integer(
  value,
  fallback,
  name,
  { min = 1, max = Number.MAX_SAFE_INTEGER } = {},
) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new TypeError(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

export function loadConfig(env = process.env) {
  const studyToken = env.KWW_STUDY_TOKEN?.trim();
  if (!studyToken || studyToken.length < 16) {
    throw new TypeError("KWW_STUDY_TOKEN must contain at least 16 characters");
  }
  const corsAllowedOrigin = env.KWW_CORS_ALLOWED_ORIGIN?.trim() || null;
  if (
    corsAllowedOrigin &&
    !/^chrome-extension:\/\/[a-z0-9-]+$/i.test(corsAllowedOrigin)
  ) {
    throw new TypeError(
      "KWW_CORS_ALLOWED_ORIGIN must be an exact chrome-extension:// origin",
    );
  }
  const configuredPath =
    env.KWW_STORAGE_PATH?.trim() || "backend/data/events.sqlite";

  return Object.freeze({
    host: env.KWW_BIND_HOST?.trim() || "127.0.0.1",
    port: integer(env.KWW_PORT, 3000, "KWW_PORT", { max: 65535 }),
    storagePath:
      configuredPath === ":memory:" ? configuredPath : resolve(configuredPath),
    studyToken,
    maxPayloadBytes: integer(
      env.KWW_MAX_PAYLOAD_BYTES,
      DEFAULT_MAX_PAYLOAD_BYTES,
      "KWW_MAX_PAYLOAD_BYTES",
      { min: 1024, max: 10 * 1024 * 1024 },
    ),
    corsAllowedOrigin,
  });
}

export { DEFAULT_MAX_PAYLOAD_BYTES };
