// Canvas renderers for shareable images: the squad card (3.6) and the recap card (5.1/5.2).
// Drawn by hand (no html2canvas) so output is identical on every device and works offline.

const RED = '#E41827'

async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load('italic 900 96px "Barlow Condensed"'),
      document.fonts.load('700 40px Inter'),
      document.fonts.load('600 32px Inter'),
    ])
  } catch { /* fall back to system fonts */ }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

function drawBackdrop(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#2A0A0D')
  g.addColorStop(0.6, '#1A1D23')
  g.addColorStop(1, '#14171C')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

function drawCardShell(ctx, x, y, w, h) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.45)'
  ctx.shadowBlur = 60
  ctx.shadowOffsetY = 30
  const g = ctx.createLinearGradient(x, y, x + w * 0.6, y + h)
  g.addColorStop(0, RED)
  g.addColorStop(1, '#7A0710')
  ctx.fillStyle = g
  roundRect(ctx, x, y, w, h, 56)
  ctx.fill()
  ctx.restore()
  // pitch circle watermark
  ctx.save()
  roundRect(ctx, x, y, w, h, 56)
  ctx.clip()
  ctx.strokeStyle = 'rgba(255,255,255,.08)'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(x + w - 40, y + h * 0.42, 230, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawHeader(ctx, x, y, w, roundName) {
  ctx.fillStyle = '#fff'
  ctx.font = 'italic 900 64px "Barlow Condensed", sans-serif'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('SportyStreet', x, y + 56)
  ctx.font = '800 26px Inter, sans-serif'
  const label = fitText(ctx, roundName.toUpperCase(), 380)
  const pw = ctx.measureText(label).width + 40
  ctx.fillStyle = 'rgba(255,255,255,.18)'
  roundRect(ctx, x + w - pw, y + 10, pw, 52, 26)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.fillText(label, x + w - pw + 20, y + 46)
}

async function loadImage(src) {
  if (!src) return null
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = src
    await img.decode()
    return img
  } catch {
    return null
  }
}

function drawAvatar(ctx, cx, cy, r, color, text, img) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  if (img) {
    // cover-fit the photo into the circle, biased to the top where faces are
    const s = Math.min(img.naturalWidth, img.naturalHeight)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(img, (img.naturalWidth - s) / 2, 0, s, s, cx - r, cy - r, r * 2, r * 2)
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,.85)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    return
  }
  ctx.fillStyle = '#fff'
  ctx.font = `800 ${Math.round(r * 0.8)}px Inter, sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(text, cx, cy + r * 0.28)
  ctx.textAlign = 'left'
}

async function toBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

/**
 * @param {{roundName: string, title: string, players: Array<{name, initials, color, captain, hero, flag, imageUrl?}>, footer?: string, format?: 'post'|'story', score?: string}} o
 */
export async function renderSquadCard(options) {
  await fontsReady()
  const photos = await Promise.all(options.players.map((p) => loadImage(p.imageUrl)))
  try {
    return await drawSquadCard(options, photos)
  } catch {
    // A cross-origin photo without CORS taints the canvas — fall back to initials.
    return drawSquadCard(options, [])
  }
}

async function drawSquadCard({ roundName, title, players, footer = 'Think you can beat it?', link = '', format = 'post', score }, photos) {
  const W = 1080
  const H = format === 'story' ? 1920 : 1350
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const ctx = canvas.getContext('2d')
  drawBackdrop(ctx, W, H)
  const cw = 920
  const ch = 1110
  const cx = (W - cw) / 2
  const cy = format === 'story' ? 330 : 120
  drawCardShell(ctx, cx, cy, cw, ch)
  const px = cx + 64
  const pw = cw - 128
  drawHeader(ctx, px, cy + 56, pw, roundName)

  ctx.fillStyle = '#fff'
  ctx.font = 'italic 900 104px "Barlow Condensed", sans-serif'
  ctx.fillText(fitText(ctx, title.toUpperCase(), pw), px, cy + 260)
  if (score) {
    ctx.font = '700 34px Inter, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,.85)'
    ctx.fillText(score, px, cy + 316)
  }

  let y = cy + (score ? 400 : 370)
  for (const [i, p] of players.slice(0, 6).entries()) {
    drawAvatar(ctx, px + 40, y, 40, p.color, p.initials, photos[i])
    ctx.fillStyle = '#fff'
    ctx.font = '700 44px Inter, sans-serif'
    const marks = `${p.captain ? 'C ' : ''}${p.hero ? '★' : ''}${p.bench ? 'BENCH' : ''}`.trim()
    ctx.fillText(fitText(ctx, p.name, pw - 260), px + 104, y + 15)
    ctx.font = '900 34px Inter, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillStyle = p.hero ? '#F5B400' : '#fff'
    ctx.fillText(`${marks}${p.flag ? `  ${p.flag}` : ''}`, px + pw, y + 13)
    ctx.textAlign = 'left'
    y += 108
  }

  const by = cy + ch - 150
  ctx.fillStyle = 'rgba(0,0,0,.25)'
  roundRect(ctx, px, by, pw, 96, 28)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = '800 34px Inter, sans-serif'
  ctx.fillText(footer, px + 32, by + 60)
  if (link) {
    ctx.font = '700 28px Inter, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(fitText(ctx, link, pw * 0.42), px + pw - 32, by + 59)
    ctx.textAlign = 'left'
  }

  if (format === 'story') {
    ctx.fillStyle = 'rgba(255,255,255,.7)'
    ctx.font = 'italic 900 52px "Barlow Condensed", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('YOUR FIVE. YOUR COUNTRY. YOUR MOMENT.', W / 2, cy + ch + 150)
    ctx.textAlign = 'left'
  }
  return toBlob(canvas)
}

/** Recap card: big score, rank and the best contributors. */
export async function renderRecapCard({ roundName, score, rankLine, rpLine, lines = [], format = 'post' }) {
  await fontsReady()
  const W = 1080
  const H = format === 'story' ? 1920 : 1350
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const ctx = canvas.getContext('2d')
  drawBackdrop(ctx, W, H)
  const cw = 920
  const ch = 1110
  const cx = (W - cw) / 2
  const cy = format === 'story' ? 330 : 120
  drawCardShell(ctx, cx, cy, cw, ch)
  const px = cx + 64
  const pw = cw - 128
  drawHeader(ctx, px, cy + 56, pw, roundName)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  ctx.font = 'italic 900 300px "Barlow Condensed", sans-serif'
  ctx.fillText(String(score), W / 2, cy + 470)
  ctx.font = '700 40px Inter, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,.9)'
  ctx.fillText(rankLine, W / 2, cy + 545)
  if (rpLine) {
    ctx.font = '900 38px Inter, sans-serif'
    const w = ctx.measureText(rpLine).width + 56
    ctx.fillStyle = '#F5B400'
    roundRect(ctx, W / 2 - w / 2, cy + 585, w, 64, 32)
    ctx.fill()
    ctx.fillStyle = '#14171C'
    ctx.fillText(rpLine, W / 2, cy + 630)
  }
  ctx.textAlign = 'left'
  let y = cy + 740
  for (const l of lines.slice(0, 4)) {
    ctx.fillStyle = 'rgba(0,0,0,.2)'
    roundRect(ctx, px, y - 52, pw, 78, 22)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '700 36px Inter, sans-serif'
    ctx.fillText(fitText(ctx, l.label, pw - 200), px + 28, y)
    ctx.textAlign = 'right'
    ctx.font = '900 38px Inter, sans-serif'
    ctx.fillText(l.value, px + pw - 28, y)
    ctx.textAlign = 'left'
    y += 92
  }
  return toBlob(canvas)
}
