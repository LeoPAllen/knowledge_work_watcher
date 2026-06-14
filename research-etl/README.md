# Research ETL

The dependency-free Node ETL reads synthetic JSONL or backend SQLite events and
writes deterministic CSV tables. It validates schema versions 1 and 2, duplicate IDs,
timestamps, denied/private leakage, and secret-like output values before write.

Session rules:

- sort by participant hash, extension session, timestamp, and event ID;
- start a new activity session after more than 30 minutes of inactivity;
- link search results/clicks and LLM sources to matching navigation URL hashes
  in the same activity session within 30 minutes; and
- classify sources as search, LLM, Q&A, docs, code, encyclopedia, or other.

Study-expanded fields are isolated in:

- `sensitive_llm_response_text.csv`
- `sensitive_search_snippets.csv`
- `sensitive_search_full_urls.csv`

Run the reviewed synthetic fixture:

```sh
npm run etl:synthetic
```

Run another JSONL, NDJSON, SQLite, or DB input:

```sh
npm run etl -- --input path/to/events.sqlite --output research-exports/run
```

Generated exports belong under ignored `research-exports/`. Never use or commit
real participant data in this repository.

Withdrawal requires deleting or regenerating affected exports; see
[data-retention-withdrawal.md](../docs/data-retention-withdrawal.md).
