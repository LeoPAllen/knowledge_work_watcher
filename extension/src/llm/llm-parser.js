(function defineLlmParser(global) {
  "use strict";

  const PARSER_VERSION = 2;
  const PARSER_NAME = "kww_llm_visible_text";
  const MAX_PROMPTS = 50;
  const MAX_SOURCES = 20;
  const CONFIG = Object.freeze({
    chatgpt: {
      hosts: ["chatgpt.com"],
      roots: ["main", '[role="main"]'],
      prompts: [
        '[data-message-author-role="user"] [data-testid="message-text"]',
        '[data-message-author-role="user"]',
      ],
      responses: [
        '[data-message-author-role="assistant"]',
        '[data-testid^="conversation-turn-"] [data-message-author-role="assistant"]',
      ],
      model: '[data-testid="model-name"]',
    },
    claude: {
      hosts: ["claude.ai"],
      roots: ["main", '[role="main"]'],
      prompts: [
        '[data-testid="user-message"] [data-testid="message-text"]',
        '[data-testid="user-message"]',
      ],
      responses: [
        '[data-testid="assistant-message"]',
        '[data-is-streaming] [data-testid*="assistant"]',
      ],
      model: '[data-testid="model-selector"]',
    },
    gemini: {
      hosts: ["gemini.google.com"],
      roots: ["main", '[role="main"]'],
      prompts: [
        '.query-text [data-testid="message-text"]',
        ".query-text",
      ],
      responses: [".model-response", "model-response"],
      model: "[data-model-name]",
    },
    perplexity: {
      hosts: ["perplexity.ai", "www.perplexity.ai"],
      roots: ["main", '[role="main"]'],
      prompts: [
        '[data-testid="user-query"] [data-testid="message-text"]',
        '[data-testid="user-query"]',
      ],
      responses: ['[data-testid="answer"]', '[data-testid*="answer"]'],
      model: '[data-testid="model-name"]',
    },
    copilot: {
      hosts: ["copilot.microsoft.com"],
      roots: ["main", '[role="main"]'],
      prompts: [
        '[data-content="user-message"] [data-testid="message-text"]',
        '[data-content="user-message"]',
      ],
      responses: ['[data-content="ai-message"]', '[data-author="assistant"]'],
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

  const EXCLUDED =
    'script, style, template, input, textarea, select, option, [hidden], [aria-hidden="true"], [inert], [data-attachment], [data-testid*="attachment"], [aria-label*="attachment" i], [data-testid*="profile"], [aria-label*="profile" i], [data-testid*="upload"], [aria-label*="upload" i]';

  function visibleText(node) {
    if (!node) {
      return "";
    }
    if (node.nodeType === 3) {
      return node.nodeValue ?? "";
    }
    if (node.nodeType !== 1 || node.matches?.(EXCLUDED)) {
      return "";
    }
    const style = node.getAttribute?.("style")?.toLowerCase() ?? "";
    if (style.includes("display:none") || style.includes("visibility:hidden")) {
      return "";
    }
    const computed = global.getComputedStyle?.(node);
    if (
      computed?.display === "none" ||
      computed?.visibility === "hidden"
    ) {
      return "";
    }
    return [...node.childNodes].map(visibleText).join(" ");
  }

  function selectFamily(root, selectors) {
    for (let index = 0; index < selectors.length; index += 1) {
      const nodes = [...root.querySelectorAll(selectors[index])];
      if (nodes.length > 0) {
        return {
          nodes,
          selector_family:
            index === 0 ? "canonical" : index === 1 ? "fallback" : "semantic",
          confidence: index === 0 ? "high" : index === 1 ? "medium" : "low",
        };
      }
    }
    return { nodes: [], selector_family: "none", confidence: "low" };
  }

  function findRoot(document, roots) {
    for (let index = 0; index < roots.length; index += 1) {
      const root = document.querySelector(roots[index]);
      if (root) {
        return {
          root,
          selector_family: index === 0 ? "canonical" : "fallback",
          confidence: index === 0 ? "high" : "medium",
        };
      }
    }
    return null;
  }

  function parseLlmPage(document, pageUrl) {
    const tool = toolForUrl(pageUrl);
    if (!tool) {
      return { ok: false, code: "unsupported_llm_page" };
    }
    const config = CONFIG[tool];
    const rootMatch = findRoot(document, config.roots);
    if (!rootMatch) {
      return { ok: false, code: "conversation_root_missing", tool };
    }
    const { root } = rootMatch;

    const promptMatch = selectFamily(root, config.prompts);
    const prompts = promptMatch.nodes
      .slice(0, MAX_PROMPTS)
      .map((node, index) => ({
        prompt_index: index + 1,
        text: cleanText(visibleText(node), 4000),
      }))
      .filter((prompt) => prompt.text);

    const responseMatch = selectFamily(root, config.responses);
    const responseSelectorFamily =
      rootMatch.confidence === "high"
        ? responseMatch.selector_family
        : "fallback";
    const responseConfidence =
      rootMatch.confidence === "high"
        ? responseMatch.confidence
        : rootMatch.confidence;
    const responses = responseMatch.nodes
      .slice(0, MAX_PROMPTS)
      .map((node, index) => ({
        response_index: index + 1,
        text: cleanText(visibleText(node), 20000),
        selector_family: responseSelectorFamily,
        confidence: responseConfidence,
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
      parser_name: PARSER_NAME,
      capture_method: "visible_dom_text",
      selector_family: responseSelectorFamily,
      confidence: responseConfidence,
      health: {
        parsed_count: responses.filter((response) => response.text).length,
        missing_response_text_count: responses.filter(
          (response) => !response.text,
        ).length,
        degraded_count:
          rootMatch.confidence === "high" &&
          responseMatch.confidence === "high"
            ? 0
            : 1,
      },
    };
  }

  function conversationRoot(document, tool) {
    return findRoot(document, CONFIG[tool].roots)?.root ?? null;
  }

  global.KWWLlmParser = Object.freeze({
    PARSER_VERSION,
    PARSER_NAME,
    toolForUrl,
    parseLlmPage,
    conversationRoot,
  });
})(globalThis);
