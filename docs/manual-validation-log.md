# Manual Validation Log

Copy this template into the restricted operational record for each run. Do not
record tokens, participant mappings, raw payloads, or real participant data in
this repository.

## Run

- Date/time:
- Operator:
- Commit hash:
- Package checksum:
- Chrome version:
- Extension ID:
- Backend URL:
- Synthetic participant hash prefix:

## Commands

- [ ] `npm ci`
- [ ] `npm test`
- [ ] `npm run check`
- [ ] `npm run verify:e2e`
- [ ] `npm run package:extension`
- Other:

## Manual Checks

- Backend direct POST accepted/rejected:
- Extension sync accepted/rejected:
- Queue before/after:
- Pause/revoke:
- Denied/private page:
- Backup/restore:
- Withdrawal dry run:

## Sites Tested

- LLM: ChatGPT / Claude / Gemini / Perplexity / Copilot
- Search: Google / Bing / DuckDuckGo
- Knowledge: Stack Overflow / GitHub / MDN / Wikipedia
- Parser errors/degraded:

## Counts

- Backend rows by event type:
- Sensitive event count:
- ETL input rows:
- ETL output rows:
- Unexpected or missing rows:

## Outcome

- Result: pass / conditional / fail
- Failures:
- Privacy observations:
- Next action:
- Go/no-go owner decision:
