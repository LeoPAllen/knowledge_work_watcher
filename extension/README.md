# Extension Shell

This directory contains a dependency-free Chrome Manifest V3 shell. It has no
host permissions, content scripts, telemetry, storage, or network behavior.

## Load Unpacked

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this repository's `extension/` directory.
5. Open the toolbar popup and the options page.

The popup must show inactive consent and capture. Options are disabled
placeholders and do not save or transmit values.

## Check

From the repository root:

```sh
node extension/scripts/check-manifest.mjs
```
