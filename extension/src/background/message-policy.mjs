import { classifyUrl } from "../shared/privacy-filter.mjs";

const SEARCH_ACTIONS = new Set([
  "get_capture_gate",
  "search_page_parsed",
  "search_result_clicked",
  "search_parser_error",
]);
const LLM_ACTIONS = new Set([
  "get_capture_gate",
  "llm_page_parsed",
  "llm_parser_error",
]);
const KNOWLEDGE_ACTIONS = new Set([
  "get_capture_gate",
  "knowledge_page_parsed",
  "knowledge_parser_error",
]);

const SEARCH_PAGES = new Map([
  ["www.google.com", new Set(["/search"])],
  ["www.bing.com", new Set(["/search"])],
  ["duckduckgo.com", new Set(["/", "/html/"])],
]);
const LLM_HOSTS = new Set([
  "chatgpt.com",
  "claude.ai",
  "gemini.google.com",
  "perplexity.ai",
  "www.perplexity.ai",
  "copilot.microsoft.com",
]);
const KNOWLEDGE_HOSTS = new Set([
  "stackoverflow.com",
  "serverfault.com",
  "superuser.com",
  "askubuntu.com",
  "mathoverflow.net",
  "stackapps.com",
  "github.com",
  "developer.mozilla.org",
  "www.npmjs.com",
  "pypi.org",
  "docs.github.com",
  "docs.gitlab.com",
  "docs.python.org",
  "learn.microsoft.com",
  "developers.google.com",
]);

function senderUrl(sender) {
  try {
    return new URL(sender?.url);
  } catch {
    return null;
  }
}

function isKnowledgeHost(hostname) {
  return (
    KNOWLEDGE_HOSTS.has(hostname) ||
    hostname.endsWith(".stackexchange.com") ||
    hostname === "wikipedia.org" ||
    hostname.endsWith(".wikipedia.org")
  );
}

export function isAuthorizedParserMessage(type, sender) {
  const url = senderUrl(sender);
  if (!url || url.protocol !== "https:" || !Number.isInteger(sender.tab?.id)) {
    return false;
  }
  if (type === "get_capture_gate") {
    return (
      SEARCH_PAGES.get(url.hostname)?.has(url.pathname) === true ||
      ((LLM_HOSTS.has(url.hostname) || isKnowledgeHost(url.hostname)) &&
        classifyUrl(url.href).classification === "allowed")
    );
  }
  if (SEARCH_ACTIONS.has(type)) {
    return SEARCH_PAGES.get(url.hostname)?.has(url.pathname) === true;
  }
  if (LLM_ACTIONS.has(type)) {
    return (
      LLM_HOSTS.has(url.hostname) &&
      classifyUrl(url.href).classification === "allowed"
    );
  }
  if (KNOWLEDGE_ACTIONS.has(type)) {
    return (
      isKnowledgeHost(url.hostname) &&
      classifyUrl(url.href).classification === "allowed"
    );
  }
  return false;
}

export function canCreateTestEvent(state) {
  return state?.debug_mode === true;
}

export function extensionPageSource(sender, extensionBaseUrl) {
  const url = senderUrl(sender);
  const extensionUrl = senderUrl({ url: extensionBaseUrl });
  if (
    !url ||
    !extensionUrl ||
    url.protocol !== extensionUrl.protocol ||
    url.hostname !== extensionUrl.hostname
  ) {
    return null;
  }
  if (url.pathname.startsWith("/src/popup/")) {
    return "popup";
  }
  if (url.pathname.startsWith("/src/options/")) {
    return "options";
  }
  return null;
}
