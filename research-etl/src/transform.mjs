import { episodeId } from "./sessionize.mjs";

export const DEFAULT_LINK_WINDOW_MINUTES = 30;

const SEARCH_TYPES = new Set([
  "search_query_observed",
  "search_results_exposed",
  "search_result_clicked",
]);
const LLM_TYPES = new Set([
  "llm_prompt_observed",
  "llm_response_observed",
  "llm_source_links_exposed",
  "llm_interaction_metadata",
]);
const KNOWLEDGE_TYPES = new Set([
  "knowledge_page_exposed",
  "qna_question_exposed",
  "qna_answer_exposed",
  "code_repo_exposed",
  "docs_page_exposed",
]);

function first(payload, fields) {
  for (const field of fields) {
    if (payload[field] !== undefined && payload[field] !== null) {
      return payload[field];
    }
  }
  return null;
}

function pageHash(payload) {
  return first(payload, ["url_hash", "page_url_hash"]);
}

function hostname(payload) {
  return first(payload, [
    "hostname",
    "search_hostname",
    "llm_hostname",
    "knowledge_hostname",
  ]);
}

function eventText(event) {
  return first(event.payload, ["query", "prompt_text", "title"]);
}

function categoryToSource(category) {
  return (
    {
      qna: "qna",
      code_repo: "code",
      package_docs: "docs",
      documentation: "docs",
      reference: "encyclopedia",
    }[category] ?? "other"
  );
}

function hostnameToSource(value) {
  if (!value) {
    return "other";
  }
  if (
    ["google.com", "bing.com", "duckduckgo.com"].some(
      (domain) => value === domain || value.endsWith(`.${domain}`),
    )
  ) {
    return "search";
  }
  if (
    ["chatgpt.com", "claude.ai", "perplexity.ai"].some(
      (domain) => value === domain || value.endsWith(`.${domain}`),
    ) ||
    ["gemini.google.com", "copilot.microsoft.com"].includes(value)
  ) {
    return "llm";
  }
  if (
    value === "stackoverflow.com" ||
    value.endsWith(".stackexchange.com") ||
    ["serverfault.com", "superuser.com", "askubuntu.com"].includes(value)
  ) {
    return "qna";
  }
  if (value === "github.com" || value === "gitlab.com") {
    return "code";
  }
  if (value === "wikipedia.org" || value.endsWith(".wikipedia.org")) {
    return "encyclopedia";
  }
  if (
    value.startsWith("docs.") ||
    ["developer.mozilla.org", "www.npmjs.com", "pypi.org"].includes(value)
  ) {
    return "docs";
  }
  return "other";
}

export function sourceTypeFor(record) {
  const { event } = record;
  if (SEARCH_TYPES.has(event.event_type)) {
    return "search";
  }
  if (LLM_TYPES.has(event.event_type)) {
    return "llm";
  }
  if (KNOWLEDGE_TYPES.has(event.event_type)) {
    return categoryToSource(event.payload.category);
  }
  return hostnameToSource(hostname(event.payload));
}

function baseRow(record) {
  return {
    event_id: record.event.event_id,
    activity_session_id: record.activity_session_id,
    participant_id_hash: record.event.participant_id_hash,
    extension_session_id: record.event.session_id,
    created_at: record.event.created_at,
    received_at: record.received_at,
    event_type: record.event.event_type,
    source_type: sourceTypeFor(record),
  };
}

const EVENTS_CLEAN_COLUMNS = [
  "event_id",
  "schema_version",
  "event_type",
  "created_at",
  "received_at",
  "participant_id_hash",
  "extension_session_id",
  "activity_session_id",
  "activity_sequence",
  "capture_mode",
  "event_source",
  "source_type",
  "page_hash",
  "hostname",
  "tab_id",
  "window_id",
  "text_value",
  "item_count",
];

function cleanEvents(records) {
  return records.map((record) => {
    const { event } = record;
    const payload = event.payload;
    return {
      ...baseRow(record),
      schema_version: event.schema_version,
      activity_sequence: record.activity_sequence,
      capture_mode: event.capture_mode,
      event_source: event.source,
      page_hash: pageHash(payload),
      hostname: hostname(payload),
      tab_id: payload.tab_id ?? null,
      window_id: payload.window_id ?? null,
      text_value: eventText(event),
      item_count: first(payload, [
        "result_count",
        "source_count",
        "prompt_count",
        "response_count",
      ]) ??
        payload.results?.length ??
        payload.sources?.length ??
        payload.headings?.length ??
        null,
    };
  });
}

const PAGE_VIEW_COLUMNS = [
  "page_view_id",
  "event_id",
  "activity_session_id",
  "participant_id_hash",
  "extension_session_id",
  "created_at",
  "source_type",
  "page_hash",
  "hostname",
  "page_type",
  "title",
  "tab_id",
  "window_id",
];

function pageViews(records) {
  return records
    .filter((record) =>
      ["navigation_committed", "knowledge_page_exposed"].includes(
        record.event.event_type,
      ),
    )
    .map((record) => ({
      ...baseRow(record),
      page_view_id: episodeId("page", record, record.event.event_id),
      page_hash: pageHash(record.event.payload),
      hostname: hostname(record.event.payload),
      page_type:
        record.event.event_type === "navigation_committed"
          ? "navigation"
          : record.event.payload.page_type,
      title: record.event.payload.title ?? null,
      tab_id: record.event.payload.tab_id ?? null,
      window_id: record.event.payload.window_id ?? null,
    }));
}

const SEARCH_EPISODE_COLUMNS = [
  "search_episode_id",
  "activity_session_id",
  "participant_id_hash",
  "extension_session_id",
  "search_engine",
  "page_hash",
  "started_at",
  "ended_at",
  "query",
  "query_redacted",
  "result_count",
  "clicked_rank",
  "destination_hostnames",
  "destination_hashes",
];

function searchEpisodes(records) {
  const episodes = [];
  const active = new Map();
  for (const record of records.filter((item) =>
    SEARCH_TYPES.has(item.event.event_type),
  )) {
    const payload = record.event.payload;
    const key = `${record.activity_session_id}:${payload.page_url_hash}`;
    let episode = active.get(key);
    if (record.event.event_type === "search_query_observed" || !episode) {
      episode = {
        search_episode_id: episodeId(
          "search",
          record,
          `${payload.page_url_hash}:${record.event.event_id}`,
        ),
        activity_session_id: record.activity_session_id,
        participant_id_hash: record.event.participant_id_hash,
        extension_session_id: record.event.session_id,
        search_engine: payload.search_engine,
        page_hash: payload.page_url_hash,
        started_at: record.event.created_at,
        ended_at: record.event.created_at,
        query: payload.query ?? null,
        query_redacted: payload.query_redacted ?? null,
        result_count: 0,
        clicked_rank: null,
        destination_hostnames: [],
        destination_hashes: [],
      };
      active.set(key, episode);
      episodes.push(episode);
    }
    episode.ended_at = record.event.created_at;
    if (record.event.event_type === "search_results_exposed") {
      episode.result_count = payload.results.length;
      episode.destination_hostnames.push(
        ...payload.results.map((result) => result.destination_hostname),
      );
      episode.destination_hashes.push(
        ...payload.results.map((result) => result.destination_url_hash),
      );
    }
    if (record.event.event_type === "search_result_clicked") {
      episode.clicked_rank = payload.clicked_rank;
      episode.destination_hostnames.push(payload.destination_hostname);
      episode.destination_hashes.push(payload.destination_url_hash);
    }
  }
  return episodes.map((episode) => ({
    ...episode,
    destination_hostnames: [...new Set(episode.destination_hostnames)].join("|"),
    destination_hashes: [...new Set(episode.destination_hashes)].join("|"),
  }));
}

const LLM_EPISODE_COLUMNS = [
  "llm_episode_id",
  "activity_session_id",
  "participant_id_hash",
  "extension_session_id",
  "conversation_id",
  "llm_tool",
  "model_name",
  "started_at",
  "ended_at",
  "prompt_count",
  "response_count",
  "source_count",
  "prompt_texts",
  "source_hostnames",
  "source_hashes",
];

function llmEpisodes(records) {
  const episodes = new Map();
  for (const record of records.filter((item) =>
    LLM_TYPES.has(item.event.event_type),
  )) {
    const payload = record.event.payload;
    const key = `${record.activity_session_id}:${payload.conversation_id}`;
    let episode = episodes.get(key);
    if (!episode) {
      episode = {
        llm_episode_id: episodeId("llm", record, payload.conversation_id),
        activity_session_id: record.activity_session_id,
        participant_id_hash: record.event.participant_id_hash,
        extension_session_id: record.event.session_id,
        conversation_id: payload.conversation_id,
        llm_tool: payload.llm_tool,
        model_name: payload.model_name,
        started_at: record.event.created_at,
        ended_at: record.event.created_at,
        prompt_count: 0,
        response_count: 0,
        source_count: 0,
        prompt_texts: [],
        source_hostnames: [],
        source_hashes: [],
      };
      episodes.set(key, episode);
    }
    episode.ended_at = record.event.created_at;
    episode.model_name ??= payload.model_name;
    if (record.event.event_type === "llm_prompt_observed") {
      episode.prompt_count = Math.max(
        episode.prompt_count,
        payload.prompt_index,
      );
      if (payload.prompt_text) {
        episode.prompt_texts.push(payload.prompt_text);
      }
    }
    if (record.event.event_type === "llm_response_observed") {
      episode.response_count = Math.max(
        episode.response_count,
        payload.response_index,
      );
      episode.source_count = Math.max(
        episode.source_count,
        payload.source_count,
      );
    }
    if (record.event.event_type === "llm_source_links_exposed") {
      episode.source_count = Math.max(
        episode.source_count,
        payload.sources.length,
      );
      episode.source_hostnames.push(
        ...payload.sources.map((source) => source.destination_hostname),
      );
      episode.source_hashes.push(
        ...payload.sources.map((source) => source.destination_url_hash),
      );
    }
    if (record.event.event_type === "llm_interaction_metadata") {
      episode.prompt_count = Math.max(
        episode.prompt_count,
        payload.prompt_count,
      );
      episode.response_count = Math.max(
        episode.response_count,
        payload.response_count,
      );
      episode.source_count = Math.max(
        episode.source_count,
        payload.source_count,
      );
    }
  }
  return [...episodes.values()].map((episode) => ({
    ...episode,
    prompt_texts: episode.prompt_texts.join(" | "),
    source_hostnames: [...new Set(episode.source_hostnames)].join("|"),
    source_hashes: [...new Set(episode.source_hashes)].join("|"),
  }));
}

const KNOWLEDGE_EXPOSURE_COLUMNS = [
  "exposure_id",
  "event_id",
  "activity_session_id",
  "participant_id_hash",
  "extension_session_id",
  "created_at",
  "source_type",
  "category",
  "site",
  "page_type",
  "page_hash",
  "hostname",
  "title",
  "question_id",
  "answer_id",
  "accepted_answer",
  "owner",
  "repository",
  "issue_number",
  "pull_request_number",
  "package_name",
  "tags",
  "headings",
];

function knowledgeExposures(records) {
  return records
    .filter((record) => KNOWLEDGE_TYPES.has(record.event.event_type))
    .map((record) => {
      const payload = record.event.payload;
      return {
        ...baseRow(record),
        exposure_id: episodeId(
          "exposure",
          record,
          record.event.event_id,
        ),
        category: payload.category,
        site: payload.site,
        page_type: payload.page_type,
        page_hash: payload.page_url_hash,
        hostname: payload.knowledge_hostname,
        title: payload.title,
        question_id: payload.question_id ?? null,
        answer_id: payload.answer_id ?? null,
        accepted_answer: payload.accepted ?? null,
        owner: payload.owner ?? null,
        repository: payload.repository ?? null,
        issue_number: payload.issue_number ?? null,
        pull_request_number: payload.pull_request_number ?? null,
        package_name: payload.package_name ?? null,
        tags: payload.tags?.join("|") ?? null,
        headings: payload.headings?.join(" | ") ?? null,
      };
    });
}

const DOWNSTREAM_COLUMNS = [
  "link_id",
  "activity_session_id",
  "participant_id_hash",
  "source_type",
  "source_event_id",
  "source_episode_id",
  "source_created_at",
  "destination_hash",
  "destination_hostname",
  "navigation_event_id",
  "navigation_created_at",
  "lag_seconds",
];

function sourceCandidates(records, searchRows, llmRows) {
  const searchByPage = new Map(
    searchRows.map((row) => [
      `${row.activity_session_id}:${row.page_hash}`,
      row.search_episode_id,
    ]),
  );
  const llmByConversation = new Map(
    llmRows.map((row) => [
      `${row.activity_session_id}:${row.conversation_id}`,
      row.llm_episode_id,
    ]),
  );
  const candidates = [];
  for (const record of records) {
    const payload = record.event.payload;
    if (record.event.event_type === "search_results_exposed") {
      for (const result of payload.results) {
        candidates.push({
          record,
          source_type: "search",
          source_episode_id: searchByPage.get(
            `${record.activity_session_id}:${payload.page_url_hash}`,
          ),
          destination_hash: result.destination_url_hash,
          destination_hostname: result.destination_hostname,
        });
      }
    } else if (record.event.event_type === "search_result_clicked") {
      candidates.push({
        record,
        source_type: "search",
        source_episode_id: searchByPage.get(
          `${record.activity_session_id}:${payload.page_url_hash}`,
        ),
        destination_hash: payload.destination_url_hash,
        destination_hostname: payload.destination_hostname,
      });
    } else if (record.event.event_type === "llm_source_links_exposed") {
      for (const source of payload.sources) {
        candidates.push({
          record,
          source_type: "llm",
          source_episode_id: llmByConversation.get(
            `${record.activity_session_id}:${payload.conversation_id}`,
          ),
          destination_hash: source.destination_url_hash,
          destination_hostname: source.destination_hostname,
        });
      }
    }
  }
  return candidates;
}

function downstreamNavigation(
  records,
  searchRows,
  llmRows,
  linkWindowMinutes,
) {
  const windowMs = linkWindowMinutes * 60_000;
  const navigations = records.filter(
    (record) => record.event.event_type === "navigation_committed",
  );
  const links = sourceCandidates(records, searchRows, llmRows)
    .map((candidate) => {
      const sourceTime = Date.parse(candidate.record.event.created_at);
      const navigation = navigations.find(
        (record) =>
          record.activity_session_id === candidate.record.activity_session_id &&
          record.event.payload.url_hash === candidate.destination_hash &&
          Date.parse(record.event.created_at) >= sourceTime &&
          Date.parse(record.event.created_at) - sourceTime <= windowMs,
      );
      if (!navigation) {
        return null;
      }
      return {
        link_id: episodeId(
          "link",
          candidate.record,
          `${candidate.record.event.event_id}:${navigation.event.event_id}:${candidate.destination_hash}`,
        ),
        activity_session_id: candidate.record.activity_session_id,
        participant_id_hash: candidate.record.event.participant_id_hash,
        source_type: candidate.source_type,
        source_event_id: candidate.record.event.event_id,
        source_episode_id: candidate.source_episode_id,
        source_created_at: candidate.record.event.created_at,
        destination_hash: candidate.destination_hash,
        destination_hostname: candidate.destination_hostname,
        navigation_event_id: navigation.event.event_id,
        navigation_created_at: navigation.event.created_at,
        lag_seconds:
          (Date.parse(navigation.event.created_at) - sourceTime) / 1000,
      };
    })
    .filter(Boolean);
  const unique = new Map();
  for (const link of links) {
    const key = [
      link.source_episode_id,
      link.destination_hash,
      link.navigation_event_id,
    ].join(":");
    unique.set(key, link);
  }
  return [...unique.values()];
}

const TRACE_COLUMNS = [
  "trace_id",
  "activity_session_id",
  "participant_id_hash",
  "sequence",
  "created_at",
  "event_id",
  "event_type",
  "source_type",
  "page_hash",
  "hostname",
  "episode_id",
];

function solutionTrace(records, searchRows, llmRows) {
  const searchByPage = new Map(
    searchRows.map((row) => [
      `${row.activity_session_id}:${row.page_hash}`,
      row.search_episode_id,
    ]),
  );
  const llmByConversation = new Map(
    llmRows.map((row) => [
      `${row.activity_session_id}:${row.conversation_id}`,
      row.llm_episode_id,
    ]),
  );
  return records
    .filter(
      (record) =>
        SEARCH_TYPES.has(record.event.event_type) ||
        LLM_TYPES.has(record.event.event_type) ||
        KNOWLEDGE_TYPES.has(record.event.event_type) ||
        record.event.event_type === "navigation_committed",
    )
    .map((record) => {
      const payload = record.event.payload;
      const linkedEpisode =
        searchByPage.get(
          `${record.activity_session_id}:${payload.page_url_hash}`,
        ) ??
        llmByConversation.get(
          `${record.activity_session_id}:${payload.conversation_id}`,
        ) ??
        null;
      return {
        trace_id: episodeId("trace", record, record.event.event_id),
        activity_session_id: record.activity_session_id,
        participant_id_hash: record.event.participant_id_hash,
        sequence: record.activity_sequence,
        created_at: record.event.created_at,
        event_id: record.event.event_id,
        event_type: record.event.event_type,
        source_type: sourceTypeFor(record),
        page_hash: pageHash(payload),
        hostname: hostname(payload),
        episode_id: linkedEpisode,
      };
    });
}

export function transformRecords(
  records,
  { linkWindowMinutes = DEFAULT_LINK_WINDOW_MINUTES } = {},
) {
  const searchRows = searchEpisodes(records);
  const llmRows = llmEpisodes(records);
  const tables = {
    events_clean: {
      columns: EVENTS_CLEAN_COLUMNS,
      rows: cleanEvents(records),
    },
    page_views: {
      columns: PAGE_VIEW_COLUMNS,
      rows: pageViews(records),
    },
    search_episodes: {
      columns: SEARCH_EPISODE_COLUMNS,
      rows: searchRows,
    },
    llm_episodes: {
      columns: LLM_EPISODE_COLUMNS,
      rows: llmRows,
    },
    knowledge_exposures: {
      columns: KNOWLEDGE_EXPOSURE_COLUMNS,
      rows: knowledgeExposures(records),
    },
    downstream_navigation: {
      columns: DOWNSTREAM_COLUMNS,
      rows: downstreamNavigation(
        records,
        searchRows,
        llmRows,
        linkWindowMinutes,
      ),
    },
    solution_assembly_trace: {
      columns: TRACE_COLUMNS,
      rows: solutionTrace(records, searchRows, llmRows),
    },
  };
  return tables;
}
