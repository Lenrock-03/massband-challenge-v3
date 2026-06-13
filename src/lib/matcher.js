/**
 * Levenshtein distance between two strings (case-insensitive).
 */
function lev(a, b) {
  a = a.toLowerCase()
  b = b.toLowerCase()
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

/**
 * Similarity score [0..1] between two strings.
 */
function sim(a, b) {
  a = a.trim(); b = b.trim()
  const ml = Math.max(a.length, b.length)
  if (!ml) return 1
  return 1 - lev(a, b) / ml
}

/**
 * Find the best matching person from a list for a raw name string.
 *
 * @param {string} raw - Raw name from chat (e.g. "Gritschi", "Flo Gruber")
 * @param {Array<{id,name,aliases}>} persons - All known persons
 * @param {Object} mappings - { alias: personId } dictionary
 * @returns {{ person: Object|null, conf: number, how: string }}
 */
export function matchName(raw, persons, mappings) {
  const key = raw.trim().toLowerCase()
  if (!key) return { person: null, conf: 0, how: 'empty' }

  // 1. Exact mapping dictionary hit
  if (mappings[key]) {
    const p = persons.find(x => x.id === mappings[key])
    if (p) return { person: p, conf: 1.0, how: 'mapping' }
  }

  // 2. Alias fields on person objects
  for (const p of persons) {
    if ((p.aliases || []).some(a => a.toLowerCase() === key))
      return { person: p, conf: 1.0, how: 'alias' }
  }

  // 3. Fuzzy match against multiple name variants per person
  let best = null, bestScore = 0

  for (const p of persons) {
    const full   = p.name.toLowerCase()
    const parts  = full.split(' ')
    const first  = parts[0]
    const last   = parts[parts.length - 1]

    const candidates = [
      full,
      first,
      last,
      `${first} ${last[0]}`,          // "Florian G"
      `${first[0]}. ${last}`,          // "F. Gruber"
      parts.slice(0, 2).join(' '),     // first two words
      parts.slice(-2).join(' '),       // last two words
    ]

    // If raw itself has multiple words, also try permutations
    if (key.includes(' ')) {
      const rp = key.split(' ')
      candidates.push(rp[0], rp[rp.length - 1], rp.join(' '))
    }

    const score = Math.max(...candidates.map(c => sim(key, c)))
    if (score > bestScore) { bestScore = score; best = p }
  }

  if (!best || bestScore < 0.38)
    return { person: null, conf: 0, how: 'none' }

  return { person: best, conf: bestScore, how: 'fuzzy' }
}
