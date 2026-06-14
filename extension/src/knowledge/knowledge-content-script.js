(function runKnowledgeCapture() {
  "use strict";

  const parser = globalThis.KWWKnowledgeParser;
  let lastSignature = null;
  let debounceTimer = null;

  async function capture() {
    const gate = await chrome.runtime.sendMessage({ type: "get_capture_gate" });
    if (!gate?.ok || !gate.active) {
      return;
    }

    let parsed;
    try {
      parsed = parser.parseKnowledgePage(
        document,
        location.href,
        document.referrer,
      );
    } catch {
      await chrome.runtime.sendMessage({
        type: "knowledge_parser_error",
        stage: "parse",
        code: "parse_failed",
        parserVersion: parser.PARSER_VERSION,
      });
      return;
    }

    if (!parsed.ok) {
      if (
        parsed.code === "private_or_ambiguous_repo" ||
        parsed.code === "unsupported_knowledge_page"
      ) {
        return;
      }
      await chrome.runtime.sendMessage({
        type: "knowledge_parser_error",
        stage: "parse",
        code: parsed.code,
        parserVersion: parser.PARSER_VERSION,
      });
      return;
    }
    const signature = JSON.stringify(parsed);
    if (signature === lastSignature) {
      return;
    }
    lastSignature = signature;
    await chrome.runtime.sendMessage({ type: "knowledge_page_parsed", parsed });
  }

  function scheduleCapture() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void capture().catch(() => {}), 500);
  }

  async function initialize() {
    const gate = await chrome.runtime.sendMessage({ type: "get_capture_gate" });
    if (!gate?.ok || !gate.active) {
      return;
    }
    await capture();
    if (document.body) {
      new MutationObserver(scheduleCapture).observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  void initialize().catch(() => {});
})();
