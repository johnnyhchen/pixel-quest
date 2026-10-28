// Shared state between the hook ingest (one short process per agent event) and the viewer.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DIR = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'pixel-quest')
export const STATE = path.join(DIR, 'state.json')
export const PREFS = path.join(DIR, 'prefs.json')
export const PID = path.join(DIR, 'viewer.pid')
export const DEBUG_FLAG = path.join(DIR, 'debug')
export const DEBUG_LOG = path.join(DIR, 'events.log')

export const MAX_HP = 5

export const initialState = () => ({
  harness: 'claude',
  scene: 'tavern',
  caption: 'Resting at the Rusty Tankard. Awaiting a quest…',
  monster: 'bug',
  sages: false,
  busy: false,
  critique: false,
  inflight: 0,
  at: Date.now(),
  lastToolAt: 0,
  victoryAt: 0,
  hurtUntil: 0,
  stats: { xp: 0, slain: 0, quests: 0, hp: MAX_HP },
})

export const readJson = (file, fallback) => {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) }
  } catch {
    return fallback
  }
}

// Atomic replace so the viewer never reads a half-written file.
export const writeJson = (file, value) => {
  fs.mkdirSync(DIR, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value))
  fs.renameSync(tmp, file)
}

export const readState = () => {
  const s = readJson(STATE, initialState())
  s.stats = { ...initialState().stats, ...s.stats }
  return s
}

export const readPrefs = () => readJson(PREFS, { size: 'medium', align: 'left' })
