# Live Parser Validation

Run at the exact pilot commit before distribution, after a supported site
changes, and at least weekly during an active pilot. Use only synthetic,
harmless content and a dedicated test participant.

## Setup

- [ ] Record date, commit, Chrome version, extension ID, and backend URL
- [ ] Confirm baseline capture/upload are active and queue starts empty
- [ ] Confirm pause/revoke and denied/private checks still work
- [ ] Do not upload files, paste secrets, or use personal accounts when avoidable

## LLM Sites

Use this prompt on ChatGPT, Claude, Gemini, Perplexity, and Copilot:

> Name two public documentation sites for learning JavaScript. Include links.

Expect:

- `llm_prompt_observed`
- `llm_response_observed`
- `llm_response_text_observed`
- `llm_source_links_exposed` when links are visible
- `llm_interaction_metadata`

Verify visible response text is capped/redacted, links are allowlist-filtered,
and `sensitive_llm_response_text.csv` contains only expected synthetic text.

## Search Sites

Search Google, Bing, and DuckDuckGo for:

> JavaScript Array map MDN

Expect:

- `search_query_observed`
- `search_results_exposed`
- `search_snippet_observed`
- `search_result_full_url_observed` for allowed destinations
- `search_result_clicked` when an inferred supported result is opened

Inspect `sensitive_search_snippets.csv` and
`sensitive_search_full_urls.csv`. Confirm tracking and credential-like query
parameters are absent.

## Knowledge Sites

| Site | Harmless page/action | Expected event |
| --- | --- | --- |
| Stack Overflow | Public question about JavaScript arrays | `qna_question_exposed`, optional answer events |
| GitHub | Public repository `mdn/content` | `code_repo_exposed` |
| MDN | `Array.prototype.map()` reference | `docs_page_exposed` |
| Wikipedia | `JavaScript` article | `docs_page_exposed` |

Expect `knowledge_page_exposed` where applicable. Confirm no question/answer
body, code, README body, article text, comments, or private repository content.

## Failure And Drift Triage

- `parser_error`: record site, parser version, safe code, and page hash only.
- `parser_degraded`: compare parsed/missing/degraded counts with the prior run.
- Never save raw DOM, page source, account UI, or participant content for triage.
- Reproduce with a synthetic fixture and add the narrowest selector fallback.
- If extraction becomes broad, private, or misleading, stop that pilot workflow.
- Re-run parser, privacy, backend, ETL, E2E, and package checks after a fix.

## Completion

- [ ] All twelve sites tested or an explicit supported-site exception recorded
- [ ] Expected event types present with no unexpected fields
- [ ] Sensitive ETL outputs isolated from minimized exports
- [ ] No raw DOM, hidden text, uploads, tokens, credentials, or denied data
- [ ] Pause/revoke immediately stop capture
- [ ] Results and failures copied into `manual-validation-log.md`
