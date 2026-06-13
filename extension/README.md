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

The popup must show inactive consent and capture. Study options remain disabled.
The developer section can create, count, export, and clear synthetic events.

## Checks

From the repository root:

```sh
node extension/scripts/check-manifest.mjs
node --test extension/tests/*.test.mjs
```
