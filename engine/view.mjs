#!/usr/bin/env node
// Pixel Quest viewer: draws the scene in this terminal with truecolor ▀ half blocks,
// following state.json as the Codex/agy hooks rewrite it. Run it in a split beside the agent.
import fs from 'node:fs'

import { drawScene, get, MIN_LAYOUT_W, SIZES, viewRows } from './scenes.mjs'
import { MAX_HP, PID, PREFS, readPrefs, readState, STATE, DIR } from './state.mjs'

const TICK_MS = 125
const IDLE_SWAP_MS = 90 * 1000
const PONDER_AFTER_MS = 3000
const VICTORY_MS = 4000
const STALE_BUSY_MS = 10 * 60 * 1000

const IDLE = ['tavern', 'campfire']
const IDLE_CAPTION = {
  tavern: 'Resting at the Rusty Tankard. Awaiting a quest…',
  campfire: 'Telling tales by the campfire. Awaiting a quest…',
}

const out = process.stdout
if (!out.isTTY) {
  console.error('quest: the viewer needs a terminal. Run `quest` in a split pane.')
  process.exit(1)
}

fs.mkdirSync(DIR, { recursive: true })
fs.writeFileSync(PID, String(process.pid))

let restored = false
const restore = () => {
  if (restored) return
  restored = true
  out.write('\x1b[0m\x1b[?25h\x1b[?1049l')
  try {
    if (fs.readFileSync(PID, 'utf8').trim() === String(process.pid)) fs.unlinkSync(PID)
  } catch {}
}
process.on('exit', restore)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(0))
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
  process.stdin.on('data', d => {
    if (d[0] === 3 || d[0] === 113) process.exit(0) // ctrl-c or q
  })
}
out.write('\x1b[?1049h\x1b[?25l\x1b[2J')
out.on('resize', () => out.write('\x1b[2J'))

let tick = 0
let state = readState()
let prefs = readPrefs()
let stateMtime = 0
let prefsMtime = 0

const mtime = file => {
  try {
    return fs.statSync(file).mtimeMs
  } catch {
    return 0
  }
}

// What to draw now: the hooks only record events, so every timed transition happens here.
const current = now => {
  const s = state
  const busy = s.busy && now - s.at < STALE_BUSY_MS
  const mood = { party: false, monster: s.monster, hurt: now < s.hurtUntil, sages: s.sages }
  if (!busy && (s.scene !== 'victory' || now - s.victoryAt > VICTORY_MS)) {
    const idleSince = Math.max(s.at, s.victoryAt + VICTORY_MS)
    const scene = IDLE[Math.floor(Math.max(0, now - idleSince) / IDLE_SWAP_MS) % IDLE.length]
    return { scene, caption: IDLE_CAPTION[scene], mood }
  }
  const quiet = s.inflight <= 0 || now - s.lastToolAt > STALE_BUSY_MS
  if (busy && quiet && now - s.lastToolAt > PONDER_AFTER_MS && s.scene !== 'library' && now >= s.hurtUntil)
    return { scene: 'pondering', caption: 'Consulting the map at the crossroads…', mood }
  return { scene: s.scene, caption: s.caption, mood }
}

const fg = c => `\x1b[38;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m`
const bg = c => `\x1b[48;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m`
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const hearts = hp => '♥'.repeat(hp) + '♡'.repeat(Math.max(0, MAX_HP - hp))
const level = xp => Math.floor(Math.sqrt(xp / 3)) + 1
const HARNESS_LABEL = { codex: 'Codex', agy: 'agy', claude: 'Claude' }

const render = () => {
  const now = Date.now()
  const sm = mtime(STATE)
  if (sm !== stateMtime) {
    stateMtime = sm
    state = readState()
  }
  if (tick % 8 === 0) {
    const pm = mtime(PREFS)
    if (pm !== prefsMtime) {
      prefsMtime = pm
      prefs = readPrefs()
      out.write('\x1b[2J')
    }
  }
  const size = prefs.size in SIZES ? prefs.size : 'medium'
  const width = out.columns || 80
  const cols = Math.max(24, Math.min(SIZES[size].cols, width))
  const rows = viewRows(size)
  const layoutW = Math.max(cols, MIN_LAYOUT_W)
  const x0 = Math.floor((layoutW - cols) / 2)
  const y0 = SIZES[size].cropTop
  const pad = ' '.repeat(prefs.align === 'right' ? Math.max(0, width - cols) : 0)

  const { scene, caption, mood } = current(now)
  const c = drawScene(scene, layoutW, tick, mood, state.harness)
  let buf = '\x1b[H'
  for (let r = 0; r < rows; r++) {
    buf += pad
    let lastF = -1
    let lastB = -1
    for (let x = 0; x < cols; x++) {
      const top = get(c, x0 + x, y0 + 2 * r)
      const bottom = get(c, x0 + x, y0 + 2 * r + 1)
      if (top !== lastF) buf += fg((lastF = top))
      if (bottom !== lastB) buf += bg((lastB = bottom))
      buf += '▀'
    }
    buf += '\x1b[0m\x1b[K\n'
  }
  const st = state.stats
  const who = HARNESS_LABEL[state.harness] ?? state.harness
  const tally = cols >= 56 ? `XP ${st.xp} · ${st.slain} bugs slain · ${st.quests} quests · ${who}` : `⚔${st.slain} ✦${st.quests}`
  buf += `${pad}${clip(caption, cols)}\x1b[K\n`
  buf += `${pad}${fg(0xd97757)}Lv ${level(st.xp)}\x1b[0m ${fg(0xff6a6a)}${hearts(st.hp)}\x1b[0m \x1b[2m${tally}\x1b[0m\x1b[K\x1b[J`
  out.write(buf)
  tick++
}

setInterval(render, TICK_MS)
render()
