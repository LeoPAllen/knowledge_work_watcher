# Extension Shell

This directory contains a dependency-free Chrome Manifest V3 extension. It has
no host permissions, content scripts, browsing capture, or network behavior.
The `storage` permission supports a bounded local queue for validated extension
metadata and synthetic test events.

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

These controls do not capture browsing activity or transmit data.

## Checks

From the repository root:

```sh
node extension/scripts/check-manifest.mjs
node --test extension/tests/*.test.mjs
```
