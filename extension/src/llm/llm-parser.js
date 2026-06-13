(function defineLlmParser(global) {
  "use strict";

  const PARSER_VERSION = 1;
  const MAX_PROMPTS = 50;
  const MAX_SOURCES = 20;
  const CONFIG = Object.freeze({
    chatgpt: {
      hosts: ["chatgpt.com"],
      root: "main",
      prompts:
        '[data-message-author-role="user"] [data-testid="message-text"]',
      responses: '[data-message-author-role="assistant"]',
      model: '[data-testid="model-name"]',
    },
    claude: {
      hosts: ["claude.ai"],
      root: "main",
      prompts: '[data-testid="user-message"] [data-testid="message-text"]',
      responses: '[data-testid="assistant-message"]',
      model: '[data-testid="model-selector"]',
    },
    gemini: {
      hosts: ["gemini.google.com"],
      root: "main",
      prompts: '.query-text [data-testid="message-text"]',
      responses: ".model-response",
      model: "[data-model-name]",
    },
    perplexity: {
      hosts: ["perplexity.ai", "www.perplexity.ai"],
      root: "main",
      prompts: '[data-testid="user-query"] [data-testid="message-text"]',
      responses: '[data-testid="answer"]',
      model: '[data-testid="model-name"]',
    },
    copilot: {
      hosts: ["copilot.microsoft.com"],
      root: "main",
      prompts: '[data-content="user-message"] [data-testid="message-text"]',
      responses: '[data-content="ai-message"]',
      model: '[data-testid="model-name"]',
    },
  });

  function toolForUrl(input) {
    try {
      const url = new URL(input);
      return (
        Object.entries(CONFIG).find(([, config]) =>
          config.hosts.includes(url.hostname),
        )?.[0] ?? null
      );
    } catch {
      return null;
    }
  }

  function cleanText(value, limit) {
    return value.replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function parseLlmPage(document, pageUrl) {
    const tool = toolForUrl(pageUrl);
    if (!tool) {
      return { ok: false, code: "unsupported_llm_page" };
    }
    const config = CONFIG[tool];
    const root = document.querySelector(config.root);
    if (!root) {
      return { ok: false, code: "conversation_root_missing", tool };
    }

    const prompts = [...root.querySelectorAll(config.prompts)]
      .slice(0, MAX_PROMPTS)
      .map((node, index) => ({
        prompt_index: index + 1,
        text: cleanText(node.textContent ?? "", 4000),
      }))
      .filter((prompt) => prompt.text);

    const responses = [...root.querySelectorAll(config.responses)]
      .slice(0, MAX_PROMPTS)
      .map((node, index) => ({
        response_index: index + 1,
        source_urls: [...node.querySelectorAll("a[href]")]
          .filter(
            (link) =>
              !link.hasAttribute("download") &&
              !link.closest(
                '[data-attachment], [data-testid*="attachment"], [aria-label*="attachment" i]',
              ),
          )
          .map((link) => link.href)
          .filter(Boolean)
          .slice(0, MAX_SOURCES),
      }));

    const modelNode = document.querySelector(config.model);
    return {
      ok: true,
      tool,
      prompts,
      responses,
      model_name: modelNode
        ? cleanText(
            modelNode.getAttribute("data-model-name") ??
              modelNode.textContent ??
              "",
            100,
          ) || null
        : null,
      parser_version: PARSER_VERSION,
    };
  }

  function conversationRoot(document, tool) {
    return document.querySelector(CONFIG[tool].root);
  }

  global.KWWLlmParser = Object.freeze({
    PARSER_VERSION,
    toolForUrl,
    parseLlmPage,
    conversationRoot,
  });
})(globalThis);
