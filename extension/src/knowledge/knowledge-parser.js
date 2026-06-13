(function defineKnowledgeParser(global) {
  "use strict";

  const PARSER_VERSION = 1;
  const MAX_HEADINGS = 20;
  const MAX_TAGS = 10;
  const MAX_ANSWERS = 20;
  const QNA_HOSTS = new Set([
    "stackoverflow.com",
    "serverfault.com",
    "superuser.com",
    "askubuntu.com",
    "mathoverflow.net",
    "stackapps.com",
  ]);
  const DOCS_HOSTS = new Set([
    "developer.mozilla.org",
    "docs.github.com",
    "docs.gitlab.com",
    "docs.python.org",
    "learn.microsoft.com",
    "developers.google.com",
  ]);

  function siteForUrl(input) {
    try {
      const url = new URL(input);
      const host = url.hostname;
      if (QNA_HOSTS.has(host) || host.endsWith(".stackexchange.com")) {
        return { site: host, category: "qna" };
      }
      if (host === "github.com") {
        return { site: "github", category: "code_repo" };
      }
      if (host === "www.npmjs.com") {
        return { site: "npm", category: "package_docs" };
      }
      if (host === "pypi.org") {
        return { site: "pypi", category: "package_docs" };
      }
      if (DOCS_HOSTS.has(host)) {
        return { site: host, category: "documentation" };
      }
      if (host === "wikipedia.org" || host.endsWith(".wikipedia.org")) {
        return { site: "wikipedia", category: "reference" };
      }
      return null;
    } catch {
      return null;
    }
  }

  function clean(value, limit = 300) {
    return value.replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function integerFrom(value) {
    const match = String(value ?? "").replace(/,/g, "").match(/-?\d+/);
    return match ? Number(match[0]) : null;
  }

  function isExposed(node) {
    return (
      !node.hasAttribute("hidden") &&
      node.getAttribute("aria-hidden") !== "true" &&
      !node.closest('[hidden], [aria-hidden="true"]')
    );
  }

  function referrerCategory(referrer) {
    const referrerSite = siteForUrl(referrer);
    if (referrerSite) {
      return referrerSite.category;
    }
    try {
      return new URL(referrer).protocol === "https:" ? "external" : "none";
    } catch {
      return "none";
    }
  }

  function headings(root) {
    return [...root.querySelectorAll("h2, h3")]
      .filter(isExposed)
      .map((node) => clean(node.textContent ?? "", 200))
      .filter(Boolean)
      .slice(0, MAX_HEADINGS);
  }

  function parseQna(document, url) {
    const questionId =
      url.pathname.match(/^\/questions\/(\d+)/)?.[1] ??
      document.querySelector("[data-questionid]")?.getAttribute("data-questionid");
    if (!questionId) {
      return { ok: false, code: "unsupported_knowledge_page" };
    }
    const question = document.querySelector("[data-questionid]");
    return {
      page_type: "question",
      title: clean(
        document.querySelector("h1 a, h1")?.textContent ?? document.title ?? "",
      ),
      question: {
        question_id: questionId,
        tags: [...document.querySelectorAll(".post-tag")]
          .filter(isExposed)
          .map((tag) => clean(tag.textContent ?? "", 50))
          .filter(Boolean)
          .slice(0, MAX_TAGS),
        score: integerFrom(
          question?.querySelector(".js-vote-count")?.textContent,
        ),
      },
      answers: [...document.querySelectorAll(".answer[data-answerid]")]
        .filter(isExposed)
        .slice(0, MAX_ANSWERS)
        .map((answer) => ({
          answer_id: answer.getAttribute("data-answerid"),
          accepted:
            answer.classList.contains("accepted-answer") ||
            Boolean(answer.querySelector(".js-accepted-answer-indicator")),
          score: integerFrom(
            answer.querySelector(".js-vote-count")?.textContent,
          ),
        })),
    };
  }

  function parseGithub(document, url) {
    const [owner, repository, third, fourth] = url.pathname
      .split("/")
      .filter(Boolean);
    const reserved = new Set([
      "account",
      "collections",
      "dashboard",
      "explore",
      "issues",
      "login",
      "marketplace",
      "notifications",
      "organizations",
      "orgs",
      "pulls",
      "search",
      "settings",
      "signup",
    ]);
    if (!owner || !repository || reserved.has(owner)) {
      return { ok: false, code: "unsupported_knowledge_page" };
    }
    const publicMeta = document.querySelector(
      'meta[name="octolytics-dimension-repository_public"][content="true"]',
    );
    const publicMarker = document.querySelector(
      '[data-repository-visibility="public"]',
    );
    if (!publicMeta && !publicMarker) {
      return { ok: false, code: "private_or_ambiguous_repo" };
    }

    let pageType = "repository";
    let filePath = null;
    let issueNumber = null;
    let pullRequestNumber = null;
    if (third === "blob" || third === "tree") {
      pageType = third === "blob" ? "file" : "directory";
      filePath = url.pathname.split("/").slice(5).join("/") || null;
    } else if (third === "issues" && /^\d+$/.test(fourth ?? "")) {
      pageType = "issue";
      issueNumber = Number(fourth);
    } else if (third === "pull" && /^\d+$/.test(fourth ?? "")) {
      pageType = "pull_request";
      pullRequestNumber = Number(fourth);
    }
    return {
      page_type: pageType,
      title: clean(document.querySelector("h1")?.textContent ?? document.title ?? ""),
      repository: {
        owner,
        repository,
        file_path: filePath,
        issue_number: issueNumber,
        pull_request_number: pullRequestNumber,
        visibility: "public",
      },
    };
  }

  function parseDocs(document, url, site) {
    const isPackage = site === "npm" || site === "pypi";
    const packageName = isPackage
      ? decodeURIComponent(
          url.pathname.match(
            site === "npm" ? /^\/package\/([^/]+(?:\/[^/]+)?)/ : /^\/project\/([^/]+)/,
          )?.[1] ?? "",
        ) || null
      : null;
    if (isPackage && !packageName) {
      return { ok: false, code: "unsupported_knowledge_page" };
    }
    const root = document.querySelector("main, article, #content");
    if (!root) {
      return { ok: false, code: "knowledge_root_missing" };
    }
    return {
      page_type: isPackage ? "package" : "documentation",
      title: clean(document.querySelector("h1")?.textContent ?? document.title ?? ""),
      headings: headings(root),
      package_name: packageName,
    };
  }

  function parseWikipedia(document, url) {
    if (!url.pathname.startsWith("/wiki/")) {
      return { ok: false, code: "unsupported_knowledge_page" };
    }
    const root = document.querySelector("#mw-content-text");
    if (!root) {
      return { ok: false, code: "knowledge_root_missing" };
    }
    return {
      page_type: "article",
      title: clean(
        document.querySelector("#firstHeading")?.textContent ?? document.title ?? "",
      ),
      headings: headings(root),
      package_name: null,
    };
  }

  function parseKnowledgePage(document, pageUrl, referrer = "") {
    const identified = siteForUrl(pageUrl);
    if (!identified) {
      return { ok: false, code: "unsupported_knowledge_page" };
    }
    const url = new URL(pageUrl);
    let parsed;
    if (identified.category === "qna") {
      parsed = parseQna(document, url);
    } else if (identified.category === "code_repo") {
      parsed = parseGithub(document, url);
    } else if (identified.category === "reference") {
      parsed = parseWikipedia(document, url);
    } else {
      parsed = parseDocs(document, url, identified.site);
    }
    return parsed.ok === false
      ? { ...parsed, site: identified.site, category: identified.category }
      : {
          ok: true,
          ...identified,
          ...parsed,
          referrer_category: referrerCategory(referrer),
          parser_version: PARSER_VERSION,
        };
  }

  global.KWWKnowledgeParser = Object.freeze({
    PARSER_VERSION,
    siteForUrl,
    parseKnowledgePage,
  });
})(globalThis);
