# Pixel Quest

A retro RPG pixel-art scene that acts out what your coding agent is doing. The hero rests at the tavern or the campfire when things are idle. Reading and searching send them through the forest, and web research means riding out across open country. Reviews take them to the library with the council of sages. Edits are battles with bugs, test and build runs wake the Trial Dragon, and every finished turn ends at a treasure chest. Stats carry across sessions: XP, bugs slain, quests completed and hearts lost to errors.

It works with three agents:

- **Claude Code**: a mod that draws a pane inside the TUI. It stays off until you run `/quest` in a session.
- **Codex CLI** and **agy (Antigravity CLI)**: neither has a pane API, so a small viewer runs in a terminal split beside the agent. Hooks in each agent feed it what's happening.

Requires Node 18+ and a truecolor terminal (Ghostty, iTerm2, WezTerm, kitty and others).

## Claude Code

```
/plugin install pixel-quest --marketplace johnnyhchen/pixel-quest
```

Then, in any session:

```
/quest                      open the pane
/quest small|medium|large   resize it
/quest left|right           pick a side
/quest close                close it
```

## Codex and agy

```
git clone https://github.com/johnnyhchen/pixel-quest
cd pixel-quest && ./install.sh
```

This installs the engine to `~/.local/share/pixel-quest`, the `quest` command to `~/.local/bin`, a Codex `quest` skill with hooks in `~/.codex/hooks.json`, and an agy plugin in `~/.gemini/config/plugins/pixel-quest`. If you already have a `~/.codex/hooks.json`, the installer prints the hooks to merge rather than overwriting it. Codex runs hooks only after you trust them, so approve them when it asks.

Open a terminal split and run `quest`. One viewer follows every Codex and agy session, and the hero's tunic shows which agent is working: teal for Codex, blue for agy. You can also ask the agent to run `$quest` (Codex) or `/quest` (agy).

```
quest [small|medium|large] [left|right]   run the viewer, or retune a running one
quest close | status | reset              stop it, show state, reset stats
quest debug on|off                        log raw hook payloads, for tuning
```

In tmux, `quest` run from an agent opens its own split.

### How the Codex/agy side works

Each hook event runs `engine/hook`, which turns it into a scene change in `~/.local/state/pixel-quest/state.json`. The viewer redraws eight times a second with `▀` half blocks and handles the timed transitions itself: the victory fade, swapping between the idle scenes, and pondering when the agent has been quiet for a few seconds.

agy's `PreToolUse` hook has to return a permission decision, so Pixel Quest hooks `PostToolUse` only. That means agy scenes change when a tool finishes rather than when it starts. Hooks never block the agent or change what it does.

## License

MIT
