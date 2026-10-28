# Pixel Quest

A retro RPG pixel-art scene that acts out what your coding agent is doing.

| What the agent is doing | Scene |
|---|---|
| Idle (switches every 90s) | **The Rusty Tankard**: the hero sips ale across from a wizard who hums little music notes. A barkeep polishes mugs, a cat sleeps by the fireplace, and stars twinkle through the window.<br>**Campfire**: the hero toasts a marshmallow that slowly browns. The wizard's pipe glows, the ranger snores in a bedroll, and sparks rise under the moon. |
| Reading or searching code | Walking through the **Whispering Woods** with parallax pines and snowy peaks |
| Web search or fetch | **Open country**: fences, rolling hills, wildflowers and a spinning windmill |
| A subagent is launched | The **party** marches together: ranger, wizard and hero |
| Critique or review | **The library**: candlelit desk, page flips, dust motes, a blinking owl, and a wizard sage for review agents |
| Editing files | **Battling bugs** (purple beetles). The hero swings, the bug flashes white and is knocked back, and every third one bursts into a puff with gold coins. |
| Shell commands | Same fight, but against slimes |
| Tests or builds, or any failed tool call | **Dungeon boss**: the Trial Dragon breathes fire at the hero's shield, and the hero flashes red when hurt |
| Thinking between tool calls | The hero at a crossroads signpost with a "?" bubble |
| Turn finished | **Victory**: a treasure chest opens, sparkles fly and the hero jumps for joy, then it's back to the tavern |

Below the picture is a caption, like "Battling bugs in Program.cs", and a small status bar: level, hearts (errors cost one, finishing a turn restores them), XP, bugs slain and quests done. Stats carry across sessions.

A turn counts as critique when your prompt mentions review, critique, audit or adversarial, or when the agent launches a reviewer. In those turns, reading and searching code show the library instead of the forest.

Codex and agy often read code through the shell, so their shell commands are sorted by what they look like: `cat`, `rg`, `git log` and the like go to the forest, `curl` and `gh` ride out to open country, test and build commands wake the dragon, and anything else fights slimes.

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
