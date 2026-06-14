# Extension Shell

This directory contains a runtime dependency-free Chrome Manifest V3 extension.
It has no broad page-text capture. Narrow content scripts
parse named elements on supported search and LLM tools. The `storage` permission
supports a bounded local queue; `webNavigation` supplies committed top-frame
URLs. Optional upload uses exact runtime host grants and the `alarms` permission.

## Load Unpacked

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this repository's `extension/` directory.
5. Open the toolbar popup and the options page.

The popup shows active, paused, or off control state. Options manage local
configuration, placeholder consent, ambient state, and pause/resume. The debug
section can create synthetic events, inspect queue/rejection counts, export
records, clear local storage, and start a manual sync.

When baseline capture is active, the study profile always records visible LLM
assistant responses, visible search snippets, and normalized full search-result
URLs in explicit expanded events. No per-field toggles exist. Install/use only
after completing the external study consent flow.

Text is redacted and capped; full URLs require an allowed destination and have
tracking/credential parameters removed. Raw DOM, hidden nodes, profiles,
uploads, attachments, passwords, tokens, cookies, and denied/private pages
remain excluded.

Knowledge-site parsers add titles/headings and structured Q&A, public GitHub,
package, documentation, and Wikipedia metadata. Full page bodies are excluded.

Upload is disabled by default. It requires consent, active ambient capture, a
write-only study token, and permission for the configured HTTPS server.
Loopback HTTP is permitted for development. Failures preserve queued events;
explicit server rejections create metadata-only local records.

## Study-Build Live Checklist

1. Configure a synthetic participant, activate baseline capture, and confirm no
   separate response/snippet/URL toggles appear.
2. Validate ChatGPT, Claude, Gemini, Perplexity, and Copilot response events.
3. Validate Google, Bing, and DuckDuckGo snippet and full-URL events.
4. Confirm parser name/version, selector family, confidence, caps, and
   redaction metadata are present.
5. Pause and revoke capture; confirm expanded events stop immediately.
6. Trigger a fixture/live selector miss and confirm only safe parser
   error/degraded metadata is queued.
7. Export logs and confirm no raw DOM, hidden fields, profiles, uploads,
   attachments, cookies, passwords, tokens, or denied/private page data.

## Manual Upload Check

1. Load the extension, note its ID, and set `.env` with a synthetic token and
   `KWW_CORS_ALLOWED_ORIGIN=chrome-extension://<extension-id>`.
2. Run `set -a; source .env; set +a; npm run backend:start`.
3. In options, set `http://localhost:3000`, the same token, consent, active
   ambient capture, local debug mode, and upload enabled.
4. Create a synthetic event, select **Sync now**, and verify the queue decreases.
5. Inspect `backend/data/events.sqlite` and verify the synthetic event exists.
6. Pause capture, create another event, and verify sync leaves it queued.

## Checks

From the repository root:

```sh
npm ci
npm run check:manifest
npm test
npm run package:extension
```

The package command writes a review-only ZIP under ignored `dist/`. It contains
only `manifest.json` and runtime `src/` files; it is not a store release.
