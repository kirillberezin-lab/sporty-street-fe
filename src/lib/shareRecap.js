// Recap sharing used by the result (5.1) and recap (5.2) screens.
import { renderRecapCard } from './cards.js'
import { num, topPercent } from './format.js'
import { shortName } from './players.js'
import { copyText, downloadBlob, shareNative } from './share.js'

export function rankLine(result, total) {
  if (!result) return ''
  const pct = topPercent(result.finalRank, total)
  return `${pct ? `${pct} · ` : ''}#${num(result.finalRank)}${total ? ` of ${num(total)}` : ''}`
}

/** @returns {Promise<'shared'|'cancelled'|'saved'>} 'saved' = image downloaded and caption copied. */
export async function shareRecap({ roundName, result, total, rows }) {
  const line = rankLine(result, total)
  const blob = await renderRecapCard({
    roundName,
    score: result.finalScore,
    rankLine: `points · ${line}`,
    rpLine: result.totalAwardedRp ? `+${result.totalAwardedRp} RP earned` : '',
    lines: rows.slice(0, 4).map((x) => ({ label: `${shortName(x.player?.name ?? 'Player')} · ${x.reason}`, value: `${x.total}` })),
  })
  const file = new File([blob], 'sportystreet-recap.png', { type: 'image/png' })
  const text = `I scored ${result.finalScore} pts in ${roundName} on SportyStreet (${line}). Beat that 👇`
  const res = await shareNative({ title: 'My SportyStreet recap', text, url: location.origin, file })
  if (res !== 'unsupported') return res
  downloadBlob(blob, file.name)
  await copyText(`${text} ${location.origin}`)
  return 'saved'
}
