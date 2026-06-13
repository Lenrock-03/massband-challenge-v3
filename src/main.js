import './style.css'
import {
  db,
  collection, doc,
  addDoc, setDoc, deleteDoc, updateDoc, getDoc,
  onSnapshot, query, orderBy,
  serverTimestamp, writeBatch,
} from './lib/firebase.js'
import { getStudentList } from './lib/studentList.js'
import { matchName }      from './lib/matcher.js'
import { parseChat }      from './lib/parser.js'

// ── State ────────────────────────────────────────────────────────
let persons      = []   // [{id, name, type, aliases}]
let transactions = []   // [{id, personId, amount, type, reason, date, source, originalText}]
let mappings     = {}   // { alias: personId }
let config       = { abiDate: '2026-04-28', adminPwHash: btoa('admin123') }
let isAdmin      = false
let stagingRows  = []
let editingId    = null
let unsubPersons = null
let unsubTx      = null

// ── Utils ─────────────────────────────────────────────────────────
const fmt  = n => n.toFixed(2).replace('.', ',') + ' €'
const fmtD = d => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const today = () => new Date().toISOString().split('T')[0]

function toast(msg, type = 'info') {
  const c = document.getElementById('toasts')
  const t = document.createElement('div')
  t.className = `toast ${type}`
  t.textContent = msg
  c.appendChild(t)
  setTimeout(() => t.remove(), 3500)
}

function $id(id) { return document.getElementById(id) }

// ── Firestore helpers ─────────────────────────────────────────────
async function loadConfig() {
  try {
    const snap = await getDoc(doc(db, 'config', 'main'))
    if (snap.exists()) Object.assign(config, snap.data())
  } catch (_) {}
  const inp = $id('abi-date-inp')
  if (inp) inp.value = config.abiDate || '2026-04-28'
  updateCountdown()
}

async function saveConfig() {
  await setDoc(doc(db, 'config', 'main'), config)
}

async function loadMappings() {
  try {
    const snap = await getDoc(doc(db, 'config', 'mappings'))
    if (snap.exists()) mappings = { ...snap.data() }
  } catch (_) {}
}

async function saveMappings() {
  await setDoc(doc(db, 'config', 'mappings'), mappings)
}

function subscribePersons() {
  if (unsubPersons) unsubPersons()
  unsubPersons = onSnapshot(collection(db, 'persons'), snap => {
    persons = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    // Merge aliases into mappings cache
    snap.docs.forEach(d => {
      const data = d.data()
      ;(data.aliases || []).forEach(a => {
        if (!mappings[a.toLowerCase()]) mappings[a.toLowerCase()] = d.id
      })
    })
    renderBoard()
    if (isAdmin) { populateDropdowns(); renderPersonsList(); renderMappingList() }
  })
}

function subscribeTx() {
  if (unsubTx) unsubTx()
  unsubTx = onSnapshot(
    query(collection(db, 'transactions'), orderBy('date', 'desc')),
    snap => {
      transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      renderBoard()
      updateStats()
      if (isAdmin) renderLedger()
    }
  )
}

// ── Boot ──────────────────────────────────────────────────────────
async function boot() {
  try {
    await Promise.all([loadConfig(), loadMappings()])
    subscribePersons()
    subscribeTx()
    $id('loading').style.display = 'none'
    showView('board')
  } catch (e) {
    $id('loading').innerHTML =
      `<div style="color:var(--red);font-size:14px;text-align:center;padding:20px">
        ⚠️ Firestore-Verbindung fehlgeschlagen<br><small>${e.message}</small>
       </div>`
  }
}

// ── View switching ────────────────────────────────────────────────
function showView(v) {
  $id('view-board').classList.toggle('hidden', v !== 'board')
  $id('view-admin').classList.toggle('hidden', v !== 'admin')
  if (v === 'board') { renderBoard(); updateStats(); updateCountdown() }
  if (v === 'admin') { populateDropdowns(); renderLedger(); renderPersonsList(); renderMappingList() }
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.remove('active')
    p.classList.add('hidden')
  })
  document.querySelector(`.tab-btn[data-tab="${name}"]`).classList.add('active')
  const pane = $id('tab-' + name)
  pane.classList.remove('hidden')
  pane.classList.add('active')

  if (name === 'ledger')   renderLedger()
  if (name === 'persons')  { renderPersonsList(); renderMappingList() }
  if (name === 'quick')    { populateDropdowns(); setTodayDates() }
}

// ── Countdown ─────────────────────────────────────────────────────
function updateCountdown() {
  const abiDate = new Date(config.abiDate || '2026-04-28')
  const now      = new Date()
  const daysLeft = Math.max(0, Math.ceil((abiDate - now) / 86_400_000))
  const pct      = Math.min(100, Math.max(0, (1 - daysLeft / 100) * 100))
  $id('cd-days').textContent    = daysLeft > 0 ? daysLeft : '✓'
  $id('cd-fill').style.width    = pct + '%'
  $id('cd-end').textContent     = abiDate.toLocaleDateString('de-DE')
}

// ── Stats ─────────────────────────────────────────────────────────
function pStats(pid) {
  let debt = 0, paid = 0
  transactions.forEach(t => {
    if (t.personId !== pid) return
    if (t.type === 'PENALTY') debt += t.amount
    else paid += t.amount
  })
  return { debt, paid, open: Math.max(0, debt - paid) }
}

function updateStats() {
  let pot = 0, paid = 0
  transactions.forEach(t => {
    if (t.type === 'PENALTY') pot  += t.amount
    else                      paid += t.amount
  })
  $id('s-pot').textContent  = fmt(pot)
  $id('s-paid').textContent = fmt(paid)
  $id('s-open').textContent = fmt(Math.max(0, pot - paid))
}

// ── Leaderboard ───────────────────────────────────────────────────
function renderBoard() {
  const list = $id('board-list')
  const active = persons.filter(p => transactions.some(t => t.personId === p.id))
  if (!active.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>Noch keine Einträge. Importiere den WhatsApp-Chat im Admin-Bereich.</p>
      </div>`
    return
  }

  const sort = $id('sort-sel').value
  const data = active.map(p => ({ ...p, s: pStats(p.id) }))
  data.sort((a, b) => {
    if (sort === 'open')  return b.s.open - a.s.open
    if (sort === 'total') return b.s.debt - a.s.debt
    if (sort === 'paid')  return b.s.paid - a.s.paid
    return a.name.localeCompare(b.name, 'de')
  })

  list.innerHTML = data.map((p, i) => {
    const txs  = transactions.filter(t => t.personId === p.id)
    const rc   = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : ''
    const badge = p.type === 'teacher' ? '<span class="badge badge-lehrer">Lehrkraft</span>'
                : p.type === 'guest'   ? '<span class="badge badge-gast">Gast</span>' : ''

    const txHtml = txs.length
      ? txs.map(t => `
          <div class="tx-row">
            <span class="tx-dot ${t.type === 'PENALTY' ? 'p' : 'y'}"></span>
            <span class="tx-date">${fmtD(t.date)}</span>
            <span class="tx-reason">${esc(t.reason || '—')}</span>
            <span class="tx-amt ${t.type === 'PENALTY' ? 'p' : 'y'}">${t.type === 'PENALTY' ? '–' : '+'}${fmt(t.amount)}</span>
          </div>`).join('')
      : '<div class="tx-row" style="color:var(--muted)">Keine Einträge</div>'

    return `
      <div class="person-card">
        <div class="person-row" data-txid="tx-${p.id}">
          <div class="rank ${rc}">${i + 1}</div>
          <div class="person-name">${esc(p.name)}${badge}</div>
          <div class="amounts">
            <div class="amount-col"><div class="lbl">SCHULDEN</div><div class="val val-debt">${fmt(p.s.debt)}</div></div>
            <div class="amount-col"><div class="lbl">BEZAHLT</div><div class="val val-paid">${fmt(p.s.paid)}</div></div>
            <div class="amount-col"><div class="lbl">OFFEN</div><div class="val val-open">${fmt(p.s.open)}</div></div>
          </div>
          <span class="chevron" id="chev-${p.id}">▶</span>
        </div>
        <div class="tx-list" id="tx-${p.id}">${txHtml}</div>
      </div>`
  }).join('')

  // Click to expand
  list.querySelectorAll('.person-row').forEach(row => {
    row.addEventListener('click', () => {
      const txId = row.dataset.txid
      document.getElementById(txId).classList.toggle('open')
      row.querySelector('.chevron').classList.toggle('open')
    })
  })
}

// ── Password ──────────────────────────────────────────────────────
function openAdmin() {
  if (isAdmin) { showView('admin'); return }
  $id('pw-modal').classList.remove('hidden')
  setTimeout(() => $id('pw-input').focus(), 50)
}
function closePwModal() {
  $id('pw-modal').classList.add('hidden')
  $id('pw-input').value = ''
  $id('pw-err').classList.add('hidden')
}
function checkPw() {
  const v = $id('pw-input').value
  if (btoa(v) === (config.adminPwHash || btoa('admin123'))) {
    isAdmin = true
    closePwModal()
    showView('admin')
    $id('nav-admin').textContent = '🔓 Admin-Bereich'
    toast('Admin-Bereich entsperrt', 'ok')
  } else {
    $id('pw-err').classList.remove('hidden')
  }
}

// ── Dropdowns ─────────────────────────────────────────────────────
function populateDropdowns() {
  const sorted = [...persons].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const opts = '<option value="">— wählen —</option>' +
    sorted.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')
  ;['qa-person', 'pay-person', 'alias-person'].forEach(id => {
    const el = $id(id)
    if (!el) return
    const prev = el.value
    el.innerHTML = opts
    el.value = prev
  })
}

function setTodayDates() {
  const t = today()
  ;['qa-date', 'pay-date'].forEach(id => {
    const el = $id(id)
    if (el && !el.value) el.value = t
  })
}

// ── Quick Add ─────────────────────────────────────────────────────
async function addPenalty() {
  const pid    = $id('qa-person').value
  const reason = $id('qa-reason').value
  const amt    = parseFloat($id('qa-amt').value)
  const date   = $id('qa-date').value
  const note   = $id('qa-note').value.trim()
  if (!pid) return toast('Bitte Person wählen', 'err')
  if (!amt || amt <= 0) return toast('Bitte Betrag eingeben', 'err')
  await addDoc(collection(db, 'transactions'), {
    personId: pid, amount: amt, type: 'PENALTY',
    reason: (reason || 'Sonstiges') + (note ? ' — ' + note : ''),
    date: date || today(), source: 'MANUAL', originalText: '',
    createdAt: serverTimestamp(),
  })
  toast('Strafe gespeichert', 'ok')
  ;[$id('qa-person'), $id('qa-reason'), $id('qa-note')].forEach(el => { el.value = '' })
  $id('qa-amt').value = ''
}

async function addPayment() {
  const pid  = $id('pay-person').value
  const amt  = parseFloat($id('pay-amt').value)
  const date = $id('pay-date').value
  const note = $id('pay-note').value.trim()
  if (!pid) return toast('Bitte Person wählen', 'err')
  if (!amt || amt <= 0) return toast('Bitte Betrag eingeben', 'err')
  await addDoc(collection(db, 'transactions'), {
    personId: pid, amount: amt, type: 'PAYMENT',
    reason: note || 'Bareinzahlung',
    date: date || today(), source: 'MANUAL', originalText: '',
    createdAt: serverTimestamp(),
  })
  toast('Zahlung gespeichert', 'ok')
  ;[$id('pay-person'), $id('pay-note')].forEach(el => { el.value = '' })
  $id('pay-amt').value = ''
}

// ── Persons ───────────────────────────────────────────────────────
async function addPerson() {
  const name     = $id('np-name').value.trim()
  const type     = $id('np-type').value
  const aliasRaw = $id('np-aliases').value.trim()
  if (!name) return toast('Bitte Namen eingeben', 'err')
  if (persons.find(p => p.name.toLowerCase() === name.toLowerCase()))
    return toast('Person existiert bereits', 'err')
  const aliases = aliasRaw
    ? aliasRaw.split(',').map(a => a.trim()).filter(Boolean)
    : []
  const ref = await addDoc(collection(db, 'persons'), {
    name, type, aliases, createdAt: serverTimestamp(),
  })
  aliases.forEach(a => { mappings[a.toLowerCase()] = ref.id })
  await saveMappings()
  toast(`${name} hinzugefügt`, 'ok')
  $id('np-name').value = ''
  $id('np-aliases').value = ''
}

function renderPersonsList() {
  $id('persons-count').textContent = persons.length
  const el = $id('persons-list')
  if (!persons.length) { el.innerHTML = '<p class="muted">Noch keine Teilnehmer.</p>'; return }
  const sorted = [...persons].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  el.innerHTML = sorted.map(p => {
    const s = pStats(p.id)
    const badge = p.type === 'teacher' ? '<span class="badge badge-lehrer">Lehrkraft</span>'
                : p.type === 'guest'   ? '<span class="badge badge-gast">Gast</span>' : ''
    return `
      <div class="flex-between" style="padding:7px 0;border-bottom:1px solid var(--border)">
        <span>${esc(p.name)}${badge}</span>
        <span style="display:flex;gap:8px;align-items:center">
          <span style="color:var(--red);font-size:12px">${fmt(s.open)} offen</span>
          <button class="btn-danger btn-sm" data-remove="${p.id}">✕</button>
        </span>
      </div>`
  }).join('')

  el.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removePerson(btn.dataset.remove))
  })
}

async function removePerson(id) {
  if (!confirm('Person und alle Transaktionen löschen?')) return
  const batch = writeBatch(db)
  batch.delete(doc(db, 'persons', id))
  transactions.filter(t => t.personId === id).forEach(t => {
    batch.delete(doc(db, 'transactions', t.id))
  })
  Object.keys(mappings).forEach(k => { if (mappings[k] === id) delete mappings[k] })
  await batch.commit()
  await saveMappings()
  toast('Teilnehmer entfernt', 'info')
}

// ── Mappings ──────────────────────────────────────────────────────
async function addMapping() {
  const alias = $id('new-alias').value.trim().toLowerCase()
  const pid   = $id('alias-person').value
  if (!alias || !pid) return toast('Bitte Alias und Person angeben', 'err')
  mappings[alias] = pid
  await saveMappings()
  renderMappingList()
  toast('Mapping gespeichert', 'ok')
  $id('new-alias').value = ''
}

async function deleteMapping(alias) {
  delete mappings[alias]
  await saveMappings()
  renderMappingList()
}

function renderMappingList() {
  const el = $id('mapping-list')
  if (!el) return
  const entries = Object.entries(mappings)
  if (!entries.length) { el.innerHTML = '<p class="muted">Noch keine Mappings.</p>'; return }
  el.innerHTML = entries
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([alias, pid]) => {
      const p = persons.find(x => x.id === pid)
      return `
        <div class="flex-between" style="padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">
          <span><strong>${esc(alias)}</strong> → ${p ? esc(p.name) : '<em style="color:var(--muted)">unbekannt</em>'}</span>
          <button class="btn-ghost btn-sm" data-dmap="${esc(alias)}">✕</button>
        </div>`
    }).join('')

  el.querySelectorAll('[data-dmap]').forEach(btn => {
    btn.addEventListener('click', () => deleteMapping(btn.dataset.dmap))
  })
}

// ── Ledger ────────────────────────────────────────────────────────
function renderLedger() {
  const search = ($id('ldg-search')?.value || '').toLowerCase()
  const filter = $id('ldg-filter')?.value || 'all'

  let txs = [...transactions]
  if (filter !== 'all') txs = txs.filter(t => t.type === filter)
  if (search) txs = txs.filter(t => {
    const p = persons.find(x => x.id === t.personId)
    return (p?.name || '').toLowerCase().includes(search) ||
           (t.reason || '').toLowerCase().includes(search)
  })

  $id('ldg-count').textContent = `${txs.length} Einträge`
  const body = $id('ldg-body')

  if (!txs.length) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px">Keine Einträge gefunden</td></tr>'
    return
  }

  body.innerHTML = txs.map(t => {
    const p = persons.find(x => x.id === t.personId)
    if (editingId === t.id) {
      return `
        <tr style="background:var(--surf2)">
          <td><input type="date" value="${t.date}" id="ed-date" style="width:120px"></td>
          <td>${esc(p?.name || '?')}</td>
          <td>
            <select id="ed-type">
              <option value="PENALTY" ${t.type === 'PENALTY' ? 'selected' : ''}>Strafe</option>
              <option value="PAYMENT" ${t.type === 'PAYMENT' ? 'selected' : ''}>Zahlung</option>
            </select>
          </td>
          <td><input type="number" value="${t.amount}" id="ed-amt" style="width:70px" step="0.5"></td>
          <td><input type="text" value="${t.reason || ''}" id="ed-reason" style="width:180px"></td>
          <td></td>
          <td>
            <button class="btn-success btn-sm" data-save="${t.id}">✓</button>
            <button class="btn-ghost btn-sm" data-cancel="1">✕</button>
          </td>
        </tr>`
    }
    const isP = t.type === 'PENALTY'
    return `
      <tr>
        <td>${fmtD(t.date)}</td>
        <td>${esc(p?.name || '?')}</td>
        <td><span style="font-size:11px;font-weight:600;color:${isP ? 'var(--red)' : 'var(--green)'}">${isP ? 'Strafe' : 'Zahlung'}</span></td>
        <td style="font-weight:600;color:${isP ? 'var(--red)' : 'var(--green)'}">${isP ? '–' : '+'}${fmt(t.amount)}</td>
        <td class="muted">${esc(t.reason || '—')}</td>
        <td><span class="chip ${t.source === 'WHATSAPP' ? 'chip-wa' : 'chip-man'}">${t.source === 'WHATSAPP' ? 'WA' : 'Man'}</span></td>
        <td style="display:flex;gap:4px">
          <button class="btn-outline btn-sm" data-edit="${t.id}">✎</button>
          <button class="btn-danger btn-sm"  data-del="${t.id}">✕</button>
        </td>
      </tr>`
  }).join('')

  body.querySelectorAll('[data-edit]').forEach(b => { b.addEventListener('click', () => { editingId = b.dataset.edit; renderLedger() }) })
  body.querySelectorAll('[data-cancel]').forEach(b => { b.addEventListener('click', () => { editingId = null; renderLedger() }) })
  body.querySelectorAll('[data-save]').forEach(b => {
    b.addEventListener('click', async () => {
      await updateDoc(doc(db, 'transactions', b.dataset.save), {
        date:   $id('ed-date').value,
        type:   $id('ed-type').value,
        amount: parseFloat($id('ed-amt').value),
        reason: $id('ed-reason').value,
      })
      editingId = null
      toast('Gespeichert', 'ok')
    })
  })
  body.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Diesen Eintrag löschen?')) return
      await deleteDoc(doc(db, 'transactions', b.dataset.del))
      toast('Gelöscht', 'info')
    })
  })
}

// ── Chat import & staging ─────────────────────────────────────────
function isDup(personId, amount, date, origText) {
  return transactions.some(
    t => t.personId === personId && t.amount === amount &&
         t.date === date && t.source === 'WHATSAPP' &&
         t.originalText === origText
  )
}

function buildStaging(text) {
  // Merge jahrgangsliste names as virtual persons for matching
  // (they won't be in Firestore until first import creates them)
  const studentList = getStudentList()
  const virtualPersons = [
    ...persons,
    ...studentList
      .filter(name => !persons.find(p => p.name.toLowerCase() === name.toLowerCase()))
      .map(name => ({ id: '__student__' + name, name, type: 'student', aliases: [] }))
  ]

  const raw = parseChat(text)
  stagingRows = raw.map(entry => {
    const m   = matchName(entry.rawName, virtualPersons, mappings)
    const dup = m.person ? isDup(m.person.id, entry.amount, entry.date, entry.originalText) : false
    return {
      ...entry,
      match: m,
      dup,
      skip: dup,
      resolvedId: m.person?.id || null,
      resolvedName: m.person?.name || null,
    }
  })

  const card = $id('staging-card')
  card.classList.remove('hidden')
  $id('stg-count').textContent = stagingRows.length

  const ok   = stagingRows.filter(r => r.match.conf >= 0.85 && !r.dup).length
  const warn = stagingRows.filter(r => r.match.conf >= 0.38 && r.match.conf < 0.85 && !r.dup).length
  const dup  = stagingRows.filter(r => r.dup).length
  const err  = stagingRows.filter(r => r.match.conf < 0.38 && !r.dup).length
  $id('stg-stats').textContent = `✓${ok}  ⚠${warn}  🔁${dup} Dup  ✕${err} unbekannt`

  renderStagingTable(virtualPersons)
}

function renderStagingTable(virtualPersons) {
  const sorted = [...(virtualPersons || persons)].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  $id('stg-body').innerHTML = stagingRows.map((row, i) => {
    const label = row.dup
      ? '<span class="s-dup">Duplikat</span>'
      : row.match.conf >= 0.85
        ? '<span class="s-ok">✓ Auto</span>'
        : row.match.conf >= 0.38
          ? '<span class="s-warn">⚠ Prüfen</span>'
          : '<span class="s-err">? Unbekannt</span>'

    const opts = '<option value="">—</option>' +
      sorted.map(p => `<option value="${p.id}"${p.id === row.resolvedId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')

    return `
      <tr style="${row.dup ? 'opacity:.45' : ''}">
        <td>${fmtD(row.date)}</td>
        <td style="color:var(--muted)">${esc(row.rawName)}</td>
        <td><select class="match-sel" data-stg="${i}">${opts}</select></td>
        <td style="font-weight:600;color:var(--red)">${fmt(row.amount)}</td>
        <td>${label}</td>
        <td><input type="checkbox" data-skip="${i}"${row.skip ? ' checked' : ''}></td>
      </tr>`
  }).join('')

  $id('stg-body').querySelectorAll('[data-stg]').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = +sel.dataset.stg
      stagingRows[i].resolvedId = sel.value
      stagingRows[i].skip = !sel.value
    })
  })
  $id('stg-body').querySelectorAll('[data-skip]').forEach(cb => {
    cb.addEventListener('change', () => { stagingRows[+cb.dataset.skip].skip = cb.checked })
  })
}

function clearStaging() {
  stagingRows = []
  $id('staging-card').classList.add('hidden')
  $id('file-inp').value = ''
}

async function confirmImport() {
  const toImport = stagingRows.filter(r => !r.skip && r.resolvedId)
  if (!toImport.length) return toast('Keine Einträge zum Importieren', 'err')

  const batch = writeBatch(db)
  let newMappings = false

  for (const row of toImport) {
    let personId = row.resolvedId

    // If it's a virtual (jahrgangsliste) person not yet in Firestore, create them
    if (personId.startsWith('__student__')) {
      const name = row.resolvedName
      const existing = persons.find(p => p.name.toLowerCase() === name.toLowerCase())
      if (existing) {
        personId = existing.id
      } else {
        const newRef = doc(collection(db, 'persons'))
        batch.set(newRef, { name, type: 'student', aliases: [], createdAt: serverTimestamp() })
        personId = newRef.id
      }
    }

    // Learn mapping
    const key = row.rawName.toLowerCase()
    if (!mappings[key] || mappings[key] !== personId) {
      mappings[key] = personId
      newMappings = true
    }

    const txRef = doc(collection(db, 'transactions'))
    batch.set(txRef, {
      personId, amount: row.amount, type: 'PENALTY',
      reason: 'Maßband-Vergehen', date: row.date,
      source: 'WHATSAPP', originalText: row.originalText,
      createdAt: serverTimestamp(),
    })
  }

  await batch.commit()
  if (newMappings) await saveMappings()

  const skipped = stagingRows.length - toImport.length
  clearStaging()
  toast(`${toImport.length} importiert, ${skipped} übersprungen`, 'ok')
}

// ── Settings ──────────────────────────────────────────────────────
async function saveAbiDate() {
  config.abiDate = $id('abi-date-inp').value
  await saveConfig()
  updateCountdown()
  toast('Gespeichert', 'ok')
}

async function changePw() {
  const a = $id('new-pw1').value, b = $id('new-pw2').value
  if (!a) return toast('Bitte Passwort eingeben', 'err')
  if (a !== b) return toast('Passwörter stimmen nicht überein', 'err')
  config.adminPwHash = btoa(a)
  await saveConfig()
  toast('Passwort geändert', 'ok')
  $id('new-pw1').value = ''
  $id('new-pw2').value = ''
}

// ── Export ────────────────────────────────────────────────────────
function exportCSV() {
  let csv = 'Name;Typ;Schulden;Bezahlt;Offen\n'
  ;[...persons].sort((a, b) => a.name.localeCompare(b.name, 'de')).forEach(p => {
    const s = pStats(p.id)
    csv += `${p.name};${p.type};${s.debt.toFixed(2)};${s.paid.toFixed(2)};${s.open.toFixed(2)}\n`
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
  a.download = 'massband_teilnehmer.csv'
  a.click()
}

function exportJSON() {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(
    [JSON.stringify({ persons, transactions, mappings, config }, null, 2)],
    { type: 'application/json' }
  ))
  a.download = 'massband_export.json'
  a.click()
}

// ── Wire up all events ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Nav
  $id('nav-board').addEventListener('click', () => showView('board'))
  $id('nav-admin').addEventListener('click', openAdmin)
  $id('admin-back').addEventListener('click', () => showView('board'))

  // Password
  $id('pw-submit').addEventListener('click', checkPw)
  $id('pw-cancel').addEventListener('click', closePwModal)
  $id('pw-input').addEventListener('keydown', e => { if (e.key === 'Enter') checkPw() })

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  })

  // Sort
  $id('sort-sel').addEventListener('change', renderBoard)

  // Upload zone
  const zone = $id('upload-zone')
  const inp  = $id('file-inp')
  zone.addEventListener('click', () => inp.click())
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag') })
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'))
  zone.addEventListener('drop', e => {
    e.preventDefault()
    zone.classList.remove('drag')
    const f = e.dataTransfer.files[0]
    if (f) processFile(f)
  })
  inp.addEventListener('change', e => { const f = e.target.files[0]; if (f) processFile(f) })

  function processFile(file) {
    if (!file.name.endsWith('.txt')) return toast('Bitte eine .txt-Datei hochladen', 'err')
    const r = new FileReader()
    r.onload = e => buildStaging(e.target.result)
    r.readAsText(file, 'UTF-8')
  }

  $id('stg-clear').addEventListener('click', clearStaging)
  $id('stg-confirm').addEventListener('click', confirmImport)

  // Quick add
  $id('qa-reason').addEventListener('change', () => {
    const opt = $id('qa-reason').selectedOptions[0]
    if (opt?.dataset.amt) $id('qa-amt').value = opt.dataset.amt
  })
  $id('qa-submit').addEventListener('click', addPenalty)
  $id('pay-submit').addEventListener('click', addPayment)

  // Ledger
  $id('ldg-search').addEventListener('input', renderLedger)
  $id('ldg-filter').addEventListener('change', renderLedger)

  // Persons
  $id('np-submit').addEventListener('click', addPerson)
  $id('alias-submit').addEventListener('click', addMapping)

  // Settings
  $id('abi-save').addEventListener('click', saveAbiDate)
  $id('pw-change').addEventListener('click', changePw)
  $id('export-csv').addEventListener('click', exportCSV)
  $id('export-json').addEventListener('click', exportJSON)

  // Boot
  boot()
})
