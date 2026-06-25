/**
 * Parse a WhatsApp .txt export and extract penalty entries.
 *
 * Each returned entry: { rawName, amount, date, originalText, sender }
 */

const SKIP_PATTERNS = [
  'wurde gelöscht',
  'Medien ausgeschlossen',
  'Ende-zu-Ende',
  'ist von der Community',
  'ist über einen',
  'hat die Gruppe',
  'Sicherheitscode',
  'Gruppenbeschreibung',
  'beigetreten',
  'hat die Gruppen',
  'Diese Nachricht wurde bearbeitet',
]

/**
 * Phrases that indicate the SENDER themselves did something —
 * not a third person. The sender's name should be used instead
 * of treating the phrase as a person name.
 */
const SELF_REFERENTIAL = [
  /^hab\s+mein/i,
  /^ich\s+hab/i,
  /^ich\s+habe/i,
  /^habe\s+mein/i,
  /^mein\s+ma[sß]band/i,
  /^hab\s+vergessen/i,
  /^habe\s+vergessen/i,
]

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{2}),\s*\d{2}:\d{2}/

function parseDate(line) {
  const m = line.match(DATE_RE)
  if (!m) return null
  return `20${m[3]}-${m[2]}-${m[1]}`
}

function isSelfReferential(text) {
  return SELF_REFERENTIAL.some(re => re.test(text.trim()))
}

function extractFromSegment(seg, date, sender) {
  const s = seg.replace(/<Diese Nachricht wurde bearbeitet\.?>/gi, '').trim()
  if (!s) return null

  // Pattern A: "Name Betrag€"
  let m = s.match(/^(.+?)\s+([\d]+(?:[,.][\d]+)?)\s*[€$&]\s*$/)
  if (!m) m = s.match(/^(.+?)\s+([\d]+(?:[,.][\d]+)?)\s*[Ee]uro\s*$/)
  if (!m) m = s.match(/^(.+?)\s+([\d]+(?:[,.][\d]+)?)\s*[€$&]/)

  if (m) {
    let rawName = m[1].replace(/[*_~`]/g, '').trim()
    const amount = parseFloat(m[2].replace(',', '.'))
    if (isSelfReferential(rawName)) {
      if (!sender) return null
      rawName = sender
    }
    if (isValidEntry(rawName, amount))
      return { rawName, amount, date, originalText: s }
    return null
  }

  // Pattern B: "Betrag€ Name"
  m = s.match(/^([\d]+(?:[,.][\d]+)?)\s*[€$&]\s+(.+)$/)
  if (m) {
    const rawName = m[2].replace(/[*_~`]/g, '').trim()
    const amount  = parseFloat(m[1].replace(',', '.'))
    if (isValidEntry(rawName, amount))
      return { rawName, amount, date, originalText: s }
  }

  return null
}

function isValidEntry(name, amount) {
  return (
    name &&
    name.length >= 2 &&
    name.length <= 45 &&
    amount >= 0.5 &&
    amount <= 50
  )
}

/**
 * Parse the full chat text.
 * Handles both single-line and multi-line WhatsApp messages.
 * Multi-line messages (continuation lines without a date prefix)
 * inherit the date and sender from the previous dated line.
 *
 * @param {string} text - Raw content of WhatsApp .txt export
 * @returns {Array<{rawName,amount,date,originalText,sender}>}
 */
export function parseChat(text) {
  const lines = text.split('\n')
  const results = []

  let currentDate   = null
  let currentSender = ''

  for (const line of lines) {
    const trimmed = line.replace(/\r$/, '') // strip CRLF if present

    const date = parseDate(trimmed)

    if (date) {
      // ── Dated line ────────────────────────────────────────────
      currentDate = date

      const dashIdx = trimmed.indexOf(' - ')
      if (dashIdx < 0) continue
      const after = trimmed.slice(dashIdx + 3)

      if (SKIP_PATTERNS.some(p => after.includes(p))) {
        currentSender = ''
        continue
      }

      const ci      = after.indexOf(': ')
      currentSender = ci >= 0 ? after.slice(0, ci).trim() : ''
      const body    = ci >= 0 ? after.slice(ci + 2).trim() : after.trim()

      // First segment on the same line
      for (const seg of body.split('\n')) {
        const entry = extractFromSegment(seg.trim(), currentDate, currentSender)
        if (entry) results.push({ ...entry, sender: currentSender })
      }

    } else if (trimmed && currentDate && !SKIP_PATTERNS.some(p => trimmed.includes(p))) {
      // ── Continuation line (no date prefix) ───────────────────
      // This is the rest of a multi-line message — same date & sender
      const entry = extractFromSegment(trimmed, currentDate, currentSender)
      if (entry) results.push({ ...entry, sender: currentSender })
    }
  }

  return results
}
