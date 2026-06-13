const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function normalizeStudyServerUrl(value) {
  if (value === "") {
    return "";
  }
  if (typeof value !== "string" || value !== value.trim()) {
    throw new TypeError("study server URL must not contain surrounding spaces");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("study server URL must be valid");
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  ) {
    throw new TypeError(
      "study server must be an HTTPS origin or an HTTP loopback origin",
    );
  }
  return url.origin;
}

export function permissionPatternForServer(value) {
  const origin = normalizeStudyServerUrl(value);
  if (!origin) {
    return null;
  }
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}/*`;
}

export function batchEndpointForServer(value) {
  return `${normalizeStudyServerUrl(value)}/v1/events/batch`;
}
