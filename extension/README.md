# Extension Shell

This directory contains a dependency-free Chrome Manifest V3 extension. It has
no host permissions, content scripts, page-text capture, or network behavior.
The `storage` permission supports a bounded local queue. The `webNavigation`
permission supplies committed top-frame URLs, which are filtered and minimized
before local storage.

## Load Unpacked

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this repository's `extension/` directory.
5. Open the toolbar popup and the options page.

The popup shows active, paused, or off control state. Options manage local
configuration, placeholder consent, ambient state, and pause/resume. The debug
section can create synthetic events only when local debug mode is enabled, and
can always count, export, or clear the queue.

When capture is active, allowlisted top-frame navigation plus related tab/window
signals are queued locally. Raw URLs, queries, fragments, titles, and denied
page details are not stored. Nothing is transmitted.

## Manual Privacy Check

1. Load the unpacked extension and open its options page.
2. Set a synthetic participant ID, accept placeholder consent, and enable
   ambient capture.
3. Visit `https://en.wikipedia.org/wiki/Knowledge_worker`.
4. Visit a denied demo page such as `https://docs.google.com/`.
5. Export local logs from options.
6. Verify the allowed record has a hostname and URL hash but no raw URL/title.
7. Verify the denied record is only `capture_skipped` policy metadata.

## Checks

From the repository root:

```sh
node extension/scripts/check-manifest.mjs
node --test extension/tests/*.test.mjs
```
