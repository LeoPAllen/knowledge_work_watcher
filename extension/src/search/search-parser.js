(function defineSearchParser(global) {
  "use strict";

  const PARSER_VERSION = 1;
  const MAX_RESULTS = 20;
  const MAX_TITLE_LENGTH = 300;
  const ENGINE_CONFIG = Object.freeze({
    google: {
      hostname: "www.google.com",
      path: "/search",
      root: "#search",
      result: ".g",
      link: "a",
      title: "h3",
      excluded: ".uEierd",
    },
    bing: {
      hostname: "www.bing.com",
      path: "/search",
      root: "#b_results",
      result: ".b_algo",
      link: "h2 a",
      title: "h2",
      excluded: ".b_ad",
    },
    duckduckgo: {
      hostname: "duckduckgo.com",
      paths: ["/", "/html/"],
      root: "#links",
      result: ".result",
      link: "a.result__a",
      title: "a.result__a",
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
    return document.querySelector(ENGINE_CONFIG[engine].root);
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
    for (const container of root.querySelectorAll(config.result)) {
      if (container.matches(config.excluded)) {
        continue;
      }
      const link = container.querySelector(config.link);
      const titleNode = container.querySelector(config.title);
      if (!link?.href || !titleNode) {
        continue;
      }
      const title = cleanText(titleNode.textContent ?? "");
      if (!title) {
        continue;
      }
      results.push({
        rank: results.length + 1,
        title,
        url: destinationUrl(link.href, engine),
        result_type: "organic",
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
    };
  }

  function clickedResult(document, pageUrl, target) {
    const engine = engineForUrl(pageUrl);
    const config = engine ? ENGINE_CONFIG[engine] : null;
    if (!config) {
      return null;
    }
    const root = resultRoot(document, engine);
    const container = target?.closest?.(config.result);
    if (!root || !container || !root.contains(container)) {
      return null;
    }
    if (container.matches(config.excluded)) {
      return null;
    }
    const link = target.closest("a");
    const resultLink = container.querySelector(config.link);
    if (!link || link !== resultLink || !link.href) {
      return null;
    }
    const containers = [...root.querySelectorAll(config.result)].filter(
      (candidate) => {
        const candidateLink = candidate.querySelector(config.link);
        const candidateTitle = candidate.querySelector(config.title);
        return (
          !candidate.matches(config.excluded) &&
          candidateLink?.href &&
          cleanText(candidateTitle?.textContent ?? "")
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
    engineForUrl,
    parseSearchPage,
    resultRoot,
    clickedResult,
  });
})(globalThis);
