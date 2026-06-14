(function runLlmCapture() {
  "use strict";

  const parser = globalThis.KWWLlmParser;
  let lastSignature = null;
  let debounceTimer = null;

  async function send(message) {
    return chrome.runtime.sendMessage(message);
  }

  async function capture() {
    const gate = await send({ type: "get_capture_gate" });
    if (!gate?.ok || !gate.active) {
      return;
    }

    let parsed;
    try {
      parsed = parser.parseLlmPage(document, location.href);
    } catch {
      await send({
        type: "llm_parser_error",
        stage: "parse",
        code: "parse_failed",
        parserVersion: parser.PARSER_VERSION,
      });
      return;
    }

    if (!parsed.ok) {
      await send({
        type: "llm_parser_error",
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
    await send({ type: "llm_page_parsed", parsed });
  }

  function scheduleCapture() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void capture().catch(() => {}), 400);
  }

  async function initialize() {
    const tool = parser.toolForUrl(location.href);
    if (!tool) {
      return;
    }
    const gate = await send({ type: "get_capture_gate" });
    if (!gate?.ok || !gate.active) {
      return;
    }
    await capture();
    const root = parser.conversationRoot(document, tool);
    if (root) {
      new MutationObserver(scheduleCapture).observe(root, {
        childList: true,
        subtree: true,
      });
    }
  }

  void initialize().catch(() => {});
})();
