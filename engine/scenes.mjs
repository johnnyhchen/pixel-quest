// Pixel Quest scenes, ported from the Claude Code mod (claude/hooks/register.tsx).
// Pure drawing: no I/O. A scene is drawn into a Canvas of 0xRRGGBB pixels.

export const H = 40 // scene height in pixels; each terminal row shows two via the ▀ half block
export const MIN_LAYOUT_W = 64 // scenes are laid out at least this wide, then cropped to the view

// Each size crops the 40px scene from the top (sky and ceiling go first) and caps its width.
export const SIZES = {
  small: { cols: 48, cropTop: 12 },
  medium: { cols: 64, cropTop: 8 },
  large: { cols: 120, cropTop: 0 },
}
export const viewRows = size => (H - SIZES[size].cropTop) / 2

// ---------------------------------------------------------------- pixels

const canvas = (w, h) => ({ w, h, px: new Uint32Array(w * h) })

const put = (c, x, y, col) => {
  x = Math.floor(x)
  y = Math.floor(y)
  if (x >= 0 && y >= 0 && x < c.w && y < c.h) c.px[y * c.w + x] = col
}

export const get = (c, x, y) => c.px[y * c.w + x] ?? 0

const rect = (c, x, y, w, h, col) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(c, x + i, y + j, col)
}

const mix = (a, b, f) => {
  const ch = s => Math.round(((a >> s) & 255) * (1 - f) + ((b >> s) & 255) * f) << s
  return ch(16) | ch(8) | ch(0)
}

const glow = (c, cx, cy, radius, col, strength) => {
  for (let y = Math.max(0, cy - radius); y < Math.min(c.h, cy + radius); y++)
    for (let x = Math.max(0, cx - radius); x < Math.min(c.w, cx + radius); x++) {
      const d = Math.hypot(x - cx, (y - cy) * 1.3) / radius
      if (d < 1) put(c, x, y, mix(get(c, x, y), col, (1 - d) * strength))
    }
}

const gradient = (c, y0, y1, top, bottom) => {
  for (let y = y0; y < y1; y++) rect(c, 0, y, c.w, 1, mix(top, bottom, (y - y0) / Math.max(1, y1 - y0 - 1)))
}

const hash = n => {
  let x = Math.imul(n | 0, 374761393) ^ 0x9e3779b9
  x = Math.imul(x ^ (x >>> 13), 1274126177)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

const mod = (a, n) => ((a % n) + n) % n

const sprite = (c, rows, pal, x, y, flip = false, tint) => {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const col = pal[row[flip ? row.length - 1 - i : i] ?? '.']
      if (col !== undefined) put(c, x + i, y + j, tint ?? col)
    }
  })
}

const line = (c, x, y, angle, len, col, tip) => {
  for (let k = 0; k <= len; k++) put(c, x + Math.cos(angle) * k, y + Math.sin(angle) * k, k === len && tip ? tip : col)
}

// ---------------------------------------------------------------- sprites

const K = 0x1b1424
const SKIN = 0xf2c09a
const GOLD = 0xe8c15a
const BOOT = 0x2a1d18
const PANTS = 0x3a3550
const WHITE = 0xf4f1e8

const HERO_PAL = { H: 0x5a3420, S: SKIN, K, O: 0xd97757, D: 0x9c4a35, Y: GOLD, P: PANTS, B: BOOT }
const KEEP_PAL = { ...HERO_PAL, H: 0x9a9aa2, O: 0xe8e0d0, D: 0x6a4a3a }
const WIZ_PAL = { L: 0x3b5bdb, l: 0x27408f, Y: GOLD, S: SKIN, K, W: 0xe6e6ee, B: BOOT }
const RANGER_PAL = { G: 0x3f8f4f, g: 0x2a6036, S: SKIN, K, T: 0x7a4a24, P: PANTS, B: BOOT }

// The hero's tunic follows the harness driving it: Claude orange, Codex green-teal, agy blue.
export const HERO_TUNICS = {
  claude: { O: 0xd97757, D: 0x9c4a35 },
  codex: { O: 0x3fae8f, D: 0x2a7560 },
  agy: { O: 0x5b8def, D: 0x3a5fb0 },
}

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
const SLIME_PAL = { G: 0x58c45a, K }
const BUG = [
  ['..k....k..', '...k..k...', '..VVVVVV..', '.VvVVVVvV.', 'VVVRVVRVVV', '.VVVVVVVV.', 'k.k.kk.k.k'],
  ['.k......k.', '...k..k...', '..VVVVVV..', '.VvVVVVvV.', 'VVVRVVRVVV', '.VVVVVVVV.', '.k.k..k.k.'],
]
const BUG_PAL = { k: K, V: 0x8a4fc4, v: 0xc9a2f0, R: 0xff4d4d }
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
const DRAGON_PAL = { R: 0xc0392b, r: 0x7a1f1a, K: 0xffe14d, Y: 0x3a0a0a, W: WHITE, y: 0xe0a040 }
const OWL = [
  ['b...b', 'bbbbb', 'bWbWb', 'bbYbb', '.bbb.'],
  ['b...b', 'bbbbb', 'bbbbb', 'bbYbb', '.bbb.'],
]
const OWL_PAL = { b: 0x8a6440, W: 0xffe8a0, Y: GOLD }
const CAT = ['g.g...', 'gggggg', '.ggggg']
const ZED = ['zzz', '.z.', 'zzz']
const QUESTION = ['.q.', 'q.q', '..q', '.q.', '...', '.q.']

const walkLegs = (t, phase = 0) => (mod(Math.floor(t / 2) + phase, 2) === 0 ? LEGS.walk1 : LEGS.walk2)

let heroPal = HERO_PAL

const drawHero = (c, x, y, legs, opts = {}) => sprite(c, [...HERO, ...legs], opts.pal ?? heroPal, x, y, opts.flip, opts.tint)

const drawWizard = (c, x, y, legs, flip = false) => sprite(c, [...WIZARD, ...legs], WIZ_PAL, x, y, flip)

const drawRanger = (c, x, y, legs, flip = false) => sprite(c, [...RANGER, ...legs], RANGER_PAL, x, y, flip)

const zzz = (c, x, y, t) => {
  for (let k = 0; k < 2; k++) {
    const p = mod(t + k * 12, 24)
    if (p < 20) sprite(c, ZED, { z: mix(0xbfc8ff, 0x000000, p / 30) }, x + p / 5 + k, y - p / 3)
  }
}

const fire = (c, cx, base, t, size = 1) => {
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

const stars = (c, maxY, t, count) => {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hash(i * 3 + 1) * c.w)
    const y = Math.floor(hash(i * 3 + 2) * maxY)
    put(c, x, y, mod(t + i * 7, 31) < 2 ? 0x6a6a90 : mod(i, 5) === 0 ? 0xfff2b0 : 0xd8dcff)
  }
}

// ---------------------------------------------------------------- scenes

const outdoorsDay = (c, ground, t, scroll, biome) => {
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

const journey = (c, t, biome, mood) => {
  const ground = 30
  outdoorsDay(c, ground, t, t, biome)
  const hx = Math.floor(c.w * (mood.party ? 0.55 : 0.35))
  const bob = mod(Math.floor(t / 2), 2)
  drawHero(c, hx, ground - 6 - bob, walkLegs(t))
  if (mood.party) {
    drawWizard(c, hx - 11, ground - 8 - mod(Math.floor(t / 2) + 1, 2), [mod(Math.floor(t / 2) + 1, 2) ? WIZ_LEGS.walk1[0] : WIZ_LEGS.walk2[0]])
    drawRanger(c, hx - 21, ground - 6 - bob, walkLegs(t, 1))
  }
}

const pondering = (c, t) => {
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

const campfire = (c, t) => {
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

const tavern = (c, t) => {
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
  if (mod(t, 80) < 30)
    for (let n = 0; n < 2; n++) {
      const p = mod(t + n * 15, 30)
      const nx = mx + 22 + p / 4 + n * 3
      const ny = 16 - p / 3
      put(c, nx, ny, GOLD)
      put(c, nx + 1, ny - 1, GOLD)
      put(c, nx + 1, ny - 2, GOLD)
    }
}

const library = (c, t, mood) => {
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
  sprite(c, HERO, heroPal, cx - 4, 18)
  rect(c, cx - 14, 25, 28, 2, 0x7a4a2a)
  rect(c, cx - 13, 27, 26, 5, 0x5a3420)
  rect(c, cx - 6, 24, 12, 1, 0xf0e6d0)
  put(c, cx, 24, 0x9a8a70)
  const flip = mod(t, 40)
  if (flip < 8) rect(c, cx + 5 - Math.floor(flip * 1.4), 23, 1, 1, WHITE)
  const kx = cx + 10
  rect(c, kx, 21, 1, 4, WHITE)
  put(c, kx, 20 - (mod(t, 3) % 2), 0xffe14d)
  put(c, kx, 19, mod(t, 4) < 2 ? 0xff9a2e : 0x3a2a3a)
  glow(c, kx, 20, 12, 0xffc060, 0.25)
  for (let d = 0; d < 4; d++) {
    const p = mod(t + d * 17, 60)
    put(c, Math.floor(hash(d + 300) * c.w) + Math.sin(p / 8) * 2, 30 - p / 3, 0x8a7a6a)
  }
}

const battle = (c, t, mood) => {
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

const boss = (c, t, mood) => {
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

const victory = (c, t) => {
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

export const drawScene = (scene, w, t, mood, harness = 'claude') => {
  heroPal = { ...HERO_PAL, ...(HERO_TUNICS[harness] ?? {}) }
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
