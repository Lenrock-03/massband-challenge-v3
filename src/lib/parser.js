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
 *
 * e.g. "Hab mein Maßband verloren 20€" → sender lost the tape measure
 *      "Ich hab vergessen 2€"          → sender forgot
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

function parseDate(line) {
  const m = line.match(/^(\d{2})\.(\d{2})\.(\d{2}),\s*\d{2}:\d{2}/)
  if (!m) return null
  return `20${m[3]}-${m[2]}-${m[1]}`
}

function isSelfReferential(text) {
  return SELF_REFERENTIAL.some(re => re.test(text.trim()))
}

function extractFromSegment(seg, date, sender) {
  // Clean up edit markers
  const s = seg.replace(/<Diese Nachricht wurde bearbeitet\.?>/gi, '').trim()
  if (!s) return null

  // Pattern A: "Name(s) Betrag€"  →  "Flo Gruber 2€", "Goga 5 €"
  let m = s.match(/^(.+?)\s+([\d]+(?:[,.][\d]+)?)\s*[€$&]\s*$/)
  if (!m) m = s.match(/^(.+?)\s+([\d]+(?:[,.][\d]+)?)\s*[Ee]uro\s*$/)
  if (!m) m = s.match(/^(.+?)\s+([\d]+(?:[,.][\d]+)?)\s*[€$&]/)

  if (m) {
    let rawName = m[1].replace(/[*_~`]/g, '').trim()
    const amount = parseFloat(m[2].replace(',', '.'))

    // If the text is self-referential ("Hab mein Maßband verloren 20€"),
    // use the sender as the person instead of the phrase
    if (isSelfReferential(rawName)) {
      if (!sender) return null
      rawName = sender
    }

    if (isValidEntry(rawName, amount))
      return { rawName, amount, date, originalText: s }
    return null
  }

  // Pattern B: "Betrag€ Name"  →  "2€ Emma"
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
 * @param {string} text - Raw content of WhatsApp .txt export
 * @returns {Array<{rawName,amount,date,originalText,sender}>}
 */
export function parseChat(text) {
  const lines = text.split('\n')
  const results = []

  for (const line of lines) {
    const date = parseDate(line)
    if (!date) continue

    const dashIdx = line.indexOf(' - ')
    if (dashIdx < 0) continue
    const after = line.slice(dashIdx + 3)

    if (SKIP_PATTERNS.some(p => after.includes(p))) continue

    // Extract sender name (before the first ": ")
    const ci     = after.indexOf(': ')
    const sender = ci >= 0 ? after.slice(0, ci).trim() : ''
    const body   = ci >= 0 ? after.slice(ci + 2).trim() : after.trim()

    // Handle multi-line messages
    const segs = body.split('\n')
    for (const seg of segs) {
      const entry = extractFromSegment(seg, date, sender)
      if (entry) results.push({ ...entry, sender })
    }
  }

  return results
}
