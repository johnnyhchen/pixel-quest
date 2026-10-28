#!/usr/bin/env bash
# Installs the Codex and agy side of Pixel Quest. (Claude Code installs through /plugin; see README.)
#   ./install.sh          engine + quest CLI + Codex skill/hooks + agy plugin
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
PQ_HOME="$HOME/.local/share/pixel-quest"
BIN="$HOME/.local/bin"

mkdir -p "$PQ_HOME" "$BIN"
cp "$SRC"/engine/* "$PQ_HOME/"
chmod +x "$PQ_HOME/hook" "$PQ_HOME"/*.mjs
cp "$SRC/bin/quest" "$BIN/quest"
chmod +x "$BIN/quest"
echo "engine -> $PQ_HOME, quest -> $BIN/quest"

if [[ -d "$HOME/.codex" ]]; then
  mkdir -p "$HOME/.codex/skills/quest"
  cp "$SRC/codex/skills/quest/SKILL.md" "$HOME/.codex/skills/quest/"
  hooks="$(sed "s#__PIXEL_QUEST_HOME__#$PQ_HOME#g" "$SRC/codex/hooks.json")"
  if [[ -e "$HOME/.codex/hooks.json" ]]; then
    echo "Codex: ~/.codex/hooks.json already exists, so it was left alone. Merge these hooks into it:"
    echo "$hooks"
  else
    echo "$hooks" > "$HOME/.codex/hooks.json"
    echo "Codex: skill + ~/.codex/hooks.json installed. Trust the hooks when Codex asks (or in /hooks)."
  fi
fi

if [[ -d "$HOME/.gemini" ]]; then
  mkdir -p "$HOME/.gemini/config/plugins"
  rm -rf "$HOME/.gemini/config/plugins/pixel-quest"
  cp -R "$SRC/agy/pixel-quest" "$HOME/.gemini/config/plugins/"
  echo "agy: plugin installed at ~/.gemini/config/plugins/pixel-quest. Restart agy to load it."
fi

case ":$PATH:" in *":$BIN:"*) ;; *) echo "Add $BIN to your PATH to use \`quest\`." ;; esac
echo "Done. Open a terminal split and run: quest"
