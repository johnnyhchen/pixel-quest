import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { QuestPrefs, QuestSize, QuestStats, QuestStatus, Scene } from '../types'

const PANE = 'quest'
const RASTER = 'scene'
const H = 40 // scene height in pixels; each terminal row shows two via the ▀ half block
const MIN_LAYOUT_W = 64 // scenes are laid out at least this wide, then cropped to the view
const TICK_MS = 125
const IDLE_SWAP_TICKS = (90 * 1000) / TICK_MS
const PONDER_AFTER_TICKS = 24
const VICTORY_TICKS = 32
const MAX_HP = 5

const status = atom({ plugin: 'pixel-quest', key: 'status' } as const, { scene: 'tavern', caption: 'Resting at the Rusty Tankard' } as QuestStatus, {
  shape: 'status-1',
})
const prefs = atom({ plugin: 'pixel-quest', key: 'prefs' } as const, { size: 'medium', align: 'right' } as QuestPrefs, {
  shape: 'prefs-1',
})

// Each size crops the 40px scene from the top (sky and ceiling go first) and caps its width.
const SIZES: Record<QuestSize, { cols: number; cropTop: number }> = {
  small: { cols: 48, cropTop: 12 },
  medium: { cols: 64, cropTop: 8 },
  large: { cols: 120, cropTop: 0 },
}
const viewRows = (size: QuestSize) => (H - SIZES[size].cropTop) / 2

const stats = atom({ plugin: 'pixel-quest', key: 'stats' } as const, { xp: 0, slain: 0, quests: 0, hp: MAX_HP } as QuestStats, {
  shape: 'stats-1',
})

// ---------------------------------------------------------------- pixels

type Canvas = { w: number; h: number; px: Uint32Array }

const canvas = (w: number, h: number): Canvas => ({ w, h, px: new Uint32Array(w * h) })

const put = (c: Canvas, x: number, y: number, col: number) => {
  x = Math.floor(x)
  y = Math.floor(y)
  if (x >= 0 && y >= 0 && x < c.w && y < c.h) c.px[y * c.w + x] = col
}

const get = (c: Canvas, x: number, y: number) => c.px[y * c.w + x] ?? 0

const rect = (c: Canvas, x: number, y: number, w: number, h: number, col: number) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(c, x + i, y + j, col)
}

const mix = (a: number, b: number, f: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - f) + ((b >> s) & 255) * f) << s
  return ch(16) | ch(8) | ch(0)
}

const glow = (c: Canvas, cx: number, cy: number, radius: number, col: number, strength: number) => {
  for (let y = Math.max(0, cy - radius); y < Math.min(c.h, cy + radius); y++)
    for (let x = Math.max(0, cx - radius); x < Math.min(c.w, cx + radius); x++) {
      const d = Math.hypot(x - cx, (y - cy) * 1.3) / radius
      if (d < 1) put(c, x, y, mix(get(c, x, y), col, (1 - d) * strength))
    }
}

const gradient = (c: Canvas, y0: number, y1: number, top: number, bottom: number) => {
  for (let y = y0; y < y1; y++) rect(c, 0, y, c.w, 1, mix(top, bottom, (y - y0) / Math.max(1, y1 - y0 - 1)))
}

const hash = (n: number) => {
  let x = Math.imul(n | 0, 374761393) ^ 0x9e3779b9
  x = Math.imul(x ^ (x >>> 13), 1274126177)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

const mod = (a: number, n: number) => ((a % n) + n) % n

type Palette = Record<string, number>

const sprite = (c: Canvas, rows: string[], pal: Palette, x: number, y: number, flip = false, tint?: number) => {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const col = pal[row[flip ? row.length - 1 - i : i] ?? '.']
      if (col !== undefined) put(c, x + i, y + j, tint ?? col)
    }
  })
}

const line = (c: Canvas, x: number, y: number, angle: number, len: number, col: number, tip?: number) => {
  for (let k = 0; k <= len; k++) put(c, x + Math.cos(angle) * k, y + Math.sin(angle) * k, k === len && tip ? tip : col)
}

// ---------------------------------------------------------------- sprites

const K = 0x1b1424
const SKIN = 0xf2c09a
const GOLD = 0xe8c15a
const BOOT = 0x2a1d18
const PANTS = 0x3a3550
const WHITE = 0xf4f1e8

const HERO_PAL: Palette = { H: 0x5a3420, S: SKIN, K, O: 0xd97757, D: 0x9c4a35, Y: GOLD, P: PANTS, B: BOOT }
const KEEP_PAL: Palette = { ...HERO_PAL, H: 0x9a9aa2, O: 0xe8e0d0, D: 0x6a4a3a }
const WIZ_PAL: Palette = { L: 0x3b5bdb, l: 0x27408f, Y: GOLD, S: SKIN, K, W: 0xe6e6ee, B: BOOT }
const RANGER_PAL: Palette = { G: 0x3f8f4f, g: 0x2a6036, S: SKIN, K, T: 0x7a4a24, P: PANTS, B: BOOT }

const HERO = ['..HHHH..', '.HHHHHH.', '.HSSKSK.', '.HSSSSS.', '..SSSS..', '.DOOOOD.', 'SDOOOODS', '.DYYYYD.', '.DOOOOD.']
const LEGS = {
  stand: ['..PP.PP.', '..BB.BB.'],
  walk1: ['.PP...PP', '.BB...BB'],
  walk2: ['...PPP..', '...BBB..'],
  sit: ['..PPPPP.', '.....PB.'],
}
const WIZARD = ['.....Y..', '....LL..', '...LLL..', '..LLYLL.', '.LLLLLLL', '..SSKSK.', '..SSSSS.', '..WWWWW.', '.LWWWWWL', 'LLLWWWLL', '.lLLLLl.', '.lLLLLl.']
const WIZ_LEGS = { stand: ['..BB.BB.'], walk1: ['.BB...BB'], walk2: ['...BBB..'], sit: ['..lllll.'] }
const RANGER = ['..GGGG..', '.GGGGGG.', '.GGSKSK.', '.GSSSSS.', '..GSSS..', '.gGGGGg.', 'SgGTTGgS', '.gGTGGg.', '.gGGGGg.']

const SLIME = ['...GG...', '..GGGG..', '.GGGGGG.', '.GKGGKG.', 'GGGGGGGG', '.GGGGGG.']
const SLIME_PAL: Palette = { G: 0x58c45a, K }
const BUG = [
  ['..k....k..', '...k..k...', '..VVVVVV..', '.VvVVVVvV.', 'VVVRVVRVVV', '.VVVVVVVV.', 'k.k.kk.k.k'],
  ['.k......k.', '...k..k...', '..VVVVVV..', '.VvVVVVvV.', 'VVVRVVRVVV', '.VVVVVVVV.', '.k.k..k.k.'],
]
const BUG_PAL: Palette = { k: K, V: 0x8a4fc4, v: 0xc9a2f0, R: 0xff4d4d }
const DRAGON = [
  '..........r.....',
  '.........rr..r..',
  '...RRR..rrr.rr..',
  '..RKRRR.rrrrr...',
  '.RRRRRRR.rrrr...',
  'YRRRRRRRRRrr....',
  '.WW.RRRRRRRRR...',
  '....RRRRRRRRRR..',
  '.....RRRRRRRRRR.',
  '.....RyRRRRR.RRR',
  '.....RR..RR...RR',
  '....RRR.RRR.....',
]
const DRAGON_PAL: Palette = { R: 0xc0392b, r: 0x7a1f1a, K: 0xffe14d, Y: 0x3a0a0a, W: WHITE, y: 0xe0a040 }
const OWL = [
  ['b...b', 'bbbbb', 'bWbWb', 'bbYbb', '.bbb.'],
  ['b...b', 'bbbbb', 'bbbbb', 'bbYbb', '.bbb.'],
]
const OWL_PAL: Palette = { b: 0x8a6440, W: 0xffe8a0, Y: GOLD }
const CAT = ['g.g...', 'gggggg', '.ggggg']
const ZED = ['zzz', '.z.', 'zzz']
const QUESTION = ['.q.', 'q.q', '..q', '.q.', '...', '.q.']

const walkLegs = (t: number, phase = 0) => (mod(Math.floor(t / 2) + phase, 2) === 0 ? LEGS.walk1 : LEGS.walk2)

const drawHero = (c: Canvas, x: number, y: number, legs: string[], opts: { flip?: boolean; tint?: number; pal?: Palette } = {}) =>
  sprite(c, [...HERO, ...legs], opts.pal ?? HERO_PAL, x, y, opts.flip, opts.tint)

const drawWizard = (c: Canvas, x: number, y: number, legs: string[], flip = false) => sprite(c, [...WIZARD, ...legs], WIZ_PAL, x, y, flip)

const drawRanger = (c: Canvas, x: number, y: number, legs: string[], flip = false) => sprite(c, [...RANGER, ...legs], RANGER_PAL, x, y, flip)

const zzz = (c: Canvas, x: number, y: number, t: number) => {
  for (let k = 0; k < 2; k++) {
    const p = mod(t + k * 12, 24)
    if (p < 20) sprite(c, ZED, { z: mix(0xbfc8ff, 0x000000, p / 30) }, x + p / 5 + k, y - p / 3)
  }
}

const fire = (c: Canvas, cx: number, base: number, t: number, size = 1) => {
  rect(c, cx - 4 * size, base, 8 * size, 1, 0x5a3418)
  rect(c, cx - 3 * size, base - 1, 6 * size, 1, 0x7a4a24)
  for (let i = -3 * size; i <= 3 * size; i++) {
    const h = Math.max(1, Math.round((5 + 3 * hash(i * 13 + Math.floor(t / 1) * 7)) * size - Math.abs(i) * 1.1))
    for (let k = 0; k < h; k++) {
      const f = k / h
      put(c, cx + i, base - 2 - k, f < 0.35 ? 0xffe14d : f < 0.7 ? 0xff9a2e : 0xe0402a)
    }
  }
  for (let s = 0; s < 3 * size; s++) {
    const p = mod(t * 2 + s * 9, 20)
    put(c, cx + Math.sin((t + s * 5) / 3) * 2 + s - 1, base - 6 * size - p / 2, mix(0xffc040, 0x200000, p / 20))
  }
}

const stars = (c: Canvas, maxY: number, t: number, count: number) => {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hash(i * 3 + 1) * c.w)
    const y = Math.floor(hash(i * 3 + 2) * maxY)
    put(c, x, y, mod(t + i * 7, 31) < 2 ? 0x6a6a90 : mod(i, 5) === 0 ? 0xfff2b0 : 0xd8dcff)
  }
}

// ---------------------------------------------------------------- scenes

type Mood = { party: boolean; monster: 'bug' | 'slime'; hurt: boolean; sages: boolean }

const outdoorsDay = (c: Canvas, ground: number, t: number, scroll: number, biome: 'forest' | 'country') => {
  gradient(c, 0, ground, biome === 'forest' ? 0x5fa8e8 : 0x7cc4f4, 0xd8f0f8)
  glow(c, c.w - 9, 6, 7, 0xfff4c0, 0.6)
  rect(c, c.w - 11, 4, 4, 4, 0xfff0a0)
  for (let i = 0; i < 3; i++) {
    const x = mod(i * 37 - scroll / 6, c.w + 24) - 12
    const y = 3 + i * 4
    rect(c, x, y, 8, 2, WHITE)
    rect(c, x + 2, y - 1, 4, 1, WHITE)
  }
  const far = scroll / 4
  for (let x = 0; x < c.w; x++) {
    const tri = Math.abs(mod(x + far, 26) - 13)
    const top = biome === 'forest' ? ground - 16 + tri : ground - 8 + Math.round(3 * Math.sin((x + far) / 9))
    for (let y = Math.max(0, top); y < ground; y++)
      put(c, x, y, biome === 'forest' ? (tri < 2 && y < top + 2 ? WHITE : 0x587a9a) : 0x8cc46a)
  }
  const mid = scroll / 2
  if (biome === 'forest') {
    for (let k = Math.floor(mid / 9) - 1; k < Math.floor(mid / 9) + c.w / 9 + 2; k++) {
      const x = k * 9 - mid + Math.floor(hash(k) * 4)
      const h = 9 + Math.floor(hash(k + 50) * 6)
      rect(c, x + 3, ground - 3, 2, 3, 0x5a3a20)
      for (let j = 0; j < h; j++) {
        const w = Math.floor(j / 2) + 1
        rect(c, x + 4 - w, ground - 3 - h + j, w * 2, 1, j % 3 === 0 ? 0x2f7a3a : 0x23602d)
      }
    }
  } else {
    for (let k = Math.floor(mid / 6) - 1; k < Math.floor(mid / 6) + c.w / 6 + 2; k++) {
      const x = k * 6 - mid
      rect(c, x, ground - 4, 1, 4, 0x8a6440)
      rect(c, x, ground - 3, 6, 1, 0xa07a50)
    }
    const wx = mod(c.w + 8 - mid, c.w + 60) - 20
    rect(c, wx, ground - 14, 5, 14, 0xd8c8a8)
    rect(c, wx + 1, ground - 16, 3, 2, 0xa04030)
    for (let b = 0; b < 4; b++) line(c, wx + 2, ground - 13, t * 0.25 + (b * Math.PI) / 2, 7, 0x6a5040)
  }
  rect(c, 0, ground, c.w, c.h - ground, biome === 'forest' ? 0x4a9040 : 0x6ab04a)
  rect(c, 0, ground + 3, c.w, 4, 0xc8a060)
  for (let x = 0; x < c.w; x++) {
    if (hash(Math.floor(x + scroll)) < 0.12) put(c, x, ground + 4 + Math.floor(hash(Math.floor(x + scroll) + 9) * 3), 0x9a7a48)
    const fx = Math.floor(x + scroll * 1.5)
    if (hash(fx + 400) < 0.1) put(c, x, ground + 1, 0x2f6a28)
    if (biome === 'country' && hash(fx + 800) < 0.05) put(c, x, ground + 8 + Math.floor(hash(fx) * 3), [0xff6a8a, 0xffe14d, WHITE][fx % 3] ?? WHITE)
  }
}

const journey = (c: Canvas, t: number, biome: 'forest' | 'country', mood: Mood) => {
  const ground = 30
  outdoorsDay(c, ground, t, t, biome)
  const hx = Math.floor(c.w * (mood.party ? 0.55 : 0.35))
  const bob = mod(Math.floor(t / 2), 2)
  drawHero(c, hx, ground - 6 - bob, walkLegs(t))
  if (mood.party) {
    drawWizard(c, hx - 11, ground - 8 - mod(Math.floor(t / 2) + 1, 2), [mod(Math.floor(t / 2) + 1, 2) ? WIZ_LEGS.walk1[0]! : WIZ_LEGS.walk2[0]!])
    drawRanger(c, hx - 21, ground - 6 - bob, walkLegs(t, 1))
  }
}

const pondering = (c: Canvas, t: number) => {
  const ground = 30
  outdoorsDay(c, ground, t, 0, 'country')
  const hx = Math.floor(c.w * 0.4)
  const sx = hx - 7
  rect(c, sx, ground - 10, 1, 13, 0x6a4a28)
  rect(c, sx - 4, ground - 10, 6, 2, 0xa07a48)
  rect(c, sx, ground - 7, 6, 2, 0xa07a48)
  drawHero(c, hx, ground - 6, LEGS.stand)
  put(c, hx + 8, ground - 7, WHITE)
  put(c, hx + 9, ground - 9, WHITE)
  rect(c, hx + 10, ground - 16, 9, 7, WHITE)
  rect(c, hx + 11, ground - 17, 7, 9, WHITE)
  if (mod(Math.floor(t / 12), 2) === 0) sprite(c, QUESTION, { q: 0xd97757 }, hx + 13, ground - 16)
  else for (let d = 0; d < 3; d++) if (mod(t, 9) >= d * 3) put(c, hx + 12 + d * 2, ground - 12, 0xd97757)
}

const campfire = (c: Canvas, t: number) => {
  const ground = 30
  gradient(c, 0, ground, 0x0b1030, 0x2e2756)
  stars(c, ground - 6, t, Math.floor(c.w / 3))
  rect(c, c.w - 13, 3, 6, 6, 0xf4f0d8)
  rect(c, c.w - 14, 4, 8, 4, 0xf4f0d8)
  put(c, c.w - 11, 5, 0xc8c4b0)
  put(c, c.w - 9, 7, 0xc8c4b0)
  for (let x = 0; x < c.w; x++) {
    const top = ground - 6 + Math.round(3 * Math.sin(x / 11) + 2 * Math.sin(x / 5))
    for (let y = top; y < ground; y++) put(c, x, y, 0x15182a)
  }
  rect(c, 0, ground, c.w, c.h - ground, 0x1f3424)
  const tx = 4
  for (let j = 0; j < 9; j++) rect(c, tx + 8 - j, ground - 9 + j, j * 2 + 1, 1, j === 8 ? 0x5a3418 : 0x8a5a3a)
  rect(c, tx + 7, ground - 4, 3, 4, 0x2a1810)
  const cx = Math.floor(c.w / 2)
  glow(c, cx, ground - 2, 20 + mod(t, 3), 0xff8a30, 0.35)
  fire(c, cx, ground + 2, t)
  const hx = cx - 15
  drawHero(c, hx, ground - 6, LEGS.sit)
  const stick = Math.sin(t / 10) * 0.08
  line(c, hx + 8, ground - 1, -0.35 + stick, 6, 0x7a5030, mix(WHITE, 0x8a5020, mod(t, 120) / 120))
  drawWizard(c, cx + 7, ground - 9, WIZ_LEGS.sit, true)
  if (mod(t, 60) < 24) put(c, cx + 7, ground - 3, 0xffe14d)
  rect(c, cx + 18, ground + 4, 10, 3, 0x3a5a8a)
  sprite(c, RANGER.slice(0, 4), RANGER_PAL, cx + 26, ground + 1)
  zzz(c, cx + 30, ground, t)
}

const tavern = (c: Canvas, t: number) => {
  const floor = 32
  for (let y = 0; y < floor; y++) rect(c, 0, y, c.w, 1, mod(y, 4) === 3 ? 0x4a2c18 : 0x6b4428)
  for (let x = 0; x < c.w; x += 13) for (let y = 0; y < floor; y += 4) put(c, x + mod(y * 3, 13), y + 1, 0x4a2c18)
  rect(c, 0, 0, c.w, 2, 0x3d2614)
  rect(c, 18, 4, 11, 9, 0x3d2614)
  rect(c, 19, 5, 9, 7, 0x10183a)
  for (let i = 0; i < 4; i++) put(c, 19 + Math.floor(hash(i + 70) * 9), 5 + Math.floor(hash(i + 90) * 7), mod(t + i * 5, 20) < 2 ? 0x404070 : 0xfff2b0)
  rect(c, 23, 4, 1, 9, 0x3d2614)
  rect(c, 18, 8, 11, 1, 0x3d2614)
  rect(c, 2, 16, 14, floor - 16, 0x7a7a84)
  for (let y = 16; y < floor; y += 3) for (let x = 2 + mod(y, 2) * 2; x < 16; x += 4) put(c, x, y, 0x5a5a64)
  rect(c, 1, 15, 16, 2, 0x5a5a64)
  rect(c, 5, 22, 8, floor - 22, 0x140c08)
  glow(c, 9, floor - 3, 14 + mod(t, 2), 0xff8a30, 0.3)
  fire(c, 9, floor - 1, t)
  sprite(c, CAT, { g: 0x8a8a96 }, 17, floor - 3)
  zzz(c, 21, floor - 4, t)
  rect(c, 0, floor, c.w, c.h - floor, 0x8a5a34)
  for (let y = floor + 2; y < c.h; y += 3) rect(c, 0, y, c.w, 1, 0x6a4226)
  const lx = Math.floor(c.w / 2) + 2
  rect(c, lx, 2, 1, 4, 0x2a1a10)
  rect(c, lx - 1, 6, 3, 3, mod(t, 7) < 1 ? 0xffd060 : 0xffe890)
  glow(c, lx, 7, 12, 0xffd080, 0.18)
  const bx = c.w - 24
  rect(c, bx + 2, 9, 22, 1, 0x3d2614)
  for (let i = 0; i < 6; i++) rect(c, bx + 4 + i * 3, 5 + mod(i, 2), 2, 4 - mod(i, 2), [0x3a8a4a, 0x8a3a3a, 0x3a5a9a, 0xc0a040][i % 4] ?? 0)
  drawHero(c, bx + 9, 16, LEGS.stand, { pal: KEEP_PAL, flip: true })
  if (mod(t, 50) < 25) line(c, bx + 9, 22, -0.6 + Math.sin(t / 3) * 0.3, 3, WHITE)
  rect(c, bx, 24, 24, floor - 24, 0xa0643a)
  rect(c, bx - 1, 23, 25, 2, 0xc07a48)
  const mx = Math.floor(c.w / 2) - 10
  rect(c, mx, 26, 18, 2, 0x9a6030)
  rect(c, mx + 2, 28, 2, 4, 0x6a4020)
  rect(c, mx + 14, 28, 2, 4, 0x6a4020)
  drawHero(c, mx - 6, 21, LEGS.sit)
  const sip = mod(t, 48) < 10
  const mugX = sip ? mx + 1 : mx + 2
  const mugY = sip ? 21 : 23
  rect(c, mugX, mugY, 3, 3, 0xd8b060)
  rect(c, mugX, mugY, 3, 1, WHITE)
  put(c, mugX + 3, mugY + 1, 0xd8b060)
  drawWizard(c, mx + 17, 18, WIZ_LEGS.sit, true)
  rect(c, mx + 12, 23, 3, 3, 0xd8b060)
  rect(c, mx + 12, 23, 3, 1, WHITE)
  if (mod(t, 80) < 30) for (let n = 0; n < 2; n++) {
    const p = mod(t + n * 15, 30)
    const nx = mx + 22 + p / 4 + n * 3
    const ny = 16 - p / 3
    put(c, nx, ny, GOLD)
    put(c, nx + 1, ny - 1, GOLD)
    put(c, nx + 1, ny - 2, GOLD)
  }
}

const library = (c: Canvas, t: number, mood: Mood) => {
  const floor = 32
  rect(c, 0, 0, c.w, floor, 0x3a2a3a)
  const books = [0xa83a3a, 0x3a5aa8, 0x3a8a4a, 0xc0a040, 0x7a3aa8, 0x2a8a8a, 0xa8603a]
  for (const shelfY of [10, 21]) {
    rect(c, 0, shelfY, c.w, 2, 0x5a3a22)
    let x = 1
    let n = shelfY * 31
    while (x < c.w) {
      n++
      const w = hash(n) < 0.7 ? 1 : 2
      const h = 5 + Math.floor(hash(n + 1) * 3)
      if (hash(n + 2) > 0.08) {
        rect(c, x, shelfY - h, w, h, books[Math.floor(hash(n + 3) * books.length)] ?? 0)
        if (h > 5) put(c, x, shelfY - h + 2, GOLD)
      }
      x += w + (hash(n + 4) < 0.15 ? 1 : 0)
    }
  }
  sprite(c, OWL[mod(t, 40) < 2 ? 1 : 0] ?? [], OWL_PAL, c.w - 10, 0)
  rect(c, 0, floor, c.w, c.h - floor, 0x4a3040)
  rect(c, 4, floor + 2, c.w - 8, c.h - floor - 3, 0x7a2a3a)
  const cx = Math.floor(c.w / 2)
  if (mood.sages) drawWizard(c, cx - 22, floor - 13, WIZ_LEGS.stand)
  sprite(c, HERO, HERO_PAL, cx - 4, 18)
  rect(c, cx - 14, 25, 28, 2, 0x7a4a2a)
  rect(c, cx - 13, 27, 26, 5, 0x5a3420)
  rect(c, cx - 6, 24, 12, 1, 0xf0e6d0)
  put(c, cx, 24, 0x9a8a70)
  const flip = mod(t, 40)
  if (flip < 8) rect(c, cx + 5 - Math.floor(flip * 1.4), 23, 1, 1, WHITE)
  const kx = cx + 10
  rect(c, kx, 21, 1, 4, WHITE)
  put(c, kx, 20 - mod(t, 3) % 2, 0xffe14d)
  put(c, kx, 19, mod(t, 4) < 2 ? 0xff9a2e : 0x3a2a3a)
  glow(c, kx, 20, 12, 0xffc060, 0.25)
  for (let d = 0; d < 4; d++) {
    const p = mod(t + d * 17, 60)
    put(c, Math.floor(hash(d + 300) * c.w) + Math.sin(p / 8) * 2, 30 - p / 3, 0x8a7a6a)
  }
}

const battle = (c: Canvas, t: number, mood: Mood) => {
  const ground = 30
  gradient(c, 0, ground, 0x6ab0e8, 0xcfeaf4)
  for (let x = 0; x < c.w; x++) {
    const top = ground - 5 - Math.round(2 * Math.abs(Math.sin(x / 3)))
    rect(c, x, top, 1, ground - top, 0x3a7a3a)
  }
  rect(c, 0, ground, c.w, c.h - ground, 0x5aa040)
  for (let x = 0; x < c.w; x++) if (hash(x + 77) < 0.15) put(c, x, ground + 1 + Math.floor(hash(x) * 8), 0x3f8a32)
  const p = mod(t, 24)
  const cycle = Math.floor(t / 24)
  const slain = mod(cycle, 3) === 2 && p >= 15
  const hx = Math.floor(c.w * 0.25) + (p >= 10 && p < 14 ? 2 : 0)
  const hy = ground - 6
  drawHero(c, hx, hy, LEGS.stand)
  const angles = [-1.3, -0.5, 0.35, 0.6]
  const swing = p >= 10 && p < 14 ? (angles[p - 10] ?? -1.3) : -1.1
  line(c, hx + 7, hy + 6, swing, 6, 0xd8dee9, WHITE)
  put(c, hx + 7, hy + 6, GOLD)
  const base = Math.floor(c.w * 0.62)
  let mx = base
  let my = 0
  if (p < 10) {
    mx = base - p
    my = -Math.round(Math.abs(Math.sin(p * 0.8)) * 3)
  } else if (p < 16) mx = base - 10
  else mx = base - 10 + Math.round((p - 15) * 1.25)
  const tint = p >= 13 && p < 16 ? WHITE : undefined
  if (!slain) {
    if (mood.monster === 'bug') sprite(c, BUG[mod(t, 2)] ?? [], BUG_PAL, mx, ground - 5 + my, false, tint)
    else sprite(c, SLIME, SLIME_PAL, mx, ground - 4 + my, false, tint)
  } else {
    const r = (p - 14) * 1.2
    for (let a = 0; a < 8; a++) put(c, mx + 4 + Math.cos(a * 0.785) * r, ground - 2 + Math.sin(a * 0.785) * r * 0.7, p < 21 ? 0xd0d0d8 : 0x909098)
    if (p > 17) for (let s = 0; s < 3; s++) put(c, mx + 3 + s * 2, ground - 4 - (p - 17) - s, GOLD)
  }
  if (p >= 12 && p < 15) {
    put(c, base - 11, ground - 5, 0xffe14d)
    put(c, base - 12, ground - 6, 0xffe14d)
    put(c, base - 10, ground - 7, 0xffffff)
  }
}

const boss = (c: Canvas, t: number, mood: Mood) => {
  const floor = 31
  rect(c, 0, 0, c.w, floor, 0x34343f)
  for (let y = 0; y < floor; y += 3) {
    rect(c, 0, y, c.w, 1, 0x26262f)
    for (let x = mod(y, 6) === 0 ? 0 : 3; x < c.w; x += 6) rect(c, x, y, 1, 3, 0x26262f)
  }
  rect(c, 0, floor, c.w, c.h - floor, 0x24202a)
  for (let x = 0; x < c.w; x += 5) rect(c, x, floor + 1 + mod(x, 3), 3, 1, 0x34303a)
  for (const tx of [Math.floor(c.w * 0.12), Math.floor(c.w * 0.5)]) {
    rect(c, tx, 9, 1, 4, 0x6a4a28)
    glow(c, tx, 7, 10, 0xff9a40, 0.25)
    put(c, tx, 8, 0xffe14d)
    put(c, tx, 7 - mod(t, 2), 0xff9a2e)
  }
  const p = mod(t, 32)
  const dx = c.w - 20
  const dy = floor - 12 + (mod(Math.floor(t / 4), 2) === 0 ? 0 : 1)
  sprite(c, DRAGON, DRAGON_PAL, dx, dy, false, p >= 6 && p < 8 ? WHITE : undefined)
  const hx = Math.floor(c.w * 0.22) + (p < 6 ? Math.min(p, 3) : 0)
  const hy = floor - 11
  const hurt = mood.hurt && mod(t, 2) === 0
  drawHero(c, hx, hy, LEGS.stand, hurt ? { tint: 0xff5050 } : {})
  rect(c, hx + 8, hy + 3, 3, 6, 0x3a6ad0)
  rect(c, hx + 9, hy + 5, 1, 2, GOLD)
  line(c, hx + 1, hy + 6, p < 6 ? -0.3 : -1.9, 6, 0xd8dee9, WHITE)
  if (p >= 16 && p < 28) {
    const reach = Math.min((p - 16) * 4, dx - hx - 11)
    for (let k = 0; k < reach; k++) {
      const spread = (k / reach) * 2.5
      for (let s = -1; s <= 1; s++) {
        const j = hash(k * 7 + s * 3 + t * 13)
        if (j < 0.75) put(c, dx - k, dy + 5 + s * spread + (j - 0.5) * 2, k > reach - 4 ? 0xe0402a : j < 0.3 ? 0xffe14d : 0xff9a2e)
      }
    }
    glow(c, dx - reach / 2, dy + 5, 10, 0xff8030, 0.2)
  }
}

const victory = (c: Canvas, t: number) => {
  const ground = 30
  outdoorsDay(c, ground, t, 0, 'country')
  const cx = Math.floor(c.w * 0.58)
  const open = t > 4
  if (open) glow(c, cx + 4, ground - 4, 14, 0xffe080, 0.5)
  rect(c, cx, ground - 4, 9, 5, 0x8a5a2a)
  rect(c, cx, ground - 2, 9, 1, GOLD)
  rect(c, cx + 4, ground - 3, 1, 2, GOLD)
  if (open) rect(c, cx, ground - 9, 9, 2, 0x6a4020)
  else rect(c, cx, ground - 6, 9, 2, 0x6a4020)
  if (open)
    for (let s = 0; s < 7; s++) {
      const p = mod(t * 2 + s * 5, 24)
      put(c, cx + 4 + Math.sin(s * 1.7 + p / 4) * (p / 3), ground - 6 - p, s % 2 ? GOLD : WHITE)
    }
  const hx = Math.floor(c.w * 0.32)
  const jump = Math.round(Math.abs(Math.sin(t * 0.5)) * 5)
  drawHero(c, hx, ground - 6 - jump, LEGS.stand)
  line(c, hx + 7, ground - jump, -1.57, 6, 0xd8dee9, WHITE)
  for (let k = 0; k < 10; k++) {
    const x = Math.floor(hash(k + 500) * c.w)
    put(c, x, mod(t + Math.floor(hash(k + 600) * 40), 40), [0xff6a8a, GOLD, 0x6ad0ff, 0x8aff6a][k % 4] ?? GOLD)
  }
}

const drawScene = (scene: Scene, w: number, t: number, mood: Mood): Canvas => {
  const c = canvas(w, H)
  switch (scene) {
    case 'tavern': tavern(c, t); break
    case 'campfire': campfire(c, t); break
    case 'forest': journey(c, t, 'forest', mood); break
    case 'country': journey(c, t, 'country', mood); break
    case 'party': journey(c, t, mod(Math.floor(t / 160), 2) ? 'country' : 'forest', { ...mood, party: true }); break
    case 'library': library(c, t, mood); break
    case 'battle': battle(c, t, mood); break
    case 'boss': boss(c, t, mood); break
    case 'victory': victory(c, t); break
    case 'pondering': pondering(c, t); break
  }
  return c
}

type View = { cols: number; rows: number; x0: number; y0: number; layoutW: number }

const viewFor = (size: QuestSize, bodyColumns: number): View => {
  const cols = Math.max(24, Math.min(SIZES[size].cols, bodyColumns))
  const layoutW = Math.max(cols, MIN_LAYOUT_W)
  return { cols, rows: viewRows(size), x0: Math.floor((layoutW - cols) / 2), y0: SIZES[size].cropTop, layoutW }
}

const frame = (v: View) => encode(drawScene(scene, v.layoutW, tick, mood), v)

const encode = (c: Canvas, v: View) => {
  const words = new Uint32Array(v.cols * v.rows * 3)
  for (let r = 0; r < v.rows; r++)
    for (let x = 0; x < v.cols; x++) {
      const i = (r * v.cols + x) * 3
      words[i] = 0x2580
      words[i + 1] = get(c, v.x0 + x, v.y0 + 2 * r)
      words[i + 2] = get(c, v.x0 + x, v.y0 + 2 * r + 1)
    }
  return base64(new Uint8Array(words.buffer))
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const base64 = (bytes: Uint8Array) => {
  const out: string[] = []
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out.push(
      B64[(n >> 18) & 63]!,
      B64[(n >> 12) & 63]!,
      i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=',
      i + 2 < bytes.length ? B64[n & 63]! : '=',
    )
  }
  return out.join('')
}

// ---------------------------------------------------------------- what Claude is doing

const base = (path: unknown) => (typeof path === 'string' ? path.split('/').pop() ?? path : 'a scroll')
const clip = (s: unknown, n = 36) => {
  const text = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''
  return text.length > n ? `${text.slice(0, n - 1)}…` : text
}
const host = (url: unknown) => {
  try {
    return new URL(String(url)).host
  } catch {
    return 'distant lands'
  }
}

const CRITIQUE = /\b(review|critique|critic|adversarial|audit|assess|scrutini[sz]e|second opinion)\b/i
const TRIAL = /\b(test|build|tsc|lint|pytest|jest|vitest|dotnet|cargo|go test|make|gradle|mvn)\b/

type Classified = { scene: Scene; caption: string; monster?: 'bug' | 'slime'; sages?: boolean }

const classify = (tool: string, input: Record<string, unknown>, critique: boolean): Classified | undefined => {
  switch (tool) {
    case 'Read':
      return critique
        ? { scene: 'library', caption: `Studying ${base(input.file_path)} in the archives` }
        : { scene: 'forest', caption: `Scouting ${base(input.file_path)} in the Whispering Woods` }
    case 'Grep':
    case 'Glob':
    case 'LSP':
      return critique
        ? { scene: 'library', caption: `Searching the stacks for ${clip(input.pattern ?? 'clues', 28)}` }
        : { scene: 'forest', caption: `Tracking ${clip(input.pattern ?? 'tracks', 28)} through the forest` }
    case 'WebSearch':
      return { scene: 'country', caption: `Riding out to ask about ${clip(input.query, 30)}` }
    case 'WebFetch':
      return { scene: 'country', caption: `Journeying to ${host(input.url)}` }
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return { scene: 'battle', monster: 'bug', caption: `Battling bugs in ${base(input.file_path ?? input.notebook_path)}` }
    case 'Bash':
      return TRIAL.test(String(input.command ?? ''))
        ? { scene: 'boss', caption: `The Trial Dragon awakens: ${clip(input.command, 30)}` }
        : { scene: 'battle', monster: 'slime', caption: `Casting a shell spell: ${clip(input.command, 30)}` }
    case 'Agent': {
      const kind = String(input.subagent_type ?? 'companion')
      return CRITIQUE.test(kind) || /review|critic/i.test(kind)
        ? { scene: 'library', sages: true, caption: `The council of sages convenes (${kind})` }
        : { scene: 'party', caption: `A ${kind} joins the party: ${clip(input.description, 24)}` }
    }
    case 'Skill': {
      const skill = String(input.skill ?? '')
      return CRITIQUE.test(skill) || /review/i.test(skill) ? { scene: 'library', sages: true, caption: `Consulting the tome of ${skill}` } : undefined
    }
    default:
      return undefined
  }
}

const IDLE: Scene[] = ['tavern', 'campfire']
const IDLE_CAPTION: Record<string, string> = {
  tavern: 'Resting at the Rusty Tankard. Awaiting a quest…',
  campfire: 'Telling tales by the campfire. Awaiting a quest…',
}

// Module-level copies of what the ticker needs every frame; $.state holds what the pane draws.
let tick = 0
let scene: Scene = 'tavern'
let mood: Mood = { party: false, monster: 'bug', hurt: false, sages: false }
let busy = false
let critiqueTurn = false
let inflight = 0
let lastToolTick = 0
let idleSince = 0
let victoryUntil = 0
let hurtUntil = 0
let mounted: View | undefined
let backoff = 0

const setScene = ($: EngineInterface, next: Scene, caption: string, extra: Partial<Mood> = {}) => {
  scene = next
  mood = { ...mood, sages: false, ...extra }
  void update($, status, () => ({ scene: next, caption }))
}

const goIdle = ($: EngineInterface) => {
  busy = false
  idleSince = tick
  setScene($, 'tavern', IDLE_CAPTION.tavern ?? '')
}

const onTick = ($: EngineInterface) => {
  tick++
  mood.hurt = tick < hurtUntil
  if (scene === 'victory' && tick >= victoryUntil && !busy) goIdle($)
  if (!busy && IDLE.includes(scene)) {
    const want = IDLE[Math.floor((tick - idleSince) / IDLE_SWAP_TICKS) % IDLE.length] ?? 'tavern'
    if (want !== scene) setScene($, want, IDLE_CAPTION[want] ?? '')
  }
  if (busy && inflight === 0 && tick - lastToolTick === PONDER_AFTER_TICKS && scene !== 'library')
    setScene($, 'pondering', 'Consulting the map at the crossroads…')
  if (mounted === undefined) return
  if (backoff > 0 && tick % 8 !== 0) return
  void $.ui
    .blit({ requestId: PANE, key: RASTER, cells: frame(mounted) })
    .then(r => {
      backoff = 'deny' in r && r.deny ? backoff + 1 : 0
    })
}

const PREFS_KEY = 'prefs'

const isPrefs = (x: unknown): x is QuestPrefs =>
  typeof x === 'object' && x !== null &&
  (x as QuestPrefs).size in SIZES && ((x as QuestPrefs).align === 'left' || (x as QuestPrefs).align === 'right')

// rows and columns are requests: inline it opens just tall enough, docked about as wide as the scene.
const openPane = ($: EngineInterface, p: QuestPrefs) =>
  $.ui.open({ id: PANE, title: 'Pixel Quest', rows: viewRows(p.size) + 2, columns: SIZES[p.size].cols })

const hearts = (hp: number) => '♥'.repeat(hp) + '♡'.repeat(MAX_HP - hp)
const level = (xp: number) => Math.floor(Math.sqrt(xp / 3)) + 1

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quest',
      description: 'Open the Pixel Quest pane for this session, or set its size and side',
      argumentHint: '[small|medium|large] [left|right] [close]',
    })
    const saved = await $.store.get(PREFS_KEY)
    const loaded = isPrefs(saved) ? saved : await read($, prefs)
    await update($, prefs, () => loaded)
    idleSince = tick
    $.clock.every(TICK_MS, () => onTick($))

    return next(e)
  })

  on('command.run', { command: 'quest' }, async ($, e) => {
    const words = e.args.toLowerCase().split(/\s+/).filter(Boolean)
    if (words.includes('close')) {
      await $.ui.close({ id: PANE })
      return { text: 'The adventure pane is closed. /quest opens it again.' }
    }
    const unknown = words.filter(w => !(w in SIZES) && w !== 'left' && w !== 'right')
    if (unknown.length > 0) return { text: `Unknown option: ${unknown.join(' ')}. Try /quest small|medium|large left|right close.` }
    const size = words.find((w): w is QuestSize => w in SIZES)
    const align = words.find((w): w is QuestPrefs['align'] => w === 'left' || w === 'right')
    const before = await read($, prefs)
    const after: QuestPrefs = { size: size ?? before.size, align: align ?? before.align }
    await update($, prefs, () => after)
    await $.store.set(PREFS_KEY, after)
    await openPane($, after)

    return { text: `Pixel Quest: ${after.size}, ${after.align}-aligned. In the fullscreen layout (/tui fullscreen) it docks on the right instead.` }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      busy = true
      critiqueTurn = CRITIQUE.test(e.text)
      lastToolTick = tick
      if (critiqueTurn) setScene($, 'library', 'Retreating to the library to weigh the evidence…', { sages: true })
      else setScene($, 'pondering', e.text ? `A new quest: ${clip(e.text, 30)}` : 'The quest continues…')
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const picked = classify(e.tool, e as unknown as Record<string, unknown>, critiqueTurn)
    if (picked) {
      busy = true
      setScene($, picked.scene, picked.caption, { monster: picked.monster ?? mood.monster, sages: picked.sages ?? critiqueTurn })
    }
    inflight++
    lastToolTick = tick
    try {
      const ran = await next(e)
      const failed = ran.deny === undefined && ran.isError === true
      if (failed && e.agentId === undefined) {
        hurtUntil = tick + 16
        setScene($, 'boss', `A wild error appears in ${e.tool}! Debugging…`)
      }
      const slew = !failed && ran.deny === undefined && (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit')
      void update($, stats, s => ({
        ...s,
        xp: s.xp + 1,
        slain: s.slain + (slew ? 1 : 0),
        hp: failed ? Math.max(1, s.hp - 1) : s.hp,
      }))

      return ran
    } finally {
      inflight--
      lastToolTick = tick
    }
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      busy = false
      critiqueTurn = false
      victoryUntil = tick + VICTORY_TICKS
      setScene($, 'victory', 'Quest complete! Treasure acquired.')
      void update($, stats, s => ({ ...s, quests: s.quests + 1, hp: MAX_HP }))
    }

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const now = await read($, status)
    const s = await read($, stats)
    const p = await read($, prefs)
    const v = viewFor(p.size, e.props.bodyColumns)
    const roomy = v.cols >= 56
    const hud = (
      <Text>
        <Text color="#d97757">Lv {level(s.xp)}</Text> <Text color="#ff6a6a">{hearts(s.hp)}</Text>{' '}
        <Text dimColor>{roomy ? `XP ${s.xp} · ${s.slain} bugs slain · ${s.quests} quests` : `⚔${s.slain} ✦${s.quests}`}</Text>
      </Text>
    )
    if (e.surface !== 'terminal') {
      mounted = undefined
      return (
        <Box flexDirection="column">
          <Text>{now.caption}</Text>
          {hud}
        </Box>
      )
    }
    const { Raster } = $.ui.resolve(e)
    mounted = v
    backoff = 0

    return (
      <Box flexDirection="column" alignItems={p.align === 'right' && e.props.placement === 'inline' ? 'flex-end' : 'flex-start'}>
        <Raster key={RASTER} columns={v.cols} rows={v.rows} cells={encode(drawScene(now.scene, v.layoutW, tick, mood), v)} />
        <Text>{clip(now.caption, v.cols)}</Text>
        {hud}
      </Box>
    )
  })
}
