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

When capture is active, allowlisted top-frame navigation plus related tab/window
signals are queued locally. Supported search pages may also queue a redacted
query, result rank/title/type, and destination hostname/hash. Snippets, raw
URLs, DOM, account data, and denied destination details are not stored.
LLM pages may queue redacted prompts, response metadata, model labels, and
source hostname/hashes. Response text and attachments are excluded.

Knowledge-site parsers add titles/headings and structured Q&A, public GitHub,
package, documentation, and Wikipedia metadata. Full page bodies are excluded.

Upload is disabled by default. It requires consent, active ambient capture, a
write-only study token, and permission for the configured HTTPS server.
Loopback HTTP is permitted for development. Failures preserve queued events;
explicit server rejections create metadata-only local records.

## Manual Privacy Check

1. Load the unpacked extension and open its options page.
2. Set a synthetic participant ID, accept placeholder consent, and enable
   ambient capture.
3. Visit `https://en.wikipedia.org/wiki/Knowledge_worker`.
4. Visit a denied demo page such as `https://docs.google.com/`.
5. Export local logs from options.
6. Verify the allowed record has a hostname and URL hash but no raw URL/title.
7. Verify the denied record is only `capture_skipped` policy metadata.
8. Search a synthetic phrase on Google, Bing, or DuckDuckGo.
9. Export again and verify search events contain no snippets or full URLs.

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
npm install
npm run check:manifest
npm test
```
