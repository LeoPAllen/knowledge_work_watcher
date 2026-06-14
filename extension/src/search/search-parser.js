(function defineSearchParser(global) {
  "use strict";

  const PARSER_VERSION = 2;
  const PARSER_NAME = "kww_search_visible_results";
  const MAX_RESULTS = 20;
  const MAX_TITLE_LENGTH = 300;
  const ENGINE_CONFIG = Object.freeze({
    google: {
      hostname: "www.google.com",
      path: "/search",
      roots: ["#search", 'main[role="main"]'],
      results: [".g", '[data-snhf]'],
      links: ["a:has(h3)", "a"],
      titles: ["h3", '[role="heading"]'],
      snippets: [".VwiC3b", ".snippet", '[data-sncf]'],
      excluded: ".uEierd",
    },
    bing: {
      hostname: "www.bing.com",
      path: "/search",
      roots: ["#b_results", 'main[aria-label*="Search" i]'],
      results: [".b_algo", 'li[data-bm]'],
      links: ["h2 a", 'a[href]'],
      titles: ["h2", '[role="heading"]'],
      snippets: [".b_caption p", ".b_snippet", "p"],
      excluded: ".b_ad",
    },
    duckduckgo: {
      hostname: "duckduckgo.com",
      paths: ["/", "/html/"],
      roots: ["#links", 'main'],
      results: [".result", '[data-testid="result"]'],
      links: ["a.result__a", '[data-testid="result-title-a"]'],
      titles: ["a.result__a", '[data-testid="result-title-a"]'],
      snippets: [".result__snippet", '[data-result="snippet"]'],
      excluded: ".result--ad",
    },
  });

  function engineForUrl(input) {
    let url;
    try {
      url = new URL(input);
    } catch {
      return null;
    }

    return (
      Object.entries(ENGINE_CONFIG).find(([, config]) => {
        const pathMatches = config.paths
          ? config.paths.includes(url.pathname)
          : url.pathname === config.path;
        return url.hostname === config.hostname && pathMatches;
      })?.[0] ?? null
    );
  }

  function cleanText(value) {
    return value.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH);
  }

  function cleanSnippet(value) {
    return value.replace(/\s+/g, " ").trim().slice(0, 4000);
  }

  const EXCLUDED =
    'script, style, template, input, textarea, select, option, [hidden], [aria-hidden="true"], [inert], [data-testid*="profile"], [aria-label*="profile" i]';

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

  function firstMatch(root, selectors) {
    for (let index = 0; index < selectors.length; index += 1) {
      const node = root.querySelector(selectors[index]);
      if (node) {
        return {
          node,
          selector_family:
            index === 0 ? "canonical" : index === 1 ? "fallback" : "semantic",
          confidence: index === 0 ? "high" : index === 1 ? "medium" : "low",
        };
      }
    }
    return null;
  }

  function allMatches(root, selectors) {
    for (let index = 0; index < selectors.length; index += 1) {
      const nodes = [...root.querySelectorAll(selectors[index])];
      if (nodes.length > 0) {
        return {
          nodes,
          selector_family: index === 0 ? "canonical" : "fallback",
          confidence: index === 0 ? "high" : "medium",
        };
      }
    }
    return { nodes: [], selector_family: "none", confidence: "low" };
  }

  function queryForUrl(input) {
    const query = new URL(input).searchParams.get("q");
    return query === null ? null : query.replace(/\s+/g, " ").trim();
  }

  function destinationUrl(input, engine) {
    const url = new URL(input);
    if (engine === "google" && url.pathname === "/url") {
      return url.searchParams.get("q") ?? url.href;
    }
    if (engine === "duckduckgo" && url.pathname.startsWith("/l/")) {
      return url.searchParams.get("uddg") ?? url.href;
    }
    return url.href;
  }

  function resultRoot(document, engine) {
    return firstMatch(document, ENGINE_CONFIG[engine].roots)?.node ?? null;
  }

  function parseSearchPage(document, pageUrl) {
    const engine = engineForUrl(pageUrl);
    if (!engine) {
      return { ok: false, code: "unsupported_search_page" };
    }

    const config = ENGINE_CONFIG[engine];
    const root = resultRoot(document, engine);
    if (!root) {
      return { ok: false, code: "results_root_missing", engine };
    }

    const results = [];
    const resultMatch = allMatches(root, config.results);
    for (const container of resultMatch.nodes) {
      if (container.matches(config.excluded)) {
        continue;
      }
      const linkMatch = firstMatch(container, config.links);
      const titleMatch = firstMatch(container, config.titles);
      const snippetMatch = firstMatch(container, config.snippets);
      const link = linkMatch?.node;
      const titleNode = titleMatch?.node;
      if (!link?.href || !titleNode) {
        continue;
      }
      const title = cleanText(visibleText(titleNode));
      if (!title) {
        continue;
      }
      results.push({
        rank: results.length + 1,
        title,
        url: destinationUrl(link.href, engine),
        result_type: "organic",
        snippet: snippetMatch ? cleanSnippet(visibleText(snippetMatch.node)) : null,
        selector_family:
          snippetMatch?.selector_family ?? resultMatch.selector_family,
        confidence: snippetMatch?.confidence ?? "low",
      });
      if (results.length === MAX_RESULTS) {
        break;
      }
    }

    return {
      ok: true,
      engine,
      query: queryForUrl(pageUrl),
      results,
      parser_version: PARSER_VERSION,
      parser_name: PARSER_NAME,
      capture_method: "visible_dom_text",
      selector_family: resultMatch.selector_family,
      confidence: resultMatch.confidence,
      health: {
        parsed_count: results.length,
        missing_snippet_count: results.filter((result) => !result.snippet)
          .length,
        degraded_count:
          resultMatch.confidence === "high" &&
          results.every((result) => result.confidence === "high")
            ? 0
            : 1,
      },
    };
  }

  function clickedResult(document, pageUrl, target) {
    const engine = engineForUrl(pageUrl);
    const config = engine ? ENGINE_CONFIG[engine] : null;
    if (!config) {
      return null;
    }
    const root = resultRoot(document, engine);
    const container = target?.closest?.(config.results.join(","));
    if (!root || !container || !root.contains(container)) {
      return null;
    }
    if (container.matches(config.excluded)) {
      return null;
    }
    const link = target.closest("a");
    const resultLink = firstMatch(container, config.links)?.node;
    if (!link || link !== resultLink || !link.href) {
      return null;
    }
    const containers = allMatches(root, config.results).nodes.filter(
      (candidate) => {
        const candidateLink = firstMatch(candidate, config.links)?.node;
        const candidateTitle = firstMatch(candidate, config.titles)?.node;
        return (
          !candidate.matches(config.excluded) &&
          candidateLink?.href &&
          cleanText(visibleText(candidateTitle))
        );
      },
    );
    const rank = containers.indexOf(container) + 1;
    return rank > 0
      ? { engine, rank, url: destinationUrl(link.href, engine) }
      : null;
  }

  global.KWWSearchParser = Object.freeze({
    PARSER_VERSION,
    PARSER_NAME,
    engineForUrl,
    parseSearchPage,
    resultRoot,
    clickedResult,
  });
})(globalThis);
