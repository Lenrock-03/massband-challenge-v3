/**
 * Parse a WhatsApp .txt export and extract penalty entries.
 *
 * Each returned entry: { rawName, amount, date, originalText }
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

function parseDate(line) {
  const m = line.match(/^(\d{2})\.(\d{2})\.(\d{2}),\s*\d{2}:\d{2}/)
  if (!m) return null
  return `20${m[3]}-${m[2]}-${m[1]}`
}

function extractFromSegment(seg, date) {
  // Clean up edit markers
  const s = seg.replace(/<Diese Nachricht wurde bearbeitet\.?>/gi, '').trim()
  if (!s) return null

  // Pattern A: "Name(s) Betrag€"  →  "Flo Gruber 2€", "Goga 5 €", "Tommy 1euro"
  let m = s.match(/^(.+?)\s+([\d]+(?:[,.][\d]+)?)\s*[€$&]\s*$/)
  if (!m) m = s.match(/^(.+?)\s+([\d]+(?:[,.][\d]+)?)\s*[Ee]uro\s*$/)
  if (!m) m = s.match(/^(.+?)\s+([\d]+(?:[,.][\d]+)?)\s*[€$&]/)

  if (m) {
    const rawName = m[1].replace(/[*_~`]/g, '').trim()
    const amount  = parseFloat(m[2].replace(',', '.'))
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
 * @returns {Array<{rawName,amount,date,originalText}>}
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

    // Strip "Sender: " prefix
    const ci    = after.indexOf(': ')
    const body  = ci >= 0 ? after.slice(ci + 2).trim() : after.trim()

    // Handle multi-line messages (Goga sent several names on separate lines)
    const segs = body.split('\n')
    for (const seg of segs) {
      const entry = extractFromSegment(seg, date)
      if (entry) results.push(entry)
    }
  }

  return results
}
