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
let persons      = []
let transactions = []
let mappings     = {}
let config       = { abiDate: '2026-04-28', adminPwHash: btoa('admin123') }
let isAdmin      = false
let stagingRows  = []
let editingId    = null
let unsubPersons = null
let unsubTx      = null
let stagingVP    = []

// ── Utils ─────────────────────────────────────────────────────────
const fmt  = n => n.toFixed(2).replace('.', ',') + ' €'
const fmtD = d => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

// ── Firestore ─────────────────────────────────────────────────────
async function loadConfig() {
  try {
    const snap = await getDoc(doc(db, 'config', 'main'))
    if (snap.exists()) Object.assign(config, snap.data())
  } catch (_) {}
  const inp = $id('abi-date-inp')
  if (inp) inp.value = config.abiDate || '2026-04-28'
  updateCountdown()
}
async function saveConfig() { await setDoc(doc(db, 'config', 'main'), config) }

async function loadMappings() {
  try {
    const snap = await getDoc(doc(db, 'config', 'mappings'))
    if (snap.exists()) mappings = { ...snap.data() }
  } catch (_) {}
}
async function saveMappings() { await setDoc(doc(db, 'config', 'mappings'), mappings) }

// Legt beim ersten Start alle Personen aus der Jahrgangsliste
// und alle bekannten Lehrer/Sonderpersonen in Firestore an,
// damit der Matcher nach einem Firestore-Reset sofort funktioniert.
async function seedHardcodedAliases() {
  // Schon geseedet?
  if (mappings['__seeded__']) return

  const studentList = getStudentList()
  const TEACHER_NAMES_SET = new Set(['frau regus', 'frau wiener', 'herr zimmermann'])

  const toCreate = studentList.map(name => ({
    name,
    type: TEACHER_NAMES_SET.has(name.toLowerCase()) ? 'teacher' : 'student',
  }))

  // Firestore schreibt max 500 Ops pro Batch
  let batch = writeBatch(db)
  let ops = 0
  let newMappingsToSave = false

  for (const entry of toCreate) {
    // Nicht anlegen wenn schon vorhanden
    if (persons.some(p => p.name.toLowerCase() === entry.name.toLowerCase())) continue

    const newRef = doc(collection(db, 'persons'))
    batch.set(newRef, { name: entry.name, type: entry.type, aliases: [], createdAt: serverTimestamp() })
    ops++
    if (ops >= 490) { await batch.commit(); batch = writeBatch(db); ops = 0 }
  }

  if (ops > 0) await batch.commit()

  // Marker setzen damit wir das nicht zweimal machen
  mappings['__seeded__'] = '1'
  await saveMappings()

  toast('Teilnehmerliste initialisiert', 'info')
}

function subscribePersons() {
  if (unsubPersons) unsubPersons()
  let seeded = false
  unsubPersons = onSnapshot(collection(db, 'persons'), snap => {
    persons = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    snap.docs.forEach(d => {
      const data = d.data()
      ;(data.aliases || []).forEach(a => {
        if (!mappings[a.toLowerCase()]) mappings[a.toLowerCase()] = d.id
      })
    })
    // Seed auf dem ersten Snapshot — persons ist jetzt befüllt
    if (!seeded) { seeded = true; seedHardcodedAliases() }
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

// ── Views ─────────────────────────────────────────────────────────
function showView(v) {
  $id('view-board').classList.toggle('hidden', v !== 'board')
  $id('view-admin').classList.toggle('hidden', v !== 'admin')
  if (v === 'board') { renderBoard(); updateStats(); updateCountdown() }
  if (v === 'admin') { populateDropdowns(); renderLedger(); renderPersonsList(); renderMappingList() }
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
  document.querySelectorAll('.tab-pane').forEach(p => { p.classList.remove('active'); p.classList.add('hidden') })
  document.querySelector(`.tab-btn[data-tab="${name}"]`).classList.add('active')
  const pane = $id('tab-' + name)
  pane.classList.remove('hidden')
  pane.classList.add('active')
  if (name === 'ledger')  renderLedger()
  if (name === 'persons') { renderPersonsList(); renderMappingList() }
  if (name === 'quick')   { populateDropdowns(); setTodayDates() }
  if (name === 'dedup')   { renderDedupScan(); renderDataFixes() }
}

// ── Countdown ─────────────────────────────────────────────────────
function updateCountdown() {
  const abiDate = new Date(config.abiDate || '2026-04-28')
  const now      = new Date()
  const daysLeft = Math.max(0, Math.ceil((abiDate - now) / 86_400_000))
  const pct      = Math.min(100, Math.max(0, (1 - daysLeft / 100) * 100))
  $id('cd-days').textContent = daysLeft > 0 ? daysLeft : '✓'
  $id('cd-fill').style.width = pct + '%'
  $id('cd-end').textContent  = abiDate.toLocaleDateString('de-DE')
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
  transactions.forEach(t => { if (t.type === 'PENALTY') pot += t.amount; else paid += t.amount })
  $id('s-pot').textContent  = fmt(pot)
  $id('s-paid').textContent = fmt(paid)
  $id('s-open').textContent = fmt(Math.max(0, pot - paid))
}

// ── Leaderboard ───────────────────────────────────────────────────
function renderBoard() {
  const list   = $id('board-list')
  const active = persons.filter(p => transactions.some(t => t.personId === p.id))
  if (!active.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>Noch keine Einträge. Importiere den WhatsApp-Chat im Admin-Bereich.</p></div>`
    return
  }
  const sort   = $id('sort-sel').value
  const search = ($id('board-search')?.value || '').toLowerCase()
  const data = active
    .filter(p => !search || p.name.toLowerCase().includes(search))
    .map(p => ({ ...p, s: pStats(p.id) }))
  data.sort((a, b) => {
    if (sort === 'open')  return b.s.open - a.s.open
    if (sort === 'total') return b.s.debt - a.s.debt
    if (sort === 'paid')  return b.s.paid - a.s.paid
    return a.name.localeCompare(b.name, 'de')
  })

  list.innerHTML = data.map((p, i) => {
    const txs   = transactions.filter(t => t.personId === p.id)
    const rc    = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : ''
    const badge = p.type === 'teacher' ? '<span class="badge badge-lehrer">Lehrkraft</span>'
                : p.type === 'guest'   ? '<span class="badge badge-gast">Gast</span>' : ''

    const txHtml = txs.length
      ? txs.map(t => {
          const isP = t.type === 'PENALTY'
          const origLine = t.originalText
            ? `<span class="tx-original">💬 ${esc(t.originalText)}${t.sender ? ` <em class="tx-sender">— ${esc(t.sender)}</em>` : ''}</span>`
            : ''
          return `
            <div class="tx-row">
              <span class="tx-dot ${isP ? 'p' : 'y'}"></span>
              <span class="tx-date">${fmtD(t.date)}</span>
              <div class="tx-reason-wrap">
                <span class="tx-reason">${esc(t.reason || '—')}</span>
                ${origLine}
              </div>
              <span class="tx-amt ${isP ? 'p' : 'y'}">${isP ? '–' : '+'}${fmt(t.amount)}</span>
            </div>`
        }).join('')
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

  list.querySelectorAll('.person-row').forEach(row => {
    row.addEventListener('click', () => {
      document.getElementById(row.dataset.txid).classList.toggle('open')
      row.querySelector('.chevron').classList.toggle('open')
    })
  })
}

// ── Password hashing (SHA-256, kein btoa) ─────────────────────────
async function hashPw(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
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
async function checkPw() {
  const v = $id('pw-input').value
  const hash = await hashPw(v)
  const stored = config.adminPwHash || ''
  // Support legacy btoa format for migration
  const match = hash === stored || btoa(v) === stored
  if (match) {
    if (btoa(v) === stored) { config.adminPwHash = hash; await saveConfig() }
    isAdmin = true; closePwModal(); showView('admin')
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
    const el = $id(id); if (!el) return
    const prev = el.value; el.innerHTML = opts; el.value = prev
  })
}
function setTodayDates() {
  const t = today()
  ;['qa-date', 'pay-date'].forEach(id => { const el = $id(id); if (el && !el.value) el.value = t })
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
    date: date || today(), source: 'MANUAL', originalText: '', sender: '',
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
    date: date || today(), source: 'MANUAL', originalText: '', sender: '',
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
  const aliases = aliasRaw ? aliasRaw.split(',').map(a => a.trim()).filter(Boolean) : []
  const ref = await addDoc(collection(db, 'persons'), { name, type, aliases, createdAt: serverTimestamp() })
  aliases.forEach(a => { mappings[a.toLowerCase()] = ref.id })
  await saveMappings()
  toast(`${name} hinzugefügt`, 'ok')
  $id('np-name').value = ''; $id('np-aliases').value = ''
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
  transactions.filter(t => t.personId === id).forEach(t => batch.delete(doc(db, 'transactions', t.id)))
  Object.keys(mappings).forEach(k => { if (mappings[k] === id) delete mappings[k] })
  await batch.commit(); await saveMappings()
  toast('Teilnehmer entfernt', 'info')
}

// ── Mappings ──────────────────────────────────────────────────────
async function addMapping() {
  const alias = $id('new-alias').value.trim().toLowerCase()
  const pid   = $id('alias-person').value
  if (!alias || !pid) return toast('Bitte Alias und Person angeben', 'err')
  mappings[alias] = pid; await saveMappings(); renderMappingList()
  toast('Mapping gespeichert', 'ok'); $id('new-alias').value = ''
}
async function deleteMapping(alias) {
  delete mappings[alias]; await saveMappings(); renderMappingList()
}
function renderMappingList() {
  const el = $id('mapping-list'); if (!el) return
  const entries = Object.entries(mappings)
  if (!entries.length) { el.innerHTML = '<p class="muted">Noch keine Mappings.</p>'; return }
  el.innerHTML = entries.sort((a, b) => a[0].localeCompare(b[0])).map(([alias, pid]) => {
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
    return (p?.name || '').toLowerCase().includes(search) || (t.reason || '').toLowerCase().includes(search)
  })
  $id('ldg-count').textContent = `${txs.length} Einträge`
  const body = $id('ldg-body')
  if (!txs.length) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px">Keine Einträge gefunden</td></tr>'
    return
  }
  body.innerHTML = txs.map(t => {
    const p   = persons.find(x => x.id === t.personId)
    const isP = t.type === 'PENALTY'
    if (editingId === t.id) return `
      <tr style="background:var(--surf2)">
        <td><input type="date" value="${t.date}" id="ed-date" style="width:120px"></td>
        <td>${esc(p?.name || '?')}</td>
        <td><select id="ed-type">
          <option value="PENALTY" ${isP ? 'selected' : ''}>Strafe</option>
          <option value="PAYMENT" ${!isP ? 'selected' : ''}>Zahlung</option>
        </select></td>
        <td><input type="number" value="${t.amount}" id="ed-amt" style="width:70px" step="0.5"></td>
        <td><input type="text" value="${t.reason || ''}" id="ed-reason" style="width:180px"></td>
        <td></td>
        <td style="display:flex;gap:4px">
          <button class="btn-success btn-sm" data-save="${t.id}">✓</button>
          <button class="btn-ghost btn-sm" data-cancel="1">✕</button>
        </td>
      </tr>`
    return `
      <tr>
        <td>${fmtD(t.date)}</td>
        <td>${esc(p?.name || '?')}</td>
        <td><span style="font-size:11px;font-weight:600;color:${isP ? 'var(--red)' : 'var(--green)'}">${isP ? 'Strafe' : 'Zahlung'}</span></td>
        <td style="font-weight:600;color:${isP ? 'var(--red)' : 'var(--green)'}">${isP ? '–' : '+'}${fmt(t.amount)}</td>
        <td class="muted">${esc(t.reason || '—')}${t.originalText ? `<br><span style="font-size:10px">💬 ${esc(t.originalText)}</span>` : ''}</td>
        <td><span class="chip ${t.source === 'WHATSAPP' ? 'chip-wa' : 'chip-man'}">${t.source === 'WHATSAPP' ? 'WA' : 'Man'}</span></td>
        <td style="display:flex;gap:4px">
          <button class="btn-outline btn-sm" data-edit="${t.id}">✎</button>
          <button class="btn-danger btn-sm" data-del="${t.id}">✕</button>
        </td>
      </tr>`
  }).join('')
  body.querySelectorAll('[data-edit]').forEach(b => { b.addEventListener('click', () => { editingId = b.dataset.edit; renderLedger() }) })
  body.querySelectorAll('[data-cancel]').forEach(b => { b.addEventListener('click', () => { editingId = null; renderLedger() }) })
  body.querySelectorAll('[data-save]').forEach(b => {
    b.addEventListener('click', async () => {
      await updateDoc(doc(db, 'transactions', b.dataset.save), {
        date: $id('ed-date').value, type: $id('ed-type').value,
        amount: parseFloat($id('ed-amt').value), reason: $id('ed-reason').value,
      })
      editingId = null; toast('Gespeichert', 'ok')
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

// ── Searchable dropdown ───────────────────────────────────────────
function createSearchDropdown(vpList, selectedId, onChange) {
  const sorted = [...vpList].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const wrap = document.createElement('div')
  wrap.className = 'sd-wrap'
  const selName = selectedId ? (vpList.find(p => p.id === selectedId)?.name || '—') : '— Person wählen —'
  wrap.innerHTML = `
    <div class="sd-display" tabindex="0">${esc(selName)}</div>
    <div class="sd-dropdown hidden">
      <input class="sd-search" placeholder="Suchen…" />
      <div class="sd-options">
        <div class="sd-opt" data-val="">—</div>
        ${sorted.map(p => `<div class="sd-opt" data-val="${p.id}">${esc(p.name)}</div>`).join('')}
      </div>
    </div>`
  const display  = wrap.querySelector('.sd-display')
  const dropdown = wrap.querySelector('.sd-dropdown')
  const search   = wrap.querySelector('.sd-search')
  const optWrap  = wrap.querySelector('.sd-options')
  if (selectedId) display.dataset.value = selectedId

  const filterOpts = q => optWrap.querySelectorAll('.sd-opt').forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none'
  })
  const open  = () => { dropdown.classList.remove('hidden'); search.value = ''; filterOpts(''); search.focus() }
  const close = () => dropdown.classList.add('hidden')

  display.addEventListener('click', () => dropdown.classList.contains('hidden') ? open() : close())
  display.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open() })
  search.addEventListener('input', () => filterOpts(search.value))
  search.addEventListener('keydown', e => e.stopPropagation())
  optWrap.addEventListener('click', e => {
    const opt = e.target.closest('.sd-opt'); if (!opt) return
    const val = opt.dataset.val, name = opt.textContent
    display.textContent = val ? name : '— Person wählen —'
    display.dataset.value = val; close(); onChange(val, name)
  })
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) close() }, true)
  wrap._getValue = () => display.dataset.value || ''
  return wrap
}

// ── Mini add-person form ──────────────────────────────────────────
function mountMiniAddForm(btn, i, vp, body) {
  btn.addEventListener('click', () => {
    const row = stagingRows[i]
    const tr  = $id(`stg-row-${i}`)
    const existing = tr.nextElementSibling
    if (existing?.classList.contains('mini-add-row')) { existing.remove(); return }

    const miniRow = document.createElement('tr')
    miniRow.className = 'mini-add-row'
    miniRow.innerHTML = `
      <td colspan="8" style="padding:8px 10px;background:var(--surf2);border-bottom:1px solid var(--border)">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-size:12px;color:var(--muted)">Neu:</span>
          <input class="mini-name" type="text" placeholder="Vollständiger Name" value="${esc(row.rawName)}" style="width:180px" />
          <select class="mini-type" style="width:110px">
            <option value="student">Schüler/in</option>
            <option value="teacher">Lehrkraft</option>
            <option value="guest">Gast</option>
          </select>
          <button class="btn-gold btn-sm mini-save">✓ Anlegen & zuweisen</button>
          <button class="btn-ghost btn-sm mini-cancel">✕</button>
        </div>
      </td>`
    tr.after(miniRow)

    miniRow.querySelector('.mini-cancel').addEventListener('click', () => miniRow.remove())
    miniRow.querySelector('.mini-save').addEventListener('click', async () => {
      const name = miniRow.querySelector('.mini-name').value.trim()
      const type = miniRow.querySelector('.mini-type').value
      if (!name) return toast('Bitte Namen eingeben', 'err')
      let existingPerson = persons.find(p => p.name.toLowerCase() === name.toLowerCase())
      if (!existingPerson) {
        const ref = await addDoc(collection(db, 'persons'), { name, type, aliases: [], createdAt: serverTimestamp() })
        existingPerson = { id: ref.id, name, type, aliases: [] }
        vp.push(existingPerson)
      }
      stagingRows[i].resolvedId   = existingPerson.id
      stagingRows[i].resolvedName = existingPerson.name
      stagingRows[i].skip         = false
      miniRow.remove()
      const cell = body.querySelector(`.sd-cell[data-sdidx="${i}"]`)
      cell.innerHTML = ''
      const dd = createSearchDropdown(vp, existingPerson.id, (val, n2) => {
        stagingRows[i].resolvedId = val; stagingRows[i].resolvedName = n2; stagingRows[i].skip = !val
      })
      cell.appendChild(dd)
      toast(`${name} angelegt und zugewiesen`, 'ok')
    })
  })
}

// ── Dedup ────────────────────────────────────────────────────────
function findDuplicates() {
  const groups = {}
  persons.forEach(p => {
    const key = p.name.trim().toLowerCase()
    if (!groups[key]) groups[key] = []
    groups[key].push(p)
  })
  return Object.values(groups).filter(g => g.length > 1)
}

function renderDedupScan() {
  const dups = findDuplicates()
  const result = $id('dedup-result')
  const fixBtn = $id('dedup-fix')

  if (!dups.length) {
    result.innerHTML = '<div style="color:var(--green);font-weight:600;padding:12px 0">✓ Keine Duplikate gefunden — alles sauber!</div>'
    fixBtn.classList.add('hidden')
    return
  }

  fixBtn.classList.remove('hidden')
  result.innerHTML = `
    <p class="muted" style="margin-bottom:12px">${dups.length} Gruppe(n) mit Duplikaten gefunden:</p>
    ${dups.map(group => {
      const keeper = group[0]
      const dupes  = group.slice(1)
      const txCount = transactions.filter(t => group.some(p => p.id === t.personId)).length
      return `
        <div style="padding:10px;border:1px solid var(--border);border-radius:var(--rs);margin-bottom:8px;background:var(--bg)">
          <div style="font-weight:600;margin-bottom:6px">${esc(keeper.name)}</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">${txCount} Transaktionen gesamt</div>
          <div style="font-size:11px;display:flex;gap:6px;flex-wrap:wrap">
            <span style="color:var(--green)">✓ Behalten: <strong>${keeper.id.slice(0,8)}…</strong></span>
            ${dupes.map(d => `<span style="color:var(--red)">✕ Löschen: <strong>${d.id.slice(0,8)}…</strong> (${transactions.filter(t=>t.personId===d.id).length} TX)</span>`).join('')}
          </div>
        </div>`
    }).join('')}`
}

async function fixAllDuplicates() {
  const dups = findDuplicates()
  if (!dups.length) return toast('Keine Duplikate gefunden', 'info')

  const total = dups.reduce((s, g) => s + g.length - 1, 0)
  if (!confirm(`${total} Duplikate löschen und Transaktionen zusammenführen?`)) return

  let batchOps = 0
  let batch = writeBatch(db)

  for (const group of dups) {
    const keeper = group[0]
    const dupes  = group.slice(1)
    for (const dupe of dupes) {
      const dupeTxs = transactions.filter(t => t.personId === dupe.id)
      for (const tx of dupeTxs) {
        batch.update(doc(db, 'transactions', tx.id), { personId: keeper.id })
        batchOps++
        if (batchOps >= 490) { await batch.commit(); batch = writeBatch(db); batchOps = 0 }
      }
      Object.keys(mappings).forEach(k => { if (mappings[k] === dupe.id) mappings[k] = keeper.id })
      batch.delete(doc(db, 'persons', dupe.id))
      batchOps++
      if (batchOps >= 490) { await batch.commit(); batch = writeBatch(db); batchOps = 0 }
    }
  }

  if (batchOps > 0) await batch.commit()
  await saveMappings()
  toast(`${total} Duplikate bereinigt`, 'ok')
  renderDedupScan()
}

// ── Data Fixes ────────────────────────────────────────────────────
// TX_FIX_RULES: falsch zugeordnete Transaktionen nach originalText korrigieren
const TX_FIX_RULES = [
  { originalText: 'Rinsi 1€',  correctName: 'Rosi Stinglhammer' },
  { originalText: 'Rinsi 1 €', correctName: 'Rosi Stinglhammer' },
]

// DATA_FIX_RULES: falsch angelegte Personen umbenennen oder zusammenführen
const DATA_FIX_RULES = [
  { wrongName: 'Frau Mayrock',         correctName: 'Rosi Stinglhammer', deleteWrong: true  },
  { wrongName: 'Frau Schmidt-Striegl', correctName: 'Marlene Schmid',    deleteWrong: true  },
  { wrongName: 'Frau Schmid-Strigl',   correctName: 'Marlene Schmid',    deleteWrong: true  },
  { wrongName: 'Louis Hummel',         correctName: 'Luis Hummel',       deleteWrong: false },
  { wrongName: 'Herr M. Zimmermann',   correctName: 'Herr Zimmermann',   deleteWrong: false },
]

function renderDataFixes() {
  const el = $id('data-fixes-result')
  if (!el) return

  const applicablePerson = DATA_FIX_RULES.filter(rule =>
    persons.some(p => p.name.toLowerCase() === rule.wrongName.toLowerCase())
  )
  const applicableTx = TX_FIX_RULES.filter(rule =>
    transactions.some(t => t.originalText?.trim() === rule.originalText.trim())
  )
  const total = applicablePerson.length + applicableTx.length

  const fixBtn = $id('data-fixes-btn')
  if (!total) {
    el.innerHTML = '<div style="color:var(--green);font-weight:600;padding:8px 0">✓ Keine bekannten Datenfehler gefunden.</div>'
    if (fixBtn) fixBtn.classList.add('hidden')
    return
  }
  if (fixBtn) fixBtn.classList.remove('hidden')

  const personItems = applicablePerson.map(rule => {
    const wrong = persons.find(p => p.name.toLowerCase() === rule.wrongName.toLowerCase())
    const txCount = wrong ? transactions.filter(t => t.personId === wrong.id).length : 0
    const action = rule.deleteWrong
      ? `TXs (${txCount}) umbuchen auf <strong>${esc(rule.correctName)}</strong>, dann löschen`
      : `Umbenennen in <strong>${esc(rule.correctName)}</strong>`
    return `<div style="padding:8px 10px;border:1px solid var(--border);border-radius:var(--rs);margin-bottom:6px;background:var(--bg);font-size:13px">
      👤 <span style="color:var(--red)">"${esc(rule.wrongName)}"</span> → ${action}
    </div>`
  })

  const txItems = applicableTx.map(rule => {
    const count = transactions.filter(t => t.originalText?.trim() === rule.originalText.trim()).length
    return `<div style="padding:8px 10px;border:1px solid var(--border);border-radius:var(--rs);margin-bottom:6px;background:var(--bg);font-size:13px">
      💬 <span style="color:var(--red)">"${esc(rule.originalText)}"</span> (${count}x) → umbuchen auf <strong>${esc(rule.correctName)}</strong>
    </div>`
  })

  el.innerHTML = `<p class="muted" style="margin-bottom:10px">${total} bekannte(r) Fehler gefunden:</p>${[...personItems, ...txItems].join('')}`
}

async function applyDataFixes() {
  const applicablePerson = DATA_FIX_RULES.filter(rule =>
    persons.some(p => p.name.toLowerCase() === rule.wrongName.toLowerCase())
  )
  const applicableTx = TX_FIX_RULES.filter(rule =>
    transactions.some(t => t.originalText?.trim() === rule.originalText.trim())
  )
  const total = applicablePerson.length + applicableTx.length
  if (!total) return toast('Keine Fehler zu korrigieren', 'info')
  if (!confirm(`${total} Datenfehler korrigieren?`)) return

  let batch = writeBatch(db)
  let ops = 0
  let newMappings = false

  for (const rule of applicablePerson) {
    const wrong = persons.find(p => p.name.toLowerCase() === rule.wrongName.toLowerCase())
    if (!wrong) continue
    if (rule.deleteWrong) {
      const target = persons.find(p => p.name.toLowerCase() === rule.correctName.toLowerCase())
      if (!target) { toast(`Zielperson "${rule.correctName}" nicht gefunden`, 'err'); continue }
      transactions.filter(t => t.personId === wrong.id).forEach(t => {
        batch.update(doc(db, 'transactions', t.id), { personId: target.id }); ops++
      })
      Object.keys(mappings).forEach(k => {
        if (mappings[k] === wrong.id) { mappings[k] = target.id; newMappings = true }
      })
      batch.delete(doc(db, 'persons', wrong.id)); ops++
    } else {
      batch.update(doc(db, 'persons', wrong.id), { name: rule.correctName }); ops++
    }
    if (ops >= 490) { await batch.commit(); batch = writeBatch(db); ops = 0 }
  }

  for (const rule of applicableTx) {
    const target = persons.find(p => p.name.toLowerCase() === rule.correctName.toLowerCase())
    if (!target) { toast(`Zielperson "${rule.correctName}" nicht gefunden`, 'err'); continue }
    transactions.filter(t => t.originalText?.trim() === rule.originalText.trim()).forEach(t => {
      batch.update(doc(db, 'transactions', t.id), { personId: target.id }); ops++
    })
    if (ops >= 490) { await batch.commit(); batch = writeBatch(db); ops = 0 }
  }

  if (ops > 0) await batch.commit()
  if (newMappings) await saveMappings()
  toast(`${total} Fehler korrigiert`, 'ok')
  renderDedupScan()
  renderDataFixes()
}

// ── Chat import ───────────────────────────────────────────────────
function isDup(personId, amount, date, origText) {
  return transactions.some(t =>
    t.personId === personId && t.amount === amount &&
    t.date === date && t.source === 'WHATSAPP' && t.originalText === origText
  )
}

function buildStaging(text) {
  const studentList = getStudentList()
  stagingVP = [
    ...persons,
    ...studentList
      .filter(name => !persons.find(p => p.name.toLowerCase() === name.toLowerCase()))
      .map(name => ({ id: '__student__' + name, name, type: 'student', aliases: [] }))
  ]
  const raw = parseChat(text)
  stagingRows = raw.map(entry => {
    const m   = matchName(entry.rawName, stagingVP, mappings)
    const dup = m.person ? isDup(m.person.id, entry.amount, entry.date, entry.originalText) : false
    const origLower = (entry.originalText || '').toLowerCase()
    const isPayment = /gezahlt|bezahlt|überwiesen|ueberwiesen|einzahlung|payment|paid/.test(origLower)
    return {
      ...entry, match: m, dup, skip: dup,
      resolvedId:   m.person?.id   || null,
      resolvedName: m.person?.name || null,
      txType: isPayment ? 'PAYMENT' : 'PENALTY',
    }
  })
  $id('staging-card').classList.remove('hidden')
  $id('stg-count').textContent = stagingRows.length
  const ok   = stagingRows.filter(r => r.match.conf >= 0.85 && !r.dup).length
  const warn = stagingRows.filter(r => r.match.conf >= 0.38 && r.match.conf < 0.85 && !r.dup).length
  const dup  = stagingRows.filter(r => r.dup).length
  const err  = stagingRows.filter(r => r.match.conf < 0.38 && !r.dup).length
  $id('stg-stats').textContent = `✓${ok}  ⚠${warn}  🔁${dup} Dup  ✕${err} unbekannt`
  renderStagingTable()
}

function renderStagingTable() {
  const vp   = stagingVP
  const body = $id('stg-body')

  body.innerHTML = stagingRows.map((row, i) => {
    const label = row.dup
      ? '<span class="s-dup">Duplikat</span>'
      : row.match.conf >= 0.85 ? '<span class="s-ok">✓ Auto</span>'
      : row.match.conf >= 0.38 ? '<span class="s-warn">⚠ Prüfen</span>'
      : '<span class="s-err">? Unbekannt</span>'

    const addBtn = !row.dup
      ? `<button class="btn-outline btn-sm" data-addperson="${i}">+ Neu</button>`
      : ''

    const isPenalty  = (row.txType || 'PENALTY') === 'PENALTY'
    const typeToggle = !row.dup
      ? `<select class="stg-type" data-typeidx="${i}" style="font-size:11px;padding:2px 5px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:4px;cursor:pointer">
           <option value="PENALTY" ${isPenalty ? 'selected' : ''}>Strafe</option>
           <option value="PAYMENT" ${!isPenalty ? 'selected' : ''}>Zahlung</option>
         </select>`
      : `<span style="font-size:11px;color:var(--muted)">${isPenalty ? 'Strafe' : 'Zahlung'}</span>`
    const amtColor = isPenalty ? 'var(--red)' : 'var(--green)'

    return `
      <tr style="${row.dup ? 'opacity:.45' : ''}" id="stg-row-${i}">
        <td style="white-space:nowrap">${fmtD(row.date)}</td>
        <td style="font-size:11px;color:var(--muted);max-width:100px;overflow:hidden;text-overflow:ellipsis" title="${esc(row.sender || '')}">${esc(row.sender || '?')}</td>
        <td style="font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis" title="${esc(row.originalText || '')}">${esc(row.originalText || row.rawName)}</td>
        <td class="sd-cell" data-sdidx="${i}"></td>
        <td>${typeToggle}</td>
        <td><input class="stg-amt" data-amtidx="${i}" type="number" value="${row.amount}" step="0.5" min="0.5"
            style="width:60px;font-size:12px;font-weight:600;color:${amtColor};background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:2px 4px;text-align:right"></td>
        <td style="white-space:nowrap">${label} ${addBtn}</td>
        <td><input type="checkbox" data-skip="${i}"${row.skip ? ' checked' : ''}></td>
      </tr>`
  }).join('')

  body.querySelectorAll('.sd-cell').forEach(cell => {
    const i   = +cell.dataset.sdidx
    const row = stagingRows[i]
    const dd  = createSearchDropdown(vp, row.resolvedId, (val, name) => {
      stagingRows[i].resolvedId = val; stagingRows[i].resolvedName = name; stagingRows[i].skip = !val
      const cb = body.querySelector(`[data-skip="${i}"]`); if (cb) cb.checked = !val
    })
    cell.appendChild(dd)
  })

  body.querySelectorAll('[data-addperson]').forEach(btn => {
    mountMiniAddForm(btn, +btn.dataset.addperson, vp, body)
  })

  body.querySelectorAll('.stg-type').forEach(sel => {
    sel.addEventListener('change', () => { stagingRows[+sel.dataset.typeidx].txType = sel.value })
  })

  body.querySelectorAll('.stg-amt').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.amtidx
      const v = parseFloat(inp.value)
      if (!isNaN(v) && v > 0) stagingRows[i].amount = v
    })
  })

  body.querySelectorAll('[data-skip]').forEach(cb => {
    cb.addEventListener('change', () => { stagingRows[+cb.dataset.skip].skip = cb.checked })
  })
}

function clearStaging() {
  stagingRows = []; stagingVP = []
  $id('staging-card').classList.add('hidden')
  $id('file-inp').value = ''
}

async function confirmImport() {
  const toImport = stagingRows.filter(r => !r.skip && r.resolvedId)
  if (!toImport.length) return toast('Keine Einträge zum Importieren', 'err')
  const batch = writeBatch(db)
  let newMappings = false
  const TEACHER_NAMES = ['frau regus', 'frau wiener', 'herr zimmermann']
  const createdPersons = {}

  for (const row of toImport) {
    let personId = row.resolvedId

    if (personId.startsWith('__student__') || personId.startsWith('__hardcoded__')) {
      const name    = row.resolvedName
      const nameKey = name.toLowerCase()
      const type    = TEACHER_NAMES.includes(nameKey) ? 'teacher' : 'student'
      const existing = persons.find(p => p.name.toLowerCase() === nameKey)
      if (existing) {
        personId = existing.id
      } else if (createdPersons[nameKey]) {
        personId = createdPersons[nameKey]
      } else {
        const newRef = doc(collection(db, 'persons'))
        batch.set(newRef, { name, type, aliases: [], createdAt: serverTimestamp() })
        personId = newRef.id
        createdPersons[nameKey] = personId
      }
    }

    const key = row.rawName.toLowerCase()
    if (!mappings[key] || mappings[key] !== personId) { mappings[key] = personId; newMappings = true }
    const txType = row.txType || 'PENALTY'
    const txRef  = doc(collection(db, 'transactions'))
    batch.set(txRef, {
      personId, amount: row.amount,
      type: txType,
      reason: txType === 'PAYMENT' ? 'Einzahlung (aus Chat)' : 'Maßband-Vergehen',
      date: row.date,
      source: 'WHATSAPP',
      originalText: row.originalText || '',
      sender: row.sender || '',
      createdAt: serverTimestamp(),
    })
  }
  await batch.commit()
  if (newMappings) await saveMappings()
  clearStaging()
  toast(`${toImport.length} importiert, ${stagingRows.length - toImport.length} übersprungen`, 'ok')
}

// ── Settings ──────────────────────────────────────────────────────
async function saveAbiDate() {
  config.abiDate = $id('abi-date-inp').value; await saveConfig(); updateCountdown(); toast('Gespeichert', 'ok')
}
async function changePw() {
  const a = $id('new-pw1').value, b = $id('new-pw2').value
  if (!a) return toast('Bitte Passwort eingeben', 'err')
  if (a !== b) return toast('Passwörter stimmen nicht überein', 'err')
  if (a.length < 6) return toast('Mindestens 6 Zeichen', 'err')
  config.adminPwHash = await hashPw(a)
  await saveConfig()
  toast('Passwort geändert', 'ok')
  $id('new-pw1').value = ''; $id('new-pw2').value = ''
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
  a.download = 'massband_teilnehmer.csv'; a.click()
}
function exportJSON() {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(
    [JSON.stringify({ persons, transactions, mappings, config }, null, 2)], { type: 'application/json' }
  ))
  a.download = 'massband_export.json'; a.click()
}

// ── Events ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  $id('nav-board').addEventListener('click', () => showView('board'))
  $id('nav-admin').addEventListener('click', openAdmin)
  $id('admin-back').addEventListener('click', () => showView('board'))
  $id('pw-submit').addEventListener('click', checkPw)
  $id('pw-cancel').addEventListener('click', closePwModal)
  $id('pw-input').addEventListener('keydown', e => { if (e.key === 'Enter') checkPw() })
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  })
  $id('sort-sel').addEventListener('change', renderBoard)
  $id('board-search').addEventListener('input', renderBoard)

  const zone = $id('upload-zone'), inp = $id('file-inp')
  zone.addEventListener('click', () => inp.click())
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag') })
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'))
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag')
    const f = e.dataTransfer.files[0]; if (f) processFile(f)
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
  $id('qa-reason').addEventListener('change', () => {
    const opt = $id('qa-reason').selectedOptions[0]
    if (opt?.dataset.amt) $id('qa-amt').value = opt.dataset.amt
  })
  $id('qa-submit').addEventListener('click', addPenalty)
  $id('pay-submit').addEventListener('click', addPayment)
  $id('ldg-search').addEventListener('input', renderLedger)
  $id('ldg-filter').addEventListener('change', renderLedger)
  $id('np-submit').addEventListener('click', addPerson)
  $id('alias-submit').addEventListener('click', addMapping)
  $id('dedup-scan').addEventListener('click', renderDedupScan)
  $id('dedup-fix').addEventListener('click', fixAllDuplicates)
  $id('data-fixes-btn').addEventListener('click', applyDataFixes)
  $id('abi-save').addEventListener('click', saveAbiDate)
  $id('pw-change').addEventListener('click', changePw)
  $id('export-csv').addEventListener('click', exportCSV)
  $id('export-json').addEventListener('click', exportJSON)

  boot()
})