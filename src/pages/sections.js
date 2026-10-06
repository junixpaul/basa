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
  const { data: students } = await supabase.from('students').select('id, name, level').eq('section_id', cls.id).order('name')
  const newest = lv => lessons.find(l => l.level === lv)
  const others = sections.filter(s => s.id !== cls.id)

  el.innerHTML = `<h1>Classes</h1>
    <div class="row">
      <label for="cls">Class</label>
      <select id="cls">${sections.map(s => `<option value="${s.id}" ${s.id === cls.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      <span style="margin-left:auto">${setupBtn('Manage classes')}</span>
    </div>

    <form id="add" class="addbox" novalidate>
      <b>Add students to ${esc(cls.name)}</b>
      <table><thead><tr><th>Student name</th><th>Starting level</th><th style="width:56px"></th></tr></thead><tbody id="rows"></tbody></table>
      <p class="muted small" style="margin:0">Press Enter for the next row. Pasting a list of names fills one row each.</p>
      <div class="row" style="margin:0"><button type="button" id="addRow">+ Add row</button><button class="primary">Save students</button></div>
    </form>
    <p id="msg" role="status" aria-live="polite"></p>

    ${students.length ? `
    <div class="row bulk" id="bulk" hidden>
      <b id="count"></b>
      ${others.length ? `<select id="moveTo" aria-label="Move to class"><option value="">Move to class…</option>${others.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>` : ''}
      <select id="setLevel" aria-label="Set level"><option value="">Set level…</option>${levelOpts(0)}</select>
      <button id="delSel">Remove</button>
    </div>
    <table><thead><tr>
      <th style="width:40px"><input type="checkbox" id="all" aria-label="Select all students"></th>
      <th>Student</th><th>Level</th><th></th></tr></thead><tbody>
    ${students.map(st => {
      const l = st.level < MAX_LEVEL && newest(st.level)
      return `<tr data-stu="${st.id}">
        <td><input type="checkbox" data-pick aria-label="Select ${esc(st.name)}"></td>
        <td><a href="#/students/${st.id}">${esc(st.name)}</a></td>
        <td><select data-level aria-label="Level of ${esc(st.name)}">${levelOpts(st.level)}</select></td>
        <td style="text-align:right">${l ? `<a href="#/assess/${st.id}/${l.id}"><button class="primary">Read</button></a>`
          : `<span class="muted">${st.level < MAX_LEVEL ? 'No lesson for this level yet' : 'Finished'}</span>`}</td></tr>`
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

  // select many → move / set level / remove
  if (!students.length) return
  const picks = [...el.querySelectorAll('[data-pick]')]
  const chosen = () => picks.filter(p => p.checked).map(p => p.closest('tr').dataset.stu)
  const sync = () => {
    const n = chosen().length
    $('#bulk', el).hidden = !n
    $('#count', el).textContent = `${n} selected`
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
