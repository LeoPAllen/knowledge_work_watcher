import {
  DEFAULT_ALLOWLIST,
  DEFAULT_DENYLIST,
  SENSITIVE_HOST_LABELS,
  SENSITIVE_PATH_SEGMENTS,
} from "../config/domain-policy.mjs";

export const URL_CLASSIFICATIONS = Object.freeze([
  "allowed",
  "denied",
  "private_or_sensitive",
  "unsupported",
  "invalid",
]);

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const PRIVATE_SCHEMES = new Set([
  "about:",
  "brave:",
  "chrome:",
  "chrome-extension:",
  "chrome-search:",
  "chrome-untrusted:",
  "devtools:",
  "edge:",
  "edge-extension:",
  "file:",
  "filesystem:",
  "moz-extension:",
  "opera:",
  "resource:",
  "safari-extension:",
  "view-source:",
  "vivaldi:",
]);
const UNSUPPORTED_SCHEMES = new Set([
  "blob:",
  "data:",
  "ftp:",
  "javascript:",
  "mailto:",
  "tel:",
]);

function flattenPolicy(policy) {
  return Object.entries(policy).flatMap(([category, domains]) =>
    domains.map((domain) => ({ category, domain })),
  );
}

const DEFAULT_ALLOWED_DOMAINS = flattenPolicy(DEFAULT_ALLOWLIST);
const DEFAULT_DENIED_DOMAINS = flattenPolicy(DEFAULT_DENYLIST);

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function domainMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function matchDomain(hostname, entries) {
  return entries
    .filter(({ domain }) => domainMatches(hostname, domain))
    .sort((left, right) => right.domain.length - left.domain.length)[0];
}

function normalizeCustomAllowlist(customAllowlist) {
  if (!Array.isArray(customAllowlist)) {
    return [];
  }

  return customAllowlist
    .filter((domain) => typeof domain === "string")
    .map((domain) => normalizeHostname(domain.trim()))
    .filter(
      (domain) =>
        domain.length > 0 &&
        !domain.includes("/") &&
        !domain.includes(":") &&
        !domain.includes(" "),
    )
    .map((domain) => ({ category: "custom", domain }));
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d+$/.test(part) || Number(part) > 255)
  ) {
    return false;
  }

  const [a, b] = parts.map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIpv6(hostname) {
  const value = hostname.toLowerCase();
  if (value === "::" || value === "::1") {
    return true;
  }

  const firstGroup = value.split(":")[0];
  if (/^f[cd][0-9a-f]{2}$/.test(firstGroup)) {
    return true;
  }
  if (/^fe[89ab][0-9a-f]$/.test(firstGroup)) {
    return true;
  }

  const mappedDottedIpv4 = value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedDottedIpv4) {
    return isPrivateIpv4(mappedDottedIpv4);
  }

  const mappedHexIpv4 = value.match(
    /^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/,
  );
  if (mappedHexIpv4) {
    const high = Number.parseInt(mappedHexIpv4[1], 16);
    const low = Number.parseInt(mappedHexIpv4[2], 16);
    const ipv4 = [
      high >> 8,
      high & 255,
      low >> 8,
      low & 255,
    ].join(".");
    return isPrivateIpv4(ipv4);
  }

  return false;
}

function getPrivateNetworkReason(hostname) {
  const privateSuffixes = [
    ".corp",
    ".home",
    ".home.arpa",
    ".internal",
    ".intranet",
    ".lan",
    ".local",
    ".localhost",
  ];
  if (
    hostname === "localhost" ||
    hostname === "home.arpa" ||
    privateSuffixes.some((suffix) => hostname.endsWith(suffix))
  ) {
    return "local_hostname";
  }
  if (isPrivateIpv4(hostname)) {
    return "private_ipv4";
  }
  if (hostname.includes(":") && isPrivateIpv6(hostname)) {
    return "private_ipv6";
  }
  return null;
}

function hasSensitiveHostLabel(hostname) {
  const labels = hostname.split(".");
  return labels.some((label) => SENSITIVE_HOST_LABELS.includes(label));
}

function hasSensitivePath(url) {
  const segments = url.pathname
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment).toLowerCase();
      } catch {
        return segment.toLowerCase();
      }
    })
    .filter(Boolean);

  return segments.some((segment) => SENSITIVE_PATH_SEGMENTS.includes(segment));
}

function result(classification, reason, category = null) {
  return { classification, reason, category };
}

export function classifyUrl(
  input,
  {
    customAllowlist = [],
    debugMode = false,
    allowPrivateInDebug = false,
  } = {},
) {
  if (typeof input !== "string" || input.trim() === "") {
    return result("invalid", "invalid_url");
  }

  let url;
  try {
    url = new URL(input);
  } catch {
    return result("invalid", "invalid_url");
  }

  if (PRIVATE_SCHEMES.has(url.protocol)) {
    return result("private_or_sensitive", "private_scheme");
  }
  if (UNSUPPORTED_SCHEMES.has(url.protocol) || !HTTP_PROTOCOLS.has(url.protocol)) {
    return result("unsupported", "unsupported_scheme");
  }
  if (url.username || url.password) {
    return result("private_or_sensitive", "embedded_credentials");
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    return result("invalid", "missing_hostname");
  }

  const privateNetworkReason = getPrivateNetworkReason(hostname);
  const debugPrivateAllowed =
    privateNetworkReason !== null && debugMode && allowPrivateInDebug;

  if (privateNetworkReason && !debugPrivateAllowed) {
    return result("private_or_sensitive", privateNetworkReason);
  }

  const deniedMatch = matchDomain(hostname, DEFAULT_DENIED_DOMAINS);
  if (deniedMatch) {
    return result("denied", "denied_domain", deniedMatch.category);
  }

  if (hasSensitiveHostLabel(hostname)) {
    return result("private_or_sensitive", "sensitive_subdomain");
  }
  if (hasSensitivePath(url)) {
    return result("private_or_sensitive", "sensitive_path");
  }

  if (debugPrivateAllowed) {
    return result("allowed", "debug_private_network", "debug");
  }

  const defaultMatch = matchDomain(hostname, DEFAULT_ALLOWED_DOMAINS);
  if (defaultMatch) {
    return result("allowed", "default_allowlist", defaultMatch.category);
  }

  const customMatch = matchDomain(
    hostname,
    normalizeCustomAllowlist(customAllowlist),
  );
  if (customMatch) {
    return result("allowed", "custom_allowlist", customMatch.category);
  }

  return result("unsupported", "not_allowlisted");
}
