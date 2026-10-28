#!/usr/bin/env node
// Hook ingest: `hook.mjs <codex|agy> <event>` with the harness's hook payload on stdin.
// Turns one agent event into a scene change in state.json. Never blocks or fails the agent:
// Codex gets no stdout (a no-op), agy gets `{}`.
import fs from 'node:fs'

import { DEBUG_FLAG, DEBUG_LOG, MAX_HP, readState, writeJson, STATE } from './state.mjs'

const [harness = 'codex', event = ''] = process.argv.slice(2)

const done = () => {
  if (harness === 'agy') process.stdout.write('{}\n')
  process.exit(0)
}
setTimeout(done, 2000).unref()

const base = p => (typeof p === 'string' && p ? p.split('/').pop() || p : 'a scroll')
const clip = (s, n = 36) => {
  const text = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''
  return text.length > n ? `${text.slice(0, n - 1)}…` : text
}
const host = url => {
  try {
    return new URL(String(url)).host
  } catch {
    return 'distant lands'
  }
}

const CRITIQUE = /\b(review|critique|critic|adversarial|audit|assess|scrutini[sz]e|second opinion)\b/i
const TRIAL = /\b(test|build|tsc|lint|pytest|jest|vitest|dotnet|cargo|go test|make|gradle|mvn)\b/
const SCOUT = /^\s*(cat|sed -n|head|tail|less|bat|rg|grep|find|fd|ls|tree|wc|jq|git (log|show|diff|status|blame|grep))\b/
const RIDE = /^\s*(curl|wget|gh|az|kubectl|http)\b/

// A shell command, by what it looks like it is doing.
const shell = (cmd, critique) => {
  const c = String(cmd ?? '')
  if (TRIAL.test(c)) return { scene: 'boss', caption: `The Trial Dragon awakens: ${clip(c, 30)}` }
  if (SCOUT.test(c))
    return critique
      ? { scene: 'library', caption: `Searching the stacks: ${clip(c, 30)}` }
      : { scene: 'forest', caption: `Scouting the Whispering Woods: ${clip(c, 26)}` }
  if (RIDE.test(c)) return { scene: 'country', caption: `Riding out: ${clip(c, 30)}` }
  return { scene: 'battle', monster: 'slime', caption: `Casting a shell spell: ${clip(c, 30)}` }
}

const patchFile = text => /\*\*\* (?:Update|Add|Delete) File: ([^\s"\\]+)/.exec(String(text ?? ''))?.[1]

const firstPath = args => {
  for (const [k, v] of Object.entries(args ?? {})) if (/path|file|uri/i.test(k) && typeof v === 'string') return v
}

// Codex: Claude-style hook payloads. Code-mode wraps calls in an `exec` script, so scan its text too.
const classifyCodex = (tool, input, critique) => {
  const text = typeof input === 'string' ? input : JSON.stringify(input ?? {})
  if (tool === 'apply_patch' || tool === 'Edit' || tool === 'Write' || /apply_patch/.test(tool + text.slice(0, 200)))
    return { scene: 'battle', monster: 'bug', caption: `Battling bugs in ${base(input?.file_path ?? patchFile(input?.command ?? input?.patch ?? text))}` }
  if (/^(Bash|shell|exec_command|local_shell|unified_exec)$/.test(tool)) {
    const cmd = Array.isArray(input?.command) ? input.command.join(' ') : (input?.command ?? input?.cmd)
    return shell(cmd, critique)
  }
  if (/web_search/i.test(tool + text.slice(0, 200))) return { scene: 'country', caption: `Riding out to ask about ${clip(input?.query, 30)}` }
  if (/spawn_agent/.test(tool + text.slice(0, 200))) {
    const name = input?.task_name ?? /task_name["\s:]+["']?([\w-]+)/.exec(text)?.[1] ?? 'companion'
    return CRITIQUE.test(name)
      ? { scene: 'library', sages: true, caption: `The council of sages convenes (${name})` }
      : { scene: 'party', caption: `A ${name} joins the party` }
  }
  if (tool === 'exec') {
    const cmd = /exec_command\(\{\s*cmd:\s*("(?:[^"\\]|\\.)*")/.exec(text)?.[1]
    if (cmd) return shell(JSON.parse(cmd), critique)
    if (/tools\.mcp__/.test(text)) return { scene: 'country', caption: `Sending a raven: ${clip(/tools\.(mcp__\w+)/.exec(text)?.[1], 30)}` }
  }
  if (/^mcp__/.test(tool)) return { scene: 'country', caption: `Sending a raven: ${clip(tool, 30)}` }
}

// agy: tool names like read_file/write_file/run_command (seen live: read_file with a PascalCase `Path` arg).
const classifyAgy = (tool, args, critique) => {
  const file = firstPath(args)
  if (/run_command|shell|command/.test(tool))
    return shell(args?.CommandLine ?? args?.Command ?? args?.command ?? Object.values(args ?? {}).find(v => typeof v === 'string'), critique)
  if (/web/.test(tool) && /search/.test(tool)) return { scene: 'country', caption: `Riding out to ask about ${clip(args?.query ?? args?.Query, 30)}` }
  if (/url|browser|fetch/.test(tool)) return { scene: 'country', caption: `Journeying to ${host(args?.Url ?? args?.url ?? args?.Uri)}` }
  if (/write|edit|replace|create_file|delete_file|move_file|code_action|propose_code|file_change/.test(tool))
    return { scene: 'battle', monster: 'bug', caption: `Battling bugs in ${base(file)}` }
  if (/^(read_|view_|list_dir)/.test(tool))
    return critique
      ? { scene: 'library', caption: `Studying ${base(file)} in the archives` }
      : { scene: 'forest', caption: `Scouting ${base(file)} in the Whispering Woods` }
  if (/search|find|grep|glob/.test(tool)) {
    const q = args?.Query ?? args?.Pattern ?? args?.SearchPattern ?? 'tracks'
    return critique
      ? { scene: 'library', caption: `Searching the stacks for ${clip(q, 28)}` }
      : { scene: 'forest', caption: `Tracking ${clip(q, 28)} through the forest` }
  }
  if (/critique|code_review|findings/.test(tool)) return { scene: 'library', sages: true, caption: 'The council of sages convenes' }
  if (/subagent/.test(tool)) return { scene: 'party', caption: `A companion joins the party` }
  if (tool === 'mcp_tool') return { scene: 'country', caption: 'Sending a raven to a distant tower' }
}

const failedCodex = r => {
  if (r && typeof r === 'object') {
    const code = r.exit_code ?? r.exitCode ?? r.metadata?.exit_code
    return r.is_error === true || r.isError === true || r.success === false || (typeof code === 'number' && code !== 0)
  }
  return typeof r === 'string' && /^\s*(exit code|process exited with code):? *[1-9]/i.test(r.slice(0, 200))
}

const setScene = (s, picked) => {
  s.scene = picked.scene
  s.caption = picked.caption
  if (picked.monster) s.monster = picked.monster
  s.sages = picked.sages ?? s.critique
}

const turnStart = (s, prompt) => {
  s.busy = true
  s.inflight = 0
  s.critique = CRITIQUE.test(prompt ?? '')
  s.lastToolAt = Date.now()
  if (s.critique) setScene(s, { scene: 'library', sages: true, caption: 'Retreating to the library to weigh the evidence…' })
  else setScene(s, { scene: 'pondering', caption: prompt ? `A new quest: ${clip(prompt, 30)}` : 'The quest continues…' })
}

const turnEnd = s => {
  s.busy = false
  s.critique = false
  s.inflight = 0
  s.victoryAt = Date.now()
  setScene(s, { scene: 'victory', caption: 'Quest complete! Treasure acquired.' })
  s.stats.quests++
  s.stats.hp = MAX_HP
}

const toolDone = (s, failed, slew, tool) => {
  s.inflight = Math.max(0, s.inflight - 1)
  s.lastToolAt = Date.now()
  s.stats.xp++
  if (slew) s.stats.slain++
  if (failed) {
    s.stats.hp = Math.max(1, s.stats.hp - 1)
    s.hurtUntil = Date.now() + 2000
    setScene(s, { scene: 'boss', caption: `A wild error appears in ${tool}! Debugging…` })
  }
}

const ingest = (s, e) => {
  s.harness = harness
  if (harness === 'codex') {
    const tool = String(e.tool_name ?? '')
    switch (event) {
      case 'UserPromptSubmit':
        return turnStart(s, e.prompt)
      case 'PreToolUse': {
        s.busy = true
        s.inflight++
        s.lastToolAt = Date.now()
        const picked = classifyCodex(tool, e.tool_input, s.critique)
        if (picked) setScene(s, picked)
        return
      }
      case 'PostToolUse': {
        const failed = failedCodex(e.tool_response)
        return toolDone(s, failed, !failed && classifyCodex(tool, e.tool_input, false)?.monster === 'bug', tool)
      }
      case 'Stop':
        return turnEnd(s)
    }
  } else {
    const tool = String(e.toolCall?.name ?? '')
    switch (event) {
      case 'PreInvocation':
        // agy has no prompt-submit event: a turn's first model call (invocationNum 0) starts it.
        if (e.invocationNum === 0 || !s.busy) turnStart(s, e.lastUserInput)
        s.lastToolAt = Date.now()
        return
      case 'PostToolUse': {
        // agy's PreToolUse must return a permission decision, so scenes switch as each tool finishes.
        s.busy = true
        const picked = classifyAgy(tool, e.toolCall?.args, s.critique)
        if (picked) setScene(s, picked)
        const failed = typeof e.error === 'string' && e.error !== ''
        s.inflight++
        return toolDone(s, failed, !failed && picked?.monster === 'bug', tool)
      }
      case 'Stop':
        return turnEnd(s)
    }
  }
}

const chunks = []
process.stdin.on('data', d => chunks.push(d))
process.stdin.on('end', () => {
  try {
    const raw = Buffer.concat(chunks).toString('utf8')
    const e = raw.trim() ? JSON.parse(raw) : {}
    if (fs.existsSync(DEBUG_FLAG)) fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${harness} ${event} ${raw.slice(0, 1500).replace(/\n/g, ' ')}\n`)
    const s = readState()
    ingest(s, e)
    s.at = Date.now()
    writeJson(STATE, s)
  } catch {
    // A broken quest pane must never break the agent.
  }
  done()
})
