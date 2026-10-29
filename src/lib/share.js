// Sharing (design 3.6 "share card", 5.1 "share recap", 6.3 invites).
// - Web Share API L2 shares the rendered PNG + link to any app (WhatsApp, Instagram Stories, Telegram...)
//   on Android Chrome, iOS/iPadOS Safari 15+ and installed PWAs; desktop support varies.
// - wa.me deep link opens WhatsApp with the text on every platform.
// - Clipboard + PNG download are the fallbacks.

export const canShare = () => typeof navigator.share === 'function'

export function canShareFiles() {
  try {
    return Boolean(navigator.canShare?.({ files: [new File([new Blob(['x'])], 'card.png', { type: 'image/png' })] }))
  } catch {
    return false
  }
}

/** @returns {'shared'|'cancelled'|'unsupported'} */
export async function shareNative({ title, text, url, file }) {
  if (!canShare()) return 'unsupported'
  const data = { title, text, url }
  if (file && navigator.canShare?.({ ...data, files: [file] })) data.files = [file]
  try {
    await navigator.share(data)
    return 'shared'
  } catch (e) {
    if (e.name === 'AbortError') return 'cancelled'
    // Some browsers refuse files+url together; retry with the link only.
    if (data.files) {
      try {
        await navigator.share({ title, text, url })
        return 'shared'
      } catch (e2) {
        return e2.name === 'AbortError' ? 'cancelled' : 'unsupported'
      }
    }
    return 'unsupported'
  }
}

export const whatsappUrl = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`

export function openWhatsApp(text) {
  window.open(whatsappUrl(text), '_blank', 'noopener')
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;opacity:0;top:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
