import { createEvent } from "../shared/event-schema.mjs";
import { classifyUrl } from "../shared/privacy-filter.mjs";
import { redactText } from "../shared/query-redaction.mjs";
import {
  hashAllowedUrl,
  pseudonymizeBrowserId,
} from "../shared/telemetry-identifiers.mjs";

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
const ERROR_CODES = new Set([
  "knowledge_root_missing",
  "parse_failed",
]);
const REFERRER_CATEGORIES = new Set([
  "none",
  "external",
  "qna",
  "code_repo",
  "package_docs",
  "documentation",
  "reference",
]);

function isActive(context) {
  return context.capture_status === "active" && context.session_id !== null;
}

function identify(url) {
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
}

function safeText(value, limit) {
  const redacted = redactText(value);
  return redacted.redacted ? null : redacted.query?.slice(0, limit) ?? null;
}

function safeTextList(values, limit, maxItems) {
  return (Array.isArray(values) ? values : [])
    .map((value) => safeText(value, limit))
    .filter(Boolean)
    .slice(0, maxItems);
}

function githubRoute(url) {
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
  if (
    !owner ||
    !repository ||
    reserved.has(owner) ||
    !/^[A-Za-z0-9_.-]+$/.test(owner) ||
    !/^[A-Za-z0-9_.-]+$/.test(repository)
  ) {
    return null;
  }
  const route = {
    owner,
    repository,
    pageType: "repository",
    filePath: null,
    issueNumber: null,
    pullRequestNumber: null,
  };
  if (third === "blob" || third === "tree") {
    route.pageType = third === "blob" ? "file" : "directory";
    route.filePath = safeText(
      url.pathname.split("/").slice(5).join("/") || null,
      500,
    );
  } else if (third === "issues" && /^\d+$/.test(fourth ?? "")) {
    route.pageType = "issue";
    route.issueNumber = Number(fourth);
  } else if (third === "pull" && /^\d+$/.test(fourth ?? "")) {
    route.pageType = "pull_request";
    route.pullRequestNumber = Number(fourth);
  }
  return route;
}

export function createKnowledgeTelemetry({
  stateController,
  queue,
  extensionVersion,
  hashUrl = hashAllowedUrl,
  pseudonymize = pseudonymizeBrowserId,
}) {
  async function scopedContext(sender, claimedSite, claimedCategory) {
    const context = await stateController.getTelemetryContext();
    let page;
    try {
      page = new URL(sender.url);
    } catch {
      return null;
    }
    const identified = identify(page);
    if (
      !isActive(context) ||
      page.protocol !== "https:" ||
      classifyUrl(page.href).classification !== "allowed" ||
      !identified ||
      identified.site !== claimedSite ||
      identified.category !== claimedCategory ||
      !Number.isInteger(sender.tab?.id) ||
      !Number.isInteger(sender.tab?.windowId)
    ) {
      return null;
    }
    return { context, page, ...identified };
  }

  async function common(scoped, sender, parsed) {
    return {
      page_url_hash: await hashUrl(scoped.page.href),
      knowledge_hostname: scoped.page.hostname,
      tab_id: await pseudonymize(
        scoped.context.session_id,
        "tab",
        sender.tab.id,
      ),
      window_id: await pseudonymize(
        scoped.context.session_id,
        "window",
        sender.tab.windowId,
      ),
      browser_timestamp: Date.now(),
      site: scoped.site,
      category: scoped.category,
      page_type: parsed.page_type,
      title: safeText(parsed.title, 300),
      referrer_category: REFERRER_CATEGORIES.has(parsed.referrer_category)
        ? parsed.referrer_category
        : "none",
      parser_version: 1,
    };
  }

  async function append(context, eventType, payload) {
    const current = await stateController.getTelemetryContext();
    if (!isActive(current) || current.session_id !== context.session_id) {
      return false;
    }
    await queue.append(
      createEvent({
        eventType,
        extensionVersion,
        captureMode: "ambient",
        source: "knowledge_parser",
        participantIdHash: context.participant_id_hash,
        sessionId: context.session_id,
        payload,
      }),
    );
    return true;
  }

  return {
    async onPageParsed(parsed, sender) {
      const scoped = await scopedContext(
        sender,
        parsed?.site,
        parsed?.category,
      );
      if (!scoped || parsed?.parser_version !== 1) {
        return;
      }
      const base = await common(scoped, sender, parsed);

      if (scoped.category === "qna") {
        const questionId = scoped.page.pathname.match(
          /^\/questions\/(\d+)/,
        )?.[1];
        if (!questionId || parsed.question?.question_id !== questionId) {
          return;
        }
        if (!(await append(scoped.context, "knowledge_page_exposed", base))) {
          return;
        }
        await append(scoped.context, "qna_question_exposed", {
          ...base,
          question_id: questionId,
          tags: safeTextList(parsed.question.tags, 50, 10),
          score: Number.isInteger(parsed.question.score)
            ? parsed.question.score
            : null,
        });
        for (const answer of Array.isArray(parsed.answers)
          ? parsed.answers.slice(0, 20)
          : []) {
          if (!/^\d+$/.test(answer?.answer_id ?? "")) {
            continue;
          }
          await append(scoped.context, "qna_answer_exposed", {
            ...base,
            question_id: questionId,
            answer_id: answer.answer_id,
            accepted: answer.accepted === true,
            score: Number.isInteger(answer.score) ? answer.score : null,
          });
        }
        return;
      }

      if (scoped.category === "code_repo") {
        const route = githubRoute(scoped.page);
        if (
          !route ||
          parsed.repository?.visibility !== "public" ||
          parsed.repository.owner !== route.owner ||
          parsed.repository.repository !== route.repository
        ) {
          return;
        }
        const repoBase = { ...base, page_type: route.pageType };
        if (
          !(await append(
            scoped.context,
            "knowledge_page_exposed",
            repoBase,
          ))
        ) {
          return;
        }
        await append(scoped.context, "code_repo_exposed", {
          ...repoBase,
          owner: route.owner,
          repository: route.repository,
          file_path: route.filePath,
          issue_number: route.issueNumber,
          pull_request_number: route.pullRequestNumber,
          visibility: "public",
        });
        return;
      }

      if (!(await append(scoped.context, "knowledge_page_exposed", base))) {
        return;
      }
      await append(scoped.context, "docs_page_exposed", {
        ...base,
        headings: safeTextList(parsed.headings, 200, 20),
        package_name:
          scoped.category === "package_docs"
            ? safeText(parsed.package_name, 214)
            : null,
      });
    },

    async onParserError(message, sender) {
      let page;
      try {
        page = new URL(sender.url);
      } catch {
        return;
      }
      const identified = identify(page);
      const scoped = identified
        ? await scopedContext(sender, identified.site, identified.category)
        : null;
      if (
        !scoped ||
        message.stage !== "parse" ||
        !ERROR_CODES.has(message.code) ||
        message.parserVersion !== 1
      ) {
        return;
      }
      await append(scoped.context, "parser_error", {
        page_url_hash: await hashUrl(page.href),
        knowledge_hostname: page.hostname,
        tab_id: await pseudonymize(
          scoped.context.session_id,
          "tab",
          sender.tab.id,
        ),
        window_id: await pseudonymize(
          scoped.context.session_id,
          "window",
          sender.tab.windowId,
        ),
        browser_timestamp: Date.now(),
        parser_kind: "knowledge",
        site: scoped.site,
        category: scoped.category,
        parser_stage: "parse",
        error_code: message.code,
        parser_version: 1,
      });
    },
  };
}
