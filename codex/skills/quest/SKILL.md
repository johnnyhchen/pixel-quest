---
name: quest
description: Open, resize or close the Pixel Quest pane, a retro RPG pixel-art scene that acts out what the agent is doing (tavern when idle, forest for reading, battles for edits, a dragon for tests). Use only when the user invokes $quest or asks to open, close, resize or check the quest/pixel pane.
---

# Pixel Quest

The scene is drawn by a separate viewer process in its own terminal split; hooks in `~/.codex/hooks.json` feed it. This skill only drives the `quest` command.

Arguments (any order): `small|medium|large`, `left|right`, or one of `close`, `status`, `reset`, `debug on|off`.

1. Run `quest <args>` in the shell exactly once, passing the user's arguments through (none is fine).
2. Relay its output in one line. If it says no viewer is running and there's no terminal to draw in, tell the user: open a split (Ghostty: cmd+D) and run `quest` there; it follows every Codex and agy session from then on.
3. If the pane opens but never changes scene, the hooks probably aren't trusted yet: tell the user to approve the pixel-quest hooks in `/hooks`.

Don't edit the viewer or hooks from this skill.
