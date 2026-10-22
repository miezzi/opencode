#!/usr/bin/env bash
# Builds the sidebar fork as an "OpenCode Dev" AppImage.
#
# The bundled CLI decides which background service the app talks to: if its version differs from the
# service the official app is running, the fork restarts that shared service. Copy the CLI from the
# installed official app so both agree, and rebuild after the official app updates.
set -euo pipefail

cd "$(dirname "$0")/.."

CLI_SOURCE="${OPENCODE_CLI_SOURCE:-/opt/OpenCode/resources/opencode-cli}"
CLI_VERSION_SOURCE="${CLI_SOURCE}.version"
DESKTOP="packages/desktop"

# `bun run build` triggers the package `prebuild` hook, which downloads the dev CLI, so the official one is
# copied afterwards and before packaging.
(cd "$DESKTOP" && bun run build)

if [[ -x "$CLI_SOURCE" && -f "$CLI_VERSION_SOURCE" ]]; then
  cp "$CLI_SOURCE" "$DESKTOP/resources/opencode-cli"
  cp "$CLI_VERSION_SOURCE" "$DESKTOP/resources/opencode-cli.version"
  chmod +x "$DESKTOP/resources/opencode-cli"
  echo "Bundled CLI $("$DESKTOP/resources/opencode-cli" --version) from $CLI_SOURCE"
else
  echo "warning: no CLI at $CLI_SOURCE; keeping the dev CLI download" >&2
fi

(cd "$DESKTOP" && bunx electron-builder --linux AppImage --config electron-builder.config.ts)

APPIMAGE="$DESKTOP/dist/opencode-desktop-linux-x86_64.AppImage"
INSTALL="$HOME/Apps/OpenCode-Dev.AppImage"

# The desktop entry launches this path, so a rebuild that stops at dist/ would keep opening the old build.
# Copy beside the target and rename over it: a running AppImage keeps its inode, and `cp` onto a running
# binary fails with "Text file busy".
mkdir -p "$(dirname "$INSTALL")"
cp "$APPIMAGE" "$INSTALL.new"
chmod +x "$INSTALL.new"
mv -f "$INSTALL.new" "$INSTALL"

echo "AppImage: $APPIMAGE"
echo "Installed: $INSTALL"
