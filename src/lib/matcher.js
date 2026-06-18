/**
 * Hardcoded alias dictionary — maps every known chat nickname/variant
 * to the exact full name as it appears in jahrgangsliste.csv.
 * These take priority over fuzzy matching.
 */
export const HARDCODED_ALIASES = {
  // ── Tobias Gritschneder (many misspellings) ──────────────────
  'gritscheneder':        'Tobias Gritschneder',
  'gritschneier':         'Tobias Gritschneder',
  'gritsxheneier':        'Tobias Gritschneder',
  'grotschneier':         'Tobias Gritschneder',
  'gritschneder':         'Tobias Gritschneder',
  'tobias grixeneier':    'Tobias Gritschneder',
  'tobi grixeneier':      'Tobias Gritschneder',
  'tobi':                 'Tobias Gritschneder',

  // ── Florian Gruber ───────────────────────────────────────────
  'flo gruber':           'Florian Gruber',
  'flo g.':               'Florian Gruber',
  'flo gruber nochmal':   'Florian Gruber',

  // ── Florian Reichelt ─────────────────────────────────────────
  'flo r.':               'Florian Reichelt',
  'flo reichelt':         'Florian Reichelt',
  'flo':                  'Florian Reichelt',

  // ── Finn Goga ────────────────────────────────────────────────
  'goga':                 'Finn Goga',
  'finn goga':            'Finn Goga',

  // ── Theresa Matt ─────────────────────────────────────────────
  'thesi':                'Theresa Matt',

  // ── Fynn Stöcker ─────────────────────────────────────────────
  'fynn':                 'Fynn Stöcker',

  // ── Matthias Weinhart ────────────────────────────────────────
  'matthias':             'Matthias Weinhart',

  // ── Christoph Strickstrack ───────────────────────────────────
  'christoph':            'Christoph Strickstrack',

  // ── Alexa Zengerle ───────────────────────────────────────────
  'alexa':                'Alexa Zengerle',

  // ── Julia Altenschöpfer ──────────────────────────────────────
  'julia a':              'Julia Altenschöpfer',
  'julia a.':             'Julia Altenschöpfer',
  'julia altenschöpfer':  'Julia Altenschöpfer',

  // ── Marlene Rein ─────────────────────────────────────────────
  'marlene':              'Marlene Rein',
  'marlene rein':         'Marlene Rein',

  // ── Franziska Frech ──────────────────────────────────────────
  'franzi':               'Franziska Frech',

  // ── Stephanie Eberl ──────────────────────────────────────────
  'stephi':               'Stephanie Eberl',
  'steffi':               'Stephanie Eberl',

  // ── Aviva Hägele ─────────────────────────────────────────────
  'aviva':                'Aviva Hägele',

  // ── Leonhard Everts ──────────────────────────────────────────
  'leo everts':           'Leonhard Everts',
  'leo e.':               'Leonhard Everts',
  'everts':               'Leonhard Everts',

  // ── Kathrin Kornbichler ───────────────────────────────────────
  'kathrin':              'Kathrin Kornbichler',
  'katrin':               'Kathrin Kornbichler',

  // ── Lotta Miesen ─────────────────────────────────────────────
  'lotta':                'Lotta Miesen',

  // ── Janina Auer ──────────────────────────────────────────────
  'janni':                'Janina Auer',
  'jani':                 'Janina Auer',
  'janina':               'Janina Auer',

  // ── Emma Gnegel ──────────────────────────────────────────────
  'emma':                 'Emma Gnegel',

  // ── Daniel Reichard ──────────────────────────────────────────
  'daniel':               'Daniel Reichard',
  'daniel schief':        'Daniel Reichard',

  // ── Fiona Neumeier ───────────────────────────────────────────
  'fiona':                'Fiona Neumeier',

  // ── Sara Schott ──────────────────────────────────────────────
  'sara':                 'Sara Schott',

  // ── Julia Burchard ───────────────────────────────────────────
  'julia':                'Julia Burchard',

  // ── Finja Müller-Vogt ────────────────────────────────────────
  'finja':                'Finja Müller-Vogt',

  // ── Moritz Gehr ──────────────────────────────────────────────
  'moritz':               'Moritz Gehr',
  'moritz gehr':          'Moritz Gehr',

  // ── Sophie Schroedter ────────────────────────────────────────
  'sophie':               'Sophie Schroedter',

  // ── Rosi Stinglhammer ────────────────────────────────────────
  'rosi':                 'Rosi Stinglhammer',
  'rosie':                'Rosi Stinglhammer',
  'rinsi':                'Rosi Stinglhammer',
  'mayrock':              'Rosi Stinglhammer',

  // ── Luis Hummel ──────────────────────────────────────────────
  // Chat misspells as "Louis Hummel" — correct is Luis Hummel
  'luis hummel':          'Luis Hummel',
  'louis hummel':         'Luis Hummel',

  // ── Louise Malcomess ─────────────────────────────────────────
  'lou':                  'Louise Malcomess',
  'louise':               'Louise Malcomess',
  'lou zu viel angeschnitten': 'Louise Malcomess',

  // ── Louis Harth ──────────────────────────────────────────────
  'louis h':              'Louis Harth',
  'louis harth':          'Louis Harth',

  // ── Patrick Sauer ────────────────────────────────────────────
  'patrick':              'Patrick Sauer',

  // ── Katharina Weber ──────────────────────────────────────────
  'katha':                'Katharina Weber',
  'katha weber':          'Katharina Weber',
  'katha w':              'Katharina Weber',

  // ── Valentin Rinshofer ───────────────────────────────────────
  'rinshofer':            'Valentin Rinshofer',

  // ── Paul Aschauer ────────────────────────────────────────────
  'paul':                 'Paul Aschauer',

  // ── Yukina Schiesti ──────────────────────────────────────────
  'yukina':               'Yukina Schiesti',

  // ── Marie Sophie Karpetta ────────────────────────────────────
  'karli':                'Marie Sophie Karpetta',

  // ── Timon Grantner ───────────────────────────────────────────
  'timon':                'Timon Grantner',

  // ── Lennart Gertler ──────────────────────────────────────────
  'lennart':              'Lennart Gertler',

  // ── Laura Tochtermann ────────────────────────────────────────
  'laura t':              'Laura Tochtermann',
  'laura tochtermann':    'Laura Tochtermann',

  // ── Marlene Schmid ───────────────────────────────────────────
  'schmid striegl':       'Marlene Schmid',
  'schmid strigl':        'Marlene Schmid',
  'schmid-strigl':        'Marlene Schmid',

  // ── Lukas Riedl ──────────────────────────────────────────────
  'lukas':                'Lukas Riedl',
  'luggy':                'Lukas Riedl',
  'lukas riedl':          'Lukas Riedl',

  // ── Kornel Riedl ─────────────────────────────────────────────
  'kornel':               'Kornel Riedl',

  // ── Karl Absmaier ────────────────────────────────────────────
  'karl':                 'Karl Absmaier',

  // ── Charlotte Seidl ──────────────────────────────────────────
  'charlotte':            'Charlotte Seidl',

  // ── Annalena Geuder ──────────────────────────────────────────
  'annalena':             'Annalena Geuder',
  'anna lena':            'Annalena Geuder',

  // ── Lina Höfer ───────────────────────────────────────────────
  'lina':                 'Lina Höfer',

  // ── Nick Lachner ─────────────────────────────────────────────
  'nick':                 'Nick Lachner',

  // ── Julie Braun ──────────────────────────────────────────────
  'julie':                'Julie Braun',
  'juli':                 'Julie Braun',

  // ── Jonas Grandy ─────────────────────────────────────────────
  'jonas':                'Jonas Grandy',

  // ── Hannah Renner ────────────────────────────────────────────
  'hannah':               'Hannah Renner',
  'hannah renner':        'Hannah Renner',

  // ── Laura Müller ─────────────────────────────────────────────
  'laura müller':         'Laura Müller',

  // ── Luis Nowak ───────────────────────────────────────────────
  'luis nowak':           'Luis Nowak',

  // ── Thomas Brunner ───────────────────────────────────────────
  'thomas':               'Thomas Brunner',
  'tommy':                'Thomas Brunner',

  // ── Anna Oßwald ──────────────────────────────────────────────
  'anna':                 'Anna Oßwald',

  // ── Kilian Widmann ───────────────────────────────────────────
  'kilian widmann':       'Kilian Widmann',
  'kili':                 'Kilian Widmann',

  // ── Lenny Achatz ─────────────────────────────────────────────
  'lenny':                'Lenny Achatz',
  'lenny…':               'Lenny Achatz',

  // ── Lehrer / Gäste ───────────────────────────────────────────
  // Diese werden beim Import als "teacher" angelegt falls nicht vorhanden
  'frau regus':           'Frau Regus',
  'herr zimmermann':      'Herr Zimmermann',
  'zimmermann m':         'Herr Zimmermann',
  'herr zimmermann:':     'Herr Zimmermann',
  'frau wiener':          'Frau Wiener',

  // ── Basti austeigen → Sebastian Stockhaus ────────────────────
  'basti austeigen':      'Sebastian Stockhaus',
}

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

/** Similarity score [0..1] */
function sim(a, b) {
  a = a.trim(); b = b.trim()
  const ml = Math.max(a.length, b.length)
  if (!ml) return 1
  return 1 - lev(a, b) / ml
}

/**
 * Normalize German umlauts and common substitutions for better matching.
 */
function normalize(s) {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss').replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

/**
 * Build all candidate strings for a person to match against.
 */
function buildCandidates(p) {
  const full  = p.name.toLowerCase()
  const norm  = normalize(p.name)
  const parts = full.split(' ')
  const normP = norm.split(' ')
  const first = parts[0]
  const last  = parts[parts.length - 1]
  const normFirst = normP[0]
  const normLast  = normP[normP.length - 1]

  return [
    full,
    norm,
    first,
    normFirst,
    last,
    normLast,
    `${first} ${last[0]}`,
    `${normFirst} ${normLast[0]}`,
    `${first[0]}. ${last}`,
    parts.slice(0, 2).join(' '),
    normP.slice(0, 2).join(' '),
    parts.slice(-2).join(' '),
    normP.slice(-2).join(' '),
    first.slice(0, 4),
    normFirst.slice(0, 4),
    first.slice(0, 3),
  ].filter(Boolean)
}

/**
 * Find the best matching person from a list for a raw name string.
 *
 * @param {string} raw - Raw name from chat
 * @param {Array<{id,name,aliases}>} persons - All known persons
 * @param {Object} mappings - { alias: personId } dictionary
 * @returns {{ person: Object|null, conf: number, how: string }}
 */
export function matchName(raw, persons, mappings) {
  const key     = raw.trim().toLowerCase()
  const keyNorm = normalize(raw)
  if (!key) return { person: null, conf: 0, how: 'empty' }

  // 0. Hardcoded alias dictionary (highest priority)
  const hardcodedName = HARDCODED_ALIASES[key]
  if (hardcodedName) {
    const p = persons.find(x => x.name.toLowerCase() === hardcodedName.toLowerCase())
    if (p) return { person: p, conf: 1.0, how: 'hardcoded' }
    // Person not yet in Firestore — return virtual placeholder.
    // The import will create them automatically.
    const isTeacher = ['frau regus', 'frau wiener', 'herr zimmermann', 'zimmermann m', 'herr zimmermann:']
      .includes(key)
    return {
      person: {
        id:      '__hardcoded__' + hardcodedName,
        name:    hardcodedName,
        type:    isTeacher ? 'teacher' : 'student',
        aliases: [],
      },
      conf: 1.0,
      how:  'hardcoded',
    }
  }

  // 1. Firestore mapping dictionary
  if (mappings[key]) {
    const p = persons.find(x => x.id === mappings[key])
    if (p) return { person: p, conf: 1.0, how: 'mapping' }
  }
  if (mappings[keyNorm]) {
    const p = persons.find(x => x.id === mappings[keyNorm])
    if (p) return { person: p, conf: 1.0, how: 'mapping' }
  }

  // 2. Alias fields on person objects (exact + normalized)
  for (const p of persons) {
    if ((p.aliases || []).some(a =>
      a.toLowerCase() === key || normalize(a) === keyNorm
    )) return { person: p, conf: 1.0, how: 'alias' }
  }

  // 3. Exact first-name match (high confidence)
  for (const p of persons) {
    const first = p.name.split(' ')[0].toLowerCase()
    if (first === key) return { person: p, conf: 0.9, how: 'firstname' }
  }

  // 4. Fuzzy match against all candidate variants
  let best = null, bestScore = 0

  for (const p of persons) {
    const candidates = buildCandidates(p)

    const rawVariants = [key, keyNorm]
    if (key.includes(' ')) {
      const rp = key.split(' ')
      rawVariants.push(rp[0], rp[rp.length - 1])
    }
    if (keyNorm.includes(' ')) {
      const rp = keyNorm.split(' ')
      rawVariants.push(rp[0], rp[rp.length - 1])
    }

    let score = 0
    for (const rv of rawVariants) {
      for (const c of candidates) {
        const s = sim(rv, c)
        const boost = (rv.startsWith(c) || c.startsWith(rv)) ? 0.08 : 0
        score = Math.max(score, s + boost)
      }
    }
    score = Math.min(1, score)

    if (score > bestScore) { bestScore = score; best = p }
  }

  if (!best || bestScore < 0.38)
    return { person: null, conf: 0, how: 'none' }

  return { person: best, conf: bestScore, how: 'fuzzy' }
}
