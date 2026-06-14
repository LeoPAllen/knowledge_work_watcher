(function runSearchCapture() {
  "use strict";

  const parser = globalThis.KWWSearchParser;
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
      parsed = parser.parseSearchPage(document, location.href);
    } catch {
      await send({
        type: "search_parser_error",
        stage: "parse",
        code: "parse_failed",
        parserVersion: parser.PARSER_VERSION,
      });
      return;
    }

    if (!parsed.ok) {
      await send({
        type: "search_parser_error",
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
    await send({ type: "search_page_parsed", parsed });
  }

  function scheduleCapture() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void capture().catch(() => {}), 250);
  }

  async function initialize() {
    const engine = parser.engineForUrl(location.href);
    if (!engine) {
      return;
    }
    const gate = await send({ type: "get_capture_gate" });
    if (!gate?.ok || !gate.active) {
      return;
    }
    await capture();

    const root = parser.resultRoot(document, engine);
    if (root) {
      new MutationObserver(scheduleCapture).observe(root, {
        childList: true,
        subtree: true,
      });
      root.addEventListener(
        "click",
        (event) => {
          const clicked = parser.clickedResult(
            document,
            location.href,
            event.target,
          );
          if (!clicked) {
            return;
          }
          void send({ type: "search_result_clicked", clicked }).catch(() => {});
        },
        { passive: true },
      );
    }
  }

  void initialize().catch(() => {});
})();
