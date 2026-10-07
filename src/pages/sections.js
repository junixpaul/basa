import { supabase } from '../lib/supabase.js'
import { LEVELS, MAX_LEVEL, levelLabel } from '../lib/levels.js'
import { esc, $, armed } from '../app.js'

const levelOpts = (cur = 1) => Array.from({ length: MAX_LEVEL }, (_, i) => i + 1)
  .map(n => `<option value="${n}" ${n === cur ? 'selected' : ''}>${n < MAX_LEVEL ? `Level ${n} · ${LEVELS[n]}` : 'Finished'}</option>`).join('')
const remembered = () => { try { return localStorage.getItem('class') } catch { return null } }
const remember = id => { try { localStorage.setItem('class', id) } catch {} }

// One class at a time (picked from a dropdown), so teachers never mix up sections.
export async function render(el) {
  const [{ data: sections }, { data: lessons }] = await Promise.all([
    supabase.from('sections').select('id, name').order('name'),
    supabase.from('lessons').select('id, level').order('created_at', { ascending: false }),
  ])
  const setupBtn = label => `<a href="#/setup"><button>${label}</button></a>`
  if (!sections.length) {
    el.innerHTML = `<h1>Classes</h1><p class="muted">No classes yet. Add a grade level and section first.</p><div class="row">${setupBtn('Open Setup')}</div>`
    return
  }
  const cls = sections.find(s => s.id === remembered()) || sections[0]
  const { data: students } = await supabase.from('students').select('id, name, level, prev_level').eq('section_id', cls.id).order('name')
  // latest reading score per student per level (attempts come newest first, so the first one seen wins)
  const { data: attempts } = students.length
    ? await supabase.from('attempts').select('student_id, score, passed, lessons(level)').in('student_id', students.map(s => s.id)).order('created_at', { ascending: false })
    : { data: [] }
  const latest = {}
  for (const a of attempts ?? []) latest[`${a.student_id}:${a.lessons?.level}`] ??= a
  const scoreAt = (st, lv) => latest[`${st.id}:${lv}`]
  const scoreTag = a => a ? `<span class="nowrap"><b class="${a.passed ? 'ok' : ''}">${Math.round(a.score * 100)}%</b> <span class="muted small">${a.passed ? '✓' : '✗'}</span></span>` : ''
  const short = n => (n >= MAX_LEVEL ? 'Finished' : `L${n} · ${LEVELS[n]}`)
  const newest = lv => lessons.find(l => l.level === lv)
  const others = sections.filter(s => s.id !== cls.id)

  el.innerHTML = `<h1>Classes</h1>
    <div class="row">
      <label for="cls">Class</label>
      <select id="cls">${sections.map(s => `<option value="${s.id}" ${s.id === cls.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      <span class="row" style="margin:0 0 0 auto">
        <button id="addBtn" class="primary" aria-expanded="false" aria-controls="add">+ Add students</button>
        ${students.length ? '<button id="pickMode" aria-pressed="false">Move students</button>' : ''}
      </span>
    </div>

      <form id="add" class="addbox" novalidate hidden>
        <b>Add students to ${esc(cls.name)}</b>
        <table><thead><tr><th>Student name</th><th>Starting level</th><th style="width:56px"></th></tr></thead><tbody id="rows"></tbody></table>
        <p class="muted small" style="margin:0">Press Enter for the next row. Pasting a list of names fills one row each.</p>
        <div class="row" style="margin:0"><button type="button" id="addRow">+ Add row</button>
          <span style="margin-left:auto" class="row"><button type="button" id="cancelAdd">Cancel</button><button class="primary">Save students</button></span></div>
      </form>
    <p id="msg" role="status" aria-live="polite"></p>

    ${students.length ? `
    <div class="row bulk" id="bulk" hidden>
      <b id="count">Tick the students to move</b>
      ${others.length ? `<select id="moveTo" aria-label="Move to class" disabled><option value="">Move to…</option>${others.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>` : ''}
      <select id="setLevel" aria-label="Set level" disabled><option value="">Set level…</option>${levelOpts(0)}</select>
      <button id="delSel" disabled>Remove</button>    </div>
    <table id="list"><thead><tr>
      <th class="pick" style="width:40px"><input type="checkbox" id="all" aria-label="Select all students"></th>
      <th>Student</th><th>Prev level</th><th>Level</th><th>Score</th><th></th></tr></thead><tbody>
    ${students.map(st => {
      const l = st.level < MAX_LEVEL && newest(st.level), a = scoreAt(st, st.level)
      return `<tr data-stu="${st.id}">
        <td class="pick"><input type="checkbox" data-pick aria-label="Select ${esc(st.name)}"></td>
        <td class="name"><a href="#/students/${st.id}">${esc(st.name)}</a></td>
        <td data-label="Prev level"><span class="nowrap"><span class="muted">${st.prev_level ? short(st.prev_level) : '—'}</span> ${st.prev_level ? scoreTag(scoreAt(st, st.prev_level)) : ''}</span></td>
        <td data-label="Level"><select data-level aria-label="Level of ${esc(st.name)}">${levelOpts(st.level)}</select></td>
        <td data-label="Score">${scoreTag(a) || '<span class="muted">—</span>'}</td>
        <td class="act">${l ? `<a href="#/assess/${st.id}/${l.id}"><button class="primary">Read</button></a>`
          : `<span class="muted small nowrap">${st.level < MAX_LEVEL ? 'No lesson yet' : 'Finished'}</span>`}</td></tr>`
    }).join('')}
    </tbody></table>` : `<p class="muted">No students in ${esc(cls.name)} yet.</p>`}`

  const msg = $('#msg', el)
  const say = (text, kind = '') => { msg.textContent = text; msg.className = kind }
  const run = async (q, done) => {
    const { error } = await q
    if (error) return say(error.message, 'bad')
    await render(el) // redraw replaces #msg, so report success on the new one
    if (done) Object.assign($('#msg', el), { textContent: done, className: 'ok' })
  }

  $('#cls', el).onchange = e => { remember(e.target.value); render(el) }

  // add-students table: one row per student, each with its own starting level
  const rows = $('#rows', el)
  const addRow = (name = '', level = +(rows.lastElementChild?.querySelector('select').value || 1)) => {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td><input aria-label="Student name" placeholder="Juan Dela Cruz" autocomplete="off"></td>
      <td><select aria-label="Starting level">${levelOpts(level)}</select></td>
      <td><button type="button" aria-label="Remove row">✕</button></td>`
    const input = $('input', tr)
    input.value = name
    input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addRow().focus() } }
    input.onpaste = e => { // a pasted list becomes one row per name
      const names = e.clipboardData.getData('text').split(/\r?\n/).map(n => n.trim()).filter(Boolean)
      if (names.length < 2) return
      e.preventDefault()
      input.value = names.shift()
      names.forEach(n => addRow(n, +$('select', tr).value))
    }
    $('button', tr).onclick = () => { tr.remove(); rows.children.length || addRow() }
    rows.append(tr)
    return input
  }
  addRow()
  $('#addRow', el).onclick = () => addRow().focus()
  // one panel at a time: opening "Add students" closes "Move students" and vice versa
  let closeMove = () => {}
  const addOpen = on => {
    $('#add', el).hidden = !on
    $('#addBtn', el).textContent = on ? '✕ Close' : '+ Add students'
    $('#addBtn', el).setAttribute('aria-expanded', on)
    if (on) { closeMove(); $('input', rows).focus() } else { rows.replaceChildren(); addRow(); say('') }
  }
  $('#addBtn', el).onclick = () => addOpen($('#add', el).hidden)
  $('#cancelAdd', el).onclick = () => addOpen(false)
  if (!students.length) addOpen(true) // empty class: start with the form open

  $('#add', el).onsubmit = e => {
    e.preventDefault()
    const seen = new Set(), list = []
    for (const tr of rows.children) {
      const name = $('input', tr).value.trim()
      if (name && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); list.push({ section_id: cls.id, name, level: +$('select', tr).value }) }
    }
    if (!list.length) { $('input', rows).focus(); return say('Type at least one student name.', 'bad') }
    run(supabase.from('students').insert(list), `Added ${list.length} student${list.length > 1 ? 's' : ''}.`)
  }

  el.querySelectorAll('tr[data-stu]').forEach(tr => {
    $('[data-level]', tr).onchange = e => run(supabase.from('students').update({ level: +e.target.value }).eq('id', tr.dataset.stu))
  })

  // "Move students" mode: tick boxes + action bar appear only while moving, so they don't take space otherwise
  if (!students.length) return
  const picks = [...el.querySelectorAll('[data-pick]')]
  const chosen = () => picks.filter(p => p.checked).map(p => p.closest('tr').dataset.stu)
  let picking = false
  const mode = on => {
    picking = on
    $('#list', el).classList.toggle('picking', on)
    $('#bulk', el).hidden = !on
    $('#pickMode', el).textContent = on ? '✕ Close' : 'Move students' // same button opens and closes
    $('#pickMode', el).setAttribute('aria-pressed', on)
    if (!on) { picks.forEach(p => p.checked = false); sync() } else { if (!$('#add', el).hidden) addOpen(false); picks[0]?.focus() }
  }
  closeMove = () => picking && mode(false)
  $('#pickMode', el).onclick = () => mode(!picking)
  $('#bulk', el).onkeydown = $('#list', el).onkeydown = e => { if (e.key === 'Escape' && picking) mode(false) }
  const sync = () => {
    const n = chosen().length
    $('#count', el).textContent = n ? `${n} selected` : 'Tick the students to move'
    el.querySelectorAll('#moveTo, #setLevel, #delSel').forEach(c => { c.disabled = !n })
    $('#all', el).checked = n === picks.length
    $('#all', el).indeterminate = n > 0 && n < picks.length
  }
  picks.forEach(p => p.onchange = sync)
  $('#all', el).onchange = e => { picks.forEach(p => p.checked = e.target.checked); sync() }
  $('#moveTo', el)?.addEventListener('change', e => e.target.value &&
    run(supabase.from('students').update({ section_id: e.target.value }).in('id', chosen()), 'Moved.'))
  $('#setLevel', el).onchange = e => e.target.value &&
    run(supabase.from('students').update({ level: +e.target.value }).in('id', chosen()), 'Level updated.')
  $('#delSel', el).onclick = e => armed(e.currentTarget) &&
    run(supabase.from('students').delete().in('id', chosen()), 'Removed.')
}
